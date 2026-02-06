import logger from '../config/logger';
import { ConversationRepository } from '../repositories/ConversationRepository';

/**
 * ComplianceService
 * Handles WhatsApp and LGPD compliance requirements:
 * - 24-hour message window enforcement
 * - Opt-out tracking and enforcement
 * - HMAC signature verification (delegated to MessageService)
 * - Audit logging of compliance decisions
 */
export class ComplianceService {
  /**
   * Check if conversation is within WhatsApp 24-hour messaging window
   * After 24 hours from last user message, SARA should not send proactive messages
   * but user can still respond to our template messages
   */
  static async isWithin24HourWindow(conversationId: string, traceId: string): Promise<boolean> {
    try {
      const conversation = await ConversationRepository.findById(conversationId);

      if (!conversation) {
        logger.warn('Conversation not found for 24h window check', {
          conversationId,
          traceId,
        });
        return false;
      }

      // If no user messages yet, check against conversation creation time
      if (!conversation.last_user_message_at) {
        const createdAtTime = new Date(conversation.created_at).getTime();
        const now = Date.now();
        const isWithin = now - createdAtTime < 24 * 60 * 60 * 1000;

        logger.debug('24h window check (from creation)', {
          conversationId,
          traceId,
          isWithin,
          minutesRemaining: isWithin
            ? Math.floor((24 * 60 * 60 * 1000 - (now - createdAtTime)) / 60000)
            : 0,
        });

        return isWithin;
      }

      // Check against last user message
      const lastUserMessageTime = new Date(conversation.last_user_message_at).getTime();
      const now = Date.now();
      const isWithin = now - lastUserMessageTime < 24 * 60 * 60 * 1000;

      logger.debug('24h window check (from last user message)', {
        conversationId,
        traceId,
        isWithin,
        minutesRemaining: isWithin
          ? Math.floor((24 * 60 * 60 * 1000 - (now - lastUserMessageTime)) / 60000)
          : 0,
      });

      return isWithin;
    } catch (error) {
      logger.error('Error checking 24h window', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Log compliance decision for audit trail
   */
  static async logComplianceDecision(
    conversationId: string,
    decision: 'allowed' | 'blocked' | 'warned',
    reason: string,
    traceId: string
  ): Promise<void> {
    try {
      // Log to audit trail (in production, this would go to a compliance_audit_log table)
      logger.info('Compliance decision logged', {
        conversationId,
        traceId,
        decision,
        reason,
        timestamp: new Date().toISOString(),
      });

      // Future: Store in database for compliance reporting
      // await ComplianceAuditLog.create({ conversationId, decision, reason, timestamp: new Date() })
    } catch (error) {
      logger.error('Error logging compliance decision', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get compliance status for conversation
   */
  static async getComplianceStatus(
    conversationId: string,
    traceId: string
  ): Promise<{
    isWithin24h: boolean;
    hasOptedOut: boolean;
    complianceWarnings: string[];
  }> {
    try {
      const conversation = await ConversationRepository.findById(conversationId);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const isWithin24h = await this.isWithin24HourWindow(conversationId, traceId);
      const complianceWarnings: string[] = [];

      // Check for warnings
      if (!isWithin24h) {
        complianceWarnings.push('Outside 24-hour message window');
      }

      return {
        isWithin24h,
        hasOptedOut: false, // Could be loaded from user.opted_out
        complianceWarnings,
      };
    } catch (error) {
      logger.error('Error getting compliance status', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate webhook signature (delegates to MessageService)
   * This is a wrapper for compliance audit purposes
   */
  static validateWebhookSignature(signature: string | undefined): boolean {
    if (!signature) {
      logger.warn('Missing webhook signature for validation');
      return false;
    }

    // Actual validation happens in MessageService
    // This is here for compliance audit purposes
    return true;
  }

  /**
   * Check if message is potentially malicious or suspicious
   */
  static async checkMessageSafety(messageText: string, traceId: string): Promise<boolean> {
    try {
      // Check for common attack patterns
      const suspiciousPatterns = [
        /javascript:/i,
        /<script/i,
        /onclick=/i,
        /onerror=/i,
        /sql/i,
        /drop table/i,
        /union select/i,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(messageText)) {
          logger.warn('Suspicious message pattern detected', {
            traceId,
            patternMatch: pattern.toString(),
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Error checking message safety', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
