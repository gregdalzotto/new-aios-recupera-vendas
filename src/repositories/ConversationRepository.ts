import { query, queryOne } from '../config/database';

export interface Conversation {
  id: string;
  abandonment_id: string;
  user_id: string;
  status: string;
  message_count: number;
  cycle_count?: number;
  last_message_at: string | null;
  last_user_message_at: string | null;
  followup_sent: boolean;
  created_at: string;
}

export class ConversationRepository {
  /**
   * Create new conversation for abandonment
   */
  static async create(abandonmentId: string, userId: string): Promise<Conversation> {
    const result = await query<Conversation>(
      `INSERT INTO conversations (abandonment_id, user_id, status, message_count, followup_sent)
       VALUES ($1, $2, 'active', 0, false)
       RETURNING *`,
      [abandonmentId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create conversation');
    }

    return result.rows[0];
  }

  /**
   * Find conversation by abandonment ID
   */
  static async findByAbandonmentId(abandonmentId: string): Promise<Conversation | null> {
    return queryOne<Conversation>('SELECT * FROM conversations WHERE abandonment_id = $1', [
      abandonmentId,
    ]);
  }

  /**
   * Find conversation by ID
   */
  static async findById(id: string): Promise<Conversation | null> {
    return queryOne<Conversation>('SELECT * FROM conversations WHERE id = $1', [id]);
  }

  /**
   * Find active conversations for a user
   */
  static async findActiveByUserId(userId: string): Promise<Conversation[]> {
    const result = await query<Conversation>(
      "SELECT * FROM conversations WHERE user_id = $1 AND status = 'active' ORDER BY last_message_at DESC",
      [userId]
    );

    return result.rows;
  }

  /**
   * Update conversation status
   */
  static async updateStatus(conversationId: string, status: string): Promise<void> {
    await query('UPDATE conversations SET status = $1 WHERE id = $2', [status, conversationId]);
  }

  /**
   * Find conversation by phone number
   * Joins with users table to match by phone_number
   */
  static async findByPhoneNumber(phoneNumber: string): Promise<Conversation | null> {
    return queryOne<Conversation>(
      `SELECT c.id, c.abandonment_id, c.user_id, c.status, c.message_count,
              c.last_message_at, c.last_user_message_at, c.followup_sent,
              c.created_at, c.updated_at
       FROM conversations c
       INNER JOIN users u ON c.user_id = u.id
       WHERE u.phone_number = $1`,
      [phoneNumber]
    );
  }

  /**
   * Increment message count for conversation
   */
  static async incrementMessageCount(conversationId: string): Promise<void> {
    await query('UPDATE conversations SET message_count = message_count + 1 WHERE id = $1', [
      conversationId,
    ]);
  }

  /**
   * Update last message timestamp
   */
  static async updateLastMessageAt(conversationId: string, timestamp: Date): Promise<void> {
    await query('UPDATE conversations SET last_message_at = $1 WHERE id = $2', [
      timestamp.toISOString(),
      conversationId,
    ]);
  }

  /**
   * Update last user message timestamp
   */
  static async updateLastUserMessageAt(conversationId: string, timestamp: Date): Promise<void> {
    await query('UPDATE conversations SET last_user_message_at = $1 WHERE id = $2', [
      timestamp.toISOString(),
      conversationId,
    ]);
  }

  /**
   * Update cycle count for conversation
   */
  static async updateCycleCount(conversationId: string, cycleCount: number): Promise<void> {
    await query('UPDATE conversations SET cycle_count = $1 WHERE id = $2', [
      cycleCount,
      conversationId,
    ]);
  }
}
