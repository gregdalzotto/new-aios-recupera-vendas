/**
 * OpenAI Client Wrapper
 * Wraps OpenAI API calls with retry logic, error handling, and fallback responses
 * Ensures reliability and graceful degradation
 */

import OpenAI from 'openai';
import { SARA_CONFIG } from '../config/sara';
import logger from '../config/logger';
import { retryWithBackoff, shouldRetryOpenAIError } from '../utils/retryWithBackoff';

/**
 * Response format from OpenAI in JSON mode
 */
export interface OpenAIStructuredResponse {
  response: string;
  intent: 'price_question' | 'objection' | 'confirmation' | 'unclear';
  sentiment: 'positive' | 'neutral' | 'negative';
  should_offer_discount: boolean;
}

/**
 * OpenAI Client Wrapper
 * Handles retries, error handling, and fallback responses
 */
export class OpenAIClientWrapper {
  private static client: OpenAI;

  /**
   * Initialize the OpenAI client (called once during startup)
   */
  static initialize(client: OpenAI): void {
    this.client = client;
    logger.debug('OpenAIClientWrapper initialized');
  }

  /**
   * Call OpenAI API with retry logic
   *
   * @param messages - Chat messages for completion
   * @param systemPrompt - System prompt for SARA persona
   * @param traceId - Trace ID for logging
   * @returns Parsed response from OpenAI
   * @throws Error if all retries exhausted
   */
  static async callOpenAIWithRetry(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    traceId: string
  ): Promise<OpenAIStructuredResponse> {
    return retryWithBackoff(
      async () => {
        return this.callOpenAI(messages, systemPrompt, traceId);
      },
      {
        maxAttempts: SARA_CONFIG.openai.retryMaxAttempts,
        delayMs: SARA_CONFIG.openai.retryInitialDelayMs,
        backoffMultiplier: SARA_CONFIG.openai.retryBackoffMultiplier,
        traceId,
        shouldRetry: (error) => shouldRetryOpenAIError(error, 0),
        onRetry: (attempt, error, nextDelayMs) => {
          logger.warn('OpenAI API call failed, retrying', {
            traceId,
            attempt,
            error: error.message,
            nextDelayMs,
            maxAttempts: SARA_CONFIG.openai.retryMaxAttempts,
          });
        },
      }
    );
  }

  /**
   * Single OpenAI API call without retry
   * Called by retryWithBackoff
   */
  private static async callOpenAI(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    traceId: string
  ): Promise<OpenAIStructuredResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: SARA_CONFIG.openai.maxTokens,
        response_format: { type: 'json_object' },
      });

      const durationMs = Date.now() - startTime;

      // Extract and parse response
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      let parsedResponse: OpenAIStructuredResponse;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse OpenAI JSON response', {
          traceId,
          content: content.substring(0, 200),
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        throw new Error(`Invalid JSON response from OpenAI: ${parseError}`);
      }

      // Validate response structure
      this.validateResponse(parsedResponse, traceId);

      logger.debug('OpenAI API call succeeded', {
        traceId,
        durationMs,
        tokensUsed: response.usage?.total_tokens,
      });

      return parsedResponse;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      logger.error('OpenAI API call failed', {
        traceId,
        durationMs,
        error: err.message,
      });

      throw err;
    }
  }

  /**
   * Validate OpenAI response has required fields
   */
  private static validateResponse(response: any, traceId: string): void {
    const required = ['response', 'intent', 'sentiment', 'should_offer_discount'];
    const missing = required.filter((field) => !(field in response));

    if (missing.length > 0) {
      throw new Error(`OpenAI response missing required fields: ${missing.join(', ')}`);
    }

    // Validate intent
    const validIntents = ['price_question', 'objection', 'confirmation', 'unclear'];
    if (!validIntents.includes(response.intent)) {
      throw new Error(`Invalid intent: ${response.intent}`);
    }

    // Validate sentiment
    const validSentiments = ['positive', 'neutral', 'negative'];
    if (!validSentiments.includes(response.sentiment)) {
      throw new Error(`Invalid sentiment: ${response.sentiment}`);
    }

    // Validate should_offer_discount is boolean
    if (typeof response.should_offer_discount !== 'boolean') {
      throw new Error('should_offer_discount must be a boolean');
    }

    logger.debug('OpenAI response validated', {
      traceId,
      intent: response.intent,
      sentiment: response.sentiment,
    });
  }

  /**
   * Get fallback response when OpenAI fails after all retries
   * Used for graceful degradation
   */
  static getFallbackResponse(): OpenAIStructuredResponse {
    return {
      response: 'Desculpa, tive um problema técnico. Pode tentar novamente em alguns momentos?',
      intent: 'unclear',
      sentiment: 'neutral',
      should_offer_discount: false,
    };
  }
}
