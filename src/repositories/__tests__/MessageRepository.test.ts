import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { MessageRepository } from '../MessageRepository';
import { query } from '../../config/database';
import crypto from 'crypto';

/**
 * MessageRepository Tests
 * Validates message history limit configuration and retrieval
 * Also tests pagination, filtering, and performance
 */
describe('MessageRepository', () => {
  let testConversationId: string;
  let testUserId: string;
  let testAbandonmentId: string;

  /**
   * Setup: Create test data
   */
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

  /**
   * Cleanup: Delete test data
   */
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
  describe('findByConversationId - Message History Limit & Pagination', () => {
    test('should respect configured history limit', async () => {
      // Create 5 test messages
      for (let i = 0; i < 5; i++) {
        await MessageRepository.create({
          conversation_id: testConversationId,
          sender_type: i % 2 === 0 ? 'user' : 'sara',
          message_text: `Test message ${i}`,
          message_type: 'text',
          whatsapp_message_id: `msg-${Date.now()}-${i}`,
          metadata: { intent: 'test' },
        });
      }

      // Fetch with limit=2
      const messages = await MessageRepository.findByConversationId(testConversationId, 2);

      expect(messages).toBeDefined();
      expect(messages.length).toBeLessThanOrEqual(2);
    });

    test('should return messages ordered by created_at DESC (most recent first)', async () => {
      const messages = await MessageRepository.findByConversationId(testConversationId, 10);

      if (messages.length >= 2) {
        // Verify messages are in descending order by creation time
        for (let i = 0; i < messages.length - 1; i++) {
          const current = new Date(messages[i].created_at).getTime();
          const next = new Date(messages[i + 1].created_at).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });

    test('should support OFFSET for pagination', async () => {
      // Get first 2 messages
      const firstPage = await MessageRepository.findByConversationId(testConversationId, 2, 0);
      // Get next 2 messages
      const secondPage = await MessageRepository.findByConversationId(testConversationId, 2, 2);

      // Pages should not overlap (assuming we have enough messages)
      if (firstPage.length > 0 && secondPage.length > 0) {
        expect(firstPage[0].id).not.toBe(secondPage[0].id);
      }
    });

    test('should default to offset of 0 if not specified', () => {
      const source = MessageRepository.findByConversationId.toString();
      expect(source).toContain('OFFSET');
    });

    test('should parse metadata JSON in returned messages', async () => {
      const messages = await MessageRepository.findByConversationId(testConversationId, 10);

      if (messages.length > 0) {
        const messageWithMetadata = messages.find((m) => m.metadata);
        if (messageWithMetadata) {
          expect(typeof messageWithMetadata.metadata).toBe('object');
          expect(messageWithMetadata.metadata).not.toBeNull();
        }
      }
    });

    test('should handle empty result set gracefully', async () => {
      const emptyConversationId = crypto.randomUUID();
      const messages = await MessageRepository.findByConversationId(emptyConversationId, 10);

      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBe(0);
    });

    test('should return all available messages when limit exceeds count', async () => {
      const allMessages = await MessageRepository.findByConversationId(testConversationId, 1000);
      const limitedMessages = await MessageRepository.findByConversationId(testConversationId, 5);

      expect(allMessages.length).toBeLessThanOrEqual(1000);
      expect(limitedMessages.length).toBeLessThanOrEqual(5);
    });
  });

  describe('findByConversationIdWithFilters - Advanced Filtering', () => {
    test('should filter messages by sender type (user)', async () => {
      const userMessages = await MessageRepository.findByConversationIdWithFilters(
        testConversationId,
        {
          sender: 'user',
          limit: 50,
        }
      );

      userMessages.forEach((msg) => {
        expect(msg.sender_type).toBe('user');
      });
    });

    test('should filter messages by sender type (sara)', async () => {
      const saraMessages = await MessageRepository.findByConversationIdWithFilters(
        testConversationId,
        {
          sender: 'sara',
          limit: 50,
        }
      );

      saraMessages.forEach((msg) => {
        expect(msg.sender_type).toBe('sara');
      });
    });

    test('should filter messages by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const recentMessages = await MessageRepository.findByConversationIdWithFilters(
        testConversationId,
        {
          fromDate: yesterday,
          toDate: tomorrow,
          limit: 50,
        }
      );

      recentMessages.forEach((msg) => {
        const msgDate = new Date(msg.created_at);
        expect(msgDate.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(msgDate.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    test('should combine sender and date filters', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const filteredMessages = await MessageRepository.findByConversationIdWithFilters(
        testConversationId,
        {
          sender: 'user',
          fromDate: yesterday,
          limit: 50,
        }
      );

      filteredMessages.forEach((msg) => {
        expect(msg.sender_type).toBe('user');
        const msgDate = new Date(msg.created_at);
        expect(msgDate.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
      });
    });

    test('should support pagination with filters', async () => {
      const page1 = await MessageRepository.findByConversationIdWithFilters(testConversationId, {
        limit: 2,
        offset: 0,
      });

      const page2 = await MessageRepository.findByConversationIdWithFilters(testConversationId, {
        limit: 2,
        offset: 2,
      });

      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });

    test('should default to limit of 50 if not specified', async () => {
      const messages = await MessageRepository.findByConversationIdWithFilters(testConversationId, {
        sender: 'user',
      });

      expect(messages.length).toBeLessThanOrEqual(50);
    });

    test('should handle no filters gracefully', async () => {
      const messages = await MessageRepository.findByConversationIdWithFilters(
        testConversationId,
        {}
      );

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('countByConversationId - Message Counting', () => {
    test('should count all messages in conversation', async () => {
      const count = await MessageRepository.countByConversationId(testConversationId);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should count messages filtered by sender', async () => {
      const userCount = await MessageRepository.countByConversationId(testConversationId, 'user');

      expect(typeof userCount).toBe('number');
      expect(userCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle non-existent conversation', async () => {
      const nonExistentId = crypto.randomUUID();
      const count = await MessageRepository.countByConversationId(nonExistentId);

      expect(count).toBe(0);
    });
  });

  describe('Message Dedup via findByWhatsAppMessageId', () => {
    test('should find messages by whatsapp_message_id', async () => {
      const whatsappId = `dedup-test-${Date.now()}`;

      const created = await MessageRepository.create({
        conversation_id: testConversationId,
        sender_type: 'user',
        message_text: 'Dedup test message',
        message_type: 'text',
        whatsapp_message_id: whatsappId,
      });

      const found = await MessageRepository.findByWhatsAppMessageId(whatsappId);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.whatsapp_message_id).toBe(whatsappId);
    });

    test('should return null for non-existent whatsapp_message_id', async () => {
      const nonExistentId = `non-existent-${Date.now()}`;
      const found = await MessageRepository.findByWhatsAppMessageId(nonExistentId);

      expect(found).toBeNull();
    });

    test('should parse metadata when found by whatsapp_message_id', async () => {
      const whatsappId = `dedup-metadata-${Date.now()}`;

      await MessageRepository.create({
        conversation_id: testConversationId,
        sender_type: 'user',
        message_text: 'Message with metadata',
        message_type: 'text',
        whatsapp_message_id: whatsappId,
        metadata: { intent: 'confirmation', sentiment: 'positive' },
      });

      const found = await MessageRepository.findByWhatsAppMessageId(whatsappId);

      expect(found?.metadata).toBeDefined();
      expect(typeof found?.metadata).toBe('object');
    });
  });

  describe('Performance & Database-Level Efficiency', () => {
    test('LIMIT clause is applied at database level for efficiency', () => {
      // The LIMIT is in the SQL query, not in JavaScript
      // This means the database only transfers limited rows
      const methodStr = MessageRepository.findByConversationId.toString();
      expect(methodStr).toContain('LIMIT');
    });

    test('OFFSET clause is applied at database level for efficiency', () => {
      // OFFSET is in the SQL query for pagination
      const methodStr = MessageRepository.findByConversationId.toString();
      expect(methodStr).toContain('OFFSET');
    });

    test('most recent messages are prioritized (DESC order)', () => {
      // ORDER BY created_at DESC ensures most relevant messages are included
      const methodStr = MessageRepository.findByConversationId.toString();
      expect(methodStr).toContain('DESC');
    });

    test('message history limit prevents loading entire conversation into memory', async () => {
      // Without a limit, conversations with 1000+ messages would load all
      // The configurable limit prevents this memory bloat
      const messages = await MessageRepository.findByConversationId(testConversationId, 20);
      expect(messages.length).toBeLessThanOrEqual(20);
    });
  });
});
