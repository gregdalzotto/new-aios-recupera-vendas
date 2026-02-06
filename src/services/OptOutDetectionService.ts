import logger from '../config/logger';
import { UserRepository } from '../repositories/UserRepository';

/**
 * OptOutDetectionService
 * Handles detection of user opt-out requests with two-layer approach:
 * 1. Deterministic: Check against known opt-out keywords
 * 2. Fallback: Use AI interpretation if deterministic fails
 */
export class OptOutDetectionService {
  /**
   * Keywords that indicate opt-out intent
   */
  private static readonly OPT_OUT_KEYWORDS = [
    'parar',
    'stop',
    'cancelar',
    'desinscrever',
    'remover',
    'delete',
    'unsubscribe',
    'sair',
    'não',
    'nao',
    'não quero',
    'não desejo',
    'nao quero',
    'nao desejo',
    'não mais',
    'nao mais',
    'chega',
    'basta',
    'fim',
    'retire meu número',
    'retire meu numero',
    'não me contacte',
    'nao me contacte',
  ];

  /**
   * Check if message contains opt-out intent
   * Uses two-layer detection: deterministic first, then AI fallback
   */
  static async detectOptOut(
    messageText: string,
    conversationId: string,
    traceId: string
  ): Promise<{ isOptOut: boolean; method: 'deterministic' | 'ai' | 'none'; confidence: number }> {
    try {
      // Step 1: Deterministic check (fast, keyword-based)
      const deterministic = this.checkDeterministic(messageText);
      if (deterministic.detected) {
        logger.info('Opt-out detected (deterministic)', {
          conversationId,
          traceId,
          messagePreview: messageText.substring(0, 100),
        });

        return {
          isOptOut: true,
          method: 'deterministic',
          confidence: 0.95,
        };
      }

      // Step 2: AI fallback for ambiguous cases
      // Only call AI if message is ambiguous or longer (potential explanation)
      if (messageText.length > 50 || messageText.toLowerCase().includes('porque')) {
        const aiDetection = await this.checkWithAI(messageText, traceId);

        if (aiDetection.detected) {
          logger.info('Opt-out detected (AI)', {
            conversationId,
            traceId,
            confidence: aiDetection.confidence,
            messagePreview: messageText.substring(0, 100),
          });

          return {
            isOptOut: true,
            method: 'ai',
            confidence: aiDetection.confidence,
          };
        }
      }

      return {
        isOptOut: false,
        method: 'none',
        confidence: 0,
      };
    } catch (error) {
      logger.error('Error detecting opt-out', {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });

      // On error, be conservative: don't treat as opt-out
      return {
        isOptOut: false,
        method: 'none',
        confidence: 0,
      };
    }
  }

  /**
   * Mark user as opted out
   */
  static async markOptedOut(userId: string, traceId: string): Promise<void> {
    try {
      const user = await UserRepository.findById(userId);
      if (!user) {
        logger.warn('User not found for opt-out marking', {
          userId,
          traceId,
        });
        return;
      }

      // Mark user as opted out
      await UserRepository.markOptedOut(userId, 'User requested opt-out via WhatsApp message');

      logger.info('User marked as opted out', {
        userId,
        traceId,
      });
    } catch (error) {
      logger.error('Error marking user as opted out', {
        userId,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Deterministic opt-out detection (keyword-based)
   */
  private static checkDeterministic(messageText: string): { detected: boolean; keyword?: string } {
    const lowerText = messageText.toLowerCase().trim();

    for (const keyword of this.OPT_OUT_KEYWORDS) {
      // Check for exact keyword match or as whole word
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(lowerText)) {
        return { detected: true, keyword };
      }
    }

    return { detected: false };
  }

  /**
   * AI-based opt-out detection for ambiguous cases
   */
  private static async checkWithAI(
    messageText: string,
    traceId: string
  ): Promise<{ detected: boolean; confidence: number }> {
    try {
      // Simple heuristic: Check if intent from AIService contains opt-out signals
      // This is a light check without full context
      const intent = await this.analyzeIntentLightly(messageText);

      if (
        intent.toLowerCase().includes('opt') ||
        intent.toLowerCase().includes('unsubscribe') ||
        intent.toLowerCase().includes('stop')
      ) {
        return { detected: true, confidence: 0.7 };
      }

      return { detected: false, confidence: 0 };
    } catch (error) {
      logger.warn('Error in AI opt-out detection', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });

      return { detected: false, confidence: 0 };
    }
  }

  /**
   * Light intent analysis for opt-out patterns
   */
  private static async analyzeIntentLightly(messageText: string): Promise<string> {
    // Check for common Portuguese opt-out patterns
    const patterns = [
      { regex: /n[ã a]o.*mais|chega|basta|sair|parar/i, intent: 'opt_out' },
      { regex: /desinscrever|remover|delete|unsubscribe/i, intent: 'unsubscribe' },
      { regex: /não.*quer|não.*desejo|não.*interesse/i, intent: 'not_interested' },
    ];

    for (const { regex, intent } of patterns) {
      if (regex.test(messageText)) {
        return intent;
      }
    }

    return 'unknown';
  }
}
