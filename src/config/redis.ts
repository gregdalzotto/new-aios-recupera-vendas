import { createClient, RedisClientType } from 'redis';
import logger from './logger';
import { config } from './env';

let redisClient: RedisClientType | null = null;

/**
 * Get or create Redis client
 * Connects to Redis for cache and Bull queue
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  try {
    redisClient = createClient({
      url: config.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis: Max reconnection retries exceeded');
            return new Error('Max Redis reconnection retries exceeded');
          }

          const delay = Math.min(retries * 50, 500);
          logger.warn('Redis: Reconnecting...', { attempt: retries, delay });
          return delay;
        },
      },
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('disconnect', () => {
      logger.warn('Redis disconnected');
    });

    await redisClient.connect();
    logger.info('✅ Redis client initialized');

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Health check for Redis
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}

export default {
  getRedisClient,
  healthCheck,
  closeRedisClient,
};
