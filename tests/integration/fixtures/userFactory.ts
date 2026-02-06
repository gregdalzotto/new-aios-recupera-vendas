import { query } from '../../../src/config/database';

/**
 * User Factory - Create test users
 */
export interface TestUser {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

export class UserFactory {
  static async create(overrides?: Partial<TestUser>): Promise<TestUser> {
    const user: TestUser = {
      id: overrides?.id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: overrides?.name || 'Test User',
      phone: overrides?.phone || `+55${Math.random().toString().slice(2, 11)}`,
      created_at: overrides?.created_at || new Date().toISOString(),
    };

    try {
      await query(
        `INSERT INTO users (id, name, phone, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.name, user.phone, user.created_at]
      );
    } catch (error) {
      // If insert fails, assume user exists - return it anyway
      console.log('User already exists or insert failed, returning user object');
    }

    return user;
  }

  static async cleanup(): Promise<void> {
    try {
      await query('TRUNCATE TABLE users CASCADE');
    } catch (error) {
      // Table may not exist in test environment
      console.log('Could not cleanup users table');
    }
  }
}
