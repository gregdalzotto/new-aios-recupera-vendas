import { processMessageHandler, sendMessageHandler } from '../../src/jobs/handlers';
import type { Job } from 'bull';
import type { ProcessMessagePayload } from '../../src/jobs/processMessageJob';
import type { SendMessagePayload } from '../../src/jobs/sendMessageJob';

// Mock dependencies
jest.mock('../../src/services/ConversationService');
jest.mock('../../src/services/AIService');
jest.mock('../../src/services/MessageService');
jest.mock('../../src/repositories/ConversationRepository');
jest.mock('../../src/repositories/MessageRepository');
jest.mock('../../src/repositories/AbandonmentRepository');
jest.mock('../../src/config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ConversationService } from '../../src/services/ConversationService';
import { AIService } from '../../src/services/AIService';
import { MessageService } from '../../src/services/MessageService';
import { ConversationRepository } from '../../src/repositories/ConversationRepository';
import { MessageRepository } from '../../src/repositories/MessageRepository';
import { AbandonmentRepository } from '../../src/repositories/AbandonmentRepository';

describe('Job Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processMessageHandler', () => {
    it('should process a message successfully', async () => {
      // Setup mocks
      const mockConversation = {
        id: 'conv-123',
        user_id: 'user-123',
        abandonment_id: 'abn-123',
        status: 'active',
        message_count: 0,
        last_message_at: null,
        last_user_message_at: null,
        followup_sent: false,
        created_at: new Date().toISOString(),
      };

      const mockAbandonment = {
        id: 'abn-123',
        user_id: 'user-123',
        external_id: 'ext-123',
        product_id: 'prod-001',
        value: 299.90,
        status: 'pending',
        conversation_id: null,
        converted_at: null,
        conversion_link: null,
        payment_id: null,
        created_at: new Date().toISOString(),
      };

      const mockAIResponse = {
        response: 'Oi! Voltou para completar a compra?',
        intent: 'unclear' as const,
        sentiment: 'neutral' as const,
        should_offer_discount: false,
        tokens_used: 50,
        response_id: 'openai-123',
      };

      const mockSendResult = {
        messageId: 'msg-123',
        status: 'sent' as const,
        whatsappMessageId: 'wamsg-123',
      };

      const mockMessageRepository = MessageRepository as jest.Mocked<typeof MessageRepository>;
      const mockConversationRepository = ConversationRepository as jest.Mocked<
        typeof ConversationRepository
      >;
      const mockAIService = AIService as jest.Mocked<typeof AIService>;
      const mockMessageService = MessageService as jest.Mocked<typeof MessageService>;
      const mockConversationService = ConversationService as jest.Mocked<
        typeof ConversationService
      >;
      const mockAbandonmentRepository = AbandonmentRepository as jest.Mocked<
        typeof AbandonmentRepository
      >;

      mockConversationRepository.findByPhoneNumber.mockResolvedValue(mockConversation);
      mockAbandonmentRepository.findById.mockResolvedValue(mockAbandonment);
      mockMessageRepository.findByConversationId.mockResolvedValue([]);
      mockMessageRepository.create.mockResolvedValue({
        id: 'msg-456',
        conversation_id: 'conv-123',
        sender_type: 'sara',
        message_text: 'Test message',
        message_type: 'text',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockConversationService.isOptedOut.mockResolvedValue(false);
      mockAIService.interpretMessage.mockResolvedValue(mockAIResponse);
      mockMessageService.send.mockResolvedValue(mockSendResult);

      // Create mock job
      const job = {
        id: 'job-123',
        data: {
          phoneNumber: '+5548999327881',
          messageText: 'Quero completar minha compra',
          whatsappMessageId: 'wamsg-incoming-123',
          traceId: 'trace-123',
          conversationId: 'conv-123',
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      // Execute
      const result = await processMessageHandler(job);

      // Assert
      expect(result.messageProcessed).toBe(true);
      expect(result.conversationId).toBe('conv-123');
      expect(mockMessageRepository.create).toHaveBeenCalled();
      expect(mockAIService.interpretMessage).toHaveBeenCalled();
      expect(mockMessageService.send).toHaveBeenCalled();
    });

    it('should return error if conversation not found', async () => {
      const mockConversationRepository = ConversationRepository as jest.Mocked<
        typeof ConversationRepository
      >;

      mockConversationRepository.findByPhoneNumber.mockResolvedValue(null);

      const job = {
        id: 'job-123',
        data: {
          phoneNumber: '+5599999999999',
          messageText: 'Test',
          whatsappMessageId: 'wamsg-123',
          traceId: 'trace-123',
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      const result = await processMessageHandler(job);

      expect(result.messageProcessed).toBe(false);
      expect(result.error).toBe('Conversation not found');
    });

    it('should skip response if user opted out', async () => {
      const mockConversation = {
        id: 'conv-123',
        user_id: 'user-123',
        abandonment_id: 'abn-123',
        status: 'active',
        message_count: 0,
        last_message_at: null,
        last_user_message_at: null,
        followup_sent: false,
        created_at: new Date().toISOString(),
      };

      const mockConversationRepository = ConversationRepository as jest.Mocked<
        typeof ConversationRepository
      >;
      const mockConversationService = ConversationService as jest.Mocked<
        typeof ConversationService
      >;
      const mockMessageRepository = MessageRepository as jest.Mocked<typeof MessageRepository>;
      const mockMessageService = MessageService as jest.Mocked<typeof MessageService>;

      mockConversationRepository.findByPhoneNumber.mockResolvedValue(mockConversation);
      mockConversationService.isOptedOut.mockResolvedValue(true);
      mockMessageRepository.create.mockResolvedValue({
        id: 'msg-456',
        conversation_id: 'conv-123',
        sender_type: 'user',
        message_text: 'Test',
        message_type: 'text',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const job = {
        id: 'job-123',
        data: {
          phoneNumber: '+5548999327881',
          messageText: 'Quero voltar',
          whatsappMessageId: 'wamsg-123',
          traceId: 'trace-123',
          conversationId: 'conv-123',
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      const result = await processMessageHandler(job);

      expect(result.messageProcessed).toBe(true);
      expect(mockMessageService.send).not.toHaveBeenCalled();
      expect(mockMessageRepository.create).toHaveBeenCalled();
    });
  });

  describe('sendMessageHandler', () => {
    it('should send message successfully on retry', async () => {
      const mockMessageService = MessageService as jest.Mocked<typeof MessageService>;

      mockMessageService.send.mockResolvedValue({
        messageId: 'msg-123',
        status: 'sent',
        whatsappMessageId: 'wamsg-123',
      });

      const job = {
        id: 'job-retry-123',
        data: {
          conversationId: 'conv-123',
          phoneNumber: '+5548999327881',
          messageText: 'Test retry message',
          messageType: 'text' as const,
          traceId: 'trace-123',
        },
        attemptsMade: 0,
      } as unknown as Job<SendMessagePayload>;

      const result = await sendMessageHandler(job);

      expect(result.status).toBe('sent');
      expect(result.conversationId).toBe('conv-123');
      expect(mockMessageService.send).toHaveBeenCalled();
    });

    it('should return failed status on send error', async () => {
      const mockMessageService = MessageService as jest.Mocked<typeof MessageService>;

      mockMessageService.send.mockResolvedValue({
        messageId: '',
        status: 'failed',
        error: 'API error',
      });

      const job = {
        id: 'job-retry-fail',
        data: {
          conversationId: 'conv-123',
          phoneNumber: '+5599999999999',
          messageText: 'Test',
          messageType: 'text' as const,
          traceId: 'trace-123',
        },
        attemptsMade: 1,
      } as unknown as Job<SendMessagePayload>;

      const result = await sendMessageHandler(job);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('API error');
    });
  });
});
