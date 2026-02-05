import { z } from 'zod';
import { createValidationMiddleware } from '../../src/middleware/validation';
import { FastifyRequest, FastifyReply } from 'fastify';
import { FastifyRequestWithTrace } from '../../src/middleware/correlationId';

describe('Validation Middleware', () => {
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockReply = {};
  });

  it('should pass validation with valid body schema', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().positive(),
    });

    const middleware = createValidationMiddleware({ body: schema });

    const mockRequest: Partial<FastifyRequestWithTrace> = {
      method: 'POST',
      url: '/test',
      body: { name: 'John', age: 30 },
      traceId: 'test-trace-id',
    };

    await expect(
      middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });

  it('should reject invalid body data', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().positive(),
    });

    const middleware = createValidationMiddleware({ body: schema });

    const mockRequest: Partial<FastifyRequestWithTrace> = {
      method: 'POST',
      url: '/test',
      body: { name: 'John', age: -5 }, // Invalid: negative age
      traceId: 'test-trace-id',
    };

    await expect(
      middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).rejects.toThrow('Request validation failed');
  });

  it('should validate query parameters', async () => {
    const schema = z.object({
      page: z.string().transform((v) => parseInt(v, 10)),
      limit: z.string().transform((v) => parseInt(v, 10)),
    });

    const middleware = createValidationMiddleware({ query: schema });

    const mockRequest: Partial<FastifyRequestWithTrace> = {
      method: 'GET',
      url: '/test?page=1&limit=10',
      query: { page: '1', limit: '10' },
      traceId: 'test-trace-id',
    };

    await expect(
      middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });

  it('should validate params', async () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    const middleware = createValidationMiddleware({ params: schema });

    const mockRequest: Partial<FastifyRequestWithTrace> = {
      method: 'GET',
      url: '/test/:id',
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      traceId: 'test-trace-id',
    };

    await expect(
      middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });

  it('should reject invalid UUID in params', async () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    const middleware = createValidationMiddleware({ params: schema });

    const mockRequest: Partial<FastifyRequestWithTrace> = {
      method: 'GET',
      url: '/test/:id',
      params: { id: 'not-a-uuid' },
      traceId: 'test-trace-id',
    };

    await expect(
      middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).rejects.toThrow('Request validation failed');
  });

  it('should validate multiple schemas (body, params, query)', async () => {
    const schemas = {
      body: z.object({ email: z.string().email() }),
      params: z.object({ id: z.string().uuid() }),
      query: z.object({ sort: z.enum(['asc', 'desc']) }),
    };

    const middleware = createValidationMiddleware(schemas);

    const mockRequest: Partial<FastifyRequestWithTrace> = {
      method: 'POST',
      url: '/test/:id?sort=asc',
      body: { email: 'test@example.com' },
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      query: { sort: 'asc' },
      traceId: 'test-trace-id',
    };

    await expect(
      middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).resolves.toBeUndefined();
  });
});
