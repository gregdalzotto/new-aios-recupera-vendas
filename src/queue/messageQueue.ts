import Queue from 'bull';
import logger from '../config/logger';
import { config } from '../config/env';

/**
 * Message processing job data
 */
export interface MessageJobData {
  traceId: string;
  phoneNumber: string;
  messageId: string;
  messageText: string;
  timestamp?: number;
}

/**
 * Global message queue instance
 */
let messageQueue: Queue.Queue<MessageJobData> | null = null;

/**
 * Initialize message queue
 * Bull uses Redis for persistence and retry logic
 */
export async function initializeMessageQueue(): Promise<Queue.Queue<MessageJobData>> {
  if (messageQueue) {
    return messageQueue;
  }

  try {
    messageQueue = new Queue<MessageJobData>('message-processing', {
      redis: config.REDIS_URL,
      defaultJobOptions: {
        // Retry strategy: exponential backoff
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // Start at 1s, then 2s, then 4s
        },
        removeOnComplete: {
          age: 3600, // Remove completed jobs after 1 hour
        },
        removeOnFail: false, // Keep failed jobs for analysis
      },
      settings: {
        // Clean up completed jobs every 5 minutes
        stalledInterval: 5000,
        maxStalledCount: 3,
        lockDuration: 30000,
        lockRenewTime: 15000,
      },
    });

    // Event listeners for monitoring
    messageQueue.on('error', (err) => {
      logger.error('Message queue error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    messageQueue.on('failed', (job, err) => {
      logger.error('Job failed', {
        jobId: job.id,
        jobData: job.data,
        error: err instanceof Error ? err.message : String(err),
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      });
    });

    messageQueue.on('completed', (job) => {
      logger.info('Job completed', {
        jobId: job.id,
        traceId: job.data.traceId,
        processingTime: job.finishedOn ? job.finishedOn - (job.processedOn || 0) : 0,
      });
    });

    logger.info('✅ Message queue initialized', {
      name: messageQueue.name,
      redis: config.REDIS_URL.replace(/:[^:]*@/, ':***@'), // Mask password in logs
    });

    return messageQueue;
  } catch (error) {
    logger.error('Failed to initialize message queue', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get message queue instance
 */
export function getMessageQueue(): Queue.Queue<MessageJobData> {
  if (!messageQueue) {
    throw new Error('Message queue not initialized. Call initializeMessageQueue() first.');
  }
  return messageQueue;
}

/**
 * Enqueue a message for processing
 */
export async function enqueueMessage(data: MessageJobData): Promise<string> {
  const queue = getMessageQueue();

  try {
    const job = await queue.add(data, {
      jobId: `${data.phoneNumber}_${data.messageId}`, // Unique job ID for dedup
    });

    logger.info('Message enqueued', {
      jobId: job.id,
      traceId: data.traceId,
      phoneNumber: data.phoneNumber,
    });

    return job.id as string;
  } catch (error) {
    logger.error('Failed to enqueue message', {
      traceId: data.traceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Register job processor
 * This is called by the job worker to handle message processing
 */
export function registerJobProcessor(
  processor: (job: Queue.Job<MessageJobData>) => Promise<void>
): void {
  const queue = getMessageQueue();

  queue.process(async (job) => {
    try {
      logger.info('Processing job', {
        jobId: job.id,
        traceId: job.data.traceId,
        attempt: job.attemptsMade + 1,
      });

      await processor(job);

      logger.info('Job processed successfully', {
        jobId: job.id,
        traceId: job.data.traceId,
      });
    } catch (error) {
      logger.error('Job processing failed', {
        jobId: job.id,
        traceId: job.data.traceId,
        attempt: job.attemptsMade + 1,
        error: error instanceof Error ? error.message : String(error),
      });

      // Rethrow to trigger Bull retry logic
      throw error;
    }
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getMessageQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Close queue connection
 */
export async function closeMessageQueue(): Promise<void> {
  if (messageQueue) {
    await messageQueue.close();
    messageQueue = null;
    logger.info('Message queue closed');
  }
}

export default {
  initializeMessageQueue,
  getMessageQueue,
  enqueueMessage,
  registerJobProcessor,
  getQueueStats,
  closeMessageQueue,
};
