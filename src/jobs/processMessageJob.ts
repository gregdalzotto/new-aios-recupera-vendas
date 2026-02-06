import { Queue, Worker, QueueEvents } from 'bullmq';
import { config } from '../config/env';
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
 * Uses BullMQ with Redis backend
 */
class ProcessMessageQueue {
  private static instance: Queue<ProcessMessagePayload>;
  private static worker: Worker<ProcessMessagePayload> | null = null;
  private static queueEvents: QueueEvents | null = null;

  /**
   * Get or create the queue singleton
   */
  static async getInstance(): Promise<Queue<ProcessMessagePayload>> {
    if (!this.instance) {
      this.instance = new Queue<ProcessMessagePayload>('process-message', {
        connection: config.REDIS_CONFIG,
      });

      // Configure queue event listeners
      this.setupEventListeners();

      logger.info('Process Message Queue initialized');
    }

    return this.instance;
  }

  /**
   * Setup event listeners for queue
   */
  private static setupEventListeners(): void {
    if (!this.instance) return;

    this.queueEvents = new QueueEvents('process-message', {
      connection: config.REDIS_CONFIG,
    });

    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.debug('Message processing job completed', {
        jobId,
        result: returnvalue,
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('Message processing job failed', {
        jobId,
        error: failedReason,
      });
    });

    this.queueEvents.on('error', (error) => {
      logger.error('Message queue error', { error: error.message });
    });
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
  ) {
    const queue = await this.getInstance();

    return queue.add('process-message', payload, {
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
    if (this.worker) {
      await this.worker.close();
      logger.info('Process Message Worker closed');
    }

    if (this.queueEvents) {
      await this.queueEvents.close();
      logger.info('Queue Events closed');
    }

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
    handler: (payload: ProcessMessagePayload) => Promise<ProcessMessageResult>
  ): Promise<void> {
    await this.getInstance(); // Ensure queue is initialized

    this.worker = new Worker<ProcessMessagePayload>(
      'process-message',
      async (job) => {
        logger.debug('Processing message job', {
          jobId: job.id,
          conversationId: job.data.conversationId,
          traceId: job.data.traceId,
        });

        return handler(job.data);
      },
      {
        connection: config.REDIS_CONFIG,
        concurrency: 5, // Process up to 5 jobs concurrently
      }
    );

    this.worker.on('error', (error) => {
      logger.error('Worker error', { error: error.message });
    });

    logger.info('Message handler registered');
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

export default ProcessMessageQueue;
