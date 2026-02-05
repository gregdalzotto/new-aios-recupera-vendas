import { healthCheck, getRedisClient, closeRedisClient } from '../../src/config/redis';

describe('Redis Configuration', () => {
  afterAll(async () => {
    await closeRedisClient();
  });

  it('should initialize Redis client', async () => {
    const client = await getRedisClient();
    expect(client).toBeDefined();
    expect(client.isOpen).toBe(true);
  });

  it('should return existing client on second call', async () => {
    const client1 = await getRedisClient();
    const client2 = await getRedisClient();
    expect(client1).toBe(client2);
  });

  it('should pass health check', async () => {
    const isHealthy = await healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('should handle ping correctly', async () => {
    const client = await getRedisClient();
    const pong = await client.ping();
    expect(pong).toBe('PONG');
  });

  it('should support set and get operations', async () => {
    const client = await getRedisClient();
    await client.set('test-key', 'test-value');
    const value = await client.get('test-key');
    expect(value).toBe('test-value');
    await client.del('test-key');
  });

  it('should support TTL on keys', async () => {
    const client = await getRedisClient();
    await client.setEx('ttl-key', 10, 'ttl-value');
    const ttl = await client.ttl('ttl-key');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
    await client.del('ttl-key');
  });

  it('should support increment operations', async () => {
    const client = await getRedisClient();
    await client.set('counter', '0');
    await client.incr('counter');
    const value = await client.get('counter');
    expect(value).toBe('1');
    await client.del('counter');
  });
});
