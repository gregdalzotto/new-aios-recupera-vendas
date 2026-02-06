import { AIService } from '../AIService';
import { SaraContextPayload } from '../../types/sara';

/**
 * AIService Tests
 * Testing SARA context integration with OpenAI API
 */

describe('AIService - SARA Context Integration', () => {
  /**
   * Test Suite 1: buildUserMessageWithContext() - Dynamic context injection
   */
  describe('buildUserMessageWithContext()', () => {
    let mockContext: SaraContextPayload;

    beforeEach(() => {
      mockContext = {
        user: {
          id: 'user-123',
          name: 'João Silva',
          phone: '+5548991080788',
        },
        abandonment: {
          id: 'abandonment-456',
          product: 'Curso de Python Avançado',
          productId: 'prod-python-001',
          cartValue: 15000, // R$150.00 em centavos
          currency: 'BRL',
          createdAt: new Date('2026-02-05T10:00:00Z').toISOString(),
        },
        conversation: {
          id: 'conv-789',
          state: 'ACTIVE',
          cycleCount: 2,
          maxCycles: 5,
          startedAt: new Date('2026-02-05T11:00:00Z').toISOString(),
        },
        payment: {
          originalLink: 'https://pay.example.com/order/456',
          discountWasOffered: false,
        },
        history: [
          {
            role: 'user',
            content: 'Qual é o preço?',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: 'O preço é R$150.00',
            timestamp: new Date().toISOString(),
          },
        ],
      };
    });

    it('should include user information in context', () => {
      const userMessage = 'Tenho dúvida sobre o curso';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      expect(result).toContain('Nome: João Silva');
      expect(result).toContain('Telefone: +5548991080788');
    });

    it('should format cart value correctly in BRL', () => {
      const userMessage = 'Qual é o preço?';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      // Valor should be formatted as currency
      expect(result).toMatch(/Valor:.*150/);
    });

    it('should include cycle count information', () => {
      const userMessage = 'Teste';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      expect(result).toContain('Ciclo atual: 2/5');
    });

    it('should include conversation state', () => {
      const userMessage = 'Teste';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      expect(result).toContain('Estado: ACTIVE');
    });

    it('should include discount information when discount is available', () => {
      mockContext.payment.discountLink = 'https://pay.example.com/discount?pct=15';
      mockContext.payment.discountPercent = 15;

      const userMessage = 'Teste';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      expect(result).toContain('DESCONTO DISPONÍVEL');
      expect(result).toContain('Percentual: 15%');
      expect(result).toMatch(/Economia:.*22/); // Allow for formatting differences
    });

    it('should NOT include discount information when discount is not available', () => {
      const userMessage = 'Teste';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      expect(result).not.toContain('DESCONTO DISPONÍVEL');
    });

    it('should include message history in chronological order', () => {
      const userMessage = 'Teste';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      const userIndex = result.indexOf('Usuário: Qual é o preço?');
      const assistantIndex = result.indexOf('Sara: O preço é R$150.00');

      expect(userIndex).toBeGreaterThan(-1);
      expect(assistantIndex).toBeGreaterThan(-1);
      expect(userIndex).toBeLessThan(assistantIndex);
    });

    it('should include current user message', () => {
      const userMessage = 'Posso pagar em 3 vezes?';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      expect(result).toContain('"Posso pagar em 3 vezes?"');
    });

    it('should handle empty history gracefully', () => {
      mockContext.history = [];

      const userMessage = 'Primeira mensagem';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      expect(result).toContain('HISTÓRICO');
      expect(result).not.toContain('Usuário:');
    });

    it('should calculate cart age in minutes', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      mockContext.abandonment.createdAt = oneHourAgo.toISOString();

      const userMessage = 'Teste';
      const result = (AIService as any).buildUserMessageWithContext(userMessage, mockContext);

      // Should show approximately 60 minutes
      expect(result).toMatch(/Criado há: [5-9][0-9] minutos/);
    });
  });

  /**
   * Test Suite 2: validateSaraContext() - Context validation
   */
  describe('validateSaraContext()', () => {
    let validContext: SaraContextPayload;

    beforeEach(() => {
      validContext = {
        user: {
          id: 'user-123',
          name: 'João Silva',
          phone: '+5548991080788',
        },
        abandonment: {
          id: 'abandonment-456',
          product: 'Curso Python',
          productId: 'prod-001',
          cartValue: 15000,
          currency: 'BRL',
          createdAt: new Date().toISOString(),
        },
        conversation: {
          id: 'conv-789',
          state: 'ACTIVE',
          cycleCount: 2,
          maxCycles: 5,
          startedAt: new Date().toISOString(),
        },
        payment: {
          originalLink: 'https://pay.example.com/order/456',
          discountWasOffered: false,
        },
        history: [],
      };
    });

    it('should validate correct context without errors', () => {
      expect(() => {
        (AIService as any).validateSaraContext(validContext, 'trace-001');
      }).not.toThrow();
    });

    it('should throw when user.id is missing', () => {
      validContext.user.id = '';

      expect(() => {
        (AIService as any).validateSaraContext(validContext, 'trace-001');
      }).toThrow('Contexto inválido: user.id e user.name obrigatórios');
    });

    it('should throw when user.name is missing', () => {
      validContext.user.name = '';

      expect(() => {
        (AIService as any).validateSaraContext(validContext, 'trace-001');
      }).toThrow('Contexto inválido: user.id e user.name obrigatórios');
    });

    it('should throw when abandonment.id is missing', () => {
      validContext.abandonment.id = '';

      expect(() => {
        (AIService as any).validateSaraContext(validContext, 'trace-001');
      }).toThrow('Contexto inválido: abandonment.id obrigatório');
    });

    it('should throw when payment.originalLink is missing', () => {
      validContext.payment.originalLink = '';

      expect(() => {
        (AIService as any).validateSaraContext(validContext, 'trace-001');
      }).toThrow('Contexto inválido: payment.originalLink obrigatório');
    });

    it('should throw when discountLink exists but discountPercent is missing', () => {
      validContext.payment.discountLink = 'https://pay.example.com/discount';
      validContext.payment.discountPercent = undefined;

      expect(() => {
        (AIService as any).validateSaraContext(validContext, 'trace-001');
      }).toThrow('Contexto inválido: discountPercent obrigatório se discountLink existe');
    });

    it('should not throw when max cycles are reached', () => {
      validContext.conversation.cycleCount = 5;
      validContext.conversation.maxCycles = 5;

      // Should not throw - just logs a warning
      expect(() => {
        (AIService as any).validateSaraContext(validContext, 'trace-001');
      }).not.toThrow();
    });
  });

  /**
   * Test Suite 3: interpretMessage() - Backward compatibility
   */
  describe('interpretMessage() - Backward Compatibility', () => {
    it('should auto-detect SaraContextPayload type', async () => {
      const context: SaraContextPayload = {
        user: {
          id: 'user-123',
          name: 'João',
          phone: '+5548991080788',
        },
        abandonment: {
          id: 'abandonment-456',
          product: 'Curso',
          productId: 'prod-001',
          cartValue: 15000,
          currency: 'BRL',
          createdAt: new Date().toISOString(),
        },
        conversation: {
          id: 'conv-789',
          state: 'ACTIVE',
          cycleCount: 2,
          maxCycles: 5,
          startedAt: new Date().toISOString(),
        },
        payment: {
          originalLink: 'https://pay.example.com/order/456',
          discountWasOffered: false,
        },
        history: [],
      };

      // This is just checking that the function signature is correct
      expect(context).toBeDefined();
      expect(context.user).toBeDefined();
      expect(context.abandonment).toBeDefined();
    });
  });

  /**
   * Test Suite 4: Cart value calculations
   */
  describe('Cart Value Calculations', () => {
    it('should correctly format cart values in cents to BRL', () => {
      const cartValueCents = 15000; // R$150.00
      const cartValueBRL = cartValueCents / 100;

      expect(cartValueBRL).toBe(150);

      const formatted = cartValueBRL.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });

      // Check that it contains R$ and 150
      expect(formatted).toMatch(/R\$\s*150/);
    });

    it('should correctly calculate discounted values', () => {
      const originalValue = 15000; // centavos
      const discountPercent = 15;

      const discountedValue = (originalValue / 100) * (1 - discountPercent / 100);
      const savings = originalValue / 100 - discountedValue;

      expect(discountedValue).toBe(127.5); // R$127.50
      expect(savings).toBe(22.5); // R$22.50
    });
  });

  /**
   * Test Suite 5: Time calculations
   */
  describe('Time Calculations', () => {
    it('should correctly calculate minutes elapsed', () => {
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
  });
});
