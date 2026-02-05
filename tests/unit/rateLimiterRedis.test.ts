import { FastifyRequest, FastifyReply } from 'fastify';
import {
  rateLimiterMiddleware,
  createRateLimiterMiddleware,
  getRequestCount,
  clearRateLimitData,
  RateLimiterConfig,
} from '../../src/middleware/rateLimiterRedis';
import { getRedisClient } from '../../src/config/redis';
import { createError, ErrorType } from '../../src/utils/errors';

// Mock Redis client
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/errors');
jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Rate Limiter Redis Middleware', () => {
  let mockRedisClient: any;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      incr: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    };

    (getRedisClient as jest.Mock).mockResolvedValue(mockRedisClient);

    // Mock request (use Object.defineProperty to allow setting read-only ip)
    mockRequest = {
      headers: {},
    } as Partial<FastifyRequest>;
    Object.defineProperty(mockRequest, 'ip', {
      value: '192.168.1.1',
      writable: true,
      configurable: true,
    });

    // Mock reply
    mockReply = {} as Partial<FastifyReply>;

    // Default mock error creation (allows rate limit success)
    (createError as jest.Mock).mockImplementation((config) => {
      const error = new Error(config.message);
      (error as any).statusCode = config.statusCode;
      (error as any).type = config.type;
      return error;
    });
  });

  describe('rateLimiterMiddleware', () => {
    it('should allow request within rate limit', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate_limit:192.168.1.1');
      expect(mockRedisClient.expire).toHaveBeenCalledWith('rate_limit:192.168.1.1', 60);
    });

    it('should allow multiple requests under limit', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3);
      mockRedisClient.expire.mockResolvedValue(1);

      // First request
      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      // Second request
      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      // Third request
      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalledTimes(3);
    });

    it('should reject request exceeding rate limit', async () => {
      const limitError = new Error('Rate limit exceeded');
      (limitError as any).statusCode = 429;
      (limitError as any).type = ErrorType.RATE_LIMIT_EXCEEDED;

      mockRedisClient.incr.mockResolvedValue(101); // Exceeds default limit of 100
      mockRedisClient.expire.mockResolvedValue(1);
      (createError as jest.Mock).mockReturnValue(limitError);

      await expect(
        rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Rate limit exceeded');

      expect(createError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorType.RATE_LIMIT_EXCEEDED,
          statusCode: 429,
        })
      );
    });

    it('should respect custom rate limit config', async () => {
      const customError = new Error('Rate limit exceeded');
      (customError as any).statusCode = 429;
      (customError as any).type = ErrorType.RATE_LIMIT_EXCEEDED;

      mockRedisClient.incr.mockResolvedValue(51); // Exceeds custom limit of 50
      mockRedisClient.expire.mockResolvedValue(1);
      (createError as jest.Mock).mockReturnValue(customError);

      const customConfig: RateLimiterConfig = {
        maxRequests: 50,
        windowMs: 60000,
      };

      await expect(
        rateLimiterMiddleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply,
          customConfig
        )
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should extract X-Forwarded-For header for proxy scenarios', async () => {
      mockRequest.headers = {
        'x-forwarded-for': '203.0.113.1, 198.51.100.2',
      };
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate_limit:203.0.113.1');
    });

    it('should use request.ip when X-Forwarded-For not available', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate_limit:192.168.1.1');
    });

    it('should use 127.0.0.1 as fallback when no IP available', async () => {
      Object.defineProperty(mockRequest, 'ip', {
        value: undefined,
        writable: true,
      });
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate_limit:127.0.0.1');
    });

    it('should set TTL only on first request', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      mockRedisClient.expire.mockResolvedValue(1);

      // First request
      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      // Second request
      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.expire).toHaveBeenCalledTimes(1); // Only once
    });

    it('should allow request in degraded mode when Redis unavailable', async () => {
      const redisError = new Error('Redis connection failed');
      mockRedisClient.incr.mockRejectedValue(redisError);

      // Should not throw - allows request in degraded mode
      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalled();
    });

    it('should throw original error if it is an AppError', async () => {
      const appError = new Error('Rate limit exceeded');
      Object.defineProperty(appError, 'constructor', {
        value: { name: 'AppError' },
        writable: true,
      });

      mockRedisClient.incr.mockResolvedValue(101);
      mockRedisClient.expire.mockResolvedValue(1);
      (createError as jest.Mock).mockReturnValue(appError);

      await expect(
        rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('createRateLimiterMiddleware', () => {
    it('should create middleware function', async () => {
      const middleware = createRateLimiterMiddleware({ maxRequests: 50 });

      expect(typeof middleware).toBe('function');
    });

    it('should apply custom config to created middleware', async () => {
      mockRedisClient.incr.mockResolvedValue(51); // Exceeds custom limit of 50
      mockRedisClient.expire.mockResolvedValue(1);

      const customError = new Error('Rate limit exceeded');
      (customError as any).statusCode = 429;
      (customError as any).type = ErrorType.RATE_LIMIT_EXCEEDED;
      (createError as jest.Mock).mockReturnValue(customError);

      const middleware = createRateLimiterMiddleware({ maxRequests: 50, windowMs: 30000 });

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('getRequestCount', () => {
    it('should return current request count for IP', async () => {
      mockRedisClient.get.mockResolvedValue('42');

      const count = await getRequestCount('203.0.113.1');

      expect(count).toBe(42);
      expect(mockRedisClient.get).toHaveBeenCalledWith('rate_limit:203.0.113.1');
    });

    it('should return 0 when no count exists', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const count = await getRequestCount('203.0.113.1');

      expect(count).toBe(0);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const count = await getRequestCount('203.0.113.1');

      expect(count).toBe(0);
    });

    it('should parse integer from Redis string value', async () => {
      mockRedisClient.get.mockResolvedValue('99');

      const count = await getRequestCount('203.0.113.1');

      expect(count).toBe(99);
      expect(typeof count).toBe('number');
    });
  });

  describe('clearRateLimitData', () => {
    it('should clear data for specific IP', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await clearRateLimitData('203.0.113.1');

      expect(mockRedisClient.del).toHaveBeenCalledWith('rate_limit:203.0.113.1');
    });

    it('should clear all rate limit data when no IP specified', async () => {
      mockRedisClient.keys.mockResolvedValue(['rate_limit:203.0.113.1', 'rate_limit:198.51.100.2']);
      mockRedisClient.del.mockResolvedValue(2);

      await clearRateLimitData();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('rate_limit:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'rate_limit:203.0.113.1',
        'rate_limit:198.51.100.2',
      ]);
    });

    it('should handle no keys found when clearing all', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await clearRateLimitData();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should handle clear errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Clear failed'));

      // Should not throw
      await clearRateLimitData('203.0.113.1');

      expect(mockRedisClient.del).toHaveBeenCalled();
    });
  });

  describe('IP Extraction Edge Cases', () => {
    it('should handle X-Forwarded-For with extra spaces', async () => {
      mockRequest.headers = {
        'x-forwarded-for': '  203.0.113.1  ,  198.51.100.2  ',
      };
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate_limit:203.0.113.1');
    });

    it('should handle X-Forwarded-For as string (non-array)', async () => {
      mockRequest.headers = {
        'x-forwarded-for': '203.0.113.1',
      };
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await rateLimiterMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate_limit:203.0.113.1');
    });
  });
});
