import { createHmac } from 'crypto';
import { hmacVerificationMiddleware } from '../../src/middleware/hmacVerification';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('HMAC Verification Middleware', () => {
  const SECRET = 'test-secret';
  const BODY = JSON.stringify({ test: 'data' });
  const validSignature = createHmac('sha256', SECRET).update(BODY).digest('hex');

  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    mockReply = {};
  });

  const createMockRequest = (overrides: any = {}): FastifyRequest => {
    return {
      method: 'POST',
      url: '/webhook/test',
      headers: {
        'x-hub-signature-256': `sha256=${validSignature}`,
      },
      body: BODY,
      ip: '127.0.0.1',
      ...overrides,
    } as any as FastifyRequest;
  };

  describe('Valid Signatures', () => {
    it('should pass verification with valid HMAC signature', async () => {
      const request = createMockRequest();
      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should pass with valid signature for abandonment webhook payload', async () => {
      const payload = JSON.stringify({
        entry: [
          {
            id: 'entry-1',
            time: Date.now(),
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '5511999999999' },
                  messages: [
                    {
                      from: '5511999999999',
                      id: 'msg-1',
                      timestamp: Date.now().toString(),
                      type: 'text',
                      text: { body: 'Gostaria de comprar' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
      const request = createMockRequest({
        url: '/webhook/messages',
        headers: { 'x-hub-signature-256': `sha256=${sig}` },
        body: payload,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should pass with valid signature for payment webhook payload', async () => {
      const payload = JSON.stringify({
        resource: '/me/payments',
        event: 'payments:webhook',
        timestamp: Date.now(),
        data: {
          id: 'payment-1',
          amount: { currency: 'BRL', value: '99.90' },
          status: 'CAPTURED',
          customer: { id: 'cust-1', phone: '5511999999999' },
        },
      });

      const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
      const request = createMockRequest({
        url: '/webhook/payment',
        headers: { 'x-hub-signature-256': `sha256=${sig}` },
        body: payload,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });
  });

  describe('Invalid/Attack Signatures', () => {
    it('should reject with completely invalid HMAC signature', async () => {
      const request = createMockRequest({
        headers: {
          'x-hub-signature-256': 'sha256=completely_invalid_hash_value_12345',
        },
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid HMAC signature');
    });

    it('should reject signature with wrong secret (tampering attack)', async () => {
      const wrongSecret = 'wrong-secret';
      const wrongSignature = createHmac('sha256', wrongSecret).update(BODY).digest('hex');

      const request = createMockRequest({
        headers: {
          'x-hub-signature-256': `sha256=${wrongSignature}`,
        },
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid HMAC signature');
    });

    it('should reject signature when body is tampered but signature not updated (replay attack)', async () => {
      // Original body has signature
      const originalBody = JSON.stringify({ amount: 100 });
      const originalSig = createHmac('sha256', SECRET).update(originalBody).digest('hex');

      // Attacker tries to modify the body but uses the original signature
      const request = createMockRequest({
        body: JSON.stringify({ amount: 10000 }), // Much higher amount!
        headers: {
          'x-hub-signature-256': `sha256=${originalSig}`, // Original signature
        },
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid HMAC signature');
    });

    it('should reject signature with wrong algorithm (SHA1 instead of SHA256)', async () => {
      const sha1Sig = createHmac('sha1', SECRET).update(BODY).digest('hex');

      const request = createMockRequest({
        headers: {
          'x-hub-signature-256': `sha1=${sha1Sig}`,
        },
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid HMAC signature');
    });

    it('should skip verification when signature header is empty', async () => {
      const request = createMockRequest({
        headers: {
          'x-hub-signature-256': '',
        },
      });

      // Empty header is treated as missing, so verification is skipped
      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should reject malformed signature header (missing sha256= prefix)', async () => {
      const request = createMockRequest({
        headers: {
          'x-hub-signature-256': validSignature, // No "sha256=" prefix
        },
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid HMAC signature');
    });
  });

  describe('Body Type Handling', () => {
    it('should handle string body', async () => {
      const stringBody = 'string-body';
      const stringSignature = createHmac('sha256', SECRET).update(stringBody).digest('hex');
      const request = createMockRequest({
        headers: { 'x-hub-signature-256': `sha256=${stringSignature}` },
        body: stringBody,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should handle buffer body', async () => {
      const bufferBody = Buffer.from('buffer-body');
      const bufferSignature = createHmac('sha256', SECRET)
        .update(bufferBody.toString())
        .digest('hex');
      const request = createMockRequest({
        headers: { 'x-hub-signature-256': `sha256=${bufferSignature}` },
        body: bufferBody,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should handle JSON object body', async () => {
      const objBody = { test: 'obj', nested: { value: 123 } };
      const objBodyStr = JSON.stringify(objBody);
      const objSignature = createHmac('sha256', SECRET).update(objBodyStr).digest('hex');
      const request = createMockRequest({
        headers: { 'x-hub-signature-256': `sha256=${objSignature}` },
        body: objBody,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });
  });

  describe('HTTP Method Handling', () => {
    it('should skip verification for GET requests', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: '/webhook/test',
        headers: {}, // No signature header
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should skip verification for /webhook/debug endpoint', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: '/webhook/debug',
        headers: {}, // No signature header
        body: BODY,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should skip verification when signature header is missing', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: '/webhook/test',
        headers: {}, // Remove signature header
        body: BODY,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty body', async () => {
      const emptyBody = '';
      const emptySig = createHmac('sha256', SECRET).update(emptyBody).digest('hex');

      const request = createMockRequest({
        headers: { 'x-hub-signature-256': `sha256=${emptySig}` },
        body: emptyBody,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should handle very large body signatures', async () => {
      const largeBody = JSON.stringify({
        data: 'x'.repeat(100000), // 100KB of data
      });
      const largeSig = createHmac('sha256', SECRET).update(largeBody).digest('hex');

      const request = createMockRequest({
        headers: { 'x-hub-signature-256': `sha256=${largeSig}` },
        body: largeBody,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should handle Unicode characters in body', async () => {
      const unicodeBody = JSON.stringify({
        message: 'Olá! 👋 Quero comprar 🛍️',
      });
      const unicodeSig = createHmac('sha256', SECRET).update(unicodeBody).digest('hex');

      const request = createMockRequest({
        headers: { 'x-hub-signature-256': `sha256=${unicodeSig}` },
        body: unicodeBody,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();
    });

    it('should handle missing secret (fallback to empty string)', async () => {
      delete process.env.WHATSAPP_APP_SECRET;

      const noSecretSig = createHmac('sha256', '').update(BODY).digest('hex');

      const request = createMockRequest({
        headers: { 'x-hub-signature-256': `sha256=${noSecretSig}` },
        body: BODY,
      });

      await expect(
        hmacVerificationMiddleware(request, mockReply as FastifyReply)
      ).resolves.toBeUndefined();

      // Restore for other tests
      process.env.WHATSAPP_APP_SECRET = SECRET;
    });
  });
});
