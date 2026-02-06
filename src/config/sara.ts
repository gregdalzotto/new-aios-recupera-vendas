/**
 * SARA Configuration
 * Centralized configuration for SARA agent and related services
 */

function getSaraConfig() {
  return {
    /**
     * Conversation Management
     */
    conversation: {
      maxCycles: parseInt(process.env.SARA_MAX_CYCLES || '5', 10),
    },

    /**
     * Message Processing
     */
    message: {
      historyLimit: parseInt(process.env.SARA_MESSAGE_HISTORY_LIMIT || '20', 10),
    },

    /**
     * System Prompt Caching
     */
    cache: {
      systemPromptTtlMs: parseInt(process.env.SARA_SYSTEM_PROMPT_CACHE_TTL_MS || '3600000', 10),
    },

    /**
     * OpenAI Integration
     */
    openai: {
      retryMaxAttempts: parseInt(process.env.SARA_OPENAI_RETRY_MAX_ATTEMPTS || '3', 10),
      retryInitialDelayMs: parseInt(process.env.SARA_OPENAI_RETRY_INITIAL_DELAY_MS || '1000', 10),
      retryBackoffMultiplier: 2,
      timeoutMs: 5000,
      maxTokens: 500,
    },

    /**
     * Webhook Rate Limiting
     */
    webhook: {
      rateLimitWindowMs: parseInt(process.env.SARA_WEBHOOK_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      rateLimitMaxRequests: parseInt(process.env.SARA_WEBHOOK_RATE_LIMIT_MAX_REQUESTS || '10', 10),
    },
  };
}

// Validate configuration on load
function validateSaraConfig() {
  const config = getSaraConfig();

  // Validate conversation config
  if (config.conversation.maxCycles < 1 || config.conversation.maxCycles > 100) {
    throw new Error('SARA_MAX_CYCLES must be between 1 and 100');
  }

  // Validate message config
  if (config.message.historyLimit < 1 || config.message.historyLimit > 1000) {
    throw new Error('SARA_MESSAGE_HISTORY_LIMIT must be between 1 and 1000');
  }

  // Validate cache config
  if (config.cache.systemPromptTtlMs < 60000) {
    // At least 1 minute
    throw new Error('SARA_SYSTEM_PROMPT_CACHE_TTL_MS must be at least 60000ms (1 minute)');
  }

  // Validate OpenAI config
  if (config.openai.retryMaxAttempts < 1 || config.openai.retryMaxAttempts > 10) {
    throw new Error('SARA_OPENAI_RETRY_MAX_ATTEMPTS must be between 1 and 10');
  }

  if (config.openai.retryInitialDelayMs < 100 || config.openai.retryInitialDelayMs > 10000) {
    throw new Error('SARA_OPENAI_RETRY_INITIAL_DELAY_MS must be between 100ms and 10000ms');
  }

  // Validate webhook config
  if (config.webhook.rateLimitMaxRequests < 1) {
    throw new Error('SARA_WEBHOOK_RATE_LIMIT_MAX_REQUESTS must be at least 1');
  }

  if (config.webhook.rateLimitWindowMs < 60000) {
    throw new Error('SARA_WEBHOOK_RATE_LIMIT_WINDOW_MS must be at least 60000ms (1 minute)');
  }

  return config;
}

export const SARA_CONFIG = validateSaraConfig();

export type SaraConfig = typeof SARA_CONFIG;
