import {
  initializeMessageQueue,
  getMessageQueue,
  enqueueMessage,
  registerJobProcessor,
  getQueueStats,
  closeMessageQueue,
} from '../../src/queue/messageQueue';

describe('Message Queue (Bull)', () => {
  beforeAll(async () => {
    await initializeMessageQueue();
  });

  afterAll(async () => {
    await closeMessageQueue();
  });

  it('should initialize message queue', async () => {
    const queue = getMessageQueue();
    expect(queue).toBeDefined();
    expect(queue.name).toBe('message-processing');
  });

  it('should enqueue a message', async () => {
    const jobId = await enqueueMessage({
      traceId: 'trace-123',
      phoneNumber: '+5511999999999',
      messageId: 'msg-456',
      messageText: 'Test message',
      timestamp: Date.now(),
    });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe('string');

    // Cleanup
    const queue = getMessageQueue();
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  });

  it('should support job processor registration', async () => {
    registerJobProcessor(async (job) => {
      // Processor function - just acknowledge it's callable
      expect(job.data).toBeDefined();
    });

    const jobId = await enqueueMessage({
      traceId: 'trace-456',
      phoneNumber: '+5511999999998',
      messageId: 'msg-789',
      messageText: 'Processor test',
      timestamp: Date.now(),
    });

    // Verify job was enqueued
    const queue = getMessageQueue();
    const job = await queue.getJob(jobId);
    expect(job).toBeDefined();
    expect(job!.data.traceId).toBe('trace-456');

    // Cleanup
    if (job) {
      await job.remove();
    }
  });

  it('should track queue statistics', async () => {
    const stats = await getQueueStats();

    expect(stats).toHaveProperty('waiting');
    expect(stats).toHaveProperty('active');
    expect(stats).toHaveProperty('completed');
    expect(stats).toHaveProperty('failed');
    expect(stats).toHaveProperty('delayed');

    expect(typeof stats.waiting).toBe('number');
    expect(typeof stats.active).toBe('number');
  });

  it('should handle duplicate job IDs', async () => {
    const data = {
      traceId: 'trace-dup',
      phoneNumber: '+5511999999997',
      messageId: 'msg-dup',
      messageText: 'Duplicate test',
      timestamp: Date.now(),
    };

    const jobId1 = await enqueueMessage(data);
    const jobId2 = await enqueueMessage(data);

    // Same job ID for same phone + message ID
    expect(jobId1).toBe(jobId2);
  });

  it('should support job lookup', async () => {
    const jobId = await enqueueMessage({
      traceId: 'trace-lookup',
      phoneNumber: '+5511999999996',
      messageId: 'msg-lookup',
      messageText: 'Lookup test',
      timestamp: Date.now(),
    });

    const queue = getMessageQueue();
    const job = await queue.getJob(jobId);
    expect(job).toBeDefined();
    expect(job!.data.phoneNumber).toBe('+5511999999996');
  });

  it('should close queue cleanly', async () => {
    // Re-initialize for this test
    await initializeMessageQueue();
    const queue = getMessageQueue();
    expect(queue).toBeDefined();

    await closeMessageQueue();

    // After close, should throw when trying to get queue
    expect(() => getMessageQueue()).toThrow('Message queue not initialized');

    // Re-initialize for other tests
    await initializeMessageQueue();
  });
});
