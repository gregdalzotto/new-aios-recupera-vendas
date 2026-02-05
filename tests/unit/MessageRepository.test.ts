import { MessageRepository } from '../../src/repositories/MessageRepository';

jest.mock('../../src/config/database');
jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockDatabase = require('../../src/config/database');

describe('MessageRepository', () => {
  const mockMessage = {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_type: 'user' as const,
    message_text: 'Is this product available?',
    message_type: 'text' as const,
    whatsapp_message_id: 'wamsg-123',
    metadata: {
      intent: 'unclear',
      sentiment: 'neutral',
    },
    status: 'delivered' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new message', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockMessage] });

      const result = await MessageRepository.create({
        conversation_id: 'conv-1',
        sender_type: 'user',
        message_text: 'Is this product available?',
        message_type: 'text',
        whatsapp_message_id: 'wamsg-123',
        metadata: { intent: 'unclear', sentiment: 'neutral' },
      });

      expect(result).toEqual(mockMessage);
      expect(mockDatabase.query).toHaveBeenCalled();
    });

    it('should throw error if creation fails', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await expect(
        MessageRepository.create({
          conversation_id: 'conv-1',
          sender_type: 'user',
          message_text: 'Test',
          message_type: 'text',
        })
      ).rejects.toThrow('Failed to create message');
    });
  });

  describe('findById', () => {
    it('should find message by ID', async () => {
      mockDatabase.queryOne.mockResolvedValue(mockMessage);

      const result = await MessageRepository.findById('msg-1');

      expect(result).toEqual(mockMessage);
      expect(mockDatabase.queryOne).toHaveBeenCalledWith(expect.stringContaining('id = $1'), [
        'msg-1',
      ]);
    });

    it('should return null when not found', async () => {
      mockDatabase.queryOne.mockResolvedValue(null);

      const result = await MessageRepository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByWhatsAppMessageId', () => {
    it('should find message by WhatsApp message ID', async () => {
      mockDatabase.queryOne.mockResolvedValue(mockMessage);

      const result = await MessageRepository.findByWhatsAppMessageId('wamsg-123');

      expect(result).toEqual(mockMessage);
    });

    it('should return null for dedup check when not found', async () => {
      mockDatabase.queryOne.mockResolvedValue(null);

      const result = await MessageRepository.findByWhatsAppMessageId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByConversationId', () => {
    it('should find last N messages in conversation', async () => {
      const messages = [mockMessage, { ...mockMessage, id: 'msg-2' }];
      mockDatabase.query.mockResolvedValue({ rows: messages });

      const result = await MessageRepository.findByConversationId('conv-1', 10);

      expect(result).toHaveLength(2);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('conversation_id = $1'),
        expect.arrayContaining(['conv-1', 10])
      );
    });

    it('should return empty array when no messages', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await MessageRepository.findByConversationId('conv-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('should update message status', async () => {
      mockDatabase.query.mockResolvedValue(undefined);

      await MessageRepository.updateStatus('msg-1', 'sent');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages'),
        expect.arrayContaining(['sent', null, 'msg-1'])
      );
    });

    it('should update status with error message', async () => {
      mockDatabase.query.mockResolvedValue(undefined);

      await MessageRepository.updateStatus('msg-1', 'failed', 'Invalid token');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages'),
        expect.arrayContaining(['failed', 'Invalid token', 'msg-1'])
      );
    });
  });

  describe('countBySender', () => {
    it('should count messages by sender type', async () => {
      mockDatabase.queryOne.mockResolvedValue({ count: '5' });

      const result = await MessageRepository.countBySender('conv-1', 'user');

      expect(result).toBe(5);
    });

    it('should return 0 when no messages found', async () => {
      mockDatabase.queryOne.mockResolvedValue(null);

      const result = await MessageRepository.countBySender('conv-1', 'sara');

      expect(result).toBe(0);
    });
  });
});
