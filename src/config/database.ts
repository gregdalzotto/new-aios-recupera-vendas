import { Pool, PoolClient } from 'pg';
import { config } from './env';
import logger from './logger';
import { withRetry } from '../utils/retry';

// Database connection pool
let pool: Pool | null = null;

// Query timeout in milliseconds (30 seconds)
const QUERY_TIMEOUT_MS = 30000;

/**
 * Create a timeout promise that rejects after specified duration
 */
function createTimeoutPromise<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Query timeout: ${label} exceeded ${ms}ms limit`));
    }, ms);
  });
}

/**
 * Get or create database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err: Error) => {
      logger.error('Unexpected error on idle client', err);
    });

    logger.info('Database connection pool created');
  }

  return pool;
}

/**
 * Execute a query on the pool with automatic retry on transient errors and timeout protection
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  return withRetry(async () => {
    const client = await getPool().connect();
    try {
      // Race between query execution and timeout
      const result = (await Promise.race([
        client.query(text, params),
        createTimeoutPromise<any>(QUERY_TIMEOUT_MS, text.substring(0, 50)),
      ])) as any;

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
      };
    } finally {
      client.release();
    }
  });
}

/**
 * Execute a single row query
 */
export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Execute multiple queries in a transaction with timeout protection
 */
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();

  try {
    // Wrap entire transaction in timeout
    const executeTransaction = async (): Promise<T> => {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    };

    return await (Promise.race([
      executeTransaction(),
      createTimeoutPromise<T>(QUERY_TIMEOUT_MS, 'transaction'),
    ]) as Promise<T>);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Error during transaction rollback', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Health check - verify database connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    return result.rowCount > 0;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
}

/**
 * Run migrations from SQL files
 * Note: This is a simple implementation. In production, use Flyway, Knex, or similar.
 */
export async function runMigrations(migrationDir: string): Promise<void> {
  logger.info(`Running migrations from ${migrationDir}`);

  try {
    const client = await getPool().connect();
    try {
      // Create migrations tracking table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      logger.info('Migrations tracking table ready');
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to setup migrations table', error);
    throw error;
  }
}
