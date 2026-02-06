import logger from '../config/logger';
import { SARA_CONFIG } from '../config/sara';
import { ConversationService } from '../services/ConversationService';
import { AIService } from '../services/AIService';
import { MessageService } from '../services/MessageService';
import { MessageRepository } from '../repositories/MessageRepository';
import { AbandonmentRepository } from '../repositories/AbandonmentRepository';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { UserRepository } from '../repositories/UserRepository';
import { SaraContextPayload } from '../types/sara';
import ProcessMessageQueue, {
  ProcessMessagePayload,
  ProcessMessageResult,
} from './processMessageJob';
import SendMessageQueue, { SendMessagePayload } from './sendMessageJob';

/**
 * Handler for processing incoming WhatsApp messages
 * Executes: ConversationService → AIService → MessageService → DB persist
 */
export async function processMessageHandler(
  payload: ProcessMessagePayload
): Promise<ProcessMessageResult> {
  const { phoneNumber, messageText, whatsappMessageId, traceId, conversationId } = payload;

  logger.info('Processing incoming message', {
    phoneNumber,
    traceId,
    messageText: messageText.substring(0, 50),
  });

  try {
    // Step 1: Load conversation context
    let conversation = conversationId
      ? await ConversationRepository.findById(conversationId)
      : null;

    if (!conversation) {
      conversation = await ConversationRepository.findByPhoneNumber(phoneNumber);
    }

    if (!conversation) {
      logger.warn('Conversation not found for incoming message', {
        phoneNumber,
        traceId,
      });
      return {
        conversationId: '',
        messageProcessed: false,
        error: 'Conversation not found',
      };
    }

    // Step 2: Check if user has opted out
    const isOptedOut = await ConversationService.isOptedOut(conversation.user_id);
    if (isOptedOut) {
      logger.info('User has opted out, skipping response', {
        phoneNumber,
        conversationId: conversation.id,
        traceId,
      });
      // Still store the incoming message, but don't respond
      await MessageRepository.create({
        conversation_id: conversation.id,
        sender_type: 'user',
        message_text: messageText,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        metadata: { intent: 'opted_out' },
        status: 'pending',
      });
      return {
        conversationId: conversation.id,
        messageProcessed: true,
      };
    }

    // Step 3: Store incoming message
    await MessageRepository.create({
      conversation_id: conversation.id,
      sender_type: 'user',
      message_text: messageText,
      message_type: 'text',
      whatsapp_message_id: whatsappMessageId,
      metadata: { intent: 'pending' },
      status: 'pending',
    });

    // Step 4: Update conversation timestamps
    await ConversationRepository.incrementMessageCount(conversation.id);
    await ConversationRepository.updateLastUserMessageAt(conversation.id, new Date());

    // Step 5: Monta SaraContextPayload (novo!)
    const saraContext = await buildSaraContext(conversation, phoneNumber, traceId);

    // Step 6: Call AIService to interpret message COM CONTEXTO DINÂMICO
    const aiResponse = await AIService.interpretMessage(saraContext, messageText, traceId);

    logger.info('AI response generated', {
      conversationId: conversation.id,
      traceId,
      intent: aiResponse.intent,
      sentiment: aiResponse.sentiment,
      responsePreview: aiResponse.response.substring(0, 50),
      tokensUsed: aiResponse.tokens_used,
    });

    // Step 8: Store AI response in messages
    const responseMessage = await MessageRepository.create({
      conversation_id: conversation.id,
      sender_type: 'sara',
      message_text: aiResponse.response,
      message_type: 'text',
      metadata: {
        intent: aiResponse.intent,
        sentiment: aiResponse.sentiment,
        response_id: aiResponse.response_id,
        tokens_used: aiResponse.tokens_used,
      },
      status: 'pending',
    });

    // Step 9: Send message via WhatsApp
    const sendResult = await MessageService.send(
      conversation.id,
      phoneNumber,
      aiResponse.response,
      'text',
      {
        traceId,
      }
    );

    if (sendResult.status === 'failed') {
      logger.warn('Failed to send message immediately, queuing for retry', {
        conversationId: conversation.id,
        traceId,
        error: sendResult.error,
      });

      // Queue for retry
      await SendMessageQueue.addJob({
        conversationId: conversation.id,
        phoneNumber,
        messageText: aiResponse.response,
        messageType: 'text',
        traceId,
      });

      return {
        conversationId: conversation.id,
        messageProcessed: true,
        responseMessageId: responseMessage.id,
      };
    }

    // Step 10: Update message with WhatsApp ID if available
    if (sendResult.whatsappMessageId) {
      await MessageRepository.update(responseMessage.id, {
        whatsapp_message_id: sendResult.whatsappMessageId,
        status: sendResult.status === 'sent' ? 'sent' : 'pending',
      });
    }

    // Step 11: Update conversation timestamps
    await ConversationRepository.updateLastMessageAt(conversation.id, new Date());

    logger.info('Message processed successfully', {
      conversationId: conversation.id,
      traceId,
      responseMessageId: responseMessage.id,
    });

    return {
      conversationId: conversation.id,
      messageProcessed: true,
      responseMessageId: responseMessage.id,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error processing message', {
      phoneNumber,
      traceId,
      error: err.message,
      stack: err.stack,
    });

    // Don't throw - let BullMQ handle the retry
    return {
      conversationId,
      messageProcessed: false,
      error: err.message,
    };
  }
}

/**
 * Monta SaraContextPayload a partir da conversa
 */
async function buildSaraContext(
  conversation: any,
  phoneNumber: string,
  traceId: string
): Promise<SaraContextPayload> {
  // 1. Buscar user
  const user = await UserRepository.findById(conversation.user_id);
  if (!user) {
    throw new Error('User not found for conversation');
  }

  // 2. Buscar abandonment
  const abandonment = conversation.abandonment_id
    ? await AbandonmentRepository.findById(conversation.abandonment_id)
    : null;
  if (!abandonment) {
    throw new Error('Abandonment not found for conversation');
  }

  // 3. Buscar histórico de mensagens (configurável via SARA_MESSAGE_HISTORY_LIMIT)
  const messages = await MessageRepository.findByConversationId(
    conversation.id,
    SARA_CONFIG.message.historyLimit
  );

  // 4. Formatar histórico
  const history = messages.map((msg: any) => ({
    role: msg.sender_type === 'user' ? ('user' as const) : ('assistant' as const),
    content: msg.message_text,
    timestamp: msg.created_at.toISOString(),
  }));

  // 5. Buscar links de pagamento (original + desconto se existir)
  // Por enquanto, usar placeholders - será preenchido pelo sistema de pagamento
  const paymentConfig = {
    originalLink: `https://pay.example.com/order/${abandonment.id}`,
    discountLink: undefined, // use undefined instead of null to match interface
    discountPercent: undefined,
    discountWasOffered: false,
  };

  // 6. Contar ciclos (controlado no BD)
  const cycleCount = 0; // Ciclos são rastreados no serviço, não na conversa

  // 7. Montar payload
  const context: SaraContextPayload = {
    user: {
      id: user.id,
      name: user.name || 'Usuário', // Default if null
      phone: phoneNumber,
    },
    abandonment: {
      id: abandonment.id,
      product: abandonment.product_id || 'Produto',
      productId: abandonment.product_id || '',
      cartValue: Math.round(abandonment.value * 100), // converter para centavos
      currency: 'BRL',
      createdAt: abandonment.created_at, // already ISO string from DB
    },
    conversation: {
      id: conversation.id,
      state: conversation.status || 'ACTIVE', // use status field instead
      cycleCount,
      maxCycles: 5,
      startedAt: conversation.created_at, // already ISO string from DB
    },
    payment: paymentConfig,
    history,
    metadata: {
      // Note: User interface doesn't have segment field, removed
      cartAgeMinutes: getMinutesSince(new Date(abandonment.created_at)), // parse string to Date
    },
  };

  logger.debug('SARA context built', {
    traceId,
    userId: user.id,
    userName: user.name,
    cycleCount,
    historyLength: history.length,
  });

  return context;
}

/**
 * Calcula diferença de tempo em minutos
 */
function getMinutesSince(date: Date): number {
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
}

/**
 * Handler for retrying failed message sends
 * Attempts to resend a message that previously failed
 */
export async function sendMessageHandler(payload: SendMessagePayload): Promise<void> {
  const { conversationId, phoneNumber, messageText, traceId } = payload;

  logger.info('Retrying message send', {
    conversationId,
    phoneNumber,
    traceId,
  });

  try {
    // Send message via WhatsApp
    const sendResult = await MessageService.send(conversationId, phoneNumber, messageText, 'text', {
      traceId,
    });

    if (sendResult.status === 'sent') {
      logger.info('Message sent successfully on retry', {
        conversationId,
        traceId,
        whatsappMessageId: sendResult.whatsappMessageId,
      });
      return;
    }

    logger.warn('Message send still failing on retry', {
      conversationId,
      traceId,
      error: sendResult.error,
    });

    // Throw to trigger BullMQ retry
    throw new Error(`Failed to send message: ${sendResult.error}`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error retrying message send', {
      conversationId,
      traceId,
      error: err.message,
      stack: err.stack,
    });

    // Throw to trigger BullMQ retry
    throw err;
  }
}

/**
 * Register both handlers during application startup
 */
export async function registerMessageHandlers(): Promise<void> {
  logger.info('Registering message handlers');

  try {
    await ProcessMessageQueue.registerHandler(processMessageHandler);
    logger.info('✅ ProcessMessageQueue handler registered');
  } catch (error) {
    logger.error('Failed to register ProcessMessageQueue handler', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  try {
    await SendMessageQueue.registerHandler(sendMessageHandler);
    logger.info('✅ SendMessageQueue handler registered');
  } catch (error) {
    logger.error('Failed to register SendMessageQueue handler', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
