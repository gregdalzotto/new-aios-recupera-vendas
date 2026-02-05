// eslint-disable-next-line @typescript-eslint/no-var-requires
const Bull = require('bull');
import type { Queue, Job } from 'bull';
import { getRedisClient } from '../config/redis';
import logger from '../config/logger';

/**
 * Job payload for processing incoming WhatsApp messages
 */
export interface ProcessMessagePayload {
  conversationId: string;
  whatsappMessageId: string;
  phoneNumber: string;
  messageText: string;
  traceId: string;
}

/**
 * Job result/response
 */
export interface ProcessMessageResult {
  conversationId: string;
  messageProcessed: boolean;
  responseMessageId?: string;
  error?: string;
}

/**
 * Process Message Queue for handling incoming messages asynchronously
 * Uses Bull with Redis backend
 */
class ProcessMessageQueue {
  private static instance: Queue<ProcessMessagePayload>;

  /**
   * Get or create the queue singleton
   */
  static async getInstance(): Promise<Queue<ProcessMessagePayload>> {
    if (!this.instance) {
      const redis = await getRedisClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.instance = new Bull('process-message', {
        createClient: () => redis,
      }) as Queue<ProcessMessagePayload>;

      // Configure queue event listeners
      this.instance.on('completed', (job: Job<ProcessMessagePayload>) => {
        logger.debug('Message processing job completed', {
          jobId: job.id,
          conversationId: job.data.conversationId,
          traceId: job.data.traceId,
        });
      });

      this.instance.on('failed', (job: Job<ProcessMessagePayload>, err) => {
        logger.error('Message processing job failed', {
          jobId: job.id,
          conversationId: job.data.conversationId,
          traceId: job.data.traceId,
          attempt: job.attemptsMade,
          error: err.message,
        });
      });

      this.instance.on('error', (err) => {
        logger.error('Message queue error', { error: err.message });
      });

      logger.info('Process Message Queue initialized');
    }

    return this.instance;
  }

  /**
   * Add a message processing job to the queue
   */
  static async addJob(
    payload: ProcessMessagePayload,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    }
  ): Promise<Job<ProcessMessagePayload>> {
    const queue = await this.getInstance();

    return queue.add(payload, {
      attempts: options?.attempts || 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // Start with 1 second
      },
      removeOnComplete: true, // Clean up completed jobs
      removeOnFail: false, // Keep failed jobs for debugging
      priority: options?.priority || 0,
      delay: options?.delay || 0,
    });
  }

  /**
   * Close the queue (for graceful shutdown)
   */
  static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.close();
      logger.info('Process Message Queue closed');
    }
  }

  /**
   * Register job handler
   * This should be called during application startup
   */
  static async registerHandler(
    handler: (job: Job<ProcessMessagePayload>) => Promise<ProcessMessageResult>
  ): Promise<void> {
    const queue = await this.getInstance();

    queue.process(async (job: Job<ProcessMessagePayload>) => {
      logger.debug('Processing message job', {
        jobId: job.id,
        conversationId: job.data.conversationId,
        traceId: job.data.traceId,
      });

      return handler(job);
    });
  }

  /**
   * Get queue statistics
   */
  static async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const queue = await this.getInstance();

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}

export default ProcessMessageQueue;
