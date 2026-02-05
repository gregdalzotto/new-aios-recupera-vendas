import { ProcessWebhookMessageJob } from '../../src/jobs/processWebhookMessageJob';
import * as messageRepo from '../../src/repositories/MessageRepository';
import * as conversationService from '../../src/services/ConversationService';
import { AIService } from '../../src/services/AIService';
import { MessageService } from '../../src/services/MessageService';
import ProcessMessageQueue from '../../src/jobs/processMessageJob';

jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/repositories/MessageRepository');
jest.mock('../../src/services/ConversationService');
jest.mock('../../src/services/AIService');
jest.mock('../../src/services/MessageService');
jest.mock('../../src/jobs/processMessageJob');

describe('ProcessWebhookMessageJob', () => {
  const mockPayload = {
    conversationId: 'conv-1',
    whatsappMessageId: 'wamsg-123',
    phoneNumber: '+5511999999999',
    messageText: 'Hello Sara!',
    traceId: 'trace-1',
  };

  const mockMessage = {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_type: 'user' as const,
    message_text: 'Hello Sara!',
    message_type: 'text' as const,
    whatsapp_message_id: 'wamsg-123',
    status: 'sent' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockConversation = {
    id: 'conv-1',
    user_id: 'user-1',
    abandonment_id: 'abandon-1',
    status: 'active',
    message_count: 5,
    last_message_at: new Date().toISOString(),
    last_user_message_at: new Date().toISOString(),
    followup_sent: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockAIResponse = {
    response: 'Posso ajudar com desconto!',
    intent: 'price_question' as const,
    sentiment: 'positive' as const,
    should_offer_discount: true,
    tokens_used: 85,
    response_id: 'chatcmpl-123',
  };

  const mockSendResult = {
    messageId: 'msg-2',
    status: 'sent' as const,
    whatsappMessageId: 'wamsg-456',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    (messageRepo.MessageRepository.findByWhatsAppMessageId as jest.Mock).mockResolvedValue(null);
    (messageRepo.MessageRepository.create as jest.Mock).mockResolvedValue(mockMessage);
    (messageRepo.MessageRepository.findByConversationId as jest.Mock).mockResolvedValue([
      mockMessage,
    ]);
    (conversationService.ConversationService.findByPhoneNumber as jest.Mock).mockResolvedValue(
      mockConversation
    );
    (conversationService.ConversationService.incrementMessageCount as jest.Mock).mockResolvedValue(
      undefined
    );
    (conversationService.ConversationService.updateTimestamps as jest.Mock).mockResolvedValue(
      undefined
    );
    (AIService.interpretMessage as jest.Mock).mockResolvedValue(mockAIResponse);
    (MessageService.send as jest.Mock).mockResolvedValue(mockSendResult);
  });

  describe('process', () => {
    it('should process webhook message successfully', async () => {
      const result = await ProcessWebhookMessageJob.process(mockPayload);

      expect(result.messageProcessed).toBe(true);
      expect(result.conversationId).toBe('conv-1');
      expect(result.responseMessageId).toBe('msg-2');
      expect(result.error).toBeUndefined();

      // Verify all steps were executed
      expect(messageRepo.MessageRepository.findByWhatsAppMessageId).toHaveBeenCalledWith(
        'wamsg-123'
      );
      expect(messageRepo.MessageRepository.create).toHaveBeenCalled();
      expect(conversationService.ConversationService.findByPhoneNumber).toHaveBeenCalledWith(
        '+5511999999999',
        'trace-1'
      );
      expect(AIService.interpretMessage).toHaveBeenCalled();
      expect(MessageService.send).toHaveBeenCalled();
      expect(conversationService.ConversationService.incrementMessageCount).toHaveBeenCalledWith(
        'conv-1',
        'trace-1'
      );
    });

    it('should detect duplicate messages (dedup)', async () => {
      (messageRepo.MessageRepository.findByWhatsAppMessageId as jest.Mock).mockResolvedValue(
        mockMessage
      );

      const result = await ProcessWebhookMessageJob.process(mockPayload);

      expect(result.messageProcessed).toBe(true);
      expect(result.responseMessageId).toBe('msg-1');
      expect(messageRepo.MessageRepository.create).not.toHaveBeenCalled();
      expect(AIService.interpretMessage).not.toHaveBeenCalled();
    });

    it('should handle missing conversation', async () => {
      (conversationService.ConversationService.findByPhoneNumber as jest.Mock).mockResolvedValue(
        null
      );

      const result = await ProcessWebhookMessageJob.process(mockPayload);

      expect(result.messageProcessed).toBe(false);
      expect(result.error).toContain('not found');
      expect(AIService.interpretMessage).not.toHaveBeenCalled();
    });

    it('should load message history for context', async () => {
      const historyMessages = [mockMessage, { ...mockMessage, id: 'msg-old' }];
      (messageRepo.MessageRepository.findByConversationId as jest.Mock).mockResolvedValue(
        historyMessages
      );

      await ProcessWebhookMessageJob.process(mockPayload);

      expect(messageRepo.MessageRepository.findByConversationId).toHaveBeenCalledWith('conv-1', 10);
      expect(AIService.interpretMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageHistory: historyMessages,
        }),
        'Hello Sara!'
      );
    });

    it('should handle AI interpretation error gracefully', async () => {
      (AIService.interpretMessage as jest.Mock).mockRejectedValue(new Error('OpenAI timeout'));

      const result = await ProcessWebhookMessageJob.process(mockPayload);

      expect(result.messageProcessed).toBe(false);
      expect(result.error).toContain('OpenAI timeout');
    });

    it('should handle message sending error gracefully', async () => {
      (MessageService.send as jest.Mock).mockRejectedValue(new Error('WhatsApp API error'));

      const result = await ProcessWebhookMessageJob.process(mockPayload);

      expect(result.messageProcessed).toBe(false);
      expect(result.error).toContain('WhatsApp API error');
    });

    it('should pass AI context with conversation data', async () => {
      await ProcessWebhookMessageJob.process(mockPayload);

      expect(AIService.interpretMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          userId: 'user-1',
          productName: 'Produto',
          cartValue: 0,
          offersAlreadyMade: 0,
          traceId: 'trace-1',
        }),
        'Hello Sara!'
      );
    });

    it('should send response with correct parameters', async () => {
      await ProcessWebhookMessageJob.process(mockPayload);

      expect(MessageService.send).toHaveBeenCalledWith(
        'conv-1',
        '+5511999999999',
        'Posso ajudar com desconto!',
        'text',
        { traceId: 'trace-1' }
      );
    });

    it('should update conversation timestamps after processing', async () => {
      await ProcessWebhookMessageJob.process(mockPayload);

      expect(conversationService.ConversationService.incrementMessageCount).toHaveBeenCalledWith(
        'conv-1',
        'trace-1'
      );
      expect(conversationService.ConversationService.updateTimestamps).toHaveBeenCalledWith(
        'conv-1',
        true,
        'trace-1'
      );
    });
  });

  describe('registerHandler', () => {
    it('should register handler with queue', async () => {
      const mockRegisterHandler = jest.spyOn(ProcessMessageQueue, 'registerHandler');

      await ProcessWebhookMessageJob.registerHandler();

      expect(mockRegisterHandler).toHaveBeenCalled();
    });
  });
});
