import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { ConversationService, ConversationStatus } from '../ConversationService';
import { MessageService } from '../MessageService';
import { query } from '../../config/database';
import crypto from 'crypto';

/**
 * ConversationService Context Tests (SARA-3.2)
 * Validates conversation context loading, history, metadata, and state management
 */
describe('ConversationService - Context Management', () => {
  let testConversationId: string;
  let testUserId: string;
  let testAbandonmentId: string;
  let testPhoneNumber: string;

  beforeAll(async () => {
    testUserId = crypto.randomUUID();
    testAbandonmentId = crypto.randomUUID();
    testConversationId = crypto.randomUUID();
    testPhoneNumber = '+5511999999999';

    try {
      // Create test user
      await query(
        `INSERT INTO users (id, phone_number, name, opted_out, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [testUserId, testPhoneNumber, 'Context Test User', false]
      );

      // Create test abandonment with actual schema fields
      await query(
        `INSERT INTO abandonments (id, user_id, external_id, product_id, value, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [testAbandonmentId, testUserId, 'ext-123', 'prod-001', 100.0, 'pending']
      );

      // Create test conversation
      await query(
        `INSERT INTO conversations (id, abandonment_id, user_id, status, message_count, cycle_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [testConversationId, testAbandonmentId, testUserId, 'active', 0, 0]
      );
    } catch (error) {
      console.error('Setup error:', error);
    }
  });

  afterAll(async () => {
    try {
      await query('DELETE FROM messages WHERE conversation_id = $1', [testConversationId]);
      await query('DELETE FROM conversations WHERE id = $1', [testConversationId]);
      await query('DELETE FROM abandonments WHERE id = $1', [testAbandonmentId]);
      await query('DELETE FROM users WHERE id = $1', [testUserId]);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('loadForContext', () => {
    test('should load complete conversation context for AI processing', async () => {
      // Store some messages first
      await MessageService.storeIncomingMessage(
        testConversationId,
        'I want to buy this product',
        `whatsapp-${Date.now()}`,
        { intent: 'confirmation' }
      );

      await MessageService.storeOutgoingMessage(
        testConversationId,
        'Great! Let me help you with the purchase details.',
        { response_id: 'gpt-123' }
      );

      // Load context
      const context = await ConversationService.loadForContext(
        testConversationId,
        testPhoneNumber,
        'trace-123'
      );

      expect(context).toBeDefined();
      expect(context.user.id).toBe(testUserId);
      expect(context.user.phone).toBe(testPhoneNumber);
      expect(context.abandonment.id).toBe(testAbandonmentId);
      expect(context.conversation.id).toBe(testConversationId);
      expect(context.conversation.state).toBe('ACTIVE');
      expect(context.conversation.cycleCount).toBe(0);
      expect(context.history.length).toBeGreaterThanOrEqual(2);
      expect(context.metadata?.messageCount).toBeGreaterThanOrEqual(2);
    });

    test('should throw error if conversation not found', async () => {
      const nonExistentId = crypto.randomUUID();

      await expect(
        ConversationService.loadForContext(nonExistentId, testPhoneNumber, 'trace-123')
      ).rejects.toThrow('Conversation not found');
    });

    test('should include message history in correct order', async () => {
      const context = await ConversationService.loadForContext(
        testConversationId,
        testPhoneNumber,
        'trace-456'
      );

      if (context.history.length >= 2) {
        // History should be in reverse chronological order
        for (let i = 0; i < context.history.length - 1; i++) {
          const current = new Date(context.history[i].timestamp).getTime();
          const next = new Date(context.history[i + 1].timestamp).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });

    test('should include user and abandonment data in context', async () => {
      const context = await ConversationService.loadForContext(
        testConversationId,
        testPhoneNumber,
        'trace-789'
      );

      expect(context.user.name).toBeDefined();
      expect(context.abandonment.product).toBe('prod-001');
      expect(context.abandonment.cartValue).toBe(10000); // 100.0 * 100 cents
      expect(context.abandonment.currency).toBe('BRL');
      expect(context.payment.originalLink).toContain(testAbandonmentId);
    });
  });

  describe('getFullHistory', () => {
    test('should retrieve full conversation history with default limit', async () => {
      const messages = await ConversationService.getFullHistory(testConversationId);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeLessThanOrEqual(50); // default limit
    });

    test('should support custom limit', async () => {
      const messages = await ConversationService.getFullHistory(testConversationId, 5);

      expect(messages.length).toBeLessThanOrEqual(5);
    });

    test('should support pagination with offset', async () => {
      const page1 = await ConversationService.getFullHistory(testConversationId, 3, 0);
      const page2 = await ConversationService.getFullHistory(testConversationId, 3, 3);

      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });

    test('should return empty array for non-existent conversation', async () => {
      const nonExistentId = crypto.randomUUID();
      const messages = await ConversationService.getFullHistory(nonExistentId);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBe(0);
    });
  });

  describe('getMetadata', () => {
    test('should retrieve conversation metadata', async () => {
      const metadata = await ConversationService.getMetadata(testConversationId);

      expect(metadata).toBeDefined();
      expect(metadata?.conversationId).toBe(testConversationId);
      expect(metadata?.status).toBe('active');
      expect(metadata?.cycleCount).toBe(0);
      expect(typeof metadata?.messageCount).toBe('number');
      expect(typeof metadata?.userMessageCount).toBe('number');
      expect(typeof metadata?.saraMessageCount).toBe('number');
    });

    test('should count messages by sender type', async () => {
      const metadata = await ConversationService.getMetadata(testConversationId);

      expect(metadata?.messageCount).toBeGreaterThanOrEqual(
        (metadata?.userMessageCount || 0) + (metadata?.saraMessageCount || 0)
      );
    });

    test('should return null for non-existent conversation', async () => {
      const nonExistentId = crypto.randomUUID();
      const metadata = await ConversationService.getMetadata(nonExistentId);

      expect(metadata).toBeNull();
    });

    test('should include timestamp information', async () => {
      const metadata = await ConversationService.getMetadata(testConversationId);

      expect(metadata?.createdAt).toBeDefined();
      expect(metadata?.lastMessageAt).toBeDefined();
    });
  });

  describe('updateLastMessageAt', () => {
    test('should update last message timestamp', async () => {
      const before = await ConversationService.getMetadata(testConversationId);
      const originalTime = before?.lastMessageAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 100));

      await ConversationService.updateLastMessageAt(testConversationId, 'trace-update');

      const after = await ConversationService.getMetadata(testConversationId);
      const newTime = after?.lastMessageAt;

      // Verify timestamp was updated
      if (originalTime && newTime) {
        const originalMs = new Date(originalTime).getTime();
        const newMs = new Date(newTime).getTime();
        expect(newMs).toBeGreaterThanOrEqual(originalMs);
      }
    });
  });

  describe('updateState', () => {
    test('should update conversation state', async () => {
      // Create a new conversation for this test to avoid affecting others
      const testConvId = crypto.randomUUID();
      await query(
        `INSERT INTO conversations (id, abandonment_id, user_id, status, message_count, cycle_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [testConvId, testAbandonmentId, testUserId, 'awaiting_response', 0, 0]
      );

      try {
        await ConversationService.updateState(
          testConvId,
          ConversationStatus.ACTIVE,
          'test update',
          'trace-123'
        );

        const metadata = await ConversationService.getMetadata(testConvId);
        expect(metadata?.status).toBe('active');
      } finally {
        await query('DELETE FROM conversations WHERE id = $1', [testConvId]);
      }
    });

    test('should throw error for invalid state transition', async () => {
      // Create conversation in CLOSED state (terminal)
      const testConvId = crypto.randomUUID();
      await query(
        `INSERT INTO conversations (id, abandonment_id, user_id, status, message_count, cycle_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [testConvId, testAbandonmentId, testUserId, 'closed', 0, 0]
      );

      try {
        // CLOSED state has no valid transitions
        await expect(
          ConversationService.updateState(
            testConvId,
            ConversationStatus.ACTIVE,
            'invalid',
            'trace-123'
          )
        ).rejects.toThrow();
      } finally {
        await query('DELETE FROM conversations WHERE id = $1', [testConvId]);
      }
    });
  });

  describe('getCycleCount', () => {
    test('should retrieve cycle count', async () => {
      const cycleCount = await ConversationService.getCycleCount(testConversationId);

      expect(typeof cycleCount).toBe('number');
      expect(cycleCount).toBe(0);
    });

    test('should return 0 for non-existent conversation', async () => {
      const nonExistentId = crypto.randomUUID();
      const cycleCount = await ConversationService.getCycleCount(nonExistentId);

      expect(cycleCount).toBe(0);
    });
  });

  describe('incrementCycleCount', () => {
    test('should increment cycle count', async () => {
      const before = await ConversationService.getCycleCount(testConversationId);
      const newCount = await ConversationService.incrementCycleCount(testConversationId);

      expect(newCount).toBe(before + 1);

      const after = await ConversationService.getCycleCount(testConversationId);
      expect(after).toBe(before + 1);
    });

    test('should increment multiple times', async () => {
      const before = await ConversationService.getCycleCount(testConversationId);

      await ConversationService.incrementCycleCount(testConversationId);
      await ConversationService.incrementCycleCount(testConversationId);

      const after = await ConversationService.getCycleCount(testConversationId);
      expect(after).toBe(before + 2);
    });
  });

  describe('Integration - Full Conversation Lifecycle', () => {
    test('should manage complete conversation lifecycle', async () => {
      const convId = crypto.randomUUID();
      await query(
        `INSERT INTO conversations (id, abandonment_id, user_id, status, message_count, cycle_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [convId, testAbandonmentId, testUserId, 'awaiting_response', 0, 0]
      );

      try {
        // 1. Load context
        const context = await ConversationService.loadForContext(
          convId,
          testPhoneNumber,
          'lifecycle-trace'
        );
        expect(context).toBeDefined();

        // 2. Store messages
        await MessageService.storeIncomingMessage(convId, 'Interested', `msg-${Date.now()}`);
        await MessageService.storeOutgoingMessage(convId, 'Great! How can I help?');

        // 3. Get metadata
        const metadata = await ConversationService.getMetadata(convId);
        expect(metadata?.messageCount).toBe(2);

        // 4. Update state
        await ConversationService.updateState(
          convId,
          ConversationStatus.ACTIVE,
          'engaged',
          'lifecycle-trace'
        );

        // 5. Increment cycle
        const newCycle = await ConversationService.incrementCycleCount(convId);
        expect(newCycle).toBe(1);

        // 6. Get full history
        const history = await ConversationService.getFullHistory(convId);
        expect(history.length).toBeGreaterThanOrEqual(2);

        // 7. Verify final state
        const finalMetadata = await ConversationService.getMetadata(convId);
        expect(finalMetadata?.status).toBe('active');
        expect(finalMetadata?.cycleCount).toBe(1);
      } finally {
        await query('DELETE FROM messages WHERE conversation_id = $1', [convId]);
        await query('DELETE FROM conversations WHERE id = $1', [convId]);
      }
    });
  });
});
