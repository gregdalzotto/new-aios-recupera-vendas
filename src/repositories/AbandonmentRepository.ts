import { query, queryOne } from '../config/database';

export interface Abandonment {
  id: string;
  user_id: string;
  external_id: string;
  product_id: string;
  value: number;
  status: string;
  conversation_id: string | null;
  converted_at: string | null;
  conversion_link: string | null;
  payment_id: string | null;
  created_at: string;
}

export class AbandonmentRepository {
  /**
   * Find abandonment by external ID
   */
  static async findByExternalId(externalId: string): Promise<Abandonment | null> {
    return queryOne<Abandonment>('SELECT * FROM abandonments WHERE external_id = $1', [externalId]);
  }

  /**
   * Create new abandonment record
   */
  static async create(
    userId: string,
    externalId: string,
    productId: string,
    value: number,
    paymentLink?: string
  ): Promise<Abandonment> {
    const result = await query<Abandonment>(
      `INSERT INTO abandonments (user_id, external_id, product_id, value, payment_link, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [userId, externalId, productId, value, paymentLink || '']
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create abandonment record');
    }

    return result.rows[0];
  }

  /**
   * Find abandonment by ID
   */
  static async findById(id: string): Promise<Abandonment | null> {
    return queryOne<Abandonment>('SELECT * FROM abandonments WHERE id = $1', [id]);
  }

  /**
   * Find active abandonments for a user
   */
  static async findActiveByUserId(userId: string): Promise<Abandonment[]> {
    const result = await query<Abandonment>(
      "SELECT * FROM abandonments WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC",
      [userId]
    );

    return result.rows;
  }
}
