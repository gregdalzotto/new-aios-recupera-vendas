/**
 * Message Model
 * Represents a single message in a conversation (user or Sara response)
 */
export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'sara'; // user = incoming from WhatsApp, sara = our response
  message_text: string;
  message_type: 'text' | 'template'; // type of message sent
  whatsapp_message_id?: string; // Meta message ID for tracking (only for incoming)
  metadata?: {
    intent?: string; // price_question, objection, confirmation, unclear
    sentiment?: string; // positive, neutral, negative
    tokens_used?: number; // for OpenAI cost tracking
    response_id?: string; // OpenAI response ID (for analytics)
  };
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'; // message delivery status
  error_message?: string; // if status = failed
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
}

/**
 * Message create request (without auto-generated fields)
 */
export interface CreateMessagePayload {
  conversation_id: string;
  sender_type: 'user' | 'sara';
  message_text: string;
  message_type: 'text' | 'template';
  whatsapp_message_id?: string;
  metadata?: Message['metadata'];
  status?: 'pending' | 'sent';
}
