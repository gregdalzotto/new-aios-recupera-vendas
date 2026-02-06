import { FastifyInstance } from 'fastify';
import { createHmac } from 'crypto';
import { config } from '../config/env';
import logger from '../config/logger';
import { createValidationError, createUnauthorizedError } from '../utils/errors';
import { FastifyRequestWithTrace } from '../middleware/correlationId';
import { FastifyRequestWithRawBody } from '../middleware/rawBodyCapture';
import { createRateLimiterMiddleware } from '../middleware/rateLimiter';
import { createWebhookRateLimiter } from '../middleware/rateLimiterRedis';
import { AbandonmentWebhookSchema } from '../types/schemas';
import { AbandonmentService } from '../services/AbandonmentService';
import { MessageService } from '../services/MessageService';
import { PaymentService } from '../services/PaymentService';
import ProcessMessageQueue from '../jobs/processMessageJob';
import { ConversationService } from '../services/ConversationService';
import { UserRepository } from '../repositories/UserRepository';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { AbandonmentRepository } from '../repositories/AbandonmentRepository';

/**
 * GET /webhook/messages
 * Meta WhatsApp webhook validation endpoint
 * Used by Meta to verify webhook setup and establish connection
 */
export async function getWebhookMessages(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: {
      'hub.mode': string;
      'hub.challenge': string;
      'hub.verify_token': string;
    };
  }>('/webhook/messages', async (request, reply) => {
    const traceId = (request as FastifyRequestWithTrace).traceId;
    const {
      'hub.mode': mode,
      'hub.challenge': challenge,
      'hub.verify_token': token,
    } = request.query;

    logger.info('Webhook validation request received', {
      traceId,
      mode,
      hasChallenge: !!challenge,
      hasToken: !!token,
    });

    // Validate required query parameters
    if (!mode || !challenge || !token) {
      logger.warn('Missing webhook validation parameters', {
        traceId,
        missingParams: {
          mode: !mode,
          challenge: !challenge,
          token: !token,
        },
      });

      throw createValidationError(
        'Missing required query parameters: hub.mode, hub.challenge, hub.verify_token',
        undefined,
        traceId
      );
    }

    // Verify mode is 'subscribe'
    if (mode !== 'subscribe') {
      logger.warn('Invalid webhook mode', {
        traceId,
        mode,
      });

      throw createValidationError(
        `Invalid hub.mode: ${mode}. Expected 'subscribe'`,
        undefined,
        traceId
      );
    }

    // Verify token against environment variable
    const expectedToken = config.WHATSAPP_VERIFY_TOKEN;

    if (token !== expectedToken) {
      logger.warn('Invalid webhook verification token', {
        traceId,
        tokenLength: token.length,
        expectedLength: expectedToken.length,
      });

      throw createUnauthorizedError('Invalid verification token', traceId);
    }

    // Success: return challenge as plain text
    logger.info('Webhook validation successful', {
      traceId,
      challengeLength: challenge.length,
    });

    // Return challenge as plain text (not JSON)
    reply.type('text/plain').code(200).send(challenge);
  });
}

/**
 * Verify HMAC-SHA256 signature from Meta
 */
function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
  traceId: string
): boolean {
  if (!signature) {
    logger.warn('Missing webhook signature header', { traceId });
    return false;
  }

  return MessageService.verifyWebhookSignature(body, signature, traceId);
}

/**
 * Extract message data from Meta webhook payload
 */
interface MetaMessagePayload {
  messaging_product: string;
  metadata: {
    phone_number_id: string;
  };
  messages: Array<{
    id: string;
    from: string;
    type: string;
    text?: {
      body: string;
    };
  }>;
}

function extractMessageData(payload: unknown, traceId: string): MetaMessagePayload | null {
  try {
    if (!payload || typeof payload !== 'object') {
      logger.warn('Invalid webhook payload format', { traceId, type: typeof payload });
      return null;
    }

    const data = payload as Record<string, unknown>;
    const entry = Array.isArray(data.entry) ? data.entry[0] : null;

    if (!entry || typeof entry !== 'object') {
      logger.warn('No entry in webhook payload', { traceId });
      return null;
    }

    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as unknown[])[0]
      : null;

    if (!changes || typeof changes !== 'object') {
      logger.warn('No changes in webhook entry', { traceId });
      return null;
    }

    const value = (changes as Record<string, unknown>).value;

    if (!value || typeof value !== 'object') {
      logger.warn('No value in webhook changes', { traceId });
      return null;
    }

    return value as MetaMessagePayload;
  } catch (error) {
    logger.warn('Error extracting message data from payload', {
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * POST /webhook/messages
 * Receives messages from users via WhatsApp
 * Verifies signature, deduplicates, and enqueues for async processing
 * Rate limited: 10 requests per 15 minutes per phone number
 */
export async function postWebhookMessages(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: Record<string, unknown> }>(
    '/webhook/messages',
    { preHandler: createWebhookRateLimiter() },
    async (request, reply) => {
      const traceId = (request as FastifyRequestWithTrace).traceId;

      try {
        logger.info('Webhook message received', {
          traceId,
          contentType: request.headers['content-type'],
        });

        // Step 1: Verify HMAC signature
        const signature = request.headers['x-hub-signature-256'] as string | undefined;

        // Usar rawBody capturado pela middleware, senão fazer fallback para JSON.stringify
        const requestWithRawBody = request as FastifyRequestWithRawBody;
        const rawBody = requestWithRawBody.rawBody || JSON.stringify(request.body);

        if (!verifyWebhookSignature(rawBody, signature, traceId)) {
          logger.warn('Invalid webhook signature', {
            traceId,
            hasSignature: !!signature,
          });

          throw createUnauthorizedError('Invalid webhook signature', traceId);
        }

        logger.debug('Webhook signature verified', { traceId });

        // Step 2: Extract message data from Meta payload
        const messagePayload = extractMessageData(request.body, traceId);

        if (!messagePayload) {
          logger.warn('Failed to extract message data from payload', { traceId });

          // Return 200 OK to avoid Meta retries for malformed data
          return reply.code(200).send({ status: 'skipped', reason: 'Invalid payload structure' });
        }

        logger.debug('Message payload extracted', {
          traceId,
          messageCount: messagePayload.messages?.length || 0,
        });

        // Step 3: Process each message (usually only 1)
        for (const message of messagePayload.messages || []) {
          if (message.type !== 'text' || !message.text) {
            logger.debug('Skipping non-text message', {
              traceId,
              messageId: message.id,
              type: message.type,
            });
            continue;
          }

          let phoneNumber = message.from;
          const messageText = message.text.body;
          const whatsappMessageId = message.id;

          // Normalize phone number to E.164 format (+country code + number)
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = '+' + phoneNumber;
          }

          logger.info('Processing WhatsApp message', {
            traceId,
            whatsappMessageId,
            phoneNumber,
            messageLength: messageText.length,
          });

          try {
            // Step 4: Load or create conversation
            const conversation = await ConversationService.findByPhoneNumber(phoneNumber, traceId);

            if (!conversation) {
              logger.warn('Conversation not found for phone number', {
                traceId,
                phoneNumber,
              });

              // Return 200 OK (conversation should exist from abandonment webhook)
              return reply.code(200).send({
                status: 'skipped',
                reason: 'Conversation not found for phone number',
              });
            }

            const conversationId = conversation.id;

            // Step 5: Enqueue message for async processing
            await ProcessMessageQueue.addJob({
              conversationId,
              whatsappMessageId,
              phoneNumber,
              messageText,
              traceId,
            });

            logger.info('Message enqueued for processing', {
              traceId,
              conversationId,
              whatsappMessageId,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            logger.error('Error processing message from webhook', {
              traceId,
              whatsappMessageId,
              phoneNumber,
              error: errorMessage,
            });

            // Continue processing other messages, don't fail the webhook response
          }
        }

        // Step 6: Return 200 OK immediately (Meta expects this within 5 seconds)
        logger.debug('Webhook processing completed, returning 200 OK', { traceId });

        reply.code(200).send({
          status: 'received',
          messagesProcessed: messagePayload.messages?.length || 0,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('Error processing webhook', {
          traceId,
          error: errorMessage,
        });

        // Return 200 OK for all errors (Meta should retry, or check logs)
        // Exceptions are only for auth failures
        if (error instanceof Error && error.message.includes('signature')) {
          reply.code(403).send({ status: 'forbidden', reason: 'Invalid signature' });
        } else {
          reply.code(200).send({ status: 'error', reason: errorMessage });
        }
      }
    }
  );
}

/**
 * POST /webhook/abandonment
 * Receives abandonment notifications from payment system
 * Creates user, abandonment record, and conversation
 */
export async function postWebhookAbandonment(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: unknown }>('/webhook/abandonment', async (request, reply) => {
    const traceId = (request as FastifyRequestWithTrace).traceId;

    logger.info('Abandonment webhook received', {
      traceId,
      contentType: request.headers['content-type'],
    });

    // Validate payload against schema
    const validationResult = AbandonmentWebhookSchema.safeParse(request.body);

    if (!validationResult.success) {
      const errorMap: Record<string, unknown> = {};
      validationResult.error.errors.forEach((error) => {
        const path = error.path.join('.');
        errorMap[path] = error.message;
      });

      logger.warn('Invalid abandonment webhook payload', {
        traceId,
        errors: errorMap,
      });

      throw createValidationError('Invalid abandonment webhook payload', errorMap, traceId);
    }

    const payload = validationResult.data;

    try {
      const result = await AbandonmentService.processAbandonment(payload, traceId);

      logger.info('Abandonment processed', {
        traceId,
        status: result.status,
        abandonmentId: result.abandonmentId,
      });

      reply.code(200).send({
        status: result.status,
        abandonmentId: result.abandonmentId,
        conversationId: result.conversationId,
      });
    } catch (error) {
      logger.error('Error processing abandonment', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  });
}

/**
 * POST /webhook/debug
 * Debug endpoint to validate HMAC signatures
 * Helps identify webhook validation issues
 */
export async function postWebhookDebug(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: Record<string, unknown> }>('/webhook/debug', async (request, reply) => {
    const traceId = (request as FastifyRequestWithTrace).traceId;

    try {
      const signatureHeader = request.headers['x-hub-signature-256'] as string | undefined;
      const requestWithRawBody = request as FastifyRequestWithRawBody;
      const rawBody = requestWithRawBody.rawBody || JSON.stringify(request.body);

      // Calculate expected signature
      const secret = process.env.WHATSAPP_APP_SECRET || '';
      const expectedSignature = signatureHeader
        ? createHmac('sha256', secret).update(rawBody).digest('hex')
        : 'N/A';

      // Extract received signature
      const receivedSignature = signatureHeader ? signatureHeader.split('=')[1] : 'NOT PROVIDED';

      // Compare
      const signatureMatch =
        signatureHeader &&
        receivedSignature &&
        Buffer.byteLength(receivedSignature) === Buffer.byteLength(expectedSignature) &&
        receivedSignature === expectedSignature;

      const debugInfo = {
        timestamp: new Date().toISOString(),
        traceId,
        webhook: {
          method: request.method,
          path: request.url,
          contentType: request.headers['content-type'],
        },
        signature: {
          headerPresent: !!signatureHeader,
          headerValue: signatureHeader || 'NOT PROVIDED',
          received: receivedSignature,
          expected: expectedSignature,
          match: signatureMatch,
          matchPercentage:
            receivedSignature === expectedSignature ? '✅ 100% Match' : '❌ Mismatch',
        },
        body: {
          rawLength: Buffer.byteLength(rawBody),
          preview: rawBody.substring(0, 200),
          fullBody: rawBody,
        },
        security: {
          secretFirstChars: secret.substring(0, 10) + '...',
          secretLength: secret.length,
        },
        analysis: {
          hasSignatureHeader: !!signatureHeader,
          isValidFormat: !!signatureHeader?.includes('sha256='),
          bodyIsValid: rawBody.length > 0,
          secretConfigured: secret.length > 0,
        },
      };

      // Log for debugging
      logger.info('Webhook debug request received', {
        traceId,
        signatureMatch,
        bodyLength: debugInfo.body.rawLength,
      });

      return reply.code(200).send(debugInfo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error in webhook debug endpoint', {
        traceId,
        error: errorMessage,
      });

      return reply.code(200).send({
        error: errorMessage,
        timestamp: new Date().toISOString(),
        traceId,
      });
    }
  });
}

/**
 * POST /webhook/test/setup-scenario
 * Setup test scenario with Meta test user
 * Creates user, abandonment, conversation and simulates template sent
 */
async function setupTestScenario(fastify: FastifyInstance): Promise<void> {
  fastify.post<{
    Body: {
      phoneNumber?: string;
      productName?: string;
      cartValue?: number;
      discountPercent?: number;
    };
  }>('/webhook/test/setup-scenario', async (request, reply) => {
    const traceId = (request as FastifyRequestWithTrace).traceId;

    const {
      phoneNumber = '+16315551181',
      productName = 'Curso Python Avançado',
      cartValue = 150.0,
      discountPercent = 15,
    } = request.body;

    try {
      logger.info('Setting up test scenario', {
        traceId,
        phoneNumber,
        productName,
        cartValue,
      });

      // 1. Create/get user
      const userId = await UserRepository.upsert(phoneNumber, 'Meta Test User');
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new Error('Failed to create user');
      }

      // 2. Create/get product (using raw SQL via database)
      const productId = `test-product-${Date.now()}`;
      const paymentLink = `https://pay.example.com/test-${Date.now()}`;
      const discountLink = `https://pay.example.com/test-${Date.now()}?discount=${discountPercent}`;

      // 3. Create abandonment
      const externalId = `test_${Date.now()}`;

      const abandonment = await AbandonmentRepository.create(
        user.id,
        externalId,
        productId,
        cartValue,
        paymentLink
      );

      if (!abandonment) {
        throw new Error('Failed to create abandonment');
      }

      // 4. Create conversation
      const conversation = await ConversationRepository.create(abandonment.id, user.id);

      if (!conversation) {
        throw new Error('Failed to create conversation');
      }

      const scenario = {
        user: {
          id: user.id,
          phoneNumber,
          name: user.name,
        },
        product: {
          id: productId,
          name: productName,
          value: cartValue,
          discountPercent,
          paymentLink,
          discountLink,
        },
        abandonment: {
          id: abandonment.id,
          externalId: abandonment.external_id,
          status: abandonment.status,
        },
        conversation: {
          id: conversation.id,
          status: conversation.status,
          cycleCount: 0, // Track cycles in conversation service, not in DB schema
          maxCycles: 5,
        },
        instructions: {
          step1: `Você tem 1 minuto para responder ao WhatsApp de ${phoneNumber}`,
          step2: 'SARA vai receber sua resposta via webhook',
          step3: 'SARA vai gerar resposta com contexto dinâmico:',
          details: [
            '- Nome do usuário',
            `- Valor do carrinho (R$ ${cartValue.toFixed(2)})`,
            '- Histórico de mensagens',
            `- Opção de desconto (${discountPercent}%)`,
            '- Ciclo atual da conversa (0/5)',
          ],
        },
      };

      logger.info('Test scenario created successfully', {
        traceId,
        conversationId: conversation.id,
        abandonment: abandonment.id,
      });

      return reply.code(200).send({
        status: 'success',
        message: 'Cenário de teste criado! Aguardando sua resposta no WhatsApp...',
        scenario,
        timestamp: new Date().toISOString(),
        traceId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error setting up test scenario', {
        traceId,
        phoneNumber,
        error: errorMessage,
      });

      return reply.code(400).send({
        error: errorMessage,
        timestamp: new Date().toISOString(),
        traceId,
      });
    }
  });
}

/**
 * POST /webhook/payment
 * Receives payment status callbacks from payment gateway
 * Updates abandonment status and conversation state based on payment result
 * SARA-3.4: Payment Webhook Handler
 */
export async function postWebhookPayment(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: Record<string, unknown> }>('/webhook/payment', async (request, reply) => {
    const traceId = (request as FastifyRequestWithTrace).traceId;

    logger.info('Payment webhook received', {
      traceId,
      contentType: request.headers['content-type'],
    });

    try {
      // Process payment webhook
      const result = await PaymentService.processPaymentWebhook(request.body, traceId);

      // Return appropriate response based on processing result
      if (result.status === 'already_processed') {
        logger.info('Payment already processed (idempotency)', {
          traceId,
          abandonmentId: result.abandonmentId,
          paymentStatus: result.paymentStatus,
        });

        return reply.code(200).send({
          status: 'already_processed',
          abandonmentId: result.abandonmentId,
          conversationId: result.conversationId,
          paymentStatus: result.paymentStatus,
          message: result.message,
        });
      }

      if (result.status === 'failed') {
        logger.warn('Payment webhook processing failed', {
          traceId,
          error: result.message,
        });

        // Return 400 for validation errors, 500 for processing errors
        const statusCode = result.message.includes('Invalid') ? 400 : 500;
        return reply.code(statusCode).send({
          status: 'failed',
          error: result.message,
        });
      }

      // Success: payment processed
      logger.info('Payment webhook processed successfully', {
        traceId,
        abandonmentId: result.abandonmentId,
        conversationId: result.conversationId,
        paymentStatus: result.paymentStatus,
      });

      return reply.code(200).send({
        status: 'processed',
        abandonmentId: result.abandonmentId,
        conversationId: result.conversationId,
        paymentStatus: result.paymentStatus,
        message: result.message,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error processing payment webhook', {
        traceId,
        error: errorMessage,
      });

      return reply.code(500).send({
        status: 'error',
        error: errorMessage,
      });
    }
  });
}

/**
 * Register all webhook routes
 */
export async function registerWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Register rate limiter for abandonment webhook (100 req/min per IP)
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/webhook/abandonment')) {
      await createRateLimiterMiddleware({ maxRequests: 100, windowMs: 60 * 1000 })(request, reply);
    }
  });

  await getWebhookMessages(fastify);
  await postWebhookMessages(fastify);
  await postWebhookAbandonment(fastify);
  await postWebhookPayment(fastify);
  await postWebhookDebug(fastify);
  await setupTestScenario(fastify);

  logger.info('Webhook routes registered');
}
