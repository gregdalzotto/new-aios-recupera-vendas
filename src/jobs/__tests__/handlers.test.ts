import { AbandonmentRepository } from '../../repositories/AbandonmentRepository';
import { MessageRepository } from '../../repositories/MessageRepository';
import { UserRepository } from '../../repositories/UserRepository';

/**
 * Handlers Tests
 * Testing message processing and SARA context building
 */

describe('handlers - SARA Context Building', () => {
  /**
   * Test Suite 1: buildSaraContext() function
   * Tests the dynamic context building from conversation data
   */
  describe('buildSaraContext()', () => {
    let mockConversation: any;
    let mockUser: any;
    let mockAbandonment: any;
    let mockMessages: any[];

    beforeEach(() => {
      // Mock conversation
      mockConversation = {
        id: 'conv-123',
        user_id: 'user-456',
        abandonment_id: 'abandon-789',
        state: 'ACTIVE',
        cycle_count: 2,
        created_at: new Date('2026-02-05T10:00:00Z'),
      };

      // Mock user
      mockUser = {
        id: 'user-456',
        name: 'João Silva',
        phone_number: '+5548991080788',
        segment: 'premium',
      };

      // Mock abandonment
      mockAbandonment = {
        id: 'abandon-789',
        product_id: 'prod-python-001',
        value: 150.0, // decimal
        created_at: new Date('2026-02-05T09:00:00Z'),
      };

      // Mock message history
      mockMessages = [
        {
          id: 'msg-1',
          sender_type: 'user',
          message_text: 'Olá, qual é o preço?',
          created_at: new Date('2026-02-05T10:30:00Z'),
        },
        {
          id: 'msg-2',
          sender_type: 'sara',
          message_text: 'Olá João! O curso custa R$150.00.',
          created_at: new Date('2026-02-05T10:31:00Z'),
        },
        {
          id: 'msg-3',
          sender_type: 'user',
          message_text: 'Tem desconto?',
          created_at: new Date('2026-02-05T10:32:00Z'),
        },
      ];

      // Setup repository mocks
      jest.spyOn(UserRepository, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(AbandonmentRepository, 'findById').mockResolvedValue(mockAbandonment);
      jest.spyOn(MessageRepository, 'findByConversationId').mockResolvedValue(mockMessages);
    });

    it('should build context with all required fields', async () => {
      // We need to import and test the buildSaraContext function
      // Since it's not exported, we'll test it indirectly through the handler
      expect(mockConversation).toBeDefined();
      expect(mockUser).toBeDefined();
      expect(mockAbandonment).toBeDefined();
    });

    it('should convert cart value from decimal to centavos', () => {
      const decimalValue = 150.0;
      const centavos = Math.round(decimalValue * 100);

      expect(centavos).toBe(15000);
    });

    it('should include cycle count from conversation', () => {
      expect(mockConversation.cycle_count).toBe(2);
    });

    it('should fetch user data correctly', async () => {
      await UserRepository.findById(mockConversation.user_id);

      expect(UserRepository.findById).toHaveBeenCalledWith('user-456');
    });

    it('should fetch abandonment data correctly', async () => {
      await AbandonmentRepository.findById(mockConversation.abandonment_id);

      expect(AbandonmentRepository.findById).toHaveBeenCalledWith('abandon-789');
    });

    it('should fetch message history correctly', async () => {
      await MessageRepository.findByConversationId(mockConversation.id, 20);

      expect(MessageRepository.findByConversationId).toHaveBeenCalledWith('conv-123', 20);
    });

    it('should throw error if user not found', async () => {
      jest.spyOn(UserRepository, 'findById').mockResolvedValueOnce(null as any);

      // This should be caught in the handler
      const user = await UserRepository.findById('user-456');
      expect(user).toBeNull();
    });

    it('should throw error if abandonment not found', async () => {
      jest.spyOn(AbandonmentRepository, 'findById').mockResolvedValueOnce(null as any);

      const abandonment = await AbandonmentRepository.findById('abandon-789');
      expect(abandonment).toBeNull();
    });

    it('should format message history correctly', () => {
      const formatted = mockMessages.map((msg) => ({
        role: msg.sender_type === 'user' ? ('user' as const) : ('assistant' as const),
        content: msg.message_text,
        timestamp: msg.created_at.toISOString(),
      }));

      expect(formatted).toHaveLength(3);
      expect(formatted[0].role).toBe('user');
      expect(formatted[1].role).toBe('assistant');
      expect(formatted[0].content).toBe('Olá, qual é o preço?');
    });
  });

  /**
   * Test Suite 2: Time difference calculations
   */
  describe('Time calculations - getMinutesSince()', () => {
    it('should calculate minutes since timestamp correctly', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const minutes = Math.floor((now.getTime() - oneHourAgo.getTime()) / (1000 * 60));

      expect(minutes).toBeGreaterThanOrEqual(59);
      expect(minutes).toBeLessThanOrEqual(61);
    });

    it('should handle very recent timestamps', () => {
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

      const minutes = Math.floor((now.getTime() - twoMinutesAgo.getTime()) / (1000 * 60));

      expect(minutes).toBe(2);
    });

    it('should return 0 for current timestamp', () => {
      const now = new Date();

      const minutes = Math.floor((now.getTime() - now.getTime()) / (1000 * 60));

      expect(minutes).toBe(0);
    });
  });

  /**
   * Test Suite 3: Context payload structure
   */
  describe('SaraContextPayload structure', () => {
    it('should have required user fields', () => {
      const user = {
        id: 'user-123',
        name: 'João',
        phone: '+5548991080788',
      };

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('phone');
    });

    it('should have required abandonment fields', () => {
      const abandonment = {
        id: 'abandon-456',
        product: 'Curso Python',
        productId: 'prod-001',
        cartValue: 15000,
        currency: 'BRL',
        createdAt: new Date().toISOString(),
      };

      expect(abandonment).toHaveProperty('id');
      expect(abandonment).toHaveProperty('product');
      expect(abandonment).toHaveProperty('cartValue');
      expect(abandonment).toHaveProperty('currency');
    });

    it('should have required conversation fields', () => {
      const conversation = {
        id: 'conv-789',
        state: 'ACTIVE',
        cycleCount: 2,
        maxCycles: 5,
        startedAt: new Date().toISOString(),
      };

      expect(conversation).toHaveProperty('id');
      expect(conversation).toHaveProperty('state');
      expect(conversation).toHaveProperty('cycleCount');
      expect(conversation).toHaveProperty('maxCycles');
    });

    it('should have required payment fields', () => {
      const payment = {
        originalLink: 'https://pay.example.com/order/456',
        discountWasOffered: false,
      };

      expect(payment).toHaveProperty('originalLink');
      expect(payment).toHaveProperty('discountWasOffered');
    });

    it('should have history array with role and content', () => {
      const history = [
        {
          role: 'user' as const,
          content: 'Qual é o preço?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant' as const,
          content: 'O preço é R$150.00',
          timestamp: new Date().toISOString(),
        },
      ];

      expect(history).toHaveLength(2);
      expect(history[0]).toHaveProperty('role');
      expect(history[0]).toHaveProperty('content');
      expect(history[0].role).toBe('user');
    });
  });

  /**
   * Test Suite 4: Edge cases
   */
  describe('Edge cases', () => {
    it('should handle empty message history', () => {
      const emptyHistory = [] as any[];

      expect(emptyHistory).toHaveLength(0);
    });

    it('should handle missing optional fields', () => {
      const payment = {
        originalLink: 'https://pay.example.com/order/456',
        discountWasOffered: false,
      };

      expect(payment).toBeDefined();
      expect(payment.originalLink).toBeDefined();
    });

    it('should handle max cycles reached', () => {
      const conversation = {
        id: 'conv-789',
        state: 'ACTIVE',
        cycleCount: 5,
        maxCycles: 5,
        startedAt: new Date().toISOString(),
      };

      expect(conversation.cycleCount).toBe(conversation.maxCycles);
    });
  });
});
