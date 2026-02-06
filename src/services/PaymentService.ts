import logger from '../config/logger';
import { AbandonmentRepository } from '../repositories/AbandonmentRepository';
import { ConversationService, ConversationStatus } from './ConversationService';

/**
 * PaymentService
 * Handles payment webhook callbacks and conversation state updates
 * SARA-3.4: Payment Webhook Handler
 *
 * Responsibilities:
 * 1. Validate payment webhook payloads
 * 2. Ensure idempotency (via unique payment_id)
 * 3. Update abandonment status based on payment status
 * 4. Sync conversation state (CONVERTED/DECLINED/PENDING)
 * 5. Track conversion for analytics and audit
 */
export class PaymentService {
  /**
   * Payment status mapping from external payment system to SARA status
   */
  private static readonly STATUS_MAPPING: Record<string, string> = {
    completed: 'converted',
    succeeded: 'converted',
    captured: 'converted',
    approved: 'converted',
    pending: 'pending',
    processing: 'pending',
    declined: 'declined',
    failed: 'declined',
    cancelled: 'declined',
    refunded: 'declined',
  };

  /**
   * Process payment webhook callback
   * Validates payload, ensures idempotency, updates conversation state
   */
  static async processPaymentWebhook(
    payload: unknown,
    traceId: string
  ): Promise<{
    status: 'processed' | 'already_processed' | 'failed';
    abandonmentId: string;
    conversationId: string;
    paymentStatus: string;
    message: string;
  }> {
    try {
      // Step 1: Validate and parse payload
      const validation = this.validatePayload(payload);
      if (!validation.valid) {
        logger.warn('Invalid payment webhook payload', {
          traceId,
          errors: validation.errors || [],
        });
        throw new Error(`Invalid payload: ${(validation.errors || []).join(', ')}`);
      }

      if (!validation.data) {
        throw new Error('Validation data is missing');
      }

      const validData = validation.data as Record<string, unknown>;
      const paymentId = validData.payment_id as string;
      const abandonmentId = validData.abandonment_id as string;
      const paymentStatus = validData.status as string;
      const amount = validData.amount as number | undefined;

      logger.info('Processing payment webhook', {
        traceId,
        abandonmentId,
        paymentId,
        paymentStatus,
        amount,
      });

      // Step 2: Check idempotency via payment_id
      const existingAbandonment = await AbandonmentRepository.findByPaymentId(paymentId);
      if (existingAbandonment) {
        logger.info('Payment already processed (idempotency check)', {
          traceId,
          paymentId,
          abandonmentId: existingAbandonment.id,
          previousStatus: existingAbandonment.status,
        });

        return {
          status: 'already_processed',
          abandonmentId: existingAbandonment.id,
          conversationId: existingAbandonment.conversation_id || '',
          paymentStatus: existingAbandonment.status,
          message: 'Payment already processed',
        };
      }

      // Step 3: Load abandonment record
      const abandonment = await AbandonmentRepository.findById(abandonmentId);
      if (!abandonment) {
        logger.warn('Abandonment not found for payment webhook', {
          traceId,
          abandonmentId,
          paymentId,
        });
        throw new Error(`Abandonment not found: ${abandonmentId}`);
      }

      // Step 4: Map payment status to SARA status
      const saraStatus = this.STATUS_MAPPING[paymentStatus.toLowerCase()] || 'pending';
      logger.info('Mapped payment status to SARA status', {
        traceId,
        paymentStatus,
        saraStatus,
      });

      // Step 5: Update abandonment record with payment info
      await AbandonmentRepository.markAsConverted(abandonmentId, paymentId, saraStatus, amount);

      logger.info('Abandonment marked with payment status', {
        traceId,
        abandonmentId,
        saraStatus,
      });

      // Step 6: Update conversation state
      if (abandonment.conversation_id) {
        const convId = abandonment.conversation_id;

        // Map SARA status to ConversationStatus
        let conversationStatus: ConversationStatus = ConversationStatus.ACTIVE;
        if (saraStatus === 'converted') {
          conversationStatus = ConversationStatus.CLOSED;
        } else if (saraStatus === 'declined') {
          conversationStatus = ConversationStatus.CLOSED;
        }

        await ConversationService.updateState(
          convId,
          conversationStatus,
          `Payment ${saraStatus}: ${paymentId}`,
          traceId
        );

        logger.info('Conversation state updated based on payment', {
          traceId,
          conversationId: convId,
          newStatus: conversationStatus,
          paymentStatus: saraStatus,
        });
      }

      logger.info('Payment webhook processed successfully', {
        traceId,
        abandonmentId,
        paymentId,
        status: saraStatus,
      });

      return {
        status: 'processed',
        abandonmentId,
        conversationId: abandonment.conversation_id || '',
        paymentStatus: saraStatus,
        message: `Payment processed: ${saraStatus}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error processing payment webhook', {
        traceId,
        error: errorMessage,
      });

      return {
        status: 'failed',
        abandonmentId: '',
        conversationId: '',
        paymentStatus: 'error',
        message: errorMessage,
      };
    }
  }

  /**
   * Validate payment webhook payload structure and required fields
   */
  private static validatePayload(payload: unknown): {
    valid: boolean;
    data?: Record<string, unknown>;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!payload || typeof payload !== 'object') {
      errors.push('Payload must be an object');
      return { valid: false, errors };
    }

    const data = payload as Record<string, unknown>;

    // Required fields
    if (!data.payment_id) {
      errors.push('Missing required field: payment_id');
    } else if (typeof data.payment_id !== 'string' || data.payment_id.length === 0) {
      errors.push('payment_id must be a non-empty string');
    }

    if (!data.abandonment_id) {
      errors.push('Missing required field: abandonment_id');
    } else if (typeof data.abandonment_id !== 'string' || data.abandonment_id.length === 0) {
      errors.push('abandonment_id must be a non-empty string');
    }

    if (!data.status) {
      errors.push('Missing required field: status');
    } else if (typeof data.status !== 'string') {
      errors.push('status must be a string');
    }

    // Optional but validated fields
    if (data.amount !== undefined) {
      if (typeof data.amount !== 'number' || data.amount < 0) {
        errors.push('amount must be a non-negative number');
      }
    }

    if (data.currency !== undefined) {
      if (typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency)) {
        errors.push('currency must be a valid 3-letter currency code (e.g., USD, BRL)');
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      data: {
        payment_id: data.payment_id,
        abandonment_id: data.abandonment_id,
        status: data.status,
        amount: data.amount as number | undefined,
        currency: data.currency as string | undefined,
      },
    };
  }

  /**
   * Get payment status for abandonment
   */
  static async getPaymentStatus(abandonmentId: string): Promise<{
    paymentId: string | null;
    status: string;
    convertedAt: string | null;
  }> {
    const abandonment = await AbandonmentRepository.findById(abandonmentId);

    if (!abandonment) {
      throw new Error(`Abandonment not found: ${abandonmentId}`);
    }

    return {
      paymentId: abandonment.payment_id,
      status: abandonment.status,
      convertedAt: abandonment.converted_at,
    };
  }

  /**
   * Check if abandonment is converted (payment completed)
   */
  static async isConverted(abandonmentId: string): Promise<boolean> {
    const abandonment = await AbandonmentRepository.findById(abandonmentId);

    if (!abandonment) {
      return false;
    }

    return abandonment.status === 'converted';
  }

  /**
   * Get conversion analytics for a user
   */
  static async getUserConversionStats(userId: string): Promise<{
    totalAbandonments: number;
    convertedAbandonments: number;
    conversionRate: number;
    totalRevenue: number;
  }> {
    const abandonments = await AbandonmentRepository.findByUserId(userId);

    const totalAbandonments = abandonments.length;
    const convertedAbandonments = abandonments.filter((a) => a.status === 'converted').length;
    const conversionRate = totalAbandonments > 0 ? (convertedAbandonments / totalAbandonments) * 100 : 0;
    const totalRevenue = abandonments
      .filter((a) => a.status === 'converted')
      .reduce((sum, a) => sum + a.value, 0);

    return {
      totalAbandonments,
      convertedAbandonments,
      conversionRate,
      totalRevenue,
    };
  }
}
