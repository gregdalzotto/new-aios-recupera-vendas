# SARA - Schema de Contexto Dinâmico

**Objetivo:** Definir exatamente como o backend estrutura e passa dados para a SARA a cada turno de conversa.

---

## JSON Schema Completo

```typescript
interface SaraContextPayload {
  user: {
    id: string;                    // UUID do usuário
    name: string;                  // Nome do usuário
    phone: string;                 // E.164 format (+55...)
  };

  abandonment: {
    id: string;                    // UUID do abandonment record
    product: string;               // Nome do produto
    productId: string;             // ID do produto (se aplicável)
    cartValue: number;             // Valor em centavos (ex: 150000 = R$ 1500.00)
    currency: string;              // "BRL" por padrão
    createdAt: string;             // ISO 8601 timestamp
  };

  conversation: {
    id: string;                    // UUID da conversa
    state: "AWAITING_RESPONSE" | "ACTIVE" | "CLOSED" | "ERROR";
    cycleCount: number;            // Quantos ciclos ocorreram (0-5)
    maxCycles: number;             // Máximo permitido (sempre 5)
    startedAt: string;             // ISO 8601
  };

  payment: {
    originalLink: string;          // Link de pagamento sem desconto
    discountLink?: string;         // Link com desconto (se existe)
    discountPercent?: number;      // % de desconto (ex: 15)
    discountWasOffered: boolean;   // Já foi oferecido desconto?
  };

  history: Array<{
    role: "user" | "assistant";    // Quem enviou
    content: string;               // Conteúdo da mensagem
    timestamp: string;             // ISO 8601
  }>;

  metadata?: {
    [key: string]: any;            // Dados adicionais por produto/segmento
  };
}
```

---

## Exemplos de Payload

### Exemplo 1: Primeira Resposta do Usuário

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "João Silva",
    "phone": "+5548991080788"
  },
  "abandonment": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "product": "Curso de Python Avançado",
    "productId": "PROD-001",
    "cartValue": 150000,
    "currency": "BRL",
    "createdAt": "2026-02-06T10:00:00Z"
  },
  "conversation": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "state": "ACTIVE",
    "cycleCount": 1,
    "maxCycles": 5,
    "startedAt": "2026-02-06T11:00:00Z"
  },
  "payment": {
    "originalLink": "https://pay.example.com/order/123",
    "discountLink": null,
    "discountPercent": null,
    "discountWasOffered": false
  },
  "history": [
    {
      "role": "user",
      "content": "Oi, recebi o template. Tá muito caro mesmo.",
      "timestamp": "2026-02-06T11:00:30Z"
    }
  ],
  "metadata": {
    "segment": "new_customer",
    "cartAgeMinutes": 120
  }
}
```

**SARA deve:**
- Reconhecer objeção de preço
- Verificar se desconto existe no `payment`
- Se não existe → oferecer valor/valor
- Se existe → oferecer desconto

---

### Exemplo 2: Após Oferecer Desconto

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "João Silva",
    "phone": "+5548991080788"
  },
  "abandonment": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "product": "Curso de Python Avançado",
    "productId": "PROD-001",
    "cartValue": 150000,
    "currency": "BRL",
    "createdAt": "2026-02-06T10:00:00Z"
  },
  "conversation": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "state": "ACTIVE",
    "cycleCount": 2,
    "maxCycles": 5,
    "startedAt": "2026-02-06T11:00:00Z"
  },
  "payment": {
    "originalLink": "https://pay.example.com/order/123",
    "discountLink": "https://pay.example.com/order/123?discount=SARA15",
    "discountPercent": 15,
    "discountWasOffered": true
  },
  "history": [
    {
      "role": "user",
      "content": "Oi, recebi o template. Tá muito caro mesmo.",
      "timestamp": "2026-02-06T11:00:30Z"
    },
    {
      "role": "assistant",
      "content": "Entendo perfeitamente. Consegui uma promoção de 15% para você.\nLink: https://pay.example.com/order/123?discount=SARA15",
      "timestamp": "2026-02-06T11:01:00Z"
    },
    {
      "role": "user",
      "content": "Vou pensar melhor...",
      "timestamp": "2026-02-06T11:05:00Z"
    }
  ],
  "metadata": {
    "segment": "new_customer",
    "cartAgeMinutes": 127,
    "discountAcceptanceSignal": false
  }
}
```

**SARA deve:**
- Reconhecer hesitação ("vou pensar")
- Remover urgência
- Manter porta aberta
- Não insistir

---

### Exemplo 3: Atingiu Limite de Ciclos

```json
{
  "conversation": {
    "state": "ACTIVE",
    "cycleCount": 5,
    "maxCycles": 5
  }
}
```

**SARA deve:**
- Enviar mensagem de encerramento educada
- Não tentar mais conversão
- Exemplo:
  ```
  Sem problema! Fico à disposição se precisar.
  Qualquer dúvida é só chamar.
  ```

---

### Exemplo 4: Usuário Optou por Sair (Opt-out)

```json
{
  "conversation": {
    "state": "CLOSED"
  }
}
```

**SARA deve:**
- Não responder nada
- Sistema já encerrou a conversa

---

## Campos Obrigatórios vs. Opcionais

| Campo | Obrigatório | Quando |
|-------|-------------|--------|
| `user.id`, `name`, `phone` | ✅ | Sempre |
| `abandonment.*` | ✅ | Sempre |
| `conversation.*` | ✅ | Sempre |
| `payment.originalLink` | ✅ | Sempre |
| `payment.discountLink` | ❌ | Apenas se desconto disponível |
| `payment.discountPercent` | ❌ | Apenas se desconto disponível |
| `history` | ✅ | Sempre (pode ser array vazio no início) |
| `metadata` | ❌ | Opcional (uso futuro) |

---

## Fluxo de Injeção de Contexto no AIService

### 1. Backend recebe mensagem do usuário

```
POST /webhook/messages
{
  from: "5548991080788",
  body: "Oi, tá muito caro"
}
```

### 2. Backend monta o SaraContextPayload

```typescript
const context = {
  user: { /* ... */ },
  abandonment: { /* ... */ },
  conversation: { /* ... */ },
  payment: { /* ... */ },
  history: [ /* últimas 10-20 msgs */ ]
};
```

### 3. Backend chama AIService passando contexto

```typescript
await AIService.interpretMessage({
  messageText: "Oi, tá muito caro",
  context: context,  // ← Injetar aqui
  conversationId: "...",
  traceId: "..."
});
```

### 4. AIService usa contexto + system prompt

```typescript
const systemPrompt = await loadSystemPrompt(); // persona-system-prompt.md

const messages = [
  {
    role: "system",
    content: systemPrompt
  },
  {
    role: "user",
    content: `
      CONTEXTO:
      ${JSON.stringify(context, null, 2)}

      MENSAGEM DO USUÁRIO:
      "${messageText}"
    `
  }
];

const response = await openai.chat.completions.create({
  model: "gpt-3.5-turbo",
  messages: messages,
  temperature: 0.7,
  max_tokens: 200
});
```

### 5. SARA responde com contexto em mente

- Sabe exatamente quanto custa
- Sabe se desconto está disponível
- Sabe quantos ciclos já ocorreram
- Sabe o histórico completo
- Responde de forma consultiva

---

## Cálculos e Conversões

### Valor do Carrinho

- Sempre em **centavos** no contexto
- Ex: `150000` = R$ 1.500,00
- **Ao exibir:** dividir por 100 e formatar

```typescript
const displayValue = (context.abandonment.cartValue / 100).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});
// Resultado: "R$ 1.500,00"
```

### Desconto Aplicado

```typescript
const originalValue = context.abandonment.cartValue / 100;
const discount = context.payment.discountPercent || 0;
const discountedValue = originalValue * (1 - discount / 100);

// Exibir:
// "Original: R$ 1.500,00"
// "Com desconto (15%): R$ 1.275,00"
// "Você economiza: R$ 225,00"
```

---

## Validações de Segurança

### O que o AIService deve validar ANTES de chamar SARA:

```typescript
// 1. Contexto não deve ser nulo
if (!context) throw new Error("Contexto obrigatório");

// 2. Estado deve ser ACTIVE para responder
if (context.conversation.state !== "ACTIVE") {
  return { status: "skipped", reason: "Conversation not active" };
}

// 3. Ciclos não deve exceder max
if (context.conversation.cycleCount >= context.conversation.maxCycles) {
  return { status: "closed", reason: "Max cycles reached" };
}

// 4. Links obrigatórios
if (!context.payment.originalLink) {
  throw new Error("originalLink obrigatório");
}

// 5. Se discountLink existe, discountPercent deve existir
if (context.payment.discountLink && !context.payment.discountPercent) {
  throw new Error("discountPercent obrigatório se discountLink existe");
}
```

---

## Próximos Passos

1. **@dev** implementa injeção de contexto no AIService
2. Testa com payloads de exemplo
3. Valida respostas contra persona
4. Ajusta conforme necessário

---

## Versão do Schema

- **Versão:** 1.0
- **Data:** 2026-02-06
- **Status:** Pronto para implementação
