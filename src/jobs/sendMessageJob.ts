import type { Queue, Job } from 'bull';
import { getRedisClient } from '../config/redis';
import logger from '../config/logger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Bull = require('bull');

/**
 * Job payload for sending WhatsApp messages
 */
export interface SendMessagePayload {
  conversationId: string;
  phoneNumber: string;
  messageText: string;
  messageType: 'text' | 'template';
  templateName?: string;
  templateParams?: Record<string, string>;
  traceId: string;
}

/**
 * Job result/response
 */
export interface SendMessageResult {
  conversationId: string;
  messageId: string;
  status: 'sent' | 'failed';
  whatsappMessageId?: string;
  error?: string;
}

/**
 * Send Message Queue for handling outgoing WhatsApp messages asynchronously
 * Uses Bull with Redis backend for reliability and retry logic
 */
class SendMessageQueue {
  private static instance: Queue<SendMessagePayload>;

  /**
   * Get or create the queue singleton
   */
  static async getInstance(): Promise<Queue<SendMessagePayload>> {
    if (!this.instance) {
      const redis = await getRedisClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.instance = new Bull('send-message', {
        createClient: () => redis,
      }) as Queue<SendMessagePayload>;

      // Configure queue event listeners
      this.instance.on('completed', (job: Job<SendMessagePayload>) => {
        logger.debug('Message sending job completed', {
          jobId: job.id,
          conversationId: job.data.conversationId,
          traceId: job.data.traceId,
        });
      });

      this.instance.on('failed', (job: Job<SendMessagePayload>, err) => {
        logger.error('Message sending job failed', {
          jobId: job.id,
          conversationId: job.data.conversationId,
          traceId: job.data.traceId,
          attempt: job.attemptsMade,
          error: err.message,
        });
      });

      this.instance.on('error', (err) => {
        logger.error('Send message queue error', { error: err.message });
      });

      logger.info('Send Message Queue initialized');
    }

    return this.instance;
  }

  /**
   * Add a message sending job to the queue
   */
  static async addJob(
    payload: SendMessagePayload,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    }
  ): Promise<Job<SendMessagePayload>> {
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
      logger.info('Send Message Queue closed');
    }
  }

  /**
   * Register job handler
   * This should be called during application startup
   */
  static async registerHandler(
    handler: (job: Job<SendMessagePayload>) => Promise<SendMessageResult>
  ): Promise<void> {
    const queue = await this.getInstance();

    queue.process(async (job: Job<SendMessagePayload>) => {
      logger.debug('Processing message sending job', {
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

export default SendMessageQueue;
