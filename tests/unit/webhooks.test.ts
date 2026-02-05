import { createServer } from '../../src/server';
import type { FastifyInstance } from 'fastify';

describe('Webhook Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    // Set required environment variables
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
    process.env.WHATSAPP_APP_SECRET = 'test-secret';

    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /webhook/messages', () => {
    it('should validate webhook with correct token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=test-verify-token',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('test_challenge');
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should reject webhook with invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=wrong-token',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('UNAUTHORIZED');
    });

    it('should return 400 when missing hub.mode', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.challenge=test_challenge&hub.verify_token=test-verify-token',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when missing hub.challenge', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.mode=subscribe&hub.verify_token=test-verify-token',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when missing hub.verify_token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.mode=subscribe&hub.challenge=test_challenge',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid hub.mode', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.mode=invalid&hub.challenge=test_challenge&hub.verify_token=test-verify-token',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('VALIDATION_ERROR');
    });

    it('should return plain text challenge, not JSON', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.mode=subscribe&hub.challenge=plain_text_challenge&hub.verify_token=test-verify-token',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('plain_text_challenge');
      expect(response.headers['content-type']).toContain('text/plain');

      // Verify it's NOT JSON
      expect(() => JSON.parse(response.body)).toThrow();
    });

    it('should handle special characters in challenge', async () => {
      const challenge = 'challenge_with_@special#chars$123';
      const response = await server.inject({
        method: 'GET',
        url: `/webhook/messages?hub.mode=subscribe&hub.challenge=${encodeURIComponent(challenge)}&hub.verify_token=test-verify-token`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(challenge);
    });

    it('should include traceId in logs for invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/webhook/messages?hub.mode=subscribe&hub.challenge=test&hub.verify_token=wrong',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('traceId');
    });
  });

  describe('POST /webhook/messages', () => {
    it('should accept POST requests (placeholder)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook/messages',
        payload: { test: 'data' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('received');
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('timestamp');
    });
  });
});
