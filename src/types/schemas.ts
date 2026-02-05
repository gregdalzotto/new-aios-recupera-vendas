import { z } from 'zod';

/**
 * Webhook Abandonment Payload Schema
 * Validação para eventos de abandono recebidos do sistema de pagamento
 */
export const AbandonmentWebhookSchema = z.object({
  userId: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  phone: z.string().regex(/^\+\d{10,15}$/, 'Invalid phone format. Expected E.164 format (+...).'),
  productId: z.string().min(1).max(255),
  paymentLink: z.string().url('Invalid payment link URL'),
  abandonmentId: z.string().min(1).max(255),
  value: z.number().positive('Value must be positive'),
  timestamp: z.number().optional(),
});

export type AbandonmentWebhookPayload = z.infer<typeof AbandonmentWebhookSchema>;
