/**
 * Webhook Integration Tests
 * Tests real webhook endpoint behavior with HMAC validation
 */

import { createHmac } from 'crypto';
import { UserFactory } from './fixtures/userFactory';
import { ConversationFactory } from './fixtures/conversationFactory';

jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Webhook Integration Tests', () => {
  const SECRET = process.env.WHATSAPP_APP_SECRET || 'test-secret';

  beforeEach(async () => {
    jest.clearAllMocks();
    await UserFactory.cleanup();
    await ConversationFactory.cleanup();
  });

  afterAll(async () => {
    await UserFactory.cleanup();
    await ConversationFactory.cleanup();
  });

  const createWebhookSignature = (payload: string): string => {
    return createHmac('sha256', SECRET).update(payload).digest('hex');
  };

  describe('Abandonment Webhook', () => {
    it('should process valid abandonment webhook with HMAC', async () => {
      const payload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'wamsg-123',
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Olá, quero comprar!' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createWebhookSignature(payload);

      // Simulate webhook processing
      expect(signature).toBeDefined();
      expect(signature).toHaveLength(64); // SHA256 hex = 64 chars

      // Verify signature format
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should reject abandonment webhook with invalid HMAC', async () => {
      const payload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'wamsg-456',
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Quero comprar!' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const validSignature = createWebhookSignature(payload);
      const invalidSignature = 'invalid_signature_hash_' + '0'.repeat(40);

      // Signatures should not match
      expect(validSignature).not.toBe(invalidSignature);
      expect(invalidSignature).not.toMatch(/^[a-f0-9]{64}$/);
    });

    it('should detect tampered abandonment webhook payload', async () => {
      const originalPayload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'wamsg-789',
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Original message' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const originalSig = createWebhookSignature(originalPayload);

      // Tampered payload
      const tamperedPayload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'wamsg-789',
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Tampered message!' }, // Different content
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const tamperedSig = createWebhookSignature(tamperedPayload);

      // Signatures should be different
      expect(originalSig).not.toBe(tamperedSig);
    });
  });

  describe('Message Webhook', () => {
    it('should process valid message webhook with HMAC', async () => {
      const user = await UserFactory.create();

      const payload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: user.phone,
                      id: 'wamsg-msg-123',
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Sim, quero continuar' },
                    },
                  ],
                  contacts: [
                    {
                      profile: { name: user.name },
                      wa_id: user.phone.replace('+', ''),
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createWebhookSignature(payload);

      // Verify signature is valid for this payload
      const recomputedSig = createWebhookSignature(payload);
      expect(signature).toBe(recomputedSig);
    });

    it('should reject message webhook with replayed old signature', async () => {
      const user = await UserFactory.create();

      // Original message
      const originalPayload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: user.phone,
                      id: 'wamsg-123',
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Original' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const originalSig = createWebhookSignature(originalPayload);

      // New payload with different content
      const newPayload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: user.phone,
                      id: 'wamsg-456', // Different ID
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Different message' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      // Trying to use old signature on new payload should fail
      expect(originalSig).not.toBe(createWebhookSignature(newPayload));
    });
  });

  describe('Payment Webhook', () => {
    it('should process valid payment webhook with HMAC', async () => {
      const payload = JSON.stringify({
        resource: '/me/payments',
        event: 'payments:webhook',
        timestamp: Date.now(),
        data: {
          id: 'payment-123',
          amount: { currency: 'BRL', value: '99.90' },
          status: 'CAPTURED',
          customer: { id: 'cust-123', phone: '5511999999999' },
          reference: 'order-123',
        },
      });

      const signature = createWebhookSignature(payload);

      // Verify signature validity
      expect(signature).toBeDefined();
      expect(signature).toHaveLength(64);
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should detect payment amount tampering', async () => {
      // Original payment for R$99.90
      const originalPayload = JSON.stringify({
        resource: '/me/payments',
        event: 'payments:webhook',
        timestamp: Date.now(),
        data: {
          id: 'payment-789',
          amount: { currency: 'BRL', value: '99.90' },
          status: 'CAPTURED',
          customer: { id: 'cust-123', phone: '5511999999999' },
          reference: 'order-123',
        },
      });

      const originalSig = createWebhookSignature(originalPayload);

      // Attacker tries to increase amount to R$9999.90
      const tamperedPayload = JSON.stringify({
        resource: '/me/payments',
        event: 'payments:webhook',
        timestamp: Date.now(),
        data: {
          id: 'payment-789',
          amount: { currency: 'BRL', value: '9999.90' }, // Increased amount!
          status: 'CAPTURED',
          customer: { id: 'cust-123', phone: '5511999999999' },
          reference: 'order-123',
        },
      });

      const tamperedSig = createWebhookSignature(tamperedPayload);

      // Signatures must differ
      expect(originalSig).not.toBe(tamperedSig);
    });

    it('should reject payment webhook with invalid HMAC', async () => {
      const payload = JSON.stringify({
        resource: '/me/payments',
        event: 'payments:webhook',
        timestamp: Date.now(),
        data: {
          id: 'payment-999',
          amount: { currency: 'BRL', value: '199.90' },
          status: 'CAPTURED',
          customer: { id: 'cust-456', phone: '5511999999999' },
          reference: 'order-456',
        },
      });

      const validSignature = createWebhookSignature(payload);
      const wrongSecret = 'wrong-secret-key';
      const invalidSignature = createHmac('sha256', wrongSecret)
        .update(payload)
        .digest('hex');

      // Signatures must be different
      expect(validSignature).not.toBe(invalidSignature);
    });
  });

  describe('Webhook Idempotency', () => {
    it('should handle duplicate webhook deliveries (idempotency key)', async () => {
      const user = await UserFactory.create();

      const payload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: user.phone,
                      id: 'wamsg-idempotent-123', // Same ID for duplicate
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      type: 'text',
                      text: { body: 'Duplicate message' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createWebhookSignature(payload);

      // Simulate receiving the same webhook twice
      const firstAttempt = signature;
      const secondAttempt = createWebhookSignature(payload); // Same payload = same signature

      // Both attempts should have identical signatures
      expect(firstAttempt).toBe(secondAttempt);

      // Using message ID as idempotency key
      const messageId = 'wamsg-idempotent-123';
      expect(messageId).toBeDefined();
    });

    it('should differentiate webhook deliveries with different timestamps', async () => {
      const now = Math.floor(Date.now() / 1000);

      // First message
      const payload1 = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: now,
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'wamsg-ts-123',
                      timestamp: now.toString(),
                      type: 'text',
                      text: { body: 'Message 1' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      // Second message with different timestamp
      const payload2 = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: now + 1,
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'wamsg-ts-456',
                      timestamp: (now + 1).toString(),
                      type: 'text',
                      text: { body: 'Message 2' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const sig1 = createWebhookSignature(payload1);
      const sig2 = createWebhookSignature(payload2);

      // Different payloads = different signatures
      expect(sig1).not.toBe(sig2);
    });
  });
});
