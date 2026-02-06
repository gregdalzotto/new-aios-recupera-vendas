import logger from '../config/logger';
import { ConversationRepository, Conversation } from '../repositories/ConversationRepository';
import { AbandonmentRepository } from '../repositories/AbandonmentRepository';
import { UserRepository } from '../repositories/UserRepository';
import { MessageRepository } from '../repositories/MessageRepository';
import { MessageService } from './MessageService';
import { SaraContextPayload, SaraMessageHistory } from '../types/sara';
import { SARA_CONFIG } from '../config/env';

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

  /**
   * Check if user has opted out
   */
  static async isOptedOut(userId: string): Promise<boolean> {
    try {
      const user = await UserRepository.findById(userId);
      return user?.opted_out ?? false;
    } catch (error) {
      logger.error('Error checking opt-out status', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load complete conversation context for AI processing
   * Returns SaraContextPayload with all conversation data
   */
  static async loadForContext(
    conversationId: string,
    phoneNumber: string,
    traceId: string
  ): Promise<SaraContextPayload> {
    try {
      // 1. Get conversation
      const conversation = await ConversationRepository.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // 2. Get user
      const user = await UserRepository.findById(conversation.user_id);
      if (!user) {
        throw new Error('User not found for conversation');
      }

      // 3. Get abandonment
      const abandonment = conversation.abandonment_id
        ? await AbandonmentRepository.findById(conversation.abandonment_id)
        : null;
      if (!abandonment) {
        throw new Error('Abandonment not found for conversation');
      }

      // 4. Get message history (configurable limit)
      const messages = await MessageRepository.findByConversationId(
        conversationId,
        SARA_CONFIG.message.historyLimit
      );

      // 5. Format history for AI
      const history: SaraMessageHistory[] = messages.map((msg) => ({
        role: msg.sender_type === 'user' ? ('user' as const) : ('assistant' as const),
        content: msg.message_text,
        timestamp: msg.created_at,
      }));

      // 6. Build payment context
      const paymentConfig = {
        originalLink: `https://pay.example.com/order/${abandonment.id}`,
        discountLink: undefined,
        discountPercent: undefined,
        discountWasOffered: false,
      };

      // 7. Get cycle count
      const cycleCount = conversation.cycle_count || 0;

      // 8. Get message count for analytics
      const messageCount = await MessageService.getMessageCount(conversationId);

      // 9. Build context payload
      const context: SaraContextPayload = {
        user: {
          id: user.id,
          name: user.name || 'Usuário',
          phone: phoneNumber,
        },
        abandonment: {
          id: abandonment.id,
          product: abandonment.product_id || 'Produto',
          productId: abandonment.product_id || '',
          cartValue: Math.round(abandonment.value * 100),
          currency: 'BRL',
          createdAt: abandonment.created_at,
        },
        conversation: {
          id: conversation.id,
          state: (conversation.status.toUpperCase() || 'ACTIVE') as any,
          cycleCount,
          maxCycles: 5,
          startedAt: conversation.created_at,
        },
        payment: paymentConfig,
        history,
        metadata: {
          messageCount,
          lastMessageAt: conversation.last_message_at,
          lastUserMessageAt: conversation.last_user_message_at,
        },
      };

      logger.debug('Conversation context loaded', {
        conversationId,
        userId: user.id,
        historyLength: history.length,
        cycleCount,
        traceId,
      });

      return context;
    } catch (error) {
      logger.error('Error loading conversation context', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get full conversation history with pagination
   */
  static async getFullHistory(
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
    traceId?: string
  ) {
    try {
      const messages = await MessageService.getConversationHistory(conversationId, limit, offset);

      logger.debug('Conversation history retrieved', {
        conversationId,
        messageCount: messages.length,
        limit,
        offset,
        traceId,
      });

      return messages;
    } catch (error) {
      logger.error('Error retrieving conversation history', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      throw error;
    }
  }

  /**
   * Get conversation metadata
   */
  static async getMetadata(conversationId: string, traceId?: string) {
    try {
      const conversation = await ConversationRepository.findById(conversationId);
      if (!conversation) {
        return null;
      }

      const messageCount = await MessageService.getMessageCount(conversationId);
      const userMessageCount = await MessageService.getMessageCount(conversationId, 'user');
      const saraMessageCount = await MessageService.getMessageCount(conversationId, 'sara');

      const metadata = {
        conversationId,
        status: conversation.status,
        cycleCount: conversation.cycle_count || 0,
        messageCount,
        userMessageCount,
        saraMessageCount,
        createdAt: conversation.created_at,
        lastMessageAt: conversation.last_message_at,
        lastUserMessageAt: conversation.last_user_message_at,
      };

      logger.debug('Conversation metadata retrieved', {
        conversationId,
        messageCount,
        cycleCount: conversation.cycle_count,
        traceId,
      });

      return metadata;
    } catch (error) {
      logger.error('Error retrieving conversation metadata', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      throw error;
    }
  }

  /**
   * Update last message timestamp
   */
  static async updateLastMessageAt(conversationId: string, traceId?: string): Promise<void> {
    try {
      await ConversationRepository.updateLastMessageAt(conversationId, new Date());

      logger.debug('Updated last message timestamp', {
        conversationId,
        traceId,
      });
    } catch (error) {
      logger.error('Error updating last message timestamp', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      throw error;
    }
  }

  /**
   * Update conversation state with validation
   */
  static async updateState(
    conversationId: string,
    newState: ConversationStatus,
    reason?: string,
    traceId?: string
  ): Promise<void> {
    try {
      // Get current conversation
      const conversation = await ConversationRepository.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Get current status as enum
      const currentStatus =
        Object.values(ConversationStatus).find((s) => s === conversation.status) ||
        ConversationStatus.ACTIVE;

      // Validate transition
      const validTransitions = VALID_TRANSITIONS[currentStatus];
      if (!validTransitions.includes(newState)) {
        logger.warn('Invalid state transition attempted', {
          conversationId,
          fromState: currentStatus,
          toState: newState,
          reason,
          traceId,
        });
        throw new Error(`Invalid transition from ${currentStatus} to ${newState}`);
      }

      // Update state
      await ConversationRepository.updateStatus(conversationId, newState);

      logger.info('Conversation state updated', {
        conversationId,
        fromState: currentStatus,
        toState: newState,
        reason,
        traceId,
      });
    } catch (error) {
      logger.error('Error updating conversation state', {
        conversationId,
        newState,
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      throw error;
    }
  }

  /**
   * Get cycle count for conversation
   */
  static async getCycleCount(conversationId: string): Promise<number> {
    try {
      const conversation = await ConversationRepository.findById(conversationId);
      return conversation?.cycle_count ?? 0;
    } catch (error) {
      logger.error('Error getting cycle count', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Increment cycle count for conversation
   */
  static async incrementCycleCount(conversationId: string): Promise<number> {
    try {
      const currentCount = await this.getCycleCount(conversationId);
      const newCount = currentCount + 1;

      // Update in repository
      await ConversationRepository.updateCycleCount(conversationId, newCount);

      logger.debug('Cycle count incremented', {
        conversationId,
        from: currentCount,
        to: newCount,
      });

      return newCount;
    } catch (error) {
      logger.error('Error incrementing cycle count', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
