import { query, queryOne } from '../config/database';

export interface User {
  id: string;
  phone_number: string;
  name: string | null;
  opted_out: boolean;
  opted_out_at: string | null;
  opted_out_reason: string | null;
  created_at: string;
}

export class UserRepository {
  /**
   * Find user by phone number
   */
  static async findByPhone(phone: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE phone_number = $1', [phone]);
  }

  /**
   * Find user by ID
   */
  static async findById(id: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
  }

  /**
   * Create or update user (upsert)
   * Returns the user ID
   * Uses two-step approach to avoid ON CONFLICT trigger issues
   */
  static async upsert(phone: string, name: string): Promise<string> {
    // Step 1: Try to find existing user
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE phone_number = $1',
      [phone]
    );

    if (existing) {
      // Step 2: Update existing user
      await query('UPDATE users SET name = $1 WHERE phone_number = $2', [name, phone]);
      return existing.id;
    }

    // Step 3: Create new user if not exists
    const result = await query<{ id: string }>(
      'INSERT INTO users (phone_number, name) VALUES ($1, $2) RETURNING id',
      [phone, name]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to upsert user');
    }

    return result.rows[0].id;
  }

  /**
   * Mark user as opted out
   */
  static async markOptedOut(userId: string, reason: string): Promise<void> {
    await query(
      `UPDATE users SET opted_out = true, opted_out_at = NOW(), opted_out_reason = $1
       WHERE id = $2`,
      [reason, userId]
    );
  }

  /**
   * Check if user is opted out
   */
  static async isOptedOut(userId: string): Promise<boolean> {
    const result = await queryOne<{ opted_out: boolean }>(
      'SELECT opted_out FROM users WHERE id = $1',
      [userId]
    );

    return result?.opted_out ?? false;
  }
}
