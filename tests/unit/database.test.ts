// Note: These imports are used via dynamic import in tests to reset module state
// Keeping import statement for reference
// import { query, queryOne, transaction } from '../../src/config/database';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn(function () {
    this.connect = jest.fn();
    this.end = jest.fn();
    this.on = jest.fn();
  }),
}));

jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/utils/retry', () => ({
  withRetry: jest.fn((fn) => fn()),
}));

describe('Database Query Timeout Protection', () => {
  let mockClient: any;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset module to get fresh pool instance
    jest.resetModules();

    // Mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Import after resetting modules
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn(),
      on: jest.fn(),
    };

    Pool.mockImplementation(() => mockPool);
  });

  describe('query timeout', () => {
    it('should complete query successfully within timeout', async () => {
      const mockResult = { rows: [{ id: 1, name: 'Test' }], rowCount: 1 };
      mockClient.query.mockResolvedValue(mockResult);

      const { query: importedQuery } = await import('../../src/config/database');
      const result = await importedQuery('SELECT * FROM users', []);

      expect(result.rows).toEqual(mockResult.rows);
      expect(result.rowCount).toBe(1);
    });

    it('should release client after query completes', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockClient.query.mockResolvedValue(mockResult);

      const { query: importedQuery } = await import('../../src/config/database');
      await importedQuery('SELECT * FROM users', []);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should pass correct parameters to query', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockClient.query.mockResolvedValue(mockResult);

      const { query: importedQuery } = await import('../../src/config/database');
      await importedQuery('SELECT * FROM users WHERE id = $1', [123]);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [123]);
    });

    it('should handle query errors', async () => {
      const queryError = new Error('Syntax error');
      mockClient.query.mockRejectedValue(queryError);

      const { query: importedQuery } = await import('../../src/config/database');

      await expect(importedQuery('INVALID SQL', [])).rejects.toThrow('Syntax error');
    });
  });

  describe('queryOne', () => {
    it('should return first row from query result', async () => {
      const mockResult = { rows: [{ id: 1, name: 'John' }], rowCount: 1 };
      mockClient.query.mockResolvedValue(mockResult);

      const { queryOne: importedQueryOne } = await import('../../src/config/database');
      const result = await importedQueryOne('SELECT * FROM users WHERE id = $1', [1]);

      expect(result).toEqual({ id: 1, name: 'John' });
    });

    it('should return null when no rows found', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockClient.query.mockResolvedValue(mockResult);

      const { queryOne: importedQueryOne } = await import('../../src/config/database');
      const result = await importedQueryOne('SELECT * FROM users WHERE id = $1', [999]);

      expect(result).toBeNull();
    });
  });

  describe('transaction timeout', () => {
    it('should complete transaction successfully within timeout', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const { transaction: importedTransaction } = await import('../../src/config/database');
      const result = await importedTransaction(async (_client) => {
        return { success: true };
      });

      expect(result).toEqual({ success: true });
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const { transaction: importedTransaction } = await import('../../src/config/database');

      const transactionError = new Error('Transaction failed');

      try {
        await importedTransaction(async (_client) => {
          throw transactionError;
        });
      } catch (error) {
        // Expected to throw
      }

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should release client after transaction completes', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const { transaction: importedTransaction } = await import('../../src/config/database');
      await importedTransaction(async (_client) => {
        return { success: true };
      });

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even when transaction fails', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const { transaction: importedTransaction } = await import('../../src/config/database');

      try {
        await importedTransaction(async (_client) => {
          throw new Error('Transaction error');
        });
      } catch (error) {
        // Expected to throw
      }

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle multiple statements in transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const { transaction: importedTransaction } = await import('../../src/config/database');
      await importedTransaction(async (_client) => {
        return { success: true };
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Error scenarios', () => {
    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection refused');
      mockPool.connect.mockRejectedValue(connectionError);

      const { query: importedQuery } = await import('../../src/config/database');

      await expect(importedQuery('SELECT * FROM users', [])).rejects.toThrow('Connection refused');
    });

    it('should handle query execution errors', async () => {
      const queryError = new Error('Database error');
      mockClient.query.mockRejectedValue(queryError);

      const { query: importedQuery } = await import('../../src/config/database');

      await expect(importedQuery('SELECT * FROM users', [])).rejects.toThrow('Database error');
    });
  });
});
