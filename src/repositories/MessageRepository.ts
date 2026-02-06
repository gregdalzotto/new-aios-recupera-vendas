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
   */
  static async findByConversationId(
    conversationId: string,
    limit: number = 10
  ): Promise<Message[]> {
    const result = await query<Message>(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit]
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
