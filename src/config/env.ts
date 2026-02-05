import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // WhatsApp
  WHATSAPP_VERIFY_TOKEN: z.string().min(10, 'Must be at least 10 characters'),
  WHATSAPP_APP_SECRET: z.string().min(20, 'Must be at least 20 characters'),
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

export const config = validateEnv();

export type Config = typeof config;
