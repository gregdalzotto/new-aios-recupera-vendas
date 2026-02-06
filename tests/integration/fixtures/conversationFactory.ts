import { query } from '../../../src/config/database';
import { ConversationStatus } from '../../../src/services/ConversationService';

/**
 * Conversation Factory - Create test conversations
 */
export interface TestConversation {
  id: string;
  abandonment_id: string;
  user_id: string;
  status: any; // ConversationStatus enum value
  cycle_count: number;
  max_cycles: number;
  last_user_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export class ConversationFactory {
  static async create(overrides?: Partial<TestConversation>): Promise<TestConversation> {
    const conversation: TestConversation = {
      id: overrides?.id || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      abandonment_id: overrides?.abandonment_id || `aband-${Date.now()}`,
      user_id: overrides?.user_id || `user-${Date.now()}`,
      status: overrides?.status || ConversationStatus.AWAITING_RESPONSE,
      cycle_count: overrides?.cycle_count || 0,
      max_cycles: overrides?.max_cycles || 5,
      last_user_message_at: overrides?.last_user_message_at || null,
      created_at: overrides?.created_at || new Date().toISOString(),
      updated_at: overrides?.updated_at || new Date().toISOString(),
    };

    try {
      await query(
        `INSERT INTO conversations
         (id, abandonment_id, user_id, status, cycle_count, max_cycles, last_user_message_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          conversation.id,
          conversation.abandonment_id,
          conversation.user_id,
          conversation.status,
          conversation.cycle_count,
          conversation.max_cycles,
          conversation.last_user_message_at,
          conversation.created_at,
          conversation.updated_at,
        ]
      );
    } catch (error) {
      console.log('Conversation insert failed, returning object');
    }

    return conversation;
  }

  static async cleanup(): Promise<void> {
    try {
      await query('TRUNCATE TABLE conversations CASCADE');
    } catch (error) {
      console.log('Could not cleanup conversations table');
    }
  }
}
