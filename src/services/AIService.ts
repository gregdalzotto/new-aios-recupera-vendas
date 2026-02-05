import logger from '../config/logger';
import { openaiClient, OPENAI_CONFIG, SARA_SYSTEM_PROMPT } from '../config/openai';
import { Message } from '../models/Message';

/**
 * AI Response from OpenAI
 */
export interface AIResponse {
  response: string;
  intent: 'price_question' | 'objection' | 'confirmation' | 'unclear';
  sentiment: 'positive' | 'neutral' | 'negative';
  should_offer_discount: boolean;
  tokens_used: number;
  response_id?: string; // OpenAI response ID for tracking
}

/**
 * Context for AI interpretation (conversation history)
 */
export interface AIContext {
  conversationId: string;
  userId: string;
  productName: string;
  cartValue: number;
  offersAlreadyMade: number;
  messageHistory: Message[]; // Last N messages
  traceId: string;
}

/**
 * AIService - OpenAI Integration for message interpretation
 * Analyzes user messages and generates contextual Sara responses
 */
export class AIService {
  /**
   * Timeout promise for OpenAI calls
   */
  private static createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`OpenAI API timeout exceeded ${OPENAI_CONFIG.TIMEOUT_MS}ms`));
      }, OPENAI_CONFIG.TIMEOUT_MS);
    });
  }

  /**
   * Build conversation history for context
   */
  private static buildHistoryText(messages: Message[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    // Reverse to get chronological order (oldest first)
    const sortedMessages = [...messages].reverse();

    const historyText = sortedMessages
      .map((msg) => {
        const sender = msg.sender_type === 'user' ? 'Customer' : 'Sara';
        return `${sender}: ${msg.message_text}`;
      })
      .join('\n');

    return `Recent conversation:\n${historyText}\n\n`;
  }

  /**
   * Build user message for OpenAI
   */
  private static buildUserMessage(context: AIContext, userMessage: string): string {
    const historyText = this.buildHistoryText(context.messageHistory);
    const productInfo = context.productName ? `Product: ${context.productName}\n` : '';
    const cartValueInfo = context.cartValue
      ? `Cart Value: R$${context.cartValue.toFixed(2)}\n`
      : '';

    return `${historyText}${productInfo}${cartValueInfo}Customer's latest message: "${userMessage}"`;
  }

  /**
   * Interpret user message and generate Sara response
   */
  static async interpretMessage(context: AIContext, userMessage: string): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      logger.debug('Starting message interpretation', {
        conversationId: context.conversationId,
        traceId: context.traceId,
      });

      // Build the user message with context
      const userMessageWithContext = this.buildUserMessage(context, userMessage);

      // Call OpenAI with timeout protection
      const response = await Promise.race([
        openaiClient.chat.completions.create({
          model: OPENAI_CONFIG.MODEL,
          messages: [
            {
              role: 'system',
              content: SARA_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: userMessageWithContext,
            },
          ],
          temperature: OPENAI_CONFIG.TEMPERATURE,
          max_tokens: OPENAI_CONFIG.MAX_TOKENS,
        }),
        this.createTimeoutPromise(),
      ]);

      // Parse OpenAI response
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response from Sara
      const parsedResponse = JSON.parse(content);

      // Validate response structure
      if (!parsedResponse.response || !parsedResponse.intent || !parsedResponse.sentiment) {
        throw new Error('Invalid response structure from OpenAI');
      }

      // Determine if should offer discount based on criteria
      const shouldOfferDiscount = this.shouldOfferDiscount(
        context,
        parsedResponse.intent,
        parsedResponse.should_offer_discount
      );

      const aiResponse: AIResponse = {
        response: parsedResponse.response,
        intent: parsedResponse.intent,
        sentiment: parsedResponse.sentiment,
        should_offer_discount: shouldOfferDiscount,
        tokens_used: response.usage?.total_tokens || 0,
        response_id: response.id,
      };

      const duration = Date.now() - startTime;
      logger.info('Message interpretation completed', {
        conversationId: context.conversationId,
        traceId: context.traceId,
        intent: aiResponse.intent,
        sentiment: aiResponse.sentiment,
        tokensUsed: aiResponse.tokens_used,
        durationMs: duration,
      });

      return aiResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific error types
      if (errorMessage.includes('timeout')) {
        logger.warn('OpenAI timeout - returning fallback response', {
          conversationId: context.conversationId,
          traceId: context.traceId,
          durationMs: duration,
        });

        return this.getFallbackResponse('timeout');
      }

      if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
        logger.warn('OpenAI rate limited - returning fallback response', {
          conversationId: context.conversationId,
          traceId: context.traceId,
          error: errorMessage,
        });

        return this.getFallbackResponse('rate_limit');
      }

      if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
        logger.error('OpenAI authentication failed', {
          conversationId: context.conversationId,
          traceId: context.traceId,
          error: errorMessage,
        });

        throw new Error('OpenAI authentication failed');
      }

      logger.error('OpenAI API error', {
        conversationId: context.conversationId,
        traceId: context.traceId,
        error: errorMessage,
        durationMs: duration,
      });

      return this.getFallbackResponse('error');
    }
  }

  /**
   * Determine if should offer discount based on criteria
   */
  private static shouldOfferDiscount(
    context: AIContext,
    intent: string,
    suggestedByAI: boolean
  ): boolean {
    // Criterion 1: Intent mentions price
    if (intent === 'price_question') {
      return true;
    }

    // Criterion 2: Cart value > R$500
    if (context.cartValue > 500) {
      return true;
    }

    // Criterion 3: Less than 3 offers already made
    if (context.offersAlreadyMade < 3) {
      return suggestedByAI;
    }

    return false;
  }

  /**
   * Get fallback response (for errors/timeouts)
   */
  private static getFallbackResponse(reason: 'timeout' | 'rate_limit' | 'error'): AIResponse {
    const fallbackMessages = {
      timeout: 'Um momento enquanto avalio sua mensagem...',
      rate_limit: 'Deixa eu pensar um pouco sobre isso...',
      error: 'Desculpa, estou tendo dificuldade em processar. Pode tentar novamente?',
    };

    return {
      response: fallbackMessages[reason],
      intent: 'unclear',
      sentiment: 'neutral',
      should_offer_discount: false,
      tokens_used: 0,
    };
  }

  /**
   * Get cost estimate for tokens (for Phase 2: analytics)
   */
  static estimateCost(tokensUsed: number): number {
    // gpt-3.5-turbo pricing (as of 2024)
    // Input: $0.50 per 1M tokens
    // Output: $1.50 per 1M tokens
    // Approximate average: $1.00 per 1M tokens
    const costPer1MTokens = 1.0;
    return (tokensUsed / 1000000) * costPer1MTokens;
  }
}
