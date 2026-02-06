/**
 * SARA Context Types
 * Estruturas de dados para contexto dinâmico da agente
 */

export interface SaraUserContext {
  id: string;
  name: string;
  phone: string;
}

export interface SaraAbandonmentContext {
  id: string;
  product: string;
  productId: string;
  cartValue: number; // em centavos
  currency: string;
  createdAt: string;
}

export interface SaraConversationContext {
  id: string;
  state: 'AWAITING_RESPONSE' | 'ACTIVE' | 'CLOSED' | 'ERROR';
  cycleCount: number;
  maxCycles: number;
  startedAt: string;
}

export interface SaraPaymentContext {
  originalLink: string;
  discountLink?: string;
  discountPercent?: number;
  discountWasOffered: boolean;
}

export interface SaraMessageHistory {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SaraContextPayload {
  user: SaraUserContext;
  abandonment: SaraAbandonmentContext;
  conversation: SaraConversationContext;
  payment: SaraPaymentContext;
  history: SaraMessageHistory[];
  metadata?: Record<string, unknown>;
}
