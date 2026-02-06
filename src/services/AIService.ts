import fs from 'fs/promises';
import path from 'path';
import logger from '../config/logger';
import { openaiClient, SARA_SYSTEM_PROMPT } from '../config/openai';
import { SARA_CONFIG } from '../config/sara';
import { Message } from '../models/Message';
import { SaraContextPayload } from '../types/sara';
import { OpenAIClientWrapper } from './OpenAIClientWrapper';

/**
 * AI Response from OpenAI
 */
export interface AIResponse {
  response: string;
  intent: 'price_question' | 'objection' | 'confirmation' | 'unclear';
  sentiment: 'positive' | 'neutral' | 'negative';
  should_offer_discount: boolean;
  tokens_used: number;
  response_id?: string; // OpenAI response ID for tracking
}

/**
 * Context for AI interpretation (conversation history)
 */
export interface AIContext {
  conversationId: string;
  userId: string;
  productName: string;
  cartValue: number;
  offersAlreadyMade: number;
  messageHistory: Message[]; // Last N messages
  traceId: string;
}

/**
 * AIService - OpenAI Integration for message interpretation
 * Analyzes user messages and generates contextual Sara responses
 * Includes retry logic and error handling via OpenAIClientWrapper
 */
export class AIService {
  private static systemPromptCache: string | null = null;
  private static systemPromptCacheTime: number = 0;

  /**
   * Initialize AIService with OpenAI client
   * Called during application startup
   */
  static initialize(): void {
    OpenAIClientWrapper['initialize'](openaiClient);
    logger.debug('AIService initialized with OpenAI client wrapper', {
      systemPromptCacheTtlMs: SARA_CONFIG.cache.systemPromptTtlMs,
    });
  }

  /**
   * Check if system prompt cache has expired
   * Uses configurable TTL from SARA_CONFIG.cache.systemPromptTtlMs
   */
  private static isCacheExpired(): boolean {
    const now = Date.now();
    const cacheAge = now - this.systemPromptCacheTime;
    const hasExpired = cacheAge > SARA_CONFIG.cache.systemPromptTtlMs;

    if (hasExpired && this.systemPromptCacheTime > 0) {
      logger.debug('System prompt cache expired', {
        cacheAgeMsMs: cacheAge,
        cacheTtlMs: SARA_CONFIG.cache.systemPromptTtlMs,
      });
    }

    return hasExpired;
  }

  /**
   * Carrega system prompt da SARA (cached with TTL)
   */
  private static async loadSaraSystemPrompt(): Promise<string> {
    // Check if cache is still valid
    if (this.systemPromptCache && !this.isCacheExpired()) {
      return this.systemPromptCache;
    }

    const promptPath = path.join(process.cwd(), 'docs', 'sara', 'persona-system-prompt.md');

    try {
      const content = await fs.readFile(promptPath, 'utf-8');
      this.systemPromptCache = content;
      this.systemPromptCacheTime = Date.now();
      return content;
    } catch (error) {
      logger.warn('Failed to load SARA system prompt from file, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      return SARA_SYSTEM_PROMPT;
    }
  }

  /**
   * Valida SaraContextPayload
   */
  private static validateSaraContext(context: SaraContextPayload, traceId: string): void {
    // Validações críticas
    if (!context.user?.id || !context.user?.name) {
      throw new Error('Contexto inválido: user.id e user.name obrigatórios');
    }

    if (!context.abandonment?.id) {
      throw new Error('Contexto inválido: abandonment.id obrigatório');
    }

    if (!context.payment?.originalLink) {
      throw new Error('Contexto inválido: payment.originalLink obrigatório');
    }

    // Se tem discountLink, deve ter discountPercent
    if (context.payment.discountLink && !context.payment.discountPercent) {
      throw new Error('Contexto inválido: discountPercent obrigatório se discountLink existe');
    }

    // Se cicleCount >= maxCycles, conversa deve estar CLOSED
    if (context.conversation.cycleCount >= context.conversation.maxCycles) {
      logger.warn('Ciclos máximos atingidos, conversa deve estar CLOSED', {
        traceId,
        cycleCount: context.conversation.cycleCount,
        maxCycles: context.conversation.maxCycles,
      });
    }

    logger.debug('SARA context validated successfully', {
      traceId,
      userName: context.user.name,
      cartValue: context.abandonment.cartValue,
      cycleCount: context.conversation.cycleCount,
    });
  }

  /**
   * Calcula diferença de tempo em minutos
   */
  private static getTimeDiff(isoString: string): number {
    const createdAt = new Date(isoString);
    const now = new Date();
    return Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
  }

  /**
   * Constrói mensagem do usuário injetando contexto dinâmico
   */
  private static buildUserMessageWithContext(
    messageText: string,
    context: SaraContextPayload
  ): string {
    // Formatar valor do carrinho
    const cartValueFormatted = (context.abandonment.cartValue / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    // Formatar desconto se existir
    let discountInfo = '';
    if (context.payment.discountLink && context.payment.discountPercent) {
      const discountedValue =
        (context.abandonment.cartValue / 100) * (1 - context.payment.discountPercent / 100);
      const savings = context.abandonment.cartValue / 100 - discountedValue;

      discountInfo = `
DESCONTO DISPONÍVEL:
- Percentual: ${context.payment.discountPercent}%
- Link com desconto: ${context.payment.discountLink}
- Valor original: ${cartValueFormatted}
- Valor com desconto: ${discountedValue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      })}
- Economia: ${savings.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      })}`;
    }

    // Histórico formatado
    const historyFormatted = context.history
      .map((msg) => `${msg.role === 'user' ? 'Usuário' : 'Sara'}: ${msg.content}`)
      .join('\n');

    return `
CONTEXTO DINÂMICO:
=================

USUÁRIO:
- Nome: ${context.user.name}
- Telefone: ${context.user.phone}

CARRINHO ABANDONADO:
- Produto: ${context.abandonment.product}
- Valor: ${cartValueFormatted}
- Criado há: ${this.getTimeDiff(context.abandonment.createdAt)} minutos

CONVERSA:
- Ciclo atual: ${context.conversation.cycleCount}/${context.conversation.maxCycles}
- Estado: ${context.conversation.state}

${discountInfo}

HISTÓRICO:
${historyFormatted}

MENSAGEM ATUAL DO USUÁRIO:
"${messageText}"

Responda como SARA seguindo o system prompt.
`;
  }

  /**
   * Build conversation history for context
   */
  private static buildHistoryText(messages: Message[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    // Reverse to get chronological order (oldest first)
    const sortedMessages = [...messages].reverse();

    const historyText = sortedMessages
      .map((msg) => {
        const sender = msg.sender_type === 'user' ? 'Customer' : 'Sara';
        return `${sender}: ${msg.message_text}`;
      })
      .join('\n');

    return `Recent conversation:\n${historyText}\n\n`;
  }

  /**
   * Build user message for OpenAI
   */
  private static buildUserMessage(context: AIContext, userMessage: string): string {
    const historyText = this.buildHistoryText(context.messageHistory);
    const productInfo = context.productName ? `Product: ${context.productName}\n` : '';

    // Ensure cartValue is a number (can come as string from database)
    const cartValueNum =
      typeof context.cartValue === 'string' ? parseFloat(context.cartValue) : context.cartValue;

    const cartValueInfo =
      cartValueNum && !isNaN(cartValueNum) ? `Cart Value: R$${cartValueNum.toFixed(2)}\n` : '';

    return `${historyText}${productInfo}${cartValueInfo}Customer's latest message: "${userMessage}"`;
  }

  /**
   * Interpret user message and generate Sara response
   * Supports both legacy AIContext and new SaraContextPayload
   */
  static async interpretMessage(
    context: AIContext | SaraContextPayload,
    userMessage: string,
    traceId?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Detecta qual tipo de contexto foi passado
    const isSaraContext = 'user' in context && 'abandonment' in context;
    const conversationId = isSaraContext
      ? (context as SaraContextPayload).conversation.id
      : (context as AIContext).conversationId;
    const finalTraceId =
      traceId || (isSaraContext ? 'sara-context' : (context as AIContext).traceId);

    try {
      logger.debug('Starting message interpretation', {
        conversationId,
        traceId: finalTraceId,
        contextType: isSaraContext ? 'SARA' : 'Legacy',
      });

      // Validar e construir mensagem com contexto apropriado
      let userMessageWithContext: string;
      let systemPrompt: string;

      if (isSaraContext) {
        const saraCtx = context as SaraContextPayload;
        this.validateSaraContext(saraCtx, finalTraceId);
        userMessageWithContext = this.buildUserMessageWithContext(userMessage, saraCtx);
        systemPrompt = await this.loadSaraSystemPrompt();
      } else {
        const legacyCtx = context as AIContext;
        userMessageWithContext = this.buildUserMessage(legacyCtx, userMessage);
        systemPrompt = SARA_SYSTEM_PROMPT;
      }

      // Call OpenAI with retry logic and error handling
      let parsedResponse;
      try {
        const openaiResponse = await OpenAIClientWrapper.callOpenAIWithRetry(
          [
            {
              role: 'user',
              content: userMessageWithContext,
            },
          ],
          systemPrompt,
          finalTraceId
        );
        parsedResponse = openaiResponse;
      } catch (openaiError) {
        // Log the error and return fallback response
        logger.error('OpenAI failed after all retry attempts, using fallback response', {
          conversationId,
          traceId: finalTraceId,
          error: openaiError instanceof Error ? openaiError.message : String(openaiError),
        });
        parsedResponse = OpenAIClientWrapper.getFallbackResponse();
      }

      // Determine if should offer discount based on criteria
      // Only for legacy context - SARA context handles discount differently
      let shouldOfferDiscount = false;
      if (!isSaraContext) {
        shouldOfferDiscount = this.shouldOfferDiscount(
          context as AIContext,
          parsedResponse.intent,
          parsedResponse.should_offer_discount
        );
      }

      const aiResponse: AIResponse = {
        response: parsedResponse.response,
        intent: parsedResponse.intent,
        sentiment: parsedResponse.sentiment,
        should_offer_discount: shouldOfferDiscount,
        tokens_used: 0, // Tokens not tracked when using fallback
        response_id: undefined,
      };

      const duration = Date.now() - startTime;
      logger.info('Message interpretation completed', {
        conversationId,
        traceId: finalTraceId,
        intent: aiResponse.intent,
        sentiment: aiResponse.sentiment,
        tokensUsed: aiResponse.tokens_used,
        durationMs: duration,
      });

      return aiResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific error types
      if (errorMessage.includes('timeout')) {
        logger.warn('OpenAI timeout - returning fallback response', {
          conversationId,
          traceId: finalTraceId,
          durationMs: duration,
        });

        return this.getFallbackResponse('timeout');
      }

      if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
        logger.warn('OpenAI rate limited - returning fallback response', {
          conversationId,
          traceId: finalTraceId,
          error: errorMessage,
        });

        return this.getFallbackResponse('rate_limit');
      }

      if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
        logger.error('OpenAI authentication failed', {
          conversationId,
          traceId: finalTraceId,
          error: errorMessage,
        });

        throw new Error('OpenAI authentication failed');
      }

      logger.error('OpenAI API error', {
        conversationId,
        traceId: finalTraceId,
        error: errorMessage,
        durationMs: duration,
      });

      return this.getFallbackResponse('error');
    }
  }

  /**
   * Determine if should offer discount based on criteria
   */
  private static shouldOfferDiscount(
    context: AIContext,
    intent: string,
    suggestedByAI: boolean
  ): boolean {
    // Criterion 1: Intent mentions price
    if (intent === 'price_question') {
      return true;
    }

    // Criterion 2: Cart value > R$500
    // Ensure cartValue is a number (can come as string from database)
    const cartValueNum =
      typeof context.cartValue === 'string' ? parseFloat(context.cartValue) : context.cartValue;

    if (!isNaN(cartValueNum) && cartValueNum > 500) {
      return true;
    }

    // Criterion 3: Less than 3 offers already made
    if (context.offersAlreadyMade < 3) {
      return suggestedByAI;
    }

    return false;
  }

  /**
   * Get fallback response (for errors/timeouts)
   */
  private static getFallbackResponse(reason: 'timeout' | 'rate_limit' | 'error'): AIResponse {
    const fallbackMessages = {
      timeout: 'Um momento enquanto avalio sua mensagem...',
      rate_limit: 'Deixa eu pensar um pouco sobre isso...',
      error: 'Desculpa, estou tendo dificuldade em processar. Pode tentar novamente?',
    };

    return {
      response: fallbackMessages[reason],
      intent: 'unclear',
      sentiment: 'neutral',
      should_offer_discount: false,
      tokens_used: 0,
    };
  }

  /**
   * Get cost estimate for tokens (for Phase 2: analytics)
   */
  static estimateCost(tokensUsed: number): number {
    // gpt-3.5-turbo pricing (as of 2024)
    // Input: $0.50 per 1M tokens
    // Output: $1.50 per 1M tokens
    // Approximate average: $1.00 per 1M tokens
    const costPer1MTokens = 1.0;
    return (tokensUsed / 1000000) * costPer1MTokens;
  }
}
