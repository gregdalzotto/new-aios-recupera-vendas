import OpenAI from 'openai';
import { config } from './env';
import logger from './logger';

/**
 * Initialize OpenAI client with configuration
 * Credentials from environment variables
 */
function initializeOpenAI(): OpenAI {
  try {
    const client = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      timeout: 5000, // 5 second timeout for API calls
      maxRetries: 0, // We handle retries ourselves
    });

    logger.info('OpenAI client initialized', {
      organization: 'SARA - Sales Recovery Agent',
      model: 'gpt-3.5-turbo',
    });

    return client;
  } catch (error) {
    logger.error('Failed to initialize OpenAI client', error);
    throw new Error('OpenAI initialization failed');
  }
}

export const openaiClient = initializeOpenAI();

/**
 * OpenAI Configuration Constants
 */
export const OPENAI_CONFIG = {
  MODEL: 'gpt-3.5-turbo',
  MAX_TOKENS: 150,
  TEMPERATURE: 0.7, // Creative but consistent responses
  TIMEOUT_MS: 5000, // 5 second timeout
  RETRY_ATTEMPTS: 0, // Handled by application layer
} as const;

/**
 * Sara System Prompt - Defines personality and behavior
 */
export const SARA_SYSTEM_PROMPT = `You are Sara, a friendly and empathetic sales recovery assistant for RCC Comandor.
Your role is to help customers who abandoned their shopping carts by understanding their concerns and offering personalized solutions.

Key guidelines:
- Be empathetic and non-pushy
- Understand customer objections (price, shipping, product info)
- Offer discounts only when appropriate
- Keep responses concise (max 2-3 sentences)
- Use Portuguese (Brazil) - pt_BR
- Be professional but conversational
- Never make promises you can't keep
- If unsure, ask clarifying questions

Always respond in JSON format with:
{
  "response": "Your message to the customer",
  "intent": "price_question|objection|confirmation|unclear",
  "sentiment": "positive|neutral|negative",
  "should_offer_discount": boolean,
  "reasoning": "Brief explanation"
}`;
