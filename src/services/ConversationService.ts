import logger from '../config/logger';
import { ConversationRepository, Conversation } from '../repositories/ConversationRepository';
import { AbandonmentRepository } from '../repositories/AbandonmentRepository';

/**
 * Conversation states
 */
export enum ConversationStatus {
  AWAITING_RESPONSE = 'awaiting_response',
  ACTIVE = 'active',
  CLOSED = 'closed',
  ERROR = 'error',
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  [ConversationStatus.AWAITING_RESPONSE]: [ConversationStatus.ACTIVE, ConversationStatus.CLOSED],
  [ConversationStatus.ACTIVE]: [ConversationStatus.CLOSED, ConversationStatus.ERROR],
  [ConversationStatus.ERROR]: [ConversationStatus.ACTIVE, ConversationStatus.CLOSED],
  [ConversationStatus.CLOSED]: [], // Terminal state
};

/**
 * ConversationService
 * Manages conversation state transitions and metadata updates
 */
export class ConversationService {
  /**
   * Find conversation by phone number
   * Prioritizes: ACTIVE > ERROR > AWAITING_RESPONSE
   */
  static async findByPhoneNumber(
    phoneNumber: string,
    traceId: string
  ): Promise<Conversation | null> {
    try {
      logger.debug('Finding conversation by phone', { phoneNumber, traceId });

      const conversation = await ConversationRepository.findByPhoneNumber(phoneNumber);

      if (conversation) {
        logger.debug('Conversation found', {
          conversationId: conversation.id,
          status: conversation.status,
          traceId,
        });
      }

      return conversation;
    } catch (error) {
      logger.error('Error finding conversation by phone', {
        phoneNumber,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create new conversation for abandonment
   */
  static async create(
    abandonmentId: string,
    userId: string,
    traceId: string
  ): Promise<Conversation> {
    try {
      logger.info('Creating new conversation', {
        abandonmentId,
        userId,
        traceId,
      });

      const conversation = await ConversationRepository.create(abandonmentId, userId);

      logger.info('Conversation created', {
        conversationId: conversation.id,
        status: conversation.status,
        traceId,
      });

      return conversation;
    } catch (error) {
      logger.error('Error creating conversation', {
        abandonmentId,
        userId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update conversation status with validation
   */
  static async updateStatus(
    conversationId: string,
    newStatus: ConversationStatus,
    traceId: string
  ): Promise<void> {
    try {
      const conversation = await ConversationRepository.findById(conversationId);

      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      const currentStatus = conversation.status as ConversationStatus;

      // Validate state transition
      if (!VALID_TRANSITIONS[currentStatus]?.includes(newStatus)) {
        throw new Error(`Invalid state transition: ${currentStatus} → ${newStatus}`);
      }

      logger.info('Updating conversation status', {
        conversationId,
        currentStatus,
        newStatus,
        traceId,
      });

      await ConversationRepository.updateStatus(conversationId, newStatus);

      logger.info('Conversation status updated', {
        conversationId,
        newStatus,
        traceId,
      });
    } catch (error) {
      logger.error('Error updating conversation status', {
        conversationId,
        newStatus,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Increment message count
   */
  static async incrementMessageCount(conversationId: string, traceId: string): Promise<void> {
    try {
      await ConversationRepository.incrementMessageCount(conversationId);

      logger.debug('Message count incremented', {
        conversationId,
        traceId,
      });
    } catch (error) {
      logger.error('Error incrementing message count', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update last message timestamps
   */
  static async updateTimestamps(
    conversationId: string,
    lastUserMessage: boolean = false,
    traceId: string = ''
  ): Promise<void> {
    try {
      const now = new Date();

      const conversation = await ConversationRepository.findById(conversationId);
      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      // Update last_message_at (always)
      await ConversationRepository.updateLastMessageAt(conversationId, now);

      // Update last_user_message_at if this is a user message
      if (lastUserMessage) {
        await ConversationRepository.updateLastUserMessageAt(conversationId, now);
      }

      logger.debug('Timestamps updated', {
        conversationId,
        lastUserMessage,
        traceId,
      });
    } catch (error) {
      logger.error('Error updating timestamps', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if conversation is within 24-hour window
   * Used for Meta WhatsApp compliance
   */
  static async isWithinWindow(conversationId: string, traceId: string): Promise<boolean> {
    try {
      const conversation = await ConversationRepository.findById(conversationId);

      if (!conversation) {
        logger.warn('Conversation not found for window check', { conversationId, traceId });
        return false;
      }

      if (!conversation.last_user_message_at) {
        // No user messages yet, use creation time
        const createdAtTime = new Date(conversation.created_at).getTime();
        const now = Date.now();
        const isWithin = now - createdAtTime < 24 * 60 * 60 * 1000;

        logger.debug('Window check (from creation)', {
          conversationId,
          isWithin,
          traceId,
        });

        return isWithin;
      }

      // Check against last user message
      const lastUserMessageTime = new Date(conversation.last_user_message_at).getTime();
      const now = Date.now();
      const isWithin = now - lastUserMessageTime < 24 * 60 * 60 * 1000;

      logger.debug('Window check (from last user message)', {
        conversationId,
        isWithin,
        minutesRemaining: Math.floor((24 * 60 * 60 * 1000 - (now - lastUserMessageTime)) / 60000),
        traceId,
      });

      return isWithin;
    } catch (error) {
      logger.error('Error checking window', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get conversation with full context (for debugging/analytics)
   */
  static async getWithContext(
    conversationId: string,
    traceId: string
  ): Promise<{ conversation: Conversation; abandonment: any } | null> {
    try {
      const conversation = await ConversationRepository.findById(conversationId);

      if (!conversation) {
        return null;
      }

      const abandonment = await AbandonmentRepository.findById(conversation.abandonment_id);

      return { conversation, abandonment };
    } catch (error) {
      logger.error('Error getting conversation with context', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
