import { createHmac } from 'crypto';
import { hmacVerificationMiddleware } from '../../src/middleware/hmacVerification';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('HMAC Verification Middleware', () => {
  const SECRET = 'test-secret';
  const BODY = JSON.stringify({ test: 'data' });
  const validSignature = createHmac('sha256', SECRET).update(BODY).digest('hex');

  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    // Set environment variable for the test
    process.env.WHATSAPP_APP_SECRET = SECRET;

    mockRequest = {
      method: 'POST',
      url: '/webhook/test',
      headers: {
        'x-hub-signature-256': `sha256=${validSignature}`,
      },
      body: BODY,
      ip: '127.0.0.1',
    };

    mockReply = {};
  });

  it('should pass verification with valid HMAC signature', async () => {
    await expect(
      hmacVerificationMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });

  it('should reject with invalid HMAC signature', async () => {
    mockRequest.headers = {
      'x-hub-signature-256': 'sha256=invalid_signature_hash',
    };

    await expect(
      hmacVerificationMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).rejects.toThrow('Invalid HMAC signature');
  });

  it('should skip verification for GET requests', async () => {
    const getRequest: Partial<FastifyRequest> = {
      method: 'GET',
      url: '/webhook/test',
      headers: {}, // No signature header
      ip: '127.0.0.1',
    };

    await expect(
      hmacVerificationMiddleware(getRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });

  it('should skip verification when signature header is missing', async () => {
    const postRequest: Partial<FastifyRequest> = {
      method: 'POST',
      url: '/webhook/test',
      headers: {}, // Remove signature header
      body: BODY,
      ip: '127.0.0.1',
    };

    await expect(
      hmacVerificationMiddleware(postRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });

  it('should handle different body types (string, buffer, object)', async () => {
    // Test with string body
    const stringBody = 'string-body';
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const stringSignature = createHmac('sha256', SECRET).update(stringBody).digest('hex');
    const stringRequest: Partial<FastifyRequest> = {
      method: 'POST',
      url: '/webhook/test',
      headers: { 'x-hub-signature-256': `sha256=${stringSignature}` },
      body: stringBody,
      ip: '127.0.0.1',
    };

    await expect(
      hmacVerificationMiddleware(stringRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();

    // Test with object body (JSON stringified)
    const objBody = { test: 'obj' };
    const objBodyStr = JSON.stringify(objBody);
    const objSignature = createHmac('sha256', SECRET).update(objBodyStr).digest('hex');
    const objRequest: Partial<FastifyRequest> = {
      method: 'POST',
      url: '/webhook/test',
      headers: { 'x-hub-signature-256': `sha256=${objSignature}` },
      body: objBody,
      ip: '127.0.0.1',
    };

    await expect(
      hmacVerificationMiddleware(objRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });
});
