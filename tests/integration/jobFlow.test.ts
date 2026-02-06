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
jest.mock('../../src/jobs/sendMessageJob');
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
import SendMessageQueue from '../../src/jobs/sendMessageJob';

describe('Job Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Full Message Processing Flow', () => {
    it('should process complete flow: receive → AI → send → store', async () => {
      // Setup test data
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
        value: 299.9,
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

      // Setup mocks
      (ConversationRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (ConversationRepository.incrementMessageCount as jest.Mock).mockResolvedValue(undefined);
      (ConversationRepository.updateLastUserMessageAt as jest.Mock).mockResolvedValue(undefined);
      (ConversationRepository.updateLastMessageAt as jest.Mock).mockResolvedValue(undefined);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (MessageRepository.findByConversationId as jest.Mock).mockResolvedValue([]);
      (MessageRepository.create as jest.Mock).mockResolvedValue({
        id: 'msg-456',
        conversation_id: 'conv-123',
        sender_type: 'sara',
        message_text: 'Oi! Voltou para completar a compra?',
        message_type: 'text',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      (MessageRepository.update as jest.Mock).mockResolvedValue(undefined);
      (ConversationService.isOptedOut as jest.Mock).mockResolvedValue(false);
      (AIService.interpretMessage as jest.Mock).mockResolvedValue(mockAIResponse);
      (MessageService.send as jest.Mock).mockResolvedValue(mockSendResult);

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

      // Execute handler
      const result = await processMessageHandler(job);

      // Assertions
      expect(result.messageProcessed).toBe(true);
      expect(result.conversationId).toBe('conv-123');
      expect(result.responseMessageId).toBeDefined();

      // Verify service calls
      expect(ConversationRepository.findById).toHaveBeenCalledWith('conv-123');
      expect(ConversationService.isOptedOut).toHaveBeenCalledWith('user-123');
      expect(MessageRepository.create).toHaveBeenCalled();
      expect(AIService.interpretMessage).toHaveBeenCalled();
      expect(MessageService.send).toHaveBeenCalledWith(
        'conv-123',
        '+5548999327881',
        'Oi! Voltou para completar a compra?',
        'text',
        expect.objectContaining({ traceId: 'trace-123' })
      );
      expect(ConversationRepository.updateLastMessageAt).toHaveBeenCalled();
    });

    it('should handle opt-out users gracefully', async () => {
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

      (ConversationRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (ConversationService.isOptedOut as jest.Mock).mockResolvedValue(true);
      (MessageRepository.create as jest.Mock).mockResolvedValue({
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
      expect(result.conversationId).toBe('conv-123');
      // Verify incoming message was stored but AI/send were not called
      expect(MessageRepository.create).toHaveBeenCalled();
      expect(AIService.interpretMessage).not.toHaveBeenCalled();
      expect(MessageService.send).not.toHaveBeenCalled();
    });

    it('should queue for retry on send failure', async () => {
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
        value: 299.9,
        status: 'pending',
        conversation_id: null,
        converted_at: null,
        conversion_link: null,
        payment_id: null,
        created_at: new Date().toISOString(),
      };

      const mockAIResponse = {
        response: 'Temos um desconto especial!',
        intent: 'price_question' as const,
        sentiment: 'neutral' as const,
        should_offer_discount: true,
        tokens_used: 45,
        response_id: 'openai-456',
      };

      (ConversationRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (ConversationRepository.incrementMessageCount as jest.Mock).mockResolvedValue(undefined);
      (ConversationRepository.updateLastUserMessageAt as jest.Mock).mockResolvedValue(undefined);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (MessageRepository.findByConversationId as jest.Mock).mockResolvedValue([]);
      (MessageRepository.create as jest.Mock).mockResolvedValue({
        id: 'msg-456',
        conversation_id: 'conv-123',
        sender_type: 'sara',
        message_text: 'Temos um desconto especial!',
        message_type: 'text',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      (ConversationService.isOptedOut as jest.Mock).mockResolvedValue(false);
      (AIService.interpretMessage as jest.Mock).mockResolvedValue(mockAIResponse);
      // Send fails
      (MessageService.send as jest.Mock).mockResolvedValue({
        messageId: '',
        status: 'failed' as const,
        error: 'WhatsApp API rate limited',
      });
      // Mock SendMessageQueue.addJob for retry
      (SendMessageQueue.addJob as jest.Mock).mockResolvedValue({ id: 'retry-job-456' });

      const job = {
        id: 'job-456',
        data: {
          phoneNumber: '+5548999327881',
          messageText: 'Qual é o preço?',
          whatsappMessageId: 'wamsg-incoming-456',
          traceId: 'trace-456',
          conversationId: 'conv-123',
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      const result = await processMessageHandler(job);

      // Should still mark as processed (queue handles retry)
      expect(result.messageProcessed).toBe(true);
      expect(result.responseMessageId).toBeDefined();
      // Verify retry was queued
      expect(SendMessageQueue.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-123',
          phoneNumber: '+5548999327881',
          messageText: 'Temos um desconto especial!',
          messageType: 'text',
          traceId: 'trace-456',
        })
      );
    });

    it('should handle conversation not found', async () => {
      (ConversationRepository.findById as jest.Mock).mockResolvedValue(null);
      (ConversationRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(null);

      const job = {
        id: 'job-789',
        data: {
          phoneNumber: '+5599999999999',
          messageText: 'Test message',
          whatsappMessageId: 'wamsg-789',
          traceId: 'trace-789',
          conversationId: undefined,
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      const result = await processMessageHandler(job);

      expect(result.messageProcessed).toBe(false);
      expect(result.error).toBe('Conversation not found');
      expect(AIService.interpretMessage).not.toHaveBeenCalled();
      expect(MessageService.send).not.toHaveBeenCalled();
    });

    it('should log and continue on AI service errors', async () => {
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
        value: 299.9,
        status: 'pending',
        conversation_id: null,
        converted_at: null,
        conversion_link: null,
        payment_id: null,
        created_at: new Date().toISOString(),
      };

      (ConversationRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (ConversationRepository.incrementMessageCount as jest.Mock).mockResolvedValue(undefined);
      (ConversationRepository.updateLastUserMessageAt as jest.Mock).mockResolvedValue(undefined);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (MessageRepository.findByConversationId as jest.Mock).mockResolvedValue([]);
      (MessageRepository.create as jest.Mock).mockResolvedValue({
        id: 'msg-xyz',
        conversation_id: 'conv-123',
        sender_type: 'user',
        message_text: 'Test',
        message_type: 'text',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      (ConversationService.isOptedOut as jest.Mock).mockResolvedValue(false);
      // AI service throws
      (AIService.interpretMessage as jest.Mock).mockRejectedValue(new Error('OpenAI timeout'));

      const job = {
        id: 'job-error',
        data: {
          phoneNumber: '+5548999327881',
          messageText: 'Test',
          whatsappMessageId: 'wamsg-error',
          traceId: 'trace-error',
          conversationId: 'conv-123',
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      const result = await processMessageHandler(job);

      // Should not throw, let Bull handle retry
      expect(result.messageProcessed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Send Message Handler (Retry Flow)', () => {
    it('should successfully retry failed message send', async () => {
      (MessageService.send as jest.Mock).mockResolvedValue({
        messageId: 'msg-retry-123',
        status: 'sent',
        whatsappMessageId: 'wamsg-retry-123',
      });

      const job = {
        id: 'job-retry-123',
        data: {
          conversationId: 'conv-123',
          phoneNumber: '+5548999327881',
          messageText: 'Temos um desconto para você!',
          messageType: 'text' as const,
          traceId: 'trace-retry-123',
        },
        attemptsMade: 0,
      } as unknown as Job<SendMessagePayload>;

      const result = await sendMessageHandler(job);

      expect(result.status).toBe('sent');
      expect(result.conversationId).toBe('conv-123');
      expect(result.whatsappMessageId).toBe('wamsg-retry-123');
      expect(MessageService.send).toHaveBeenCalledWith(
        'conv-123',
        '+5548999327881',
        'Temos um desconto para você!',
        'text',
        expect.objectContaining({ traceId: 'trace-retry-123' })
      );
    });

    it('should handle retry failure gracefully', async () => {
      (MessageService.send as jest.Mock).mockResolvedValue({
        messageId: '',
        status: 'failed' as const,
        error: 'Phone number blocked',
      });

      const job = {
        id: 'job-retry-fail',
        data: {
          conversationId: 'conv-123',
          phoneNumber: '+5599999999999',
          messageText: 'Test retry',
          messageType: 'text' as const,
          traceId: 'trace-retry-fail',
        },
        attemptsMade: 1,
      } as unknown as Job<SendMessagePayload>;

      const result = await sendMessageHandler(job);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Phone number blocked');
      // Bull will handle the retry based on attempts
      expect(result.conversationId).toBe('conv-123');
    });

    it('should log attempt number for tracking', async () => {
      (MessageService.send as jest.Mock).mockResolvedValue({
        messageId: 'msg-123',
        status: 'sent',
        whatsappMessageId: 'wamsg-123',
      });

      const job = {
        id: 'job-attempt-2',
        data: {
          conversationId: 'conv-123',
          phoneNumber: '+5548999327881',
          messageText: 'Retry attempt 2',
          messageType: 'text' as const,
          traceId: 'trace-attempt-2',
        },
        attemptsMade: 1, // Second attempt
      } as unknown as Job<SendMessagePayload>;

      const result = await sendMessageHandler(job);

      expect(result.status).toBe('sent');
      // Verify it was called (logging happens inside handler)
      expect(MessageService.send).toHaveBeenCalled();
    });
  });

  describe('Error Recovery & Resilience', () => {
    it('should handle database errors gracefully', async () => {
      (ConversationRepository.findById as jest.Mock).mockResolvedValue(null);
      (ConversationRepository.findByPhoneNumber as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const job = {
        id: 'job-db-error',
        data: {
          phoneNumber: '+5548999327881',
          messageText: 'Test',
          whatsappMessageId: 'wamsg-db-error',
          traceId: 'trace-db-error',
          conversationId: undefined,
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      const result = await processMessageHandler(job);

      // Should not throw, return error for Bull to retry
      expect(result.messageProcessed).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing abandonment data', async () => {
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

      const mockAIResponse = {
        response: 'Oi! Como posso ajudar?',
        intent: 'unclear' as const,
        sentiment: 'neutral' as const,
        should_offer_discount: false,
        tokens_used: 20,
        response_id: 'openai-789',
      };

      (ConversationRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (ConversationRepository.incrementMessageCount as jest.Mock).mockResolvedValue(undefined);
      (ConversationRepository.updateLastUserMessageAt as jest.Mock).mockResolvedValue(undefined);
      (ConversationRepository.updateLastMessageAt as jest.Mock).mockResolvedValue(undefined);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(null); // Missing abandonment
      (MessageRepository.findByConversationId as jest.Mock).mockResolvedValue([]);
      (MessageRepository.create as jest.Mock).mockResolvedValue({
        id: 'msg-abc',
        conversation_id: 'conv-123',
        sender_type: 'sara',
        message_text: 'Oi! Como posso ajudar?',
        message_type: 'text',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      (MessageRepository.update as jest.Mock).mockResolvedValue(undefined);
      (ConversationService.isOptedOut as jest.Mock).mockResolvedValue(false);
      (AIService.interpretMessage as jest.Mock).mockResolvedValue(mockAIResponse);
      (MessageService.send as jest.Mock).mockResolvedValue({
        messageId: 'msg-123',
        status: 'sent',
        whatsappMessageId: 'wamsg-123',
      });

      const job = {
        id: 'job-no-abandon',
        data: {
          phoneNumber: '+5548999327881',
          messageText: 'Oi',
          whatsappMessageId: 'wamsg-no-abandon',
          traceId: 'trace-no-abandon',
          conversationId: 'conv-123',
        },
        attemptsMade: 0,
      } as unknown as Job<ProcessMessagePayload>;

      const result = await processMessageHandler(job);

      // Should continue with default values when abandonment is missing
      expect(result.messageProcessed).toBe(true);
      expect(AIService.interpretMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          productName: 'Produto', // Default value
          cartValue: 0, // Default value
        }),
        'Oi'
      );
    });
  });
});
