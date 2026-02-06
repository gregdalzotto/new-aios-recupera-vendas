import { query, queryOne } from '../config/database';
import { Message, CreateMessagePayload } from '../models/Message';

export class MessageRepository {
  /**
   * Create a new message
   */
  static async create(payload: CreateMessagePayload): Promise<Message> {
    const result = await query<Message>(
      `INSERT INTO messages (
        conversation_id, sender_type, message_text, message_type,
        whatsapp_message_id, metadata, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        payload.conversation_id,
        payload.sender_type,
        payload.message_text,
        payload.message_type,
        payload.whatsapp_message_id || null,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
        payload.status || 'pending',
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create message');
    }

    return result.rows[0];
  }

  /**
   * Find message by ID
   */
  static async findById(id: string): Promise<Message | null> {
    const result = await queryOne<Message>(`SELECT * FROM messages WHERE id = $1`, [id]);

    if (result) {
      // Parse metadata JSON if exists
      if (result.metadata && typeof result.metadata === 'string') {
        result.metadata = JSON.parse(result.metadata);
      }
    }

    return result;
  }

  /**
   * Find messages by WhatsApp message ID (for dedup checking)
   */
  static async findByWhatsAppMessageId(whatsappMessageId: string): Promise<Message | null> {
    const result = await queryOne<Message>(
      `SELECT * FROM messages WHERE whatsapp_message_id = $1`,
      [whatsappMessageId]
    );

    if (result && result.metadata && typeof result.metadata === 'string') {
      result.metadata = JSON.parse(result.metadata);
    }

    return result;
  }

  /**
   * Find last N messages in conversation (for context/history)
   * Ordered by created_at DESC (most recent first)
   * Supports pagination with LIMIT and OFFSET
   */
  static async findByConversationId(
    conversationId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<Message[]> {
    const result = await query<Message>(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    // Parse metadata for each message
    return result.rows.map((msg) => {
      if (msg.metadata && typeof msg.metadata === 'string') {
        msg.metadata = JSON.parse(msg.metadata);
      }
      return msg;
    });
  }

  /**
   * Find messages with date range filtering
   * Supports filtering by sender and date range for advanced queries
   */
  static async findByConversationIdWithFilters(
    conversationId: string,
    options?: {
      sender?: 'user' | 'sara';
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<Message[]> {
    const { sender, fromDate, toDate, limit = 50, offset = 0 } = options || {};

    const conditions = ['conversation_id = $1'];
    const params: unknown[] = [conversationId];
    let paramCount = 2;

    if (sender) {
      conditions.push(`sender_type = $${paramCount++}`);
      params.push(sender);
    }

    if (fromDate) {
      conditions.push(`created_at >= $${paramCount++}`);
      params.push(fromDate.toISOString());
    }

    if (toDate) {
      conditions.push(`created_at <= $${paramCount++}`);
      params.push(toDate.toISOString());
    }

    params.push(limit);
    params.push(offset);

    const whereClause = conditions.join(' AND ');
    const result = await query<Message>(
      `SELECT * FROM messages
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    // Parse metadata for each message
    return result.rows.map((msg) => {
      if (msg.metadata && typeof msg.metadata === 'string') {
        msg.metadata = JSON.parse(msg.metadata);
      }
      return msg;
    });
  }

  /**
   * Count messages in a conversation with optional filters
   * Used for pagination metadata and analytics
   */
  static async countByConversationId(
    conversationId: string,
    sender?: 'user' | 'sara'
  ): Promise<number> {
    let query_str = 'SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1';
    const params: unknown[] = [conversationId];

    if (sender) {
      query_str += ' AND sender_type = $2';
      params.push(sender);
    }

    const result = await queryOne<{ count: string }>(query_str, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Update message status (sent, delivered, failed, etc.)
   */
  static async updateStatus(
    messageId: string,
    status: Message['status'],
    errorMessage?: string
  ): Promise<void> {
    await query(
      `UPDATE messages
       SET status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, errorMessage || null, messageId]
    );
  }

  /**
   * Count messages in conversation by sender
   */
  static async countBySender(conversationId: string, senderType: 'user' | 'sara'): Promise<number> {
    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM messages
       WHERE conversation_id = $1 AND sender_type = $2`,
      [conversationId, senderType]
    );

    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Update message fields (whatsapp_message_id, metadata, status, etc.)
   */
  static async update(
    messageId: string,
    updates: Partial<{
      whatsapp_message_id: string | null;
      metadata: Message['metadata'] | null;
      status: Message['status'];
      error_message: string | null;
    }>
  ): Promise<void> {
    const fields: string[] = [];
    const values: Array<unknown> = [];
    let paramCount = 1;

    if (updates.whatsapp_message_id !== undefined) {
      fields.push(`whatsapp_message_id = $${paramCount++}`);
      values.push(updates.whatsapp_message_id);
    }

    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }

    if (updates.error_message !== undefined) {
      fields.push(`error_message = $${paramCount++}`);
      values.push(updates.error_message);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push(`updated_at = NOW()`);
    values.push(messageId);

    await query(`UPDATE messages SET ${fields.join(', ')} WHERE id = $${paramCount}`, values);
  }
}
