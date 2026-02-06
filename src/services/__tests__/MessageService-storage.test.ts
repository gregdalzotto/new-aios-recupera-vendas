import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { MessageService } from '../MessageService';
import { query } from '../../config/database';
import crypto from 'crypto';

/**
 * MessageService Storage Tests (SARA-3.1)
 * Validates message persistence and retrieval operations
 */
describe('MessageService - Storage Operations', () => {
  let testConversationId: string;
  let testUserId: string;
  let testAbandonmentId: string;

  beforeAll(async () => {
    testUserId = crypto.randomUUID();
    testAbandonmentId = crypto.randomUUID();
    testConversationId = crypto.randomUUID();

    try {
      // Create test user
      await query(
        `INSERT INTO users (id, phone_number, name, opted_out, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [testUserId, '+5511999999999', 'Test User', false]
      );

      // Create test abandonment
      await query(
        `INSERT INTO abandonments (id, user_id, product_name, product_value, currency, discount_percentage, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [testAbandonmentId, testUserId, 'Test Product', 100.0, 'BRL', 10, null]
      );

      // Create test conversation
      await query(
        `INSERT INTO conversations (id, abandonment_id, user_id, status, message_count, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [testConversationId, testAbandonmentId, testUserId, 'active', 0]
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

  describe('storeIncomingMessage', () => {
    test('should store incoming user message with metadata', async () => {
      const whatsappId = `incoming-${Date.now()}`;
      const message = await MessageService.storeIncomingMessage(
        testConversationId,
        'I am interested in the product',
        whatsappId,
        { intent: 'confirmation', sentiment: 'positive' }
      );

      expect(message).toBeDefined();
      expect(message.sender_type).toBe('user');
      expect(message.message_text).toBe('I am interested in the product');
      expect(message.whatsapp_message_id).toBe(whatsappId);
      expect(message.status).toBe('sent');
    });

    test('should detect and prevent duplicate messages (dedup)', async () => {
      const whatsappId = `dedup-${Date.now()}`;
      const text = 'Test message for dedup';

      // Store first message
      const first = await MessageService.storeIncomingMessage(testConversationId, text, whatsappId);

      // Try to store same message again
      const second = await MessageService.storeIncomingMessage(
        testConversationId,
        text,
        whatsappId
      );

      // Both should be the same message (second is a return of first)
      expect(first.id).toBe(second.id);
      expect(first.whatsapp_message_id).toBe(second.whatsapp_message_id);
    });

    test('should handle message with no metadata', async () => {
      const whatsappId = `no-metadata-${Date.now()}`;
      const message = await MessageService.storeIncomingMessage(
        testConversationId,
        'Simple message',
        whatsappId
      );

      expect(message).toBeDefined();
      expect(message.message_text).toBe('Simple message');
    });

    test('should store long messages up to WhatsApp limit', async () => {
      const whatsappId = `long-msg-${Date.now()}`;
      const longText = 'A'.repeat(1000); // Long but within 4096 limit

      const message = await MessageService.storeIncomingMessage(
        testConversationId,
        longText,
        whatsappId
      );

      expect(message).toBeDefined();
      expect(message.message_text.length).toBe(1000);
    });
  });

  describe('storeOutgoingMessage', () => {
    test('should store outgoing SARA message', async () => {
      const message = await MessageService.storeOutgoingMessage(
        testConversationId,
        'Thank you for your interest! Let me help you with the details.',
        {
          response_id: 'chatcmpl-123',
          tokens_used: 45,
          intent: 'response',
          sentiment: 'positive',
        }
      );

      expect(message).toBeDefined();
      expect(message.sender_type).toBe('sara');
      expect(message.status).toBe('sent');
      expect(message.metadata?.response_id).toBe('chatcmpl-123');
    });

    test('should store outgoing message without metadata', async () => {
      const message = await MessageService.storeOutgoingMessage(
        testConversationId,
        'Simple outgoing message'
      );

      expect(message).toBeDefined();
      expect(message.sender_type).toBe('sara');
      expect(message.message_text).toBe('Simple outgoing message');
    });

    test('should include OpenAI metadata when available', async () => {
      const message = await MessageService.storeOutgoingMessage(
        testConversationId,
        'Response with AI tracking',
        {
          response_id: 'chatcmpl-456',
          tokens_used: 128,
        }
      );

      expect(message.metadata?.response_id).toBe('chatcmpl-456');
      expect(message.metadata?.tokens_used).toBe(128);
    });
  });

  describe('getConversationHistory', () => {
    test('should retrieve conversation history with default limit', async () => {
      const messages = await MessageService.getConversationHistory(testConversationId);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeLessThanOrEqual(50);
    });

    test('should support custom limit', async () => {
      const messages = await MessageService.getConversationHistory(testConversationId, 10);

      expect(messages.length).toBeLessThanOrEqual(10);
    });

    test('should support pagination with offset', async () => {
      const page1 = await MessageService.getConversationHistory(testConversationId, 5, 0);
      const page2 = await MessageService.getConversationHistory(testConversationId, 5, 5);

      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });

    test('should return empty array for non-existent conversation', async () => {
      const nonExistentId = crypto.randomUUID();
      const messages = await MessageService.getConversationHistory(nonExistentId);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBe(0);
    });

    test('should return messages in reverse chronological order', async () => {
      const messages = await MessageService.getConversationHistory(testConversationId, 100);

      if (messages.length >= 2) {
        for (let i = 0; i < messages.length - 1; i++) {
          const current = new Date(messages[i].created_at).getTime();
          const next = new Date(messages[i + 1].created_at).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });
  });

  describe('getConversationHistoryFiltered', () => {
    test('should filter by sender type (user)', async () => {
      const messages = await MessageService.getConversationHistoryFiltered(testConversationId, {
        sender: 'user',
      });

      messages.forEach((msg) => {
        expect(msg.sender_type).toBe('user');
      });
    });

    test('should filter by sender type (sara)', async () => {
      const messages = await MessageService.getConversationHistoryFiltered(testConversationId, {
        sender: 'sara',
      });

      messages.forEach((msg) => {
        expect(msg.sender_type).toBe('sara');
      });
    });

    test('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const messages = await MessageService.getConversationHistoryFiltered(testConversationId, {
        fromDate: yesterday,
      });

      messages.forEach((msg) => {
        const msgDate = new Date(msg.created_at);
        expect(msgDate.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
      });
    });

    test('should support pagination in filtered results', async () => {
      const page1 = await MessageService.getConversationHistoryFiltered(testConversationId, {
        limit: 3,
        offset: 0,
      });
      const page2 = await MessageService.getConversationHistoryFiltered(testConversationId, {
        limit: 3,
        offset: 3,
      });

      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });
  });

  describe('getMessageCount', () => {
    test('should count all messages in conversation', async () => {
      const count = await MessageService.getMessageCount(testConversationId);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should count messages by sender type', async () => {
      const userCount = await MessageService.getMessageCount(testConversationId, 'user');
      const saraCount = await MessageService.getMessageCount(testConversationId, 'sara');

      expect(typeof userCount).toBe('number');
      expect(typeof saraCount).toBe('number');
      expect(userCount).toBeGreaterThanOrEqual(0);
      expect(saraCount).toBeGreaterThanOrEqual(0);
    });

    test('should return 0 for non-existent conversation', async () => {
      const nonExistentId = crypto.randomUUID();
      const count = await MessageService.getMessageCount(nonExistentId);

      expect(count).toBe(0);
    });
  });

  describe('getMessageById', () => {
    test('should retrieve message by ID', async () => {
      // First create a message
      const created = await MessageService.storeIncomingMessage(
        testConversationId,
        'Test message for retrieval',
        `retrieve-${Date.now()}`
      );

      // Then retrieve it
      const retrieved = await MessageService.getMessageById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.message_text).toBe('Test message for retrieval');
    });

    test('should return null for non-existent message', async () => {
      const nonExistentId = crypto.randomUUID();
      const message = await MessageService.getMessageById(nonExistentId);

      expect(message).toBeNull();
    });

    test('should parse metadata when retrieving by ID', async () => {
      const created = await MessageService.storeIncomingMessage(
        testConversationId,
        'Message with metadata',
        `metadata-${Date.now()}`,
        { intent: 'test', sentiment: 'neutral' }
      );

      const retrieved = await MessageService.getMessageById(created.id);

      expect(retrieved?.metadata).toBeDefined();
      expect(typeof retrieved?.metadata).toBe('object');
    });
  });

  describe('Message Service Integration', () => {
    test('should store and retrieve complete message flow', async () => {
      const whatsappId = `integration-${Date.now()}`;

      // Store incoming message
      const incoming = await MessageService.storeIncomingMessage(
        testConversationId,
        'I want to buy',
        whatsappId,
        { intent: 'confirmation' }
      );

      // Store outgoing response
      const outgoing = await MessageService.storeOutgoingMessage(
        testConversationId,
        'Great! Let me help you.',
        { response_id: 'gpt-123' }
      );

      // Retrieve conversation history
      const history = await MessageService.getConversationHistory(testConversationId, 10);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((m) => m.id === incoming.id)).toBe(true);
      expect(history.some((m) => m.id === outgoing.id)).toBe(true);
    });

    test('should count messages after storage operations', async () => {
      const beforeCount = await MessageService.getMessageCount(testConversationId);

      await MessageService.storeIncomingMessage(
        testConversationId,
        'New message',
        `count-test-${Date.now()}`
      );

      const afterCount = await MessageService.getMessageCount(testConversationId);

      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
    });
  });
});
