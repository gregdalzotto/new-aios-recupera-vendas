import { randomUUID } from 'crypto';
import {
  correlationIdMiddleware,
  FastifyRequestWithTrace,
} from '../../src/middleware/correlationId';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('CorrelationId Middleware', () => {
  let mockRequest: Partial<FastifyRequestWithTrace>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      url: '/webhook/test',
      headers: {},
      ip: '127.0.0.1',
    };
    mockReply = {};
  });

  it('should generate a new UUID if no trace-id header exists', async () => {
    await correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

    const traceId = (mockRequest as FastifyRequestWithTrace).traceId;
    expect(traceId).toBeDefined();
    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('should use existing trace-id from header', async () => {
    const existingTraceId = randomUUID();
    mockRequest.headers = { 'x-trace-id': existingTraceId };

    await correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

    const traceId = (mockRequest as FastifyRequestWithTrace).traceId;
    expect(traceId).toBe(existingTraceId);
  });

  it('should add traceId to request object', async () => {
    await correlationIdMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect((mockRequest as FastifyRequestWithTrace).traceId).toBeDefined();
  });

  it('should generate unique trace-ids for different requests', async () => {
    const request1: Partial<FastifyRequestWithTrace> = {
      method: 'GET',
      url: '/test1',
      headers: {},
    };
    const request2: Partial<FastifyRequestWithTrace> = {
      method: 'GET',
      url: '/test2',
      headers: {},
    };

    await correlationIdMiddleware(request1 as FastifyRequest, mockReply as FastifyReply);
    await correlationIdMiddleware(request2 as FastifyRequest, mockReply as FastifyReply);

    expect(request1.traceId).not.toBe(request2.traceId);
  });
});
