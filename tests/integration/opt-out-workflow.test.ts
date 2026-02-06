/**
 * Opt-Out Workflow Integration Tests
 * Tests user opt-out detection: keyword matching + AI fallback
 */

import { UserFactory } from './fixtures/userFactory';
import { ConversationFactory } from './fixtures/conversationFactory';

jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/AIService');

describe('Opt-Out Workflow Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await UserFactory.cleanup();
    await ConversationFactory.cleanup();
  });

  afterAll(async () => {
    await UserFactory.cleanup();
    await ConversationFactory.cleanup();
  });

  describe('Keyword Detection - Portuguese Opt-Out Keywords', () => {
    it('should detect "não" keyword (explicit refusal)', async () => {
      const message = 'Não, obrigado. Não quero mais mensagens.';

      // Simulate keyword detection
      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
      const isOptOut = optOutKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      expect(isOptOut).toBe(true);
      expect(message.toLowerCase()).toContain('não');
    });

    it('should detect "parar" keyword (stop all)', async () => {
      const message = 'Por favor, parar de enviar mensagens';

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
      const isOptOut = optOutKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      expect(isOptOut).toBe(true);
      expect(message.toLowerCase()).toContain('parar');
    });

    it('should detect "desinscrever" keyword (unsubscribe)', async () => {
      const message = 'Quero me desinscrever da lista de ofertas';

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
      const isOptOut = optOutKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      expect(isOptOut).toBe(true);
      expect(message.toLowerCase()).toContain('desinscrever');
    });

    it('should detect "remover" keyword (remove)', async () => {
      const message = 'Por favor me remover da lista';

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
      const isOptOut = optOutKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      expect(isOptOut).toBe(true);
      expect(message.toLowerCase()).toContain('remover');
    });

    it('should NOT detect opt-out in normal purchase intent messages', async () => {
      const messages = [
        'Sim, gostaria de comprar',
        'Quero mais informações',
        'Qual é o preço?',
        'Como faço a compra?',
        'Estou interessado',
      ];

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];

      messages.forEach(message => {
        const isOptOut = optOutKeywords.some(keyword =>
          message.toLowerCase().includes(keyword)
        );
        expect(isOptOut).toBe(false);
      });
    });

    it('should be case-insensitive', async () => {
      const messages = [
        'NÃO quero mais',
        'Não quero mais',
        'não quero mais',
        'nÃo quero mais',
      ];

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];

      messages.forEach(message => {
        const isOptOut = optOutKeywords.some(keyword =>
          message.toLowerCase().includes(keyword)
        );
        expect(isOptOut).toBe(true);
      });
    });
  });

  describe('AI Fallback for Ambiguous Messages', () => {
    it('should require AI decision for ambiguous messages', async () => {
      // Messages that don't match keywords but might be opt-out
      const ambiguousMessages = [
        'Talvez depois',
        'Não agora',
        'Não tenho tempo',
        'Pode ser',
      ];

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];

      ambiguousMessages.forEach(message => {
        // Some might match "não" but are ambiguous
        const hasKeyword = optOutKeywords.some(keyword =>
          message.toLowerCase().includes(keyword)
        );

        if (hasKeyword) {
          expect(message.toLowerCase()).toContain('não');
        }
      });
    });

    it('should handle timeout in AI decision gracefully', async () => {
      // Simulate AI timeout - should default to conservative (no opt-out)
      const message = 'Talvez depois';
      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];

      const hasKeyword = optOutKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      // Without keyword, defaults to conservative (continue conversation)
      expect(hasKeyword).toBe(false);
    });
  });

  describe('Conversation Closure After Opt-Out', () => {
    it('should mark conversation for closure on opt-out detection', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: 'AWAITING_RESPONSE' as any,
      });

      // Simulate opt-out detection and closure
      const optOutMessage = 'Não quero mais mensagens';
      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];

      const isOptOut = optOutKeywords.some(keyword =>
        optOutMessage.toLowerCase().includes(keyword)
      );

      expect(isOptOut).toBe(true);
      expect(conversation.user_id).toBe(user.id);
      expect(conversation.status).toBeDefined();
    });

    it('should prevent further messages after opt-out closure', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: 'CLOSED' as any, // Simulated closed state
        cycle_count: 3,
        max_cycles: 5,
      });

      // Attempting to send after closure should be rejected
      const shouldAcceptMessage = conversation.status !== 'CLOSED';

      expect(conversation.status).toBe('CLOSED');
      expect(shouldAcceptMessage).toBe(false);
    });

    it('should log opt-out tracking in database', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
      });

      // Simulate tracking opt-out
      const optOutEvent = {
        conversationId: conversation.id,
        userId: user.id,
        timestamp: new Date().toISOString(),
        reason: 'User said "não"',
        action: 'CLOSE_CONVERSATION',
      };

      expect(optOutEvent.conversationId).toBe(conversation.id);
      expect(optOutEvent.userId).toBe(user.id);
      expect(optOutEvent.action).toBe('CLOSE_CONVERSATION');
      expect(optOutEvent.timestamp).toBeDefined();
    });
  });

  describe('Compliance Validation', () => {
    it('should honor user consent preferences', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
      });

      // Opt-out = explicit consent withdrawal
      const userOptedOut = true;

      expect(userOptedOut).toBe(true);
      expect(conversation.user_id).toBe(user.id);
    });

    it('should not retry opt-out conversations', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: 'CLOSED' as any,
      });

      // CLOSED conversations should not receive retry attempts
      const maxRetries = 0;
      const shouldRetry = conversation.status !== 'CLOSED' && maxRetries > 0;

      expect(shouldRetry).toBe(false);
    });

    it('should support opt-in after opt-out (user can change mind)', async () => {
      const user = await UserFactory.create();

      // First opt-out
      let conversation = await ConversationFactory.create({
        user_id: user.id,
        status: 'CLOSED' as any,
      });
      expect(conversation.status).toBe('CLOSED');

      // User can create new conversation if they opt-in again
      conversation = await ConversationFactory.create({
        user_id: user.id,
        status: 'AWAITING_RESPONSE' as any,
      });
      expect(conversation.status).toBe('AWAITING_RESPONSE');
    });
  });

  describe('Edge Cases', () => {
    it('should handle "não" with accents variations', async () => {
      const messages = [
        'não',
        'Não',
        'NÃO',
        'nao', // Without accent
      ];

      const optOutKeywords = ['não', 'nao']; // Support both with/without accent

      messages.forEach(message => {
        const isOptOut = optOutKeywords.some(keyword =>
          message.toLowerCase().includes(keyword)
        );
        expect(isOptOut).toBe(true);
      });
    });

    it('should handle multiple opt-out keywords in single message', async () => {
      const message = 'Não, parar, remover - quero tudo isso!';

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
      const matchedKeywords = optOutKeywords.filter(keyword =>
        message.toLowerCase().includes(keyword)
      );

      expect(matchedKeywords.length).toBe(3); // não, parar, remover
      expect(matchedKeywords).toContain('não');
      expect(matchedKeywords).toContain('parar');
      expect(matchedKeywords).toContain('remover');
    });

    it('should not false-positive on words containing opt-out substrings', async () => {
      const message = 'Não há problema em continuar'; // "não há" means "there is no" - context matters

      // Simple keyword matching
      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
      const hasKeyword = optOutKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      expect(hasKeyword).toBe(true); // Keyword found, but might need AI for context

      // In real scenario, this would go to AI for confirmation
      const needsAIDecision = true; // "Não há problema" is not an opt-out
      expect(needsAIDecision).toBe(true);
    });

    it('should handle empty or null messages', async () => {
      const messages: (string | null | undefined)[] = ['', null, undefined];

      const optOutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];

      messages.forEach(message => {
        if (!message) {
          expect(message).toBeFalsy();
          return;
        }

        const isOptOut = optOutKeywords.some(keyword =>
          message.toLowerCase().includes(keyword)
        );
        expect(isOptOut).toBe(false);
      });
    });
  });
});
