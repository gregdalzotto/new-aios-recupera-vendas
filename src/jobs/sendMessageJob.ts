import { Queue, Worker, QueueEvents } from 'bullmq';
import { config } from '../config/env';
import logger from '../config/logger';

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
 * Send Message Queue for handling message sending with retry
 * Uses BullMQ with Redis backend
 */
class SendMessageQueue {
  private static instance: Queue<SendMessagePayload>;
  private static worker: Worker<SendMessagePayload> | null = null;
  private static queueEvents: QueueEvents | null = null;

  /**
   * Get or create the queue singleton
   */
  static async getInstance(): Promise<Queue<SendMessagePayload>> {
    if (!this.instance) {
      this.instance = new Queue<SendMessagePayload>('send-message', {
        connection: config.REDIS_CONFIG,
      });

      // Configure queue event listeners
      this.setupEventListeners();

      logger.info('Send Message Queue initialized');
    }

    return this.instance;
  }

  /**
   * Setup event listeners for queue
   */
  private static setupEventListeners(): void {
    if (!this.instance) return;

    this.queueEvents = new QueueEvents('send-message', {
      connection: config.REDIS_CONFIG,
    });

    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.debug('Message sending job completed', {
        jobId,
        result: returnvalue,
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('Message sending job failed', {
        jobId,
        error: failedReason,
      });
    });

    this.queueEvents.on('error', (error) => {
      logger.error('Send message queue error', { error: error.message });
    });
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
  ) {
    const queue = await this.getInstance();

    return queue.add('send-message', payload, {
      attempts: options?.attempts || 5,
      backoff: {
        type: 'exponential',
        delay: 1000, // Start with 1 second
      },
      removeOnComplete: true,
      removeOnFail: false,
      priority: options?.priority || 0,
      delay: options?.delay || 0,
    });
  }

  /**
   * Close the queue (for graceful shutdown)
   */
  static async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      logger.info('Send Message Worker closed');
    }

    if (this.queueEvents) {
      await this.queueEvents.close();
      logger.info('Send Message Queue Events closed');
    }

    if (this.instance) {
      await this.instance.close();
      logger.info('Send Message Queue closed');
    }
  }

  /**
   * Register job handler
   */
  static async registerHandler(
    handler: (payload: SendMessagePayload) => Promise<void>
  ): Promise<void> {
    await this.getInstance(); // Ensure queue is initialized

    this.worker = new Worker<SendMessagePayload>(
      'send-message',
      async (job) => {
        logger.debug('Sending message job', {
          jobId: job.id,
          conversationId: job.data.conversationId,
          phoneNumber: job.data.phoneNumber,
          traceId: job.data.traceId,
        });

        await handler(job.data);
      },
      {
        connection: config.REDIS_CONFIG,
        concurrency: 10, // Process up to 10 send jobs concurrently
      }
    );

    this.worker.on('error', (error) => {
      logger.error('Send message worker error', { error: error.message });
    });

    logger.info('Message send handler registered');
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

    const counts = await queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');

    return {
      waiting: counts.wait,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
    };
  }
}

export default SendMessageQueue;
