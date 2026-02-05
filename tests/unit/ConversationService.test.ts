import { ConversationService, ConversationStatus } from '../../src/services/ConversationService';

// Mock repositories
jest.mock('../../src/repositories/ConversationRepository');
jest.mock('../../src/repositories/AbandonmentRepository');
jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Get mocked modules after mocking
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockConversationRepo = require('../../src/repositories/ConversationRepository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockAbandonmentRepo = require('../../src/repositories/AbandonmentRepository');

describe('ConversationService', () => {
  const mockConversation = {
    id: 'conv-1',
    abandonment_id: 'aband-1',
    user_id: 'user-1',
    status: ConversationStatus.ACTIVE,
    message_count: 5,
    last_message_at: new Date().toISOString(),
    last_user_message_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    followup_sent: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockAbandonment = {
    id: 'aband-1',
    external_id: 'ext-1',
    user_id: 'user-1',
    product_id: 'prod-1',
    product_name: 'Product A',
    original_price: 100,
    discount_price: 80,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findByPhoneNumber', () => {
    it('should find conversation by phone number', async () => {
      mockConversationRepo.ConversationRepository.findByPhoneNumber.mockResolvedValue(
        mockConversation
      );

      const result = await ConversationService.findByPhoneNumber('+5511999999999', 'trace-1');

      expect(result).toEqual(mockConversation);
      expect(mockConversationRepo.ConversationRepository.findByPhoneNumber).toHaveBeenCalledWith(
        '+5511999999999'
      );
    });

    it('should return null when conversation not found', async () => {
      mockConversationRepo.ConversationRepository.findByPhoneNumber.mockResolvedValue(null);

      const result = await ConversationService.findByPhoneNumber('+5511999999999', 'trace-1');

      expect(result).toBeNull();
    });

    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      mockConversationRepo.ConversationRepository.findByPhoneNumber.mockRejectedValue(error);

      await expect(
        ConversationService.findByPhoneNumber('+5511999999999', 'trace-1')
      ).rejects.toThrow('Database error');
    });
  });

  describe('create', () => {
    it('should create a new conversation', async () => {
      mockConversationRepo.ConversationRepository.create.mockResolvedValue(mockConversation);

      const result = await ConversationService.create('aband-1', 'user-1', 'trace-1');

      expect(result).toEqual(mockConversation);
      expect(mockConversationRepo.ConversationRepository.create).toHaveBeenCalledWith(
        'aband-1',
        'user-1'
      );
    });

    it('should handle creation errors', async () => {
      const error = new Error('Creation failed');
      mockConversationRepo.ConversationRepository.create.mockRejectedValue(error);

      await expect(ConversationService.create('aband-1', 'user-1', 'trace-1')).rejects.toThrow(
        'Creation failed'
      );
    });
  });

  describe('updateStatus', () => {
    it('should update conversation status from AWAITING_RESPONSE to ACTIVE', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue({
        ...mockConversation,
        status: ConversationStatus.AWAITING_RESPONSE,
      });
      mockConversationRepo.ConversationRepository.updateStatus.mockResolvedValue(undefined);

      await ConversationService.updateStatus('conv-1', ConversationStatus.ACTIVE, 'trace-1');

      expect(mockConversationRepo.ConversationRepository.updateStatus).toHaveBeenCalledWith(
        'conv-1',
        ConversationStatus.ACTIVE
      );
    });

    it('should reject invalid state transition from CLOSED to ACTIVE', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue({
        ...mockConversation,
        status: ConversationStatus.CLOSED,
      });

      await expect(
        ConversationService.updateStatus('conv-1', ConversationStatus.ACTIVE, 'trace-1')
      ).rejects.toThrow('Invalid state transition');
    });

    it('should throw error if conversation not found', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(null);

      await expect(
        ConversationService.updateStatus('conv-1', ConversationStatus.ACTIVE, 'trace-1')
      ).rejects.toThrow('Conversation not found');
    });
  });

  describe('incrementMessageCount', () => {
    it('should increment message count', async () => {
      mockConversationRepo.ConversationRepository.incrementMessageCount.mockResolvedValue(
        undefined
      );

      await ConversationService.incrementMessageCount('conv-1', 'trace-1');

      expect(
        mockConversationRepo.ConversationRepository.incrementMessageCount
      ).toHaveBeenCalledWith('conv-1');
    });

    it('should handle increment errors', async () => {
      const error = new Error('Increment failed');
      mockConversationRepo.ConversationRepository.incrementMessageCount.mockRejectedValue(error);

      await expect(ConversationService.incrementMessageCount('conv-1', 'trace-1')).rejects.toThrow(
        'Increment failed'
      );
    });
  });

  describe('updateTimestamps', () => {
    it('should update last_message_at timestamp', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(mockConversation);
      mockConversationRepo.ConversationRepository.updateLastMessageAt.mockResolvedValue(undefined);

      await ConversationService.updateTimestamps('conv-1', false, 'trace-1');

      expect(mockConversationRepo.ConversationRepository.updateLastMessageAt).toHaveBeenCalled();
      expect(
        mockConversationRepo.ConversationRepository.updateLastUserMessageAt
      ).not.toHaveBeenCalled();
    });

    it('should update both timestamps when lastUserMessage is true', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(mockConversation);
      mockConversationRepo.ConversationRepository.updateLastMessageAt.mockResolvedValue(undefined);
      mockConversationRepo.ConversationRepository.updateLastUserMessageAt.mockResolvedValue(
        undefined
      );

      await ConversationService.updateTimestamps('conv-1', true, 'trace-1');

      expect(mockConversationRepo.ConversationRepository.updateLastMessageAt).toHaveBeenCalled();
      expect(
        mockConversationRepo.ConversationRepository.updateLastUserMessageAt
      ).toHaveBeenCalled();
    });

    it('should throw error if conversation not found', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(null);

      await expect(
        ConversationService.updateTimestamps('conv-1', false, 'trace-1')
      ).rejects.toThrow('Conversation not found');
    });
  });

  describe('isWithinWindow', () => {
    it('should return true for conversation within 24-hour window', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue({
        ...mockConversation,
        last_user_message_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      });

      const result = await ConversationService.isWithinWindow('conv-1', 'trace-1');

      expect(result).toBe(true);
    });

    it('should return false for conversation outside 24-hour window', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue({
        ...mockConversation,
        last_user_message_at: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
      });

      const result = await ConversationService.isWithinWindow('conv-1', 'trace-1');

      expect(result).toBe(false);
    });

    it('should check against creation time if no user messages', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue({
        ...mockConversation,
        last_user_message_at: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      });

      const result = await ConversationService.isWithinWindow('conv-1', 'trace-1');

      expect(result).toBe(true);
    });

    it('should return false if conversation not found', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(null);

      const result = await ConversationService.isWithinWindow('conv-1', 'trace-1');

      expect(result).toBe(false);
    });

    it('should handle window check errors', async () => {
      const error = new Error('Window check failed');
      mockConversationRepo.ConversationRepository.findById.mockRejectedValue(error);

      await expect(ConversationService.isWithinWindow('conv-1', 'trace-1')).rejects.toThrow(
        'Window check failed'
      );
    });
  });

  describe('getWithContext', () => {
    it('should return conversation with abandonment context', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(mockConversation);
      mockAbandonmentRepo.AbandonmentRepository.findById.mockResolvedValue(mockAbandonment);

      const result = await ConversationService.getWithContext('conv-1', 'trace-1');

      expect(result).toEqual({
        conversation: mockConversation,
        abandonment: mockAbandonment,
      });
    });

    it('should return null if conversation not found', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(null);

      const result = await ConversationService.getWithContext('conv-1', 'trace-1');

      expect(result).toBeNull();
      expect(mockAbandonmentRepo.AbandonmentRepository.findById).not.toHaveBeenCalled();
    });

    it('should handle context retrieval errors', async () => {
      mockConversationRepo.ConversationRepository.findById.mockResolvedValue(mockConversation);
      const error = new Error('Context retrieval failed');
      mockAbandonmentRepo.AbandonmentRepository.findById.mockRejectedValue(error);

      await expect(ConversationService.getWithContext('conv-1', 'trace-1')).rejects.toThrow(
        'Context retrieval failed'
      );
    });
  });
});
