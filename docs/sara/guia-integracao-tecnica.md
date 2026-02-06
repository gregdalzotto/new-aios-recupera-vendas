# SARA - Guia de Integração Técnica

**Para:** @dev
**Objetivo:** Integrar system prompt e contexto dinâmico no AIService

---

## Visão Geral da Integração

```
┌─────────────────────────────────────────────────────────┐
│ Message Webhook chega                                   │
│ → processMessageJob.ts enfileira job                   │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ BullMQ Worker executa job                               │
│ → handlers.ts processMessageHandler                    │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Busca Conversation no BD                            │
│ 2. Monta SaraContextPayload (novo!)                    │
│ 3. Chama AIService.interpretMessage(context)           │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ AIService                                               │
│ 1. Carrega system prompt (persona-system-prompt.md)    │
│ 2. Injeta contexto na mensagem                         │
│ 3. Chama OpenAI                                         │
│ 4. Retorna resposta                                     │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ Handler enfileira resposta no SendMessageQueue         │
└─────────────────────────────────────────────────────────┘
```

---

## Passo 1: Criar Interface do Contexto

**Arquivo:** `src/types/sara.ts` (novo)

```typescript
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
```

---

## Passo 2: Atualizar AIService

**Arquivo:** `src/services/AIService.ts`

### 2.1. Adicionar método para carregar system prompt

```typescript
import fs from 'fs/promises';
import path from 'path';

private static systemPromptCache: string | null = null;

/**
 * Carrega system prompt da SARA (cached)
 */
private static async loadSaraSystemPrompt(): Promise<string> {
  if (this.systemPromptCache) {
    return this.systemPromptCache;
  }

  const promptPath = path.join(
    process.cwd(),
    'docs',
    'sara',
    'persona-system-prompt.md'
  );

  try {
    const content = await fs.readFile(promptPath, 'utf-8');
    this.systemPromptCache = content;
    return content;
  } catch (error) {
    logger.warn('Failed to load SARA system prompt, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'Você é SARA, uma agente de recuperação de vendas. Responda de forma empática e clara.';
  }
}
```

### 2.2. Atualizar método interpretMessage

```typescript
/**
 * Interpreta mensagem com contexto dinâmico (SARA)
 */
static async interpretMessage(
  messageText: string,
  conversationId: string,
  traceId: string,
  context?: SaraContextPayload  // ← Novo parâmetro
): Promise<{ response: string; metadata: MessageMetadata }> {
  try {
    // Validar contexto se fornecido
    if (context) {
      this.validateSaraContext(context, traceId);
    }

    // Construir user message (com contexto)
    const userMessage = context
      ? await this.buildUserMessageWithContext(messageText, context)
      : await this.buildUserMessage(messageText, conversationId, traceId);

    // Carregar system prompt
    const systemPrompt = await this.loadSaraSystemPrompt();

    logger.debug('Calling OpenAI with system prompt and context', {
      traceId,
      hasContext: !!context,
      conversationId,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const responseText =
      response.choices[0]?.message?.content?.trim() || 'Desculpe, tive um problema.';

    const metadata: MessageMetadata = {
      intent: 'response',
      sentiment: 'neutral',
      response_id: response.id,
      tokens_used: response.usage?.total_tokens || 0,
      contextProvided: !!context,
    };

    logger.info('OpenAI response generated', {
      traceId,
      responseLength: responseText.length,
      tokensUsed: metadata.tokens_used,
    });

    return { response: responseText, metadata };
  } catch (error) {
    logger.error('Error interpreting message', {
      traceId,
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```

### 2.3. Novo método para construir mensagem com contexto

```typescript
/**
 * Constrói mensagem do usuário injetando contexto dinâmico
 */
private static async buildUserMessageWithContext(
  messageText: string,
  context: SaraContextPayload
): Promise<string> {
  // Formatar valor do carrinho
  const cartValueFormatted = (context.abandonment.cartValue / 100).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL',
    }
  );

  // Formatar desconto se existir
  let discountInfo = '';
  if (context.payment.discountLink && context.payment.discountPercent) {
    const discountedValue = (context.abandonment.cartValue / 100) *
      (1 - context.payment.discountPercent / 100);
    const savings = context.abandonment.cartValue / 100 - discountedValue;

    discountInfo = `
DESCONTO DISPONÍVEL:
- Percentual: ${context.payment.discountPercent}%
- Link com desconto: ${context.payment.discountLink}
- Valor original: ${cartValueFormatted}
- Valor com desconto: ${discountedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
- Economia: ${savings.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
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
 * Calcula diferença de tempo em minutos
 */
private static getTimeDiff(isoString: string): number {
  const createdAt = new Date(isoString);
  const now = new Date();
  return Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
}
```

### 2.4. Validação de contexto

```typescript
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

  // Se cicleCount >= maxCycles, não deve processar
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
```

---

## Passo 3: Atualizar Handler

**Arquivo:** `src/jobs/handlers.ts`

```typescript
/**
 * Processa mensagem: busca conversa, monta contexto, chama AIService
 */
async function processMessageHandler(job: Job<ProcessMessagePayload>): Promise<void> {
  const {
    conversationId,
    whatsappMessageId,
    phoneNumber,
    messageText,
    traceId,
  } = job.data;

  try {
    logger.info('Processing incoming message', {
      traceId,
      conversationId,
      phoneNumber,
      messageLength: messageText.length,
    });

    // 1. Load conversation
    const conversation = await ConversationService.getById(conversationId, traceId);

    if (!conversation) {
      logger.warn('Conversation not found', { traceId, conversationId });
      return;
    }

    // 2. NOVO: Monta SaraContextPayload
    const saraContext = await buildSaraContext(
      conversation,
      phoneNumber,
      traceId
    );

    // 3. Interpreta mensagem COM CONTEXTO
    const { response } = await AIService.interpretMessage(
      messageText,
      conversationId,
      traceId,
      saraContext  // ← Passa contexto aqui
    );

    logger.info('Response generated', {
      traceId,
      conversationId,
      responseLength: response.length,
    });

    // 4. Enfileira envio
    const responseMessageId = randomUUID();
    await SendMessageQueue.addJob({
      conversationId,
      phoneNumber,
      messageText: response,
      messageId: responseMessageId,
      traceId,
    });

    logger.info('Response enqueued for sending', {
      traceId,
      conversationId,
      responseMessageId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Error processing message', {
      traceId,
      conversationId,
      error: errorMessage,
    });

    throw error;
  }
}

/**
 * NOVO: Monta SaraContextPayload a partir da conversa
 */
async function buildSaraContext(
  conversation: any,  // Conversation model
  phoneNumber: string,
  traceId: string
): Promise<SaraContextPayload> {
  // 1. Buscar user
  const user = await UserService.getById(conversation.userId, traceId);
  if (!user) {
    throw new Error('User not found for conversation');
  }

  // 2. Buscar abandonment
  const abandonment = await AbandonmentService.getById(
    conversation.abandonmentId,
    traceId
  );
  if (!abandonment) {
    throw new Error('Abandonment not found for conversation');
  }

  // 3. Buscar histórico de mensagens (últimas 10-20)
  const messages = await MessageService.getByConversationId(
    conversation.id,
    { limit: 20 },
    traceId
  );

  // 4. Formatar histórico
  const history = messages.map((msg) => ({
    role: msg.direction === 'incoming' ? 'user' : 'assistant',
    content: msg.text,
    timestamp: msg.createdAt.toISOString(),
  }));

  // 5. Buscar links de pagamento (original + desconto se existir)
  const paymentConfig = await PaymentService.getByAbandonmentId(
    abandonment.id,
    traceId
  );

  // 6. Contar ciclos (já deve estar no BD)
  const cycleCount = conversation.cycleCount || 0;

  // 7. Montar payload
  const context: SaraContextPayload = {
    user: {
      id: user.id,
      name: user.name,
      phone: phoneNumber,
    },
    abandonment: {
      id: abandonment.id,
      product: abandonment.productName,
      productId: abandonment.productId,
      cartValue: abandonment.cartValue, // em centavos
      currency: 'BRL',
      createdAt: abandonment.createdAt.toISOString(),
    },
    conversation: {
      id: conversation.id,
      state: conversation.state || 'ACTIVE',
      cycleCount,
      maxCycles: 5,
      startedAt: conversation.createdAt.toISOString(),
    },
    payment: {
      originalLink: paymentConfig?.originalLink || '',
      discountLink: paymentConfig?.discountLink,
      discountPercent: paymentConfig?.discountPercent,
      discountWasOffered: paymentConfig?.discountWasOffered || false,
    },
    history,
    metadata: {
      segment: user.segment,
      cartAgeMinutes: this.getMinutesSince(abandonment.createdAt),
    },
  };

  logger.debug('SARA context built', {
    traceId,
    userId: user.id,
    userName: user.name,
    cycleCount,
    historyLength: history.length,
  });

  return context;
}
```

---

## Passo 4: Atualizar Banco de Dados

### 4.1. Adicionar coluna para rastrear ciclos

```sql
-- Migration: add_cycle_count_to_conversations
ALTER TABLE conversations ADD COLUMN cycle_count INTEGER DEFAULT 0;

-- Incrementar ciclo após cada resposta
CREATE OR REPLACE FUNCTION increment_cycle_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET cycle_count = cycle_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_increment_cycle_count
AFTER INSERT ON messages
FOR EACH ROW
WHEN (NEW.direction = 'outgoing')
EXECUTE FUNCTION increment_cycle_count();
```

### 4.2. Adicionar coluna para rastrear desconto oferecido

```sql
ALTER TABLE payment_configs ADD COLUMN discount_was_offered BOOLEAN DEFAULT FALSE;
ALTER TABLE payment_configs ADD COLUMN offered_at TIMESTAMP;
```

---

## Passo 5: Testes

### 5.1. Teste unitário do buildUserMessageWithContext

```typescript
// src/services/__tests__/AIService.test.ts

describe('AIService - buildUserMessageWithContext', () => {
  it('deve injetar contexto correto na mensagem', async () => {
    const context: SaraContextPayload = {
      user: { id: '1', name: 'João', phone: '+5548991080788' },
      abandonment: {
        id: '1',
        product: 'Curso Python',
        productId: 'PROD-001',
        cartValue: 150000,
        currency: 'BRL',
        createdAt: new Date().toISOString(),
      },
      conversation: {
        id: '1',
        state: 'ACTIVE',
        cycleCount: 1,
        maxCycles: 5,
        startedAt: new Date().toISOString(),
      },
      payment: {
        originalLink: 'https://pay.example.com',
        discountLink: 'https://pay.example.com?discount=15',
        discountPercent: 15,
        discountWasOffered: false,
      },
      history: [],
    };

    const message = await AIService.buildUserMessageWithContext(
      'Tá caro demais',
      context
    );

    expect(message).toContain('João');
    expect(message).toContain('R$ 1.500,00');
    expect(message).toContain('15%');
    expect(message).toContain('Tá caro demais');
  });

  it('deve validar contexto inválido', async () => {
    const invalidContext = { user: {} } as any;

    expect(() =>
      AIService.validateSaraContext(invalidContext, 'test-trace')
    ).toThrow();
  });
});
```

### 5.2. Teste de integração end-to-end

```typescript
// Enviar webhook de mensagem
// Verificar contexto foi montado corretamente
// Verificar resposta gerada com contexto
// Verificar ciclo foi incrementado
```

---

## Checklist de Implementação

- [ ] Criar interface `SaraContextPayload` em `src/types/sara.ts`
- [ ] Adicionar `loadSaraSystemPrompt()` em AIService
- [ ] Atualizar `interpretMessage()` para aceitar contexto
- [ ] Implementar `buildUserMessageWithContext()`
- [ ] Implementar `validateSaraContext()`
- [ ] Atualizar handler para montar contexto
- [ ] Implementar `buildSaraContext()`
- [ ] Adicionar coluna `cycle_count` no BD
- [ ] Criar trigger para incrementar ciclos
- [ ] Escrever testes unitários
- [ ] Testar end-to-end com webhook real
- [ ] Validar qualidade das respostas
- [ ] Deploy para staging

---

## Referências

- System Prompt: `docs/sara/persona-system-prompt.md`
- Schema de Contexto: `docs/sara/contexto-dinamico-schema.md`
- AIService atual: `src/services/AIService.ts`
- Handler atual: `src/jobs/handlers.ts`

---

**Status:** Pronto para implementação
**Próximo passo:** @dev implementa e testa
