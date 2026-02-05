import { createServer } from '../../src/server';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

describe('Abandonment Webhook Integration', () => {
  let server: FastifyInstance;
  const appSecret = 'test-secret-key';
  const hasDatabase = !!process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
    process.env.WHATSAPP_APP_SECRET = appSecret;
    process.env.DATABASE_URL = process.env.DATABASE_URL || '';

    server = await createServer();

    if (!hasDatabase) {
      console.log('DATABASE_URL not set, database-dependent tests will be skipped');
    }
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  const createValidPayload = (overrides = {}) => ({
    userId: 'user-123',
    name: 'John Doe',
    phone: '+5511999999999',
    productId: 'prod-456',
    paymentLink: 'https://payment.example.com/checkout',
    abandonmentId: `abandonment-${Date.now()}`,
    value: 150.5,
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  });

  const createHmacSignature = (payload: object) => {
    const body = JSON.stringify(payload);
    return `sha256=${crypto.createHmac('sha256', appSecret).update(body).digest('hex')}`;
  };

  describe('POST /webhook/abandonment', () => {
    const testIf = (condition: boolean) => (condition ? test : test.skip);

    testIf(hasDatabase)('should accept valid abandonment payload', async () => {
      const payload = createValidPayload();
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('processed');
      expect(body.abandonmentId).toBeDefined();
      expect(body.conversationId).toBeDefined();
    });

    testIf(hasDatabase)('should return already_processed for duplicate payload', async () => {
      const payload = createValidPayload({ abandonmentId: `dup-${Date.now()}` });
      const signature = createHmacSignature(payload);

      // First request
      const response1 = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response1.statusCode).toBe(200);
      const body1 = JSON.parse(response1.body);
      expect(body1.status).toBe('processed');

      // Duplicate request with same payload
      const response2 = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response2.statusCode).toBe(200);
      const body2 = JSON.parse(response2.body);
      expect(body2.status).toBe('already_processed');
      expect(body2.abandonmentId).toBe(body1.abandonmentId);
    });

    it('should reject invalid phone format', async () => {
      if (!hasDatabase) {
        return;
      }

      const payload = createValidPayload({ phone: 'invalid-phone' });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid payment link URL', async () => {
      if (!hasDatabase) {
        return;
      }

      const payload = createValidPayload({ paymentLink: 'not-a-url' });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should reject negative value', async () => {
      if (!hasDatabase) {
        return;
      }

      const payload = createValidPayload({ value: -100 });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required field userId', async () => {
      if (!hasDatabase) {
        return;
      }

      const payload = createValidPayload();
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (payload as any).userId;
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required field name', async () => {
      if (!hasDatabase) {
        return;
      }

      const payload = createValidPayload();
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (payload as any).name;
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required field phone', async () => {
      if (!hasDatabase) {
        return;
      }

      const payload = createValidPayload();
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (payload as any).phone;
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid HMAC signature', async () => {
      const payload = createValidPayload();
      const invalidSignature = 'sha256=invalid_signature';

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': invalidSignature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('HMAC_VERIFICATION_FAILED');
    });

    it('should return traceId in error response', async () => {
      const payload = createValidPayload({ phone: 'invalid' });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('traceId');
      expect(body.traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    testIf(hasDatabase)('should accept optional timestamp field', async () => {
      const payload = createValidPayload({
        abandonmentId: `ts-${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('processed');
    });

    testIf(hasDatabase)('should handle payload with extra fields', async () => {
      const payload = createValidPayload({
        abandonmentId: `extra-${Date.now()}`,
        extraField: 'should be ignored',
        anotherField: 123,
      });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('processed');
    });

    testIf(hasDatabase)('should accept phone number with 10-15 digits', async () => {
      const validPhones = [
        '+1234567890', // 10 digits
        '+12345678901', // 11 digits
        '+123456789012345', // 15 digits
      ];

      for (const phone of validPhones) {
        const payload = createValidPayload({
          phone,
          abandonmentId: `phone-${Date.now()}-${Math.random()}`,
        });
        const signature = createHmacSignature(payload);

        const response = await server.inject({
          method: 'POST',
          url: '/webhook/abandonment',
          headers: {
            'x-hub-signature-256': signature,
            'content-type': 'application/json',
          },
          payload,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.status).toBe('processed');
      }
    });

    it('should reject phone number with fewer than 10 digits', async () => {
      const payload = createValidPayload({ phone: '+123456789' });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject phone number with more than 15 digits', async () => {
      const payload = createValidPayload({ phone: '+1234567890123456' });
      const signature = createHmacSignature(payload);

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
