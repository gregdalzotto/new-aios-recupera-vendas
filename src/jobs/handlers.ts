import type { Job } from 'bull';
import logger from '../config/logger';
import { ConversationService } from '../services/ConversationService';
import { AIService, type AIContext } from '../services/AIService';
import { MessageService } from '../services/MessageService';
import { MessageRepository } from '../repositories/MessageRepository';
import { AbandonmentRepository } from '../repositories/AbandonmentRepository';
import { ConversationRepository } from '../repositories/ConversationRepository';
import ProcessMessageQueue, {
  ProcessMessagePayload,
  ProcessMessageResult,
} from './processMessageJob';
import SendMessageQueue, { SendMessagePayload, SendMessageResult } from './sendMessageJob';

/**
 * Handler for processing incoming WhatsApp messages
 * Executes: ConversationService → AIService → MessageService → DB persist
 */
export async function processMessageHandler(
  job: Job<ProcessMessagePayload>
): Promise<ProcessMessageResult> {
  const { phoneNumber, messageText, whatsappMessageId, traceId, conversationId } = job.data;

  logger.info('Processing incoming message', {
    jobId: job.id,
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

    // Step 5: Get recent message context
    const contextMessages = await MessageRepository.findByConversationId(conversation.id, 10);

    // Step 6: Get abandonment context for AI
    const abandonment = conversation.abandonment_id
      ? await AbandonmentRepository.findById(conversation.abandonment_id)
      : null;

    // Step 7: Call AIService to interpret message
    const aiContext: AIContext = {
      conversationId: conversation.id,
      userId: conversation.user_id,
      productName: abandonment?.product_id || 'Produto',
      cartValue: abandonment?.value || 0,
      offersAlreadyMade: 0, // Could be counted from history
      messageHistory: contextMessages,
      traceId,
    };

    const aiResponse = await AIService.interpretMessage(aiContext, messageText);

    logger.info('AI response generated', {
      jobId: job.id,
      conversationId: conversation.id,
      traceId,
      intent: aiResponse.intent,
      sentiment: aiResponse.sentiment,
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
        jobId: job.id,
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
      jobId: job.id,
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
      jobId: job.id,
      phoneNumber,
      traceId,
      error: err.message,
      stack: err.stack,
      attempt: job.attemptsMade + 1,
    });

    // Don't throw - let Bull handle the retry
    return {
      conversationId,
      messageProcessed: false,
      error: err.message,
    };
  }
}

/**
 * Handler for retrying failed message sends
 * Attempts to resend a message that previously failed
 */
export async function sendMessageHandler(job: Job<SendMessagePayload>): Promise<SendMessageResult> {
  const { conversationId, phoneNumber, messageText, traceId } = job.data;

  logger.info('Retrying message send', {
    jobId: job.id,
    conversationId,
    phoneNumber,
    traceId,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Send message via WhatsApp
    const sendResult = await MessageService.send(conversationId, phoneNumber, messageText, 'text', {
      traceId,
    });

    if (sendResult.status === 'sent') {
      logger.info('Message sent successfully on retry', {
        jobId: job.id,
        conversationId,
        traceId,
        attempt: job.attemptsMade + 1,
        whatsappMessageId: sendResult.whatsappMessageId,
      });

      return {
        conversationId,
        messageId: '',
        status: 'sent',
        whatsappMessageId: sendResult.whatsappMessageId,
      };
    }

    logger.warn('Message send still failing on retry', {
      jobId: job.id,
      conversationId,
      traceId,
      attempt: job.attemptsMade + 1,
      error: sendResult.error,
    });

    // Don't throw - let Bull handle the retry
    return {
      conversationId,
      messageId: '',
      status: 'failed',
      error: sendResult.error,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error retrying message send', {
      jobId: job.id,
      conversationId,
      traceId,
      error: err.message,
      stack: err.stack,
      attempt: job.attemptsMade + 1,
    });

    // Don't throw - let Bull handle the retry
    return {
      conversationId,
      messageId: '',
      status: 'failed',
      error: err.message,
    };
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

  logger.info('✅ All message handlers registered');
}
