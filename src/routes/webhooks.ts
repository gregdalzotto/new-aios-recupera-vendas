import { FastifyInstance } from 'fastify';
import { config } from '../config/env';
import logger from '../config/logger';
import { createValidationError, createUnauthorizedError } from '../utils/errors';
import { FastifyRequestWithTrace } from '../middleware/correlationId';
import { createRateLimiterMiddleware } from '../middleware/rateLimiter';
import { AbandonmentWebhookSchema } from '../types/schemas';
import { AbandonmentService } from '../services/AbandonmentService';

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
 * POST /webhook/messages
 * Receives messages from users via WhatsApp
 * (Implementation in SARA-2.4)
 */
export async function postWebhookMessages(fastify: FastifyInstance): Promise<void> {
  fastify.post('/webhook/messages', async (request, reply) => {
    const traceId = (request as FastifyRequestWithTrace).traceId;

    logger.info('Webhook message received', {
      traceId,
      contentType: request.headers['content-type'],
    });

    // TODO: Implement message processing (SARA-2.4)
    reply.code(200).send({ status: 'received' });
  });
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

  logger.info('Webhook routes registered');
}
