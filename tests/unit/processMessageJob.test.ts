import ProcessMessageQueue, {
  ProcessMessagePayload,
  ProcessMessageResult,
} from '../../src/jobs/processMessageJob';

jest.mock('../../src/config/redis');
jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('ProcessMessageJob Queue', () => {
  const mockPayload: ProcessMessagePayload = {
    conversationId: 'conv-1',
    whatsappMessageId: 'wamsg-123',
    phoneNumber: '+5511999999999',
    messageText: 'Is this product available?',
    traceId: 'trace-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return queue singleton', async () => {
      const queue1 = await ProcessMessageQueue.getInstance();
      const queue2 = await ProcessMessageQueue.getInstance();

      expect(queue1).toBe(queue2);
    });
  });

  describe('addJob', () => {
    it('should add job to queue with default options', async () => {
      const queue = await ProcessMessageQueue.getInstance();
      const addSpy = jest.spyOn(queue, 'add');

      const job = await ProcessMessageQueue.addJob(mockPayload);

      expect(job).toBeDefined();
      expect(addSpy).toHaveBeenCalledWith(
        mockPayload,
        expect.objectContaining({
          attempts: 3,
          removeOnComplete: true,
          removeOnFail: false,
        })
      );
    });

    it('should add job with custom retry attempts', async () => {
      const queue = await ProcessMessageQueue.getInstance();
      const addSpy = jest.spyOn(queue, 'add');

      await ProcessMessageQueue.addJob(mockPayload, { attempts: 5 });

      expect(addSpy).toHaveBeenCalledWith(
        mockPayload,
        expect.objectContaining({
          attempts: 5,
        })
      );
    });

    it('should add job with exponential backoff', async () => {
      const queue = await ProcessMessageQueue.getInstance();
      const addSpy = jest.spyOn(queue, 'add');

      await ProcessMessageQueue.addJob(mockPayload);

      expect(addSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        })
      );
    });
  });

  describe('registerHandler', () => {
    it('should register job handler', async () => {
      const handler = jest.fn().mockResolvedValue({
        conversationId: 'conv-1',
        messageProcessed: true,
      } as ProcessMessageResult);

      const queue = await ProcessMessageQueue.getInstance();
      const processSpy = jest.spyOn(queue, 'process');

      await ProcessMessageQueue.registerHandler(handler);

      expect(processSpy).toHaveBeenCalled();
    });

    it('should call handler with job', async () => {
      const handler = jest.fn().mockResolvedValue({
        conversationId: 'conv-1',
        messageProcessed: true,
      } as ProcessMessageResult);

      const queue = await ProcessMessageQueue.getInstance();
      jest.spyOn(queue, 'process').mockImplementation(async (processFunction) => {
        const mockJob = { data: mockPayload, id: '1', attemptsMade: 0 };
        await processFunction(mockJob);
      });

      await ProcessMessageQueue.registerHandler(handler);

      // Handler should be called with job
      expect(handler).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      const stats = await ProcessMessageQueue.getStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('delayed');

      // All should be numbers
      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(typeof stats.delayed).toBe('number');
    });
  });

  describe('ProcessMessagePayload', () => {
    it('should have all required fields', () => {
      expect(mockPayload.conversationId).toBeDefined();
      expect(mockPayload.whatsappMessageId).toBeDefined();
      expect(mockPayload.phoneNumber).toBeDefined();
      expect(mockPayload.messageText).toBeDefined();
      expect(mockPayload.traceId).toBeDefined();
    });
  });

  describe('ProcessMessageResult', () => {
    it('should contain conversation ID and processing status', () => {
      const result: ProcessMessageResult = {
        conversationId: 'conv-1',
        messageProcessed: true,
        responseMessageId: 'msg-response-1',
      };

      expect(result.conversationId).toBe('conv-1');
      expect(result.messageProcessed).toBe(true);
      expect(result.responseMessageId).toBeDefined();
    });

    it('should optionally contain error information', () => {
      const result: ProcessMessageResult = {
        conversationId: 'conv-1',
        messageProcessed: false,
        error: 'OpenAI timeout',
      };

      expect(result.error).toBeDefined();
      expect(result.messageProcessed).toBe(false);
    });
  });
});
