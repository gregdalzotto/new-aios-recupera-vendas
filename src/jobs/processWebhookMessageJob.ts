import logger from '../config/logger';
import { MessageRepository } from '../repositories/MessageRepository';
import { AIService } from '../services/AIService';
import { MessageService } from '../services/MessageService';
import { ConversationService } from '../services/ConversationService';
import ProcessMessageQueue, {
  ProcessMessagePayload,
  ProcessMessageResult,
} from './processMessageJob';

/**
 * Process webhook message from WhatsApp
 * Orchestrates: Conversation loading → AI interpretation → Message sending → DB persistence
 */
export class ProcessWebhookMessageJob {
  /**
   * Process incoming WhatsApp message
   * This job handles the full flow of receiving, interpreting, and responding
   */
  static async process(payload: ProcessMessagePayload): Promise<ProcessMessageResult> {
    const { conversationId, whatsappMessageId, phoneNumber, messageText, traceId } = payload;

    try {
      logger.debug('Starting webhook message processing', {
        conversationId,
        whatsappMessageId,
        phoneNumber,
        messageLength: messageText.length,
        traceId,
      });

      // Step 1: Verify message not already processed (dedup)
      const existingMessage = await MessageRepository.findByWhatsAppMessageId(whatsappMessageId);
      if (existingMessage) {
        logger.info('Message already processed (dedup)', {
          conversationId,
          whatsappMessageId,
          traceId,
        });

        return {
          conversationId,
          messageProcessed: true,
          responseMessageId: existingMessage.id,
          error: undefined,
        };
      }

      // Step 2: Store incoming message
      const incomingMessage = await MessageRepository.create({
        conversation_id: conversationId,
        sender_type: 'user',
        message_text: messageText,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
      });

      logger.debug('Incoming message stored', {
        messageId: incomingMessage.id,
        conversationId,
        traceId,
      });

      // Step 3: Load conversation and context
      const conversation = await ConversationService.findByPhoneNumber(phoneNumber, traceId);
      if (!conversation) {
        logger.error('Conversation not found', {
          phoneNumber,
          conversationId,
          traceId,
        });

        return {
          conversationId,
          messageProcessed: false,
          error: 'Conversation not found',
        };
      }

      // Step 4: Load message history for context
      const messageHistory = await MessageRepository.findByConversationId(conversationId, 10);

      logger.debug('Message history loaded', {
        conversationId,
        messageCount: messageHistory.length,
        traceId,
      });

      // Step 5: Call AI to interpret message and generate response
      const aiResponse = await AIService.interpretMessage(
        {
          conversationId,
          userId: conversation.user_id,
          productName: 'Produto', // From abandonment context
          cartValue: 0, // From abandonment context
          offersAlreadyMade: 0, // Track per conversation
          messageHistory,
          traceId,
        },
        messageText
      );

      logger.debug('AI interpretation completed', {
        conversationId,
        intent: aiResponse.intent,
        sentiment: aiResponse.sentiment,
        shouldOfferDiscount: aiResponse.should_offer_discount,
        tokensUsed: aiResponse.tokens_used,
        traceId,
      });

      // Step 6: Send response via WhatsApp
      const sendResult = await MessageService.send(
        conversationId,
        phoneNumber,
        aiResponse.response,
        'text',
        { traceId }
      );

      logger.debug('WhatsApp response sent', {
        conversationId,
        status: sendResult.status,
        whatsappMessageId: sendResult.whatsappMessageId,
        traceId,
      });

      // Step 7: Update conversation state
      await ConversationService.incrementMessageCount(conversationId, traceId);
      await ConversationService.updateTimestamps(conversationId, true, traceId);

      logger.info('Webhook message processing completed successfully', {
        conversationId,
        incomingMessageId: incomingMessage.id,
        responseMessageId: sendResult.messageId,
        intent: aiResponse.intent,
        traceId,
      });

      return {
        conversationId,
        messageProcessed: true,
        responseMessageId: sendResult.messageId,
        error: undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error processing webhook message', {
        conversationId,
        whatsappMessageId,
        traceId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        conversationId,
        messageProcessed: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Register job handler with queue
   */
  static async registerHandler(): Promise<void> {
    await ProcessMessageQueue.registerHandler(async (job) => {
      return this.process(job.data);
    });

    logger.info('Webhook message job handler registered');
  }
}
