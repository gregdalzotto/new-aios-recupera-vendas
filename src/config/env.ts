import 'dotenv/config';
import { z } from 'zod';
import { URL } from 'url';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // WhatsApp
  WHATSAPP_PHONE_ID: z.string().min(10, 'Must be a valid phone number ID'),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(10, 'Must be a valid business account ID'),
  WHATSAPP_APP_ID: z.string().min(10, 'Must be a valid app ID'),
  WHATSAPP_APP_SECRET: z.string().min(20, 'Must be at least 20 characters'),
  WHATSAPP_VERIFY_TOKEN: z.string().min(10, 'Must be at least 10 characters'),
  WHATSAPP_ACCESS_TOKEN: z.string().min(20, 'Must be a valid access token'),
  WHATSAPP_TEMPLATE_INITIAL: z
    .string()
    .min(1, 'Must not be empty')
    .regex(/^[a-z0-9_]+$/i, 'Must be a valid template name (alphanumeric and underscores)'),

  // Database
  DATABASE_URL: z
    .string()
    .url('Must be a valid URL')
    .refine((url) => url.startsWith('postgres'), 'Must be a PostgreSQL connection string'),

  // Redis (Cache & Queue)
  REDIS_URL: z
    .string()
    .url('Must be a valid URL')
    .refine((url) => url.startsWith('redis://'), 'Must be a Redis connection string'),

  // OpenAI
  OPENAI_API_KEY: z.string().min(20, 'Must be a valid OpenAI API key'),

  // SARA Configuration (optional with defaults)
  SARA_MAX_CYCLES: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 5))
    .refine((val) => val >= 1 && val <= 100, 'Must be between 1 and 100'),
  SARA_MESSAGE_HISTORY_LIMIT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .refine((val) => val >= 1 && val <= 1000, 'Must be between 1 and 1000'),
  SARA_SYSTEM_PROMPT_CACHE_TTL_MS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 3600000))
    .refine((val) => val >= 60000, 'Must be at least 60000ms (1 minute)'),
  SARA_OPENAI_RETRY_MAX_ATTEMPTS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 3))
    .refine((val) => val >= 1 && val <= 10, 'Must be between 1 and 10'),
  SARA_OPENAI_RETRY_INITIAL_DELAY_MS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1000))
    .refine((val) => val >= 100 && val <= 10000, 'Must be between 100ms and 10000ms'),
  SARA_WEBHOOK_RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 900000))
    .refine((val) => val >= 60000, 'Must be at least 60000ms (1 minute)'),
  SARA_WEBHOOK_RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine((val) => val >= 1, 'Must be at least 1'),
});

// Parse and validate environment variables
function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n  ');

      console.error('❌ Invalid environment configuration:\n  ' + missingVars);
      process.exit(1);
    }
    throw error;
  }
}

const parsedConfig = validateEnv();

// Parse Redis URL for BullMQ (needs separate host, port, username, password)
function parseRedisUrl(redisUrl: string) {
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port, 10),
      username: url.username,
      password: url.password,
    };
  } catch (error) {
    console.error('❌ Failed to parse REDIS_URL:', error);
    throw error;
  }
}

export const config = {
  ...parsedConfig,
  REDIS_CONFIG: parseRedisUrl(parsedConfig.REDIS_URL),
};

export type Config = typeof config;
