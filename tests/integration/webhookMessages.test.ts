import crypto from 'crypto';
import { build } from '../../src/app';
import ProcessMessageQueue from '../../src/jobs/processMessageJob';
import { config } from '../../src/config/env';

jest.mock('../../src/jobs/processMessageJob');

describe('WhatsApp Message Webhook Integration', () => {
  let fastify: any;

  const mockConversation = {
    id: 'conv-1',
    user_id: 'user-1',
    abandonment_id: 'abandon-1',
    phone_number: '+5511999999999',
    product_name: 'Laptop XYZ',
    cart_value: 1500,
    offers_made: 0,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const validMetaPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5511999999999',
                phone_number_id: '727258347143266',
              },
              messages: [
                {
                  from: '+5511999999999',
                  id: 'wamsg-abc123',
                  timestamp: '1656243940',
                  type: 'text',
                  text: {
                    body: 'Hello, do you have any discounts?',
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    fastify = await build({ logger: false });

    // Mock ConversationService
    jest.mock('../../src/services/ConversationService', () => ({
      ConversationService: {
        findByPhoneNumber: jest.fn().mockResolvedValue(mockConversation),
        incrementMessageCount: jest.fn().mockResolvedValue(undefined),
        updateTimestamps: jest.fn().mockResolvedValue(undefined),
      },
    }));
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (ProcessMessageQueue.addJob as jest.Mock).mockResolvedValue({ id: 'job-1' });
  });

  describe('POST /webhook/messages', () => {
    it('should accept valid webhook message', async () => {
      const payload = JSON.stringify(validMetaPayload);
      const signature = createHubSignature(payload);

      const response = await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload: validMetaPayload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('received');
      expect(ProcessMessageQueue.addJob).toHaveBeenCalled();
    });

    it('should reject invalid signature', async () => {
      const payload = JSON.stringify(validMetaPayload);

      const response = await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'x-hub-signature-256': 'sha256=invalid_signature',
          'content-type': 'application/json',
        },
        payload: validMetaPayload,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject missing signature', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'content-type': 'application/json',
        },
        payload: validMetaPayload,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should handle invalid payload structure gracefully', async () => {
      const invalidPayload = { invalid: 'structure' };
      const payload = JSON.stringify(invalidPayload);
      const signature = createHubSignature(payload);

      const response = await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload: invalidPayload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('skipped');
    });

    it('should skip non-text messages', async () => {
      const payload = {
        ...validMetaPayload,
        entry: [
          {
            ...validMetaPayload.entry[0],
            changes: [
              {
                value: {
                  ...validMetaPayload.entry[0].changes[0].value,
                  messages: [
                    {
                      from: '+5511999999999',
                      id: 'wamsg-xyz',
                      timestamp: '1656243940',
                      type: 'image',
                      image: {
                        mime_type: 'image/jpeg',
                        sha256: 'abc123',
                        id: 'img-123',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const payloadStr = JSON.stringify(payload);
      const signature = createHubSignature(payloadStr);

      const response = await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(ProcessMessageQueue.addJob).not.toHaveBeenCalled();
    });

    it('should enqueue multiple messages', async () => {
      const payload = {
        ...validMetaPayload,
        entry: [
          {
            ...validMetaPayload.entry[0],
            changes: [
              {
                value: {
                  ...validMetaPayload.entry[0].changes[0].value,
                  messages: [
                    {
                      from: '+5511999999999',
                      id: 'wamsg-1',
                      timestamp: '1656243940',
                      type: 'text',
                      text: { body: 'First message' },
                    },
                    {
                      from: '+5511999999999',
                      id: 'wamsg-2',
                      timestamp: '1656243941',
                      type: 'text',
                      text: { body: 'Second message' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const payloadStr = JSON.stringify(payload);
      const signature = createHubSignature(payloadStr);

      const response = await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(ProcessMessageQueue.addJob).toHaveBeenCalledTimes(2);
    });

    it('should include correct data in enqueued job', async () => {
      const payload = JSON.stringify(validMetaPayload);
      const signature = createHubSignature(payload);

      await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload: validMetaPayload,
      });

      expect(ProcessMessageQueue.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          whatsappMessageId: 'wamsg-abc123',
          phoneNumber: '+5511999999999',
          messageText: 'Hello, do you have any discounts?',
          traceId: expect.any(String),
        }),
        undefined
      );
    });

    it('should return quickly with 200 OK to Meta', async () => {
      const payload = JSON.stringify(validMetaPayload);
      const signature = createHubSignature(payload);

      const start = Date.now();
      const response = await fastify.inject({
        method: 'POST',
        url: '/webhook/messages',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload: validMetaPayload,
      });
      const duration = Date.now() - start;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

/**
 * Helper to create valid hub signature for testing
 */
function createHubSignature(payload: string): string {
  const appSecret = process.env.WHATSAPP_APP_SECRET || config.WHATSAPP_APP_SECRET;
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
}
