import { UserRepository } from '../repositories/UserRepository';
import { AbandonmentRepository, Abandonment } from '../repositories/AbandonmentRepository';
import { ConversationRepository, Conversation } from '../repositories/ConversationRepository';
import logger from '../config/logger';

export interface ProcessAbandonmentRequest {
  userId: string;
  name: string;
  phone: string;
  productId: string;
  paymentLink: string;
  abandonmentId: string;
  value: number;
  timestamp?: number;
}

export interface ProcessAbandonmentResponse {
  status: 'processed' | 'already_processed';
  abandonmentId: string;
  conversationId?: string;
}

export class AbandonmentService {
  /**
   * Process an abandonment webhook
   * Handles user creation, abandonment creation, and conversation initialization
   * Implements idempotency via UNIQUE constraint on external_id
   */
  static async processAbandonment(
    request: ProcessAbandonmentRequest,
    traceId: string
  ): Promise<ProcessAbandonmentResponse> {
    logger.info('Processing abandonment', {
      traceId,
      userId: request.userId,
      phone: request.phone,
      abandonmentId: request.abandonmentId,
    });

    // Check if abandonment already exists (idempotency)
    const existingAbandonment = await AbandonmentRepository.findByExternalId(request.abandonmentId);

    if (existingAbandonment) {
      logger.info('Abandonment already processed', {
        traceId,
        abandonmentId: request.abandonmentId,
        existingId: existingAbandonment.id,
      });

      return {
        status: 'already_processed',
        abandonmentId: existingAbandonment.id,
      };
    }

    // Check if user is opted out
    let userId = request.userId;

    try {
      const user = await UserRepository.findById(userId);

      if (user && user.opted_out) {
        logger.warn('User has opted out, skipping abandonment processing', {
          traceId,
          userId,
        });

        return {
          status: 'already_processed',
          abandonmentId: request.abandonmentId,
        };
      }

      // Create or update user
      if (!user) {
        userId = await UserRepository.upsert(request.phone, request.name);
        logger.info('User created', { traceId, userId, phone: request.phone });
      } else if (user.name !== request.name) {
        // Update name if different
        await UserRepository.upsert(request.phone, request.name);
        logger.info('User updated', { traceId, userId });
      }
    } catch (error) {
      logger.error('Error checking/creating user', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Create abandonment record
    let abandonment: Abandonment;

    try {
      abandonment = await AbandonmentRepository.create(
        userId,
        request.abandonmentId,
        request.productId,
        request.value,
        request.paymentLink
      );

      logger.info('Abandonment record created', {
        traceId,
        abandonmentId: abandonment.id,
        externalId: request.abandonmentId,
      });
    } catch (error) {
      logger.error('Error creating abandonment', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Create conversation record
    let conversation: Conversation;

    try {
      conversation = await ConversationRepository.create(abandonment.id, userId);

      logger.info('Conversation created', {
        traceId,
        conversationId: conversation.id,
        abandonmentId: abandonment.id,
      });
    } catch (error) {
      logger.error('Error creating conversation', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return {
      status: 'processed',
      abandonmentId: abandonment.id,
      conversationId: conversation.id,
    };
  }
}
