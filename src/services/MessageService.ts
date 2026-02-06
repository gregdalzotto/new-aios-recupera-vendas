import crypto from 'crypto';
import logger from '../config/logger';
import { MessageRepository } from '../repositories/MessageRepository';
import SendMessageQueue, { SendMessagePayload } from '../jobs/sendMessageJob';
import { config } from '../config/env';

/**
 * WhatsApp API response for sent message
 */
interface WhatsAppApiResponse {
  messages: Array<{
    id: string;
  }>;
}

/**
 * Send message result
 */
export interface SendResult {
  messageId: string;
  status: 'sent' | 'queued' | 'failed';
  whatsappMessageId?: string;
  error?: string;
}

/**
 * MessageService - WhatsApp message sending with retry and fallback to queue
 * Handles text and template messages with proper error handling and compliance logging
 */
export class MessageService {
  private static readonly WHATSAPP_API_VERSION = 'v18.0';
  private static readonly WHATSAPP_API_HOST = 'https://graph.facebook.com';
  private static readonly E164_PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
  private static readonly MAX_MESSAGE_LENGTH = 4096;

  /**
   * Validate phone number in E.164 format
   */
  private static validatePhoneNumber(phone: string): boolean {
    // Remove non-digit characters except leading +
    const normalized = phone.replace(/\D/g, '');
    if (!normalized) return false;

    // E.164 format: 1-15 digits
    return this.E164_PHONE_REGEX.test(`+${normalized}`);
  }

  /**
   * Normalize phone to E.164 format
   */
  private static normalizePhone(phone: string): string {
    const normalized = phone.replace(/\D/g, '');

    // If starts with country code 55 (Brazil), ensure it has +55
    if (normalized.startsWith('55')) {
      return `+${normalized}`;
    }

    // Otherwise, assume it needs country code (fallback to +55 for Brazil)
    return `+55${normalized}`;
  }

  /**
   * Send text message via WhatsApp API with retry logic
   */
  private static async sendTextMessageWithRetry(
    phoneNumber: string,
    messageText: string,
    traceId: string,
    conversationId: string,
    retryCount: number = 0
  ): Promise<SendResult> {
    const maxRetries = 3;
    const backoffDelays = [1000, 2000, 4000, 8000]; // 1s, 2s, 4s, 8s

    try {
      // Validate inputs
      if (!this.validatePhoneNumber(phoneNumber)) {
        logger.error('Invalid phone number format', {
          phoneNumber,
          traceId,
          conversationId,
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'Invalid phone number format (E.164 required)',
        };
      }

      if (messageText.length > this.MAX_MESSAGE_LENGTH) {
        logger.error('Message text exceeds max length', {
          length: messageText.length,
          maxLength: this.MAX_MESSAGE_LENGTH,
          traceId,
          conversationId,
        });
        return {
          messageId: '',
          status: 'failed',
          error: `Message exceeds ${this.MAX_MESSAGE_LENGTH} characters`,
        };
      }

      const normalizedPhone = this.normalizePhone(phoneNumber);
      const url = `${this.WHATSAPP_API_HOST}/${this.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_ID}/messages`;

      logger.debug('Sending WhatsApp text message', {
        conversationId,
        phoneNumber: normalizedPhone,
        messageLength: messageText.length,
        traceId,
        attempt: retryCount + 1,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'text',
          text: {
            body: messageText,
          },
        }),
      });

      const data: WhatsAppApiResponse = (await response.json()) as WhatsAppApiResponse;

      // Handle specific HTTP status codes
      if (response.status === 401) {
        logger.error('WhatsApp API authentication failed', {
          conversationId,
          traceId,
          status: response.status,
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'Authentication failed (invalid access token)',
        };
      }

      if (response.status === 400) {
        logger.error('WhatsApp API bad request', {
          conversationId,
          traceId,
          status: response.status,
          error: JSON.stringify(data),
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'Bad request (invalid phone or message format)',
        };
      }

      if (response.status === 429) {
        logger.warn('WhatsApp API rate limited', {
          conversationId,
          traceId,
          retryCount,
        });

        // Rate limited - retry with exponential backoff
        if (retryCount < maxRetries) {
          const delay = backoffDelays[Math.min(retryCount, backoffDelays.length - 1)];
          logger.debug('Retrying after rate limit', { delay, retryCount });
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.sendTextMessageWithRetry(
            phoneNumber,
            messageText,
            traceId,
            conversationId,
            retryCount + 1
          );
        }

        // Max retries exceeded - queue for later
        return {
          messageId: '',
          status: 'queued',
          error: 'Rate limited - queued for retry',
        };
      }

      if (response.status === 500) {
        logger.error('WhatsApp API server error', {
          conversationId,
          traceId,
          status: response.status,
          retryCount,
        });

        // Server error - retry with exponential backoff
        if (retryCount < maxRetries) {
          const delay = backoffDelays[Math.min(retryCount, backoffDelays.length - 1)];
          logger.debug('Retrying after server error', { delay, retryCount });
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.sendTextMessageWithRetry(
            phoneNumber,
            messageText,
            traceId,
            conversationId,
            retryCount + 1
          );
        }

        // Max retries exceeded - queue for later
        return {
          messageId: '',
          status: 'queued',
          error: 'Server error - queued for retry',
        };
      }

      if (!response.ok) {
        logger.error('WhatsApp API error', {
          conversationId,
          traceId,
          status: response.status,
          error: JSON.stringify(data),
        });
        return {
          messageId: '',
          status: 'failed',
          error: `WhatsApp API error: ${response.status}`,
        };
      }

      const whatsappMessageId = data.messages?.[0]?.id;
      if (!whatsappMessageId) {
        logger.error('No message ID in WhatsApp response', {
          conversationId,
          traceId,
          response: JSON.stringify(data),
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'No message ID received from WhatsApp API',
        };
      }

      logger.info('WhatsApp text message sent successfully', {
        conversationId,
        whatsappMessageId,
        traceId,
      });

      return {
        messageId: whatsappMessageId,
        status: 'sent',
        whatsappMessageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error sending WhatsApp text message', {
        conversationId,
        traceId,
        error: errorMessage,
        retryCount,
      });

      // Network/runtime error - queue for later
      return {
        messageId: '',
        status: 'queued',
        error: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Send template message via WhatsApp API with retry logic
   */
  private static async sendTemplateMessageWithRetry(
    phoneNumber: string,
    templateName: string,
    templateParams: Record<string, string> | undefined,
    traceId: string,
    conversationId: string,
    retryCount: number = 0
  ): Promise<SendResult> {
    const maxRetries = 3;
    const backoffDelays = [1000, 2000, 4000, 8000];

    try {
      if (!this.validatePhoneNumber(phoneNumber)) {
        logger.error('Invalid phone number format for template', {
          phoneNumber,
          traceId,
          conversationId,
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'Invalid phone number format (E.164 required)',
        };
      }

      const normalizedPhone = this.normalizePhone(phoneNumber);
      const url = `${this.WHATSAPP_API_HOST}/${this.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_ID}/messages`;

      logger.debug('Sending WhatsApp template message', {
        conversationId,
        phoneNumber: normalizedPhone,
        templateName,
        traceId,
        attempt: retryCount + 1,
      });

      const template: Record<string, unknown> = {
        name: templateName,
        language: {
          code: 'pt_BR',
        },
      };

      // Add parameters if provided
      if (templateParams && Object.keys(templateParams).length > 0) {
        template.components = [
          {
            type: 'body',
            parameters: Object.values(templateParams).map((value) => ({
              type: 'text',
              text: value,
            })),
          },
        ];
      }

      const body: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'template',
        template,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as WhatsAppApiResponse;

      // Handle specific HTTP status codes
      if (response.status === 401) {
        logger.error('WhatsApp API authentication failed for template', {
          conversationId,
          traceId,
          status: response.status,
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'Authentication failed (invalid access token)',
        };
      }

      if (response.status === 400) {
        logger.error('WhatsApp API bad request for template', {
          conversationId,
          traceId,
          status: response.status,
          error: JSON.stringify(data),
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'Bad request (invalid template or parameters)',
        };
      }

      if (response.status === 429) {
        logger.warn('WhatsApp API rate limited for template', {
          conversationId,
          traceId,
          retryCount,
        });

        if (retryCount < maxRetries) {
          const delay = backoffDelays[Math.min(retryCount, backoffDelays.length - 1)];
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.sendTemplateMessageWithRetry(
            phoneNumber,
            templateName,
            templateParams,
            traceId,
            conversationId,
            retryCount + 1
          );
        }

        return {
          messageId: '',
          status: 'queued',
          error: 'Rate limited - queued for retry',
        };
      }

      if (response.status === 500) {
        logger.error('WhatsApp API server error for template', {
          conversationId,
          traceId,
          status: response.status,
          retryCount,
        });

        if (retryCount < maxRetries) {
          const delay = backoffDelays[Math.min(retryCount, backoffDelays.length - 1)];
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.sendTemplateMessageWithRetry(
            phoneNumber,
            templateName,
            templateParams,
            traceId,
            conversationId,
            retryCount + 1
          );
        }

        return {
          messageId: '',
          status: 'queued',
          error: 'Server error - queued for retry',
        };
      }

      if (!response.ok) {
        logger.error('WhatsApp API error for template', {
          conversationId,
          traceId,
          status: response.status,
          error: JSON.stringify(data),
        });
        return {
          messageId: '',
          status: 'failed',
          error: `WhatsApp API error: ${response.status}`,
        };
      }

      const whatsappMessageId = data.messages?.[0]?.id;
      if (!whatsappMessageId) {
        logger.error('No message ID in WhatsApp template response', {
          conversationId,
          traceId,
          response: JSON.stringify(data),
        });
        return {
          messageId: '',
          status: 'failed',
          error: 'No message ID received from WhatsApp API',
        };
      }

      logger.info('WhatsApp template message sent successfully', {
        conversationId,
        templateName,
        whatsappMessageId,
        traceId,
      });

      return {
        messageId: whatsappMessageId,
        status: 'sent',
        whatsappMessageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error sending WhatsApp template message', {
        conversationId,
        templateName,
        traceId,
        error: errorMessage,
        retryCount,
      });

      return {
        messageId: '',
        status: 'queued',
        error: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Send a message (text or template)
   * Returns immediately with status, falls back to queue if needed
   */
  static async send(
    conversationId: string,
    phoneNumber: string,
    messageText: string,
    messageType: 'text' | 'template' = 'text',
    options?: {
      templateName?: string;
      templateParams?: Record<string, string>;
      traceId?: string;
    }
  ): Promise<SendResult> {
    const traceId = options?.traceId || crypto.randomUUID();

    try {
      let result: SendResult;

      // Send appropriate message type
      if (messageType === 'template') {
        result = await this.sendTemplateMessageWithRetry(
          phoneNumber,
          options?.templateName || config.WHATSAPP_TEMPLATE_INITIAL,
          options?.templateParams,
          traceId,
          conversationId
        );
      } else {
        result = await this.sendTextMessageWithRetry(
          phoneNumber,
          messageText,
          traceId,
          conversationId
        );
      }

      // If queued due to error, add to Bull queue for later retry
      if (result.status === 'queued') {
        logger.info('Queuing message for later retry', {
          conversationId,
          phoneNumber,
          messageType,
          traceId,
        });

        const payload: SendMessagePayload = {
          conversationId,
          phoneNumber,
          messageText,
          messageType,
          templateName: options?.templateName,
          templateParams: options?.templateParams,
          traceId,
        };

        await SendMessageQueue.addJob(payload, { attempts: 3 });
      }

      // Store message in database (always)
      try {
        const storedMessage = await MessageRepository.create({
          conversation_id: conversationId,
          sender_type: 'sara',
          message_text: messageText,
          message_type: messageType,
          status: result.status === 'sent' ? 'sent' : 'pending',
          metadata: {
            response_id: result.whatsappMessageId,
          },
        });

        logger.debug('Message stored in database', {
          messageId: storedMessage.id,
          conversationId,
          traceId,
        });

        // Update message with WhatsApp ID if available
        if (result.whatsappMessageId && result.status === 'sent') {
          // Note: Message model doesn't have a field for WhatsApp message ID on sent messages
          // This is only for incoming messages. For compliance, we log the ID.
          logger.debug('WhatsApp outgoing message tracked', {
            messageId: storedMessage.id,
            whatsappMessageId: result.whatsappMessageId,
            traceId,
          });
        }

        return {
          messageId: storedMessage.id,
          status: result.status,
          whatsappMessageId: result.whatsappMessageId,
          error: result.error,
        };
      } catch (dbError) {
        const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        logger.error('Failed to store message in database', {
          conversationId,
          traceId,
          error: dbErrorMessage,
        });

        // Still return the WhatsApp result even if DB storage failed
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Unexpected error in MessageService.send', {
        conversationId,
        traceId,
        error: errorMessage,
      });

      return {
        messageId: '',
        status: 'failed',
        error: `Unexpected error: ${errorMessage}`,
      };
    }
  }

  /**
   * Store an incoming message from user (WhatsApp webhook)
   * Includes dedup check via whatsapp_message_id
   */
  static async storeIncomingMessage(
    conversationId: string,
    messageText: string,
    whatsappMessageId: string,
    metadata?: { intent?: string; sentiment?: string },
    traceId?: string
  ) {
    const id = traceId || crypto.randomUUID();

    try {
      // Dedup check: verify message not already stored
      const existing = await MessageRepository.findByWhatsAppMessageId(whatsappMessageId);
      if (existing) {
        logger.info('Message already stored (dedup detected)', {
          conversationId,
          whatsappMessageId,
          existingMessageId: existing.id,
          traceId: id,
        });
        return existing;
      }

      // Store new incoming message
      const message = await MessageRepository.create({
        conversation_id: conversationId,
        sender_type: 'user',
        message_text: messageText,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        metadata: metadata || {},
        status: 'sent',
      });

      logger.debug('Incoming message stored', {
        messageId: message.id,
        conversationId,
        whatsappMessageId,
        traceId: id,
      });

      return message;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to store incoming message', {
        conversationId,
        whatsappMessageId,
        traceId: id,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Store an outgoing message from SARA
   * Called after message is sent to user
   */
  static async storeOutgoingMessage(
    conversationId: string,
    messageText: string,
    metadata?: {
      response_id?: string;
      tokens_used?: number;
      intent?: string;
      sentiment?: string;
    },
    traceId?: string
  ) {
    const id = traceId || crypto.randomUUID();

    try {
      const message = await MessageRepository.create({
        conversation_id: conversationId,
        sender_type: 'sara',
        message_text: messageText,
        message_type: 'text',
        metadata: metadata || {},
        status: 'sent',
      });

      logger.debug('Outgoing message stored', {
        messageId: message.id,
        conversationId,
        traceId: id,
      });

      return message;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to store outgoing message', {
        conversationId,
        traceId: id,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Get conversation history (paginated)
   * Returns messages ordered by creation time (most recent first)
   */
  static async getConversationHistory(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    try {
      const messages = await MessageRepository.findByConversationId(conversationId, limit, offset);

      logger.debug('Retrieved conversation history', {
        conversationId,
        messageCount: messages.length,
        limit,
        offset,
      });

      return messages;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retrieve conversation history', {
        conversationId,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Get conversation history with advanced filtering
   * Supports filtering by sender, date range, and pagination
   */
  static async getConversationHistoryFiltered(
    conversationId: string,
    options?: {
      sender?: 'user' | 'sara';
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    try {
      const messages = await MessageRepository.findByConversationIdWithFilters(conversationId, {
        ...options,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      });

      logger.debug('Retrieved filtered conversation history', {
        conversationId,
        messageCount: messages.length,
        filters: options,
      });

      return messages;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retrieve filtered conversation history', {
        conversationId,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Get message count for conversation
   * Optionally filter by sender type
   */
  static async getMessageCount(conversationId: string, sender?: 'user' | 'sara') {
    try {
      const count = await MessageRepository.countByConversationId(conversationId, sender);

      logger.debug('Retrieved message count', {
        conversationId,
        count,
        sender,
      });

      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get message count', {
        conversationId,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Get message by ID
   * Useful for retrieving specific message details
   */
  static async getMessageById(messageId: string) {
    try {
      const message = await MessageRepository.findById(messageId);

      if (!message) {
        logger.warn('Message not found', { messageId });
        return null;
      }

      logger.debug('Retrieved message by ID', { messageId });
      return message;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get message by ID', {
        messageId,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Verify WhatsApp webhook signature (HMAC verification)
   * Used to authenticate incoming webhook events
   */
  static verifyWebhookSignature(
    body: string,
    signature: string | undefined,
    traceId: string
  ): boolean {
    if (!signature) {
      logger.warn('Missing webhook signature', { traceId });
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', config.WHATSAPP_APP_SECRET)
        .update(body)
        .digest('hex');

      const isValid = `sha256=${expectedSignature}` === signature;

      if (!isValid) {
        logger.error('Invalid webhook signature', {
          traceId,
          received: signature.substring(0, 20),
          expected: expectedSignature.substring(0, 20),
        });
      }

      return isValid;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error verifying webhook signature', {
        traceId,
        error: errorMessage,
      });
      return false;
    }
  }
}
