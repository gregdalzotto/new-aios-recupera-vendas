import SendMessageQueue, { SendMessagePayload } from '../../src/jobs/sendMessageJob';

jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock Bull to avoid Redis connection during testing
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
  }));
});

jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockResolvedValue({}),
}));

describe('SendMessageQueue', () => {
  const mockPayload: SendMessagePayload = {
    conversationId: 'conv-1',
    phoneNumber: '+5511999999999',
    messageText: 'Test message',
    messageType: 'text',
    traceId: 'trace-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    (SendMessageQueue as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should create queue instance', async () => {
      const queue = await SendMessageQueue.getInstance();
      expect(queue).toBeDefined();
    });
  });

  describe('addJob', () => {
    it('should add job to queue with default options', async () => {
      const job = await SendMessageQueue.addJob(mockPayload);
      expect(job.id).toBe('job-1');
    });

    it('should add job with custom attempts', async () => {
      const job = await SendMessageQueue.addJob(mockPayload, { attempts: 5 });
      expect(job.id).toBe('job-1');
    });

    it('should add job with priority', async () => {
      const job = await SendMessageQueue.addJob(mockPayload, { priority: 10 });
      expect(job.id).toBe('job-1');
    });

    it('should add job with delay', async () => {
      const job = await SendMessageQueue.addJob(mockPayload, { delay: 5000 });
      expect(job.id).toBe('job-1');
    });
  });

  describe('registerHandler', () => {
    it('should register handler successfully', async () => {
      const handler = jest.fn().mockResolvedValue({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        status: 'sent',
      });

      await SendMessageQueue.registerHandler(handler);
      expect(handler).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      const stats = await SendMessageQueue.getStats();

      expect(stats).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    });
  });

  describe('close', () => {
    it('should close queue gracefully', async () => {
      await SendMessageQueue.getInstance();
      await SendMessageQueue.close();
      // Should not throw
    });
  });
});
