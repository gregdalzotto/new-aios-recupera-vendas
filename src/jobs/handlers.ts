import logger from '../config/logger';
import { SARA_CONFIG } from '../config/sara';
import { ConversationService, ConversationStatus } from '../services/ConversationService';
import { AIService } from '../services/AIService';
import { MessageService } from '../services/MessageService';
import { MessageRepository } from '../repositories/MessageRepository';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { OptOutDetectionService } from '../services/OptOutDetectionService';
import { ComplianceService } from '../services/ComplianceService';
import ProcessMessageQueue, {
  ProcessMessagePayload,
  ProcessMessageResult,
} from './processMessageJob';
import SendMessageQueue, { SendMessagePayload } from './sendMessageJob';

/**
 * Handler for processing incoming WhatsApp messages (SARA-3.3)
 * Complete abandonment recovery workflow:
 * 1. Load conversation
 * 2. Dedup check
 * 3. Opt-out detection
 * 4. 24-hour window enforcement
 * 5. State transition
 * 6. AI interpretation
 * 7. Message storage and send
 * 8. Cycle tracking
 */
export async function processMessageHandler(
  payload: ProcessMessagePayload
): Promise<ProcessMessageResult> {
  const { phoneNumber, messageText, whatsappMessageId, traceId, conversationId } = payload;

  logger.info('Processing incoming message (SARA-3.3)', {
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

    const convId = conversation.id;

    // Step 2: Dedup check (SARA-3.3 requirement)
    const existingMessage = await MessageRepository.findByWhatsAppMessageId(whatsappMessageId);
    if (existingMessage) {
      logger.info('Duplicate message detected, skipping', {
        conversationId: convId,
        whatsappMessageId,
        traceId,
      });
      return {
        conversationId: convId,
        messageProcessed: true, // Consider as processed (already handled)
      };
    }

    // Step 3: Check message safety (SARA-3.3 compliance)
    const isSafe = await ComplianceService.checkMessageSafety(messageText, traceId);
    if (!isSafe) {
      logger.warn('Unsafe message content detected', {
        conversationId: convId,
        traceId,
      });
      // Still log but don't process
      await MessageRepository.create({
        conversation_id: convId,
        sender_type: 'user',
        message_text: messageText,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        metadata: { intent: 'unsafe' },
        status: 'pending',
      });
      return {
        conversationId: convId,
        messageProcessed: false,
        error: 'Unsafe message content',
      };
    }

    // Step 4: Check if user has opted out (SARA-3.3 opt-out detection)
    const isOptedOut = await ConversationService.isOptedOut(conversation.user_id);
    if (isOptedOut) {
      logger.info('User has opted out, skipping response', {
        conversationId: convId,
        traceId,
      });
      // Still store message but don't respond
      await MessageRepository.create({
        conversation_id: convId,
        sender_type: 'user',
        message_text: messageText,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        metadata: { intent: 'opted_out' },
        status: 'pending',
      });
      return {
        conversationId: convId,
        messageProcessed: true,
      };
    }

    // Step 5: Check for opt-out intent in message (SARA-3.3 two-layer detection)
    const optOutCheck = await OptOutDetectionService.detectOptOut(messageText, convId, traceId);
    if (optOutCheck.isOptOut) {
      logger.info('Opt-out intent detected in message', {
        conversationId: convId,
        method: optOutCheck.method,
        confidence: optOutCheck.confidence,
        traceId,
      });

      // Store incoming message
      await MessageRepository.create({
        conversation_id: convId,
        sender_type: 'user',
        message_text: messageText,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        metadata: { intent: 'opt_out_request' },
        status: 'pending',
      });

      // Mark user as opted out
      await OptOutDetectionService.markOptedOut(conversation.user_id, traceId);

      // Close conversation
      await ConversationService.updateState(
        convId,
        ConversationStatus.CLOSED,
        'User opted out',
        traceId
      );

      // Log compliance decision
      await ComplianceService.logComplianceDecision(
        convId,
        'blocked',
        'User opted out - no further messages',
        traceId
      );

      logger.info('Conversation closed due to opt-out', {
        conversationId: convId,
        traceId,
      });

      return {
        conversationId: convId,
        messageProcessed: true,
      };
    }

    // Step 6: Check 24-hour window (SARA-3.3 compliance)
    const isWithin24h = await ComplianceService.isWithin24HourWindow(convId, traceId);
    if (!isWithin24h) {
      logger.warn('Message received outside 24-hour window', {
        conversationId: convId,
        traceId,
      });

      // Store message but don't process
      await MessageRepository.create({
        conversation_id: convId,
        sender_type: 'user',
        message_text: messageText,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        metadata: { intent: 'outside_window' },
        status: 'pending',
      });

      await ComplianceService.logComplianceDecision(
        convId,
        'warned',
        'Message outside 24-hour window - no AI processing',
        traceId
      );

      return {
        conversationId: convId,
        messageProcessed: true,
        error: 'Message outside 24-hour window',
      };
    }

    // Step 7: Store incoming message
    await MessageRepository.create({
      conversation_id: convId,
      sender_type: 'user',
      message_text: messageText,
      message_type: 'text',
      whatsapp_message_id: whatsappMessageId,
      metadata: { intent: 'pending' },
      status: 'pending',
    });

    // Step 8: Update conversation timestamps
    await ConversationRepository.incrementMessageCount(convId);
    await ConversationRepository.updateLastUserMessageAt(convId, new Date());

    // Step 9: Transition state if awaiting response (SARA-3.3 state transition)
    if (conversation.status === 'awaiting_response') {
      await ConversationService.updateState(
        convId,
        ConversationStatus.ACTIVE,
        'First user message',
        traceId
      );
      logger.info('Conversation transitioned to ACTIVE', {
        conversationId: convId,
        traceId,
      });
    }

    // Step 10: Increment cycle count (SARA-3.3 cycle tracking)
    const cycleCount = await ConversationService.incrementCycleCount(convId);
    logger.debug('Cycle count incremented', {
      conversationId: convId,
      cycleCount,
      traceId,
    });

    // Check if max cycles reached
    if (cycleCount >= SARA_CONFIG.conversation.maxCycles) {
      logger.info('Max cycles reached, closing conversation', {
        conversationId: convId,
        cycleCount,
        maxCycles: SARA_CONFIG.conversation.maxCycles,
        traceId,
      });

      // Send closure message
      await MessageService.send(
        convId,
        phoneNumber,
        'Obrigado! Encerramos essa conversa. Você pode continuar comprando através do link fornecido.',
        'text',
        { traceId }
      );

      // Close conversation
      await ConversationService.updateState(
        convId,
        ConversationStatus.CLOSED,
        'Max cycles reached',
        traceId
      );

      return {
        conversationId: convId,
        messageProcessed: true,
        error: 'Max cycles reached',
      };
    }

    // Step 11: Build SARA context and call AI
    const saraContext = await ConversationService.loadForContext(convId, phoneNumber, traceId);

    // Step 12: Call AIService to interpret message
    const aiResponse = await AIService.interpretMessage(saraContext, messageText, traceId);

    logger.info('AI response generated', {
      conversationId: convId,
      traceId,
      intent: aiResponse.intent,
      sentiment: aiResponse.sentiment,
      tokensUsed: aiResponse.tokens_used,
    });

    // Step 13: Store AI response in messages
    const responseMessage = await MessageRepository.create({
      conversation_id: convId,
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

    // Step 14: Send message via WhatsApp
    const sendResult = await MessageService.send(convId, phoneNumber, aiResponse.response, 'text', {
      traceId,
    });

    if (sendResult.status === 'failed') {
      logger.warn('Failed to send message immediately, queuing for retry', {
        conversationId: convId,
        traceId,
        error: sendResult.error,
      });

      // Queue for retry
      await SendMessageQueue.addJob({
        conversationId: convId,
        phoneNumber,
        messageText: aiResponse.response,
        messageType: 'text',
        traceId,
      });

      return {
        conversationId: convId,
        messageProcessed: true,
        responseMessageId: responseMessage.id,
      };
    }

    // Step 15: Update message with WhatsApp ID
    if (sendResult.whatsappMessageId) {
      await MessageRepository.update(responseMessage.id, {
        whatsapp_message_id: sendResult.whatsappMessageId,
        status: sendResult.status === 'sent' ? 'sent' : 'pending',
      });
    }

    // Step 16: Update conversation timestamps
    await ConversationRepository.updateLastMessageAt(convId, new Date());

    logger.info('Message processed successfully (SARA-3.3)', {
      conversationId: convId,
      traceId,
      cycleCount,
      responseMessageId: responseMessage.id,
    });

    return {
      conversationId: convId,
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
