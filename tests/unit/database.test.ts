import { healthCheck, query, queryOne, transaction, closePool } from '../../src/config/database';

describe('Database Configuration', () => {
  afterAll(async () => {
    // Close connection pool after tests
    await closePool();
  });

  it('should verify database connection with health check', async () => {
    // Skip if DATABASE_URL is not set (useful for CI environments)
    if (!process.env.DATABASE_URL) {
      console.log('Skipping database test - DATABASE_URL not set');
      return;
    }

    const isHealthy = await healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('should query database successfully', async () => {
    if (!process.env.DATABASE_URL) {
      console.log('Skipping database test - DATABASE_URL not set');
      return;
    }

    // Simple query to get current time
    const result = await query('SELECT NOW() as current_time');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveProperty('current_time');
  });

  it('should handle query with parameters', async () => {
    if (!process.env.DATABASE_URL) {
      console.log('Skipping database test - DATABASE_URL not set');
      return;
    }

    // Create a test table, insert data, and query it
    await query('CREATE TEMP TABLE test_users (id SERIAL, name VARCHAR(255))');
    await query('INSERT INTO test_users (name) VALUES ($1)', ['John Doe']);

    const result = await queryOne<{ name: string }>('SELECT name FROM test_users WHERE name = $1', [
      'John Doe',
    ]);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('John Doe');
  });

  it('should handle transaction with multiple queries', async () => {
    if (!process.env.DATABASE_URL) {
      console.log('Skipping database test - DATABASE_URL not set');
      return;
    }

    const result = await transaction(async (client) => {
      // Create temp table
      await client.query('CREATE TEMP TABLE tx_test (id SERIAL, value VARCHAR(255))');

      // Insert data
      await client.query("INSERT INTO tx_test (value) VALUES ('test')");

      // Query data
      const queryResult = await client.query('SELECT COUNT(*) as count FROM tx_test');
      return (queryResult.rows[0] as { count: string }).count;
    });

    expect(result).toBe('1');
  });

  it('should handle null result from queryOne', async () => {
    if (!process.env.DATABASE_URL) {
      console.log('Skipping database test - DATABASE_URL not set');
      return;
    }

    const result = await queryOne<{ id: number }>('SELECT 1 as id WHERE FALSE');

    expect(result).toBeNull();
  });
});
