# Architecture Document – Sara
## Agente de Recuperação de Vendas via WhatsApp

**Data:** 2026-02-05
**Versão:** 1.0
**Architect:** Aria
**Status:** Ready for Implementation

---

## Table of Contents

1. [Vision & Principles](#1-vision--principles)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Component Design](#4-component-design)
5. [Data Flow](#5-data-flow)
6. [API Design](#6-api-design)
7. [Database Architecture](#7-database-architecture)
8. [Deployment & Infrastructure](#8-deployment--infrastructure)
9. [Scaling & Performance](#9-scaling--performance)
10. [Security Architecture](#10-security-architecture)
11. [Testing Strategy](#11-testing-strategy)
12. [Observability & Monitoring](#12-observability--monitoring)
13. [Error Handling & Recovery](#13-error-handling--recovery)
14. [Development Patterns](#14-development-patterns)
15. [Decisions & Trade-offs](#15-decisions--trade-offs)

---

## 1. Vision & Principles

### Architectural Vision

Sara is a **stateless, event-driven, conversational recovery system** that:
- Processes WhatsApp abandonment events in real-time (<2s latency)
- Conducts AI-powered conversations to recover sales
- Operates 100% within Meta's compliance boundaries
- Scales horizontally to handle 10x growth without redesign
- Maintains audit trails for compliance and learning

### Core Principles

| Principle | Application in Sara |
|-----------|---------------------|
| **Stateless APIs** | Each webhook handler is independent; state lives in DB only |
| **Event-Driven** | All actions triggered by webhooks (abandonment, message, payment) |
| **Idempotency** | UNIQUE constraints prevent duplicate processing |
| **Graceful Degradation** | OpenAI timeout → fallback message, system continues |
| **Security First** | HMAC-SHA256 verification, encrypted data at rest, LGPD compliance |
| **Observable** | Every action logged with trace IDs for debugging |
| **Cost Conscious** | Use GPT-3.5 (cheaper) with potential for caching |
| **Compliance by Design** | 24h window, opt-out checks, template enforcement in code |

---

## 2. Tech Stack

### Language & Runtime

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | TypeScript | Type-safety, better DX, catches errors at build time |
| **Runtime** | Node.js 18+ | V8 engine, excellent async/Promise support, rich ecosystem |
| **Package Manager** | npm | Standard, included with Node, strong security audit |

### Framework & HTTP

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **HTTP Framework** | Fastify | Lightweight, fast routing, excellent plugin ecosystem, schema validation |
| **Server** | Node.js built-in http | Via Fastify; no external server needed |
| **Request Validation** | Fastify schema + Zod | Schema-first validation, runtime type checking |

### Database & Persistence

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Primary DB** | Supabase (PostgreSQL) | Managed, LGPD-compliant, built-in auth, real-time webhooks, RLS support |
| **Query Builder** | Knex.js | Simple, readable SQL generation, migration support |
| **Caching** | Redis | For rate limiting, message deduplication, temporary state |
| **Vector DB** | Pinecone | For KB/FAQs (optional, Phase 2) |

**Why Supabase over Firebase/DynamoDB?**
- PostgreSQL is ACID-compliant (critical for financial transactions)
- LGPD-ready (EU servers available)
- Foreign keys ensure data integrity
- Complex queries for analytics
- No vendor lock-in

### AI & NLU

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **LLM** | OpenAI API (GPT-3.5-turbo) | Cost-effective, proven NLU, fast inference (~1s) |
| **Embeddings** | OpenAI API (text-embedding-3-small) | For Pinecone integration (Phase 2) |
| **Prompt Library** | YAML config files | Version-controllable, easy A/B testing |

### External APIs

| Service | Purpose | Integration |
|---------|---------|-------------|
| **Meta WhatsApp API** | Send/receive messages | REST (https://graph.instagram.com) |
| **Payment Gateway** | Receive payment webhooks | HMAC-signed webhooks (to-be-specified) |
| **OpenAI API** | Message interpretation | REST + streaming for context |

### DevOps & Infrastructure

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Containerization** | Docker | Consistent dev/prod environment, easy scaling |
| **Deployment** | Railway or AWS Lightsail | Simple, cost-effective, good for MVP |
| **Database** | Supabase Cloud | Managed PostgreSQL, no ops burden |
| **Redis** | Redis Cloud or Railway | Managed, easy scaling |
| **Secrets** | Environment variables + Vault | Simple for MVP, move to HashiCorp Vault Phase 2 |
| **CI/CD** | GitHub Actions | Free, integrated, sufficient for MVP |

### Logging & Monitoring

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Logs** | Winston (JSON format) | Structured logging, easy integration with analytics |
| **APM** | Datadog or Self-hosted (Grafana Stack) | Real-time tracing, performance insights |
| **Error Tracking** | Sentry | Automatic error capture, source maps, release tracking |
| **Metrics** | Prometheus | Standard, works with Grafana |

### Testing

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Unit Tests** | Jest | Standard, fast, snapshot testing |
| **Integration Tests** | Jest + Testcontainers | Spin up real DB for tests |
| **API Tests** | Supertest | HTTP assertion library |
| **E2E Tests** | Playwright | For Phase 2 (dashboard) |
| **Load Testing** | k6 | Lightweight, scriptable, good for webhooks |

### Development

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Linter** | ESLint | Standard, extensible |
| **Formatter** | Prettier | Opinionated, zero-config |
| **Type Checking** | TypeScript | Compiled language, strict mode |
| **IDE** | VS Code | Standard, excellent TS support |

---

## 3. System Architecture

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SYSTEMS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐         │
│  │ Payment Srv  │      │ Meta WhatsApp │      │ OpenAI API  │         │
│  │  (Webhook)   │      │  (API + WH)   │      │  (REST)     │         │
│  └──────────────┘      └──────────────┘      └──────────────┘         │
│         │                     │                      │                  │
└─────────│─────────────────────│──────────────────────│──────────────────┘
          │                     │                      │
          │ (webhook/payment)   │ (webhook/messages)   │ (REST call)
          │                     │                      │
          ▼                     ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SARA BACKEND SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   FASTIFY API SERVER                             │  │
│  │  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────┐  │  │
│  │  │ Webhook     │   │ Message      │   │ Conversation        │  │  │
│  │  │ Router      │   │ Handler      │   │ Manager             │  │  │
│  │  └─────────────┘   └──────────────┘   └─────────────────────┘  │  │
│  │         │                │                       │              │  │
│  │         └────────────────┴───────────────────────┘              │  │
│  │                       │                                          │  │
│  │                       ▼                                          │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │            BUSINESS LOGIC LAYER                          │  │  │
│  │  │                                                          │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │  │  │
│  │  │  │ Abandonment  │  │ Conversation │  │ AI Service  │   │  │  │
│  │  │  │ Service      │  │ Service      │  │ (OpenAI)    │   │  │  │
│  │  │  └──────────────┘  └──────────────┘  └─────────────┘   │  │  │
│  │  │                                                          │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │  │  │
│  │  │  │ Compliance   │  │ Opt-out      │  │ Message     │   │  │  │
│  │  │  │ Service      │  │ Detection    │  │ Service     │   │  │  │
│  │  │  └──────────────┘  └──────────────┘  └─────────────┘   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                       │                                          │  │
│  │                       ▼                                          │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │              DATA ACCESS LAYER                           │  │  │
│  │  │  (Repositories, Query Builders)                          │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                            │                                            │
│                            ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │              PERSISTENCE & CACHING LAYER                        │  │
│  │                                                                  │  │
│  │  ┌──────────────┐              ┌──────────────────────────┐    │  │
│  │  │  Supabase    │              │  Redis (Cache)           │    │  │
│  │  │  PostgreSQL  │              │  - Deduplication         │    │  │
│  │  │              │              │  - Rate limiting         │    │  │
│  │  │  - users     │              │  - Conversation sessions │    │  │
│  │  │  - abandons  │              │  - Product config cache  │    │  │
│  │  │  - convs     │              └──────────────────────────┘    │  │
│  │  │  - messages  │                                               │  │
│  │  │  - webhooks  │              ┌──────────────────────────┐    │  │
│  │  │  - products  │              │  Pinecone (Optional)     │    │  │
│  │  │  - keywords  │              │  - KB vectors (Phase 2)  │    │  │
│  │  │              │              └──────────────────────────┘    │  │
│  │  └──────────────┘                                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │           SUPPORTING SERVICES (Async)                           │  │
│  │                                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │  │
│  │  │ Job Queue    │  │ Email/Alert  │  │ Logging & Traces     │  │  │
│  │  │ (Bull)       │  │ Service      │  │ (Winston + Sentry)   │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        │ (logs)             │ (traces)           │ (metrics)
        └────────────────────┴────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │  Observability Stack            │
            │  - Datadog / Grafana            │
            │  - Prometheus                   │
            │  - Sentry                       │
            │  - Winston logs (JSON)          │
            └────────────────────────────────┘
```

### System Layers

#### 1. **API Server (Fastify)**
- **Responsibility**: Route webhooks, validate requests, handle authentication
- **Stateless**: No session state, all state in database
- **Entry points**: 6 endpoints (POST /webhook/abandonment, POST /webhook/messages, etc.)
- **Middleware**: HMAC verification, request validation, correlation IDs

#### 2. **Business Logic Layer**
Separated into cohesive services:
- **AbandonmentService**: Receive events, validate, create conversations
- **ConversationService**: Manage conversation state, threading
- **AIService**: Call OpenAI, prompt engineering, token management
- **MessageService**: Send WhatsApp messages, retry logic
- **ComplianceService**: Enforce 24h window, templates, opt-out
- **OptOutDetection**: Two-layer detection (deterministic + AI)

#### 3. **Data Access Layer**
- **Repositories**: User, Abandonment, Conversation, Message, Product
- **Query Builder**: Knex.js for safe SQL generation
- **Transactions**: Ensure atomicity (e.g., convert abandonment + send message)

#### 4. **Persistence Layer**
- **Primary DB**: Supabase (PostgreSQL)
- **Cache**: Redis for dedup, rate limiting, session caching
- **Vector DB**: Pinecone for KB (Phase 2)

#### 5. **Async/Background Jobs**
- **Queue**: Bull (Redis-backed)
- **Tasks**: Message retry, compliance checks, metrics aggregation
- **Frequency**: Real-time + periodic (e.g., cleanup old webhooks)

#### 6. **Observability**
- **Structured Logging**: Winston (JSON format)
- **APM**: Datadog or Prometheus + Grafana
- **Error Tracking**: Sentry
- **Tracing**: Correlation IDs on every request

---

## 4. Component Design

### 4.1 API Server (Fastify)

```typescript
// Core setup
const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' }
});

// Middleware
fastify.register(require('@fastify/cors'));
fastify.addHook('preHandler', correlationIdMiddleware); // Add trace IDs
fastify.addHook('preHandler', hmacVerificationMiddleware); // Verify signatures
fastify.addHook('preHandler', requestValidation); // Schema validation

// Routes
fastify.post('/webhook/abandonment', abandonmentHandler);
fastify.post('/webhook/messages', messageHandler);
fastify.post('/webhook/payment', paymentHandler);
fastify.get('/webhook/messages', webhookValidationHandler);
fastify.get('/conversations/:id', conversationDetailHandler);
fastify.post('/conversations/:id/close', closeConversationHandler);

// Health check
fastify.get('/health', async (req, res) => ({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString()
}));
```

**Key Design Decisions:**
- **Stateless handlers**: Each endpoint is independent
- **Fast validation**: Schema validation at entry point
- **Correlation IDs**: Every request gets unique trace ID
- **HMAC verification**: Before any processing

### 4.2 AbandonmentService

**Responsibility**: Receive abandonment events, create initial state, send template

```
abandonmentEvent
    ↓
Validate payload (phone, productId, paymentLink)
    ↓
Check opt-out (user.opted_out = false)
    ↓
Fetch product config from cache or DB
    ↓
Create/upsert user
    ↓
Create abandonment record
    ↓
Create conversation record (status=awaiting_response)
    ↓
Send template via WhatsApp
    ↓
Log event
    ↓
Return 200 OK with idempotency check
```

**Idempotency Handling:**
```typescript
// UNIQUE constraint on abandonments.external_id prevents duplicates
// If duplicate arrives:
try {
  await createAbandonment(event);
} catch (err) {
  if (err.code === '23505') { // Unique violation
    return { status: 'already_processed', abandonmentId: event.abandonmentId };
  }
  throw err;
}
```

### 4.3 ConversationService

**Responsibility**: Manage conversation state, threading, message persistence

**State Management:**
```
conversations.status transitions:
awaiting_response → active (first user message)
active → closed (abandoned, declined, converted, error_max_retries)
error → active (retry success) or closed (timeout)
```

**Key Operations:**
1. **Load conversation**: Find by phone number, prioritize ACTIVE > ERROR > AWAITING
2. **Update state**: Mark ACTIVE after first message
3. **Track metadata**: last_message_at, last_user_message_at, message_count
4. **Enforce limits**: Max 5 exchanges, no proactive after 24h (unless template)

### 4.4 AIService (OpenAI Integration)

**Responsibility**: Interpret messages, generate responses, manage costs

```typescript
class AIService {
  async interpretMessage(
    conversationHistory: Message[],
    userMessage: string,
    context: { productId, abandoned_value }
  ): Promise<{
    intent: string; // 'price_question', 'objection', 'confirmation', etc.
    sentiment: string; // 'positive', 'neutral', 'negative'
    shouldOffer discount: boolean;
    response: string;
    tokens_used: number;
  }> {
    // System prompt enforces compliance
    const systemPrompt = `
      You are Sara, a friendly cart recovery assistant.
      - Be empathetic, not pushy
      - Respect user preferences
      - If user says "parar", "remover", etc → suggest opt-out confirmation
      - Link preference: original first, discount only if objection
      - Max ${MAX_MESSAGE_LENGTH} chars
    `;

    // Context from DB
    const messages = conversationHistory.map(m => ({
      role: m.from_sender === 'sara' ? 'assistant' : 'user',
      content: m.message_text
    }));

    // Call OpenAI with timeout
    const result = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        system: systemPrompt,
        messages: [...messages, { role: 'user', content: userMessage }],
        temperature: 0.7,
        max_tokens: 150
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new TimeoutError()), 5000)
      )
    ]);

    // Fallback if timeout
    if (error instanceof TimeoutError) {
      return {
        intent: 'unknown',
        response: 'Um momento enquanto avalio sua solicitação...',
        tokens_used: 0
      };
    }

    return parseAndStructure(result);
  }
}
```

**Cost Optimization:**
- Use GPT-3.5-turbo (~$0.0015/1K tokens vs GPT-4 ~$0.03/1K tokens)
- Cache product FAQs in Pinecone for prompt reduction (Phase 2)
- Token budgeting: ~100 tokens per message (~$0.00015 per message)
- 1000 messages/day → ~$0.15/day → ~$4.50/month

### 4.5 OptOutDetection (Two-Layer)

**Layer 1: Deterministic (Always First)**
```typescript
// Fast, no AI cost
const OPT_OUT_KEYWORDS = ['parar', 'remover', 'cancelar', 'sair', 'stop', ...];

function detectOptOutDeterministic(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return OPT_OUT_KEYWORDS.some(keyword => normalized.includes(keyword));
}
```

**Layer 2: OpenAI (Fallback)**
```typescript
async function detectOptOutAI(
  message: string,
  conversationHistory: Message[]
): Promise<boolean> {
  // Only called if deterministic returns false
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    system: 'Detect if user wants to opt out. Return JSON: { opted_out: boolean }',
    messages: [{ role: 'user', content: message }],
    temperature: 0.0
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed.opted_out;
}
```

**Enforcement:**
```typescript
// Before ANY message send:
const user = await userRepository.find(phoneNumber);
if (user.opted_out) {
  return { status: 'user_opted_out', reason: 'LGPD compliance' };
}
```

---

## 5. Data Flow

### 5.1 Complete Abandonment → Conversion Flow

```
[1] ABANDONMENT EVENT
    └─ Payment system webhook: POST /webhook/abandonment
       { userId, name, phone, productId, paymentLink, abandonmentId, value }

[2] VALIDATION
    ├─ HMAC signature check
    ├─ Phone number format (E.164)
    ├─ Required fields present
    └─ Not opted out

[3] DATABASE OPERATIONS (Atomic)
    ├─ INSERT/UPDATE users
    ├─ INSERT abandonments (UNIQUE external_id)
    ├─ INSERT conversations (UNIQUE abandonment_id)
    └─ INSERT webhooks_log (for audit)

[4] FIRST MESSAGE
    ├─ Fetch template from config
    ├─ Personalize (name, product)
    └─ Call Meta WhatsApp API: POST /messages
       Response: { message_id: "wamid.xxx" }

[5] LOG & RETURN
    ├─ INSERT messages (from="sara", type="template")
    ├─ Update conversations (status="awaiting_response")
    └─ Return 200 OK { abandonmentId, conversationId }

───────────────────────────────────────────────────────────────

[6] USER RESPONDS (hours/days later)
    └─ Meta webhook: POST /webhook/messages
       { from: "+5511999...", text: "Oi!", timestamp, messageId }

[7] MESSAGE PROCESSING
    ├─ HMAC signature check
    ├─ Dedup check: whatsapp_message_id UNIQUE
    ├─ Find conversation (by phone number)
    ├─ Check window (last_user_message_at + 24h)
    └─ Check opt-out

[8] OPT-OUT DETECTION
    ├─ Layer 1: Deterministic keywords → IMMEDIATE block
    └─ Layer 2: OpenAI interpret → if no match

    If opted out:
    ├─ INSERT messages (from="user")
    ├─ UPDATE users (opted_out=true, opted_out_at=now())
    ├─ UPDATE conversations (status="closed")
    ├─ UPDATE abandonments (status="declined")
    └─ Send farewell message + EXIT

[9] IF NOT OPT-OUT: AI INTERPRETATION
    ├─ Load last 10 messages (conversation context)
    ├─ Call OpenAI with system prompt
    ├─ Parse intent, sentiment, recommendation
    ├─ Fallback if timeout (use generic response)
    └─ Estimate tokens

[10] RESPONSE GENERATION & LINKS
    ├─ Base response from OpenAI
    ├─ Check if discount should be offered:
    │  ├─ Intent mentions price? → Offer discount
    │  ├─ Value > R$500? → Offer discount
    │  └─ Previous offers < 3? → Offer discount
    ├─ Inject links into response:
    │  ├─ Link 1: Original (always)
    │  └─ Link 2: Discounted (conditional)
    └─ Validate response length

[11] SEND & PERSIST
    ├─ Call Meta WhatsApp API: POST /messages
    │  Request: { to, type: "text", text: response }
    │  Response: { message_id }
    ├─ INSERT messages (from="sara", text=response)
    ├─ UPDATE conversations:
    │  ├─ status → "active"
    │  ├─ last_message_at = now()
    │  ├─ message_count++
    └─ Return 200 OK

───────────────────────────────────────────────────────────────

[12] PAYMENT CONFIRMATION (from gateway)
    └─ Payment system webhook: POST /webhook/payment
       { abandonmentId, status: "paid", amount, paymentId, linkType }

[13] PAYMENT VALIDATION
    ├─ HMAC signature check
    ├─ Dedup check: payment_id UNIQUE
    ├─ Find abandonment
    ├─ Validate amount matches
    └─ Check not already converted

[14] CONVERSION (Atomic)
    ├─ UPDATE abandonments:
    │  ├─ status = "converted"
    │  ├─ payment_id = from webhook
    │  ├─ conversion_link = original|discounted
    │  └─ converted_at = now()
    ├─ UPDATE conversations (status="closed")
    ├─ INSERT messages (from="sara", text="Obrigado!")
    └─ Log conversion event

[15] NOTIFY USER
    ├─ Send confirmation message
    └─ Optional: Send email receipt (Phase 2)

[16] RETURN
    └─ Return 200 OK { status: "converted", conversationId }
```

### 5.2 Time Sequence Diagram

```
Payment System     Meta Webhook        Sara Backend          Database
     │                 │                    │                   │
     ├─ abandonment ───────────────────────→│                   │
     │               (webhook POST)        │                   │
     │                                      ├─ validate ───────→│
     │                                      ├─ create user ────→│
     │                                      ├─ create abandon ─→│
     │                                      ├─ create conv ────→│
     │                                      ←─ return IDs ─────│
     │                                      │                   │
     │                                      ├─ send template   │
     │                                      │  (WhatsApp API)  │
     │                                      │                   │
     │                                      ├─ persist msg ────→│
     │                                      ←─ 200 OK ─────────│
     │                                      │                   │
     │                           [User reads msg]               │
     │                                      │                   │
     │                   ├─ user replies ──→│                   │
     │                   │ (webhook POST)   │                   │
     │                   │                  ├─ dedup check ────→│
     │                   │                  ├─ load context ───→│
     │                   │                  ←─ history ────────│
     │                   │                  │                   │
     │                   │                  ├─ OpenAI call     │
     │                   │                  │  (2-5s)          │
     │                   │                  │                   │
     │                   │                  ├─ send response   │
     │                   │                  │ (WhatsApp API)   │
     │                   │                  │                   │
     │                   │                  ├─ persist msgs ───→│
     │                   │                  ←─ 200 OK ─────────│
     │                   │                  │                   │
     │                   │          [more exchanges...]        │
     │                   │                  │                   │
     ├─ payment ────────────────────────────→│                   │
     │  (webhook POST)                      ├─ dedup check ────→│
     │                                      ├─ find aband ─────→│
     │                                      ←─ record ─────────│
     │                                      │                   │
     │                                      ├─ update status ──→│
     │                                      │  (converted)     │
     │                                      ├─ send confirm ───→│
     │                                      │  message         │
     │                                      ├─ persist ────────→│
     │                                      ←─ 200 OK ─────────│
     │                                      │                   │
```

---

## 6. API Design

### 6.1 Endpoint Specifications

All endpoints use **application/json** and return structured responses.

#### **POST /webhook/abandonment**

Receives abandonment event from payment system.

**Request:**
```json
{
  "userId": "customer_123",
  "name": "João Silva",
  "phone": "+5511999999999",
  "productId": "prod_456",
  "paymentLink": "https://pay.example.com/cart/abc123",
  "abandonmentId": "abn_789",
  "timestamp": "2026-02-05T10:30:00Z",
  "value": 250.00
}
```

**Validations:**
- `phone`: E.164 format (+55XXXXXXX)
- `abandonmentId`: Unique (UNIQUE constraint prevents reprocess)
- `value`: Positive decimal
- All fields required except `timestamp` (server defaults)

**Response (200 OK):**
```json
{
  "status": "received",
  "abandonmentId": "abn_789",
  "conversationId": "conv_123"
}
```

**Response (200 OK) – Duplicate:**
```json
{
  "status": "already_processed",
  "abandonmentId": "abn_789",
  "conversationId": "conv_123"
}
```

**Errors:**
- `400 Bad Request`: Invalid phone format, missing required field
- `403 Forbidden`: Invalid HMAC signature
- `500 Internal Server Error`: DB or WhatsApp API failure (logged, user should retry)

**HMAC Verification:**
```
Header: X-Hub-Signature-256: sha256=abcd1234...
Computation: HMAC-SHA256(app_secret, raw_body_bytes)
```

---

#### **POST /webhook/messages** (Meta → Sara)

Receives user messages from WhatsApp.

**Request:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "ENTRY_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "11987654321",
              "phone_number_id": "PHONE_ID",
              "webhook_timestamp": "1676217820"
            },
            "messages": [
              {
                "from": "5511999999999",
                "id": "wamid.xxx",
                "text": { "body": "Sim, quero pagar!" },
                "timestamp": "1676217818",
                "type": "text"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Response (200 OK):**
- Empty body (instant acknowledgment)
- Processing happens async (job queue)

**Internal Workflow:**
1. Validate signature (HMAC-SHA256)
2. Dedup check (whatsapp_message_id UNIQUE)
3. Find conversation (phone → conversations.user_id)
4. Check window (last_user_message_at + 24h)
5. Detect opt-out (deterministic + AI)
6. If opt-out: mark user opted_out=true, send farewell, close conversation
7. If active: call OpenAI, generate response, send via WhatsApp
8. Persist messages in DB

---

#### **GET /webhook/messages** (Meta Validation)

Meta verification during webhook setup.

**Query Parameters:**
- `hub.mode`: "subscribe"
- `hub.challenge`: Random token from Meta
- `hub.verify_token`: Must match `WHATSAPP_VERIFY_TOKEN`

**Response (200 OK):**
- Body: `hub.challenge` value (as plain text)

**Response (403 Forbidden):**
- If token mismatch
- Body: `{ "error": "Invalid verify token" }`

---

#### **POST /webhook/payment** (Payment Gateway → Sara)

Confirms payment completion.

**Request:**
```json
{
  "abandonmentId": "abn_789",
  "paymentId": "pay_123",
  "status": "paid",
  "amount": 250.00,
  "productId": "prod_456",
  "linkType": "original",
  "timestamp": "2026-02-05T10:45:00Z"
}
```

**Validations:**
- `paymentId`: Unique (prevents double-charging)
- `amount`: Matches abandonment value
- `status`: Only process if "paid"

**Response (200 OK):**
```json
{
  "status": "converted",
  "conversationId": "conv_123",
  "abandonmentId": "abn_789"
}
```

**Response (200 OK) – Duplicate:**
```json
{
  "status": "already_processed",
  "conversationId": "conv_123"
}
```

**Internal Workflow:**
1. Validate signature (HMAC or secret header)
2. Dedup check (payment_id UNIQUE)
3. Find abandonment
4. Update status=converted
5. Send confirmation message
6. Log conversion event
7. Return 200 OK

---

#### **GET /conversations/:conversationId** (Admin/Internal)

Retrieve full conversation history.

**Query Parameters:**
- None (but could add `?limit=50`, `?offset=0` for pagination)

**Response (200 OK):**
```json
{
  "conversationId": "conv_123",
  "abandonmentId": "abn_789",
  "userId": "user_456",
  "userPhone": "+5511999999999",
  "userName": "João",
  "status": "active",
  "productId": "prod_456",
  "productValue": 250.00,
  "createdAt": "2026-02-05T10:30:00Z",
  "lastMessageAt": "2026-02-05T10:45:00Z",
  "messages": [
    {
      "id": "msg_1",
      "from": "sara",
      "text": "Olá João! Vi que seu carrinho...",
      "timestamp": "2026-02-05T10:30:05Z"
    },
    {
      "id": "msg_2",
      "from": "user",
      "text": "Oi, esqueci de comprar!",
      "timestamp": "2026-02-05T10:31:00Z"
    }
  ]
}
```

---

#### **POST /conversations/:conversationId/close** (Admin)

Manually close conversation (for testing/admin).

**Request Body:** (optional)
```json
{
  "reason": "manual_close"
}
```

**Response (200 OK):**
```json
{
  "status": "closed",
  "conversationId": "conv_123"
}
```

---

### 6.2 Error Response Format

All errors follow standard format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Phone number must be in E.164 format",
    "details": {
      "field": "phone",
      "value": "11999999999"
    },
    "timestamp": "2026-02-05T10:30:00Z",
    "traceId": "12345-67890"
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` (400)
- `HMAC_VERIFICATION_FAILED` (403)
- `USER_OPTED_OUT` (400)
- `CONVERSATION_NOT_FOUND` (404)
- `WEBHOOK_ALREADY_PROCESSED` (200 with "already_processed" status)
- `OPENAI_TIMEOUT` (500 with fallback message sent)
- `WHATSAPP_API_ERROR` (500 with retry queued)
- `DATABASE_ERROR` (500)

---

## 7. Database Architecture

### 7.1 Schema (7 Tables)

All use PostgreSQL with Supabase hosting.

#### **users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  opted_out BOOLEAN DEFAULT FALSE,
  opted_out_at TIMESTAMP,
  opted_out_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_opted_out ON users(opted_out);
```

#### **product_offers**
```sql
CREATE TABLE product_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(255) UNIQUE NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  payment_link VARCHAR(1024) NOT NULL,
  discount_link VARCHAR(1024),
  discount_percent DECIMAL(5, 2),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_product_offers_product_id ON product_offers(product_id);
```

#### **abandonments**
```sql
CREATE TABLE abandonments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  external_id VARCHAR(255) UNIQUE NOT NULL,
  product_id VARCHAR(255) NOT NULL REFERENCES product_offers(product_id),
  value DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'initiated',
  -- initiated | active | converted | declined
  conversation_id UUID REFERENCES conversations(id),
  converted_at TIMESTAMP,
  conversion_link VARCHAR(20),
  -- 'original' | 'discounted'
  payment_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_abandonments_user_id ON abandonments(user_id);
CREATE INDEX idx_abandonments_external_id ON abandonments(external_id);
CREATE INDEX idx_abandonments_status ON abandonments(status);
CREATE INDEX idx_abandonments_payment_id ON abandonments(payment_id);
```

#### **conversations**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abandonment_id UUID REFERENCES abandonments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'awaiting_response',
  -- awaiting_response | active | closed | error
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  last_user_message_at TIMESTAMP,
  -- For Meta 24h window calculation
  followup_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_conversations_abandonment ON conversations(abandonment_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
```

#### **messages**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  from_sender VARCHAR(50) NOT NULL,
  -- 'sara' | 'user'
  message_text TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  -- 'text' | 'template'
  whatsapp_message_id VARCHAR(255) UNIQUE,
  -- For inbound dedup (may be NULL for outbound pre-send)
  openai_response_id VARCHAR(255),
  openai_tokens_used INTEGER,
  intent VARCHAR(100),
  -- 'price_question' | 'objection' | 'confirmation' | 'opt_out' | 'unclear'
  metadata JSONB DEFAULT '{}',
  -- { links_offered: [...], sentiment: '...', suggested_action: '...' }
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

#### **webhooks_log**
```sql
CREATE TABLE webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type VARCHAR(50) NOT NULL,
  -- 'abandonment' | 'whatsapp_message' | 'payment'
  external_id VARCHAR(255),
  payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT TRUE,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_webhooks_log_type_external ON webhooks_log(webhook_type, external_id);
CREATE INDEX idx_webhooks_log_type ON webhooks_log(webhook_type);
```

#### **opt_out_keywords**
```sql
CREATE TABLE opt_out_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed
INSERT INTO opt_out_keywords (keyword) VALUES
  ('parar'), ('remover'), ('cancelar'), ('sair'), ('stop'),
  ('não quero'), ('me tire'), ('excluir'), ('desinscrever'), ('unsubscribe');
```

### 7.2 Query Patterns & Performance

#### **Find active conversation by phone (hot path)**
```sql
SELECT c.* FROM conversations c
JOIN users u ON c.user_id = u.id
WHERE u.phone_number = $1
  AND c.status IN ('active', 'awaiting_response', 'error')
ORDER BY
  CASE c.status
    WHEN 'active' THEN 1
    WHEN 'error' THEN 2
    WHEN 'awaiting_response' THEN 3
  END,
  c.created_at DESC
LIMIT 1;
```
**Index**: `idx_users_phone`, `idx_conversations_status`

#### **Load conversation history (for AI context)**
```sql
SELECT * FROM messages
WHERE conversation_id = $1
ORDER BY created_at DESC
LIMIT 50;
```
**Index**: `idx_messages_conversation_id`

#### **Check opt-out before sending**
```sql
SELECT opted_out FROM users WHERE phone_number = $1;
```
**Index**: `idx_users_phone`, `idx_users_opted_out`

#### **Get active abandonments (for analytics)**
```sql
SELECT a.* FROM abandonments a
WHERE a.status IN ('initiated', 'active')
  AND a.created_at > NOW() - INTERVAL '7 days'
ORDER BY a.created_at DESC;
```
**Index**: `idx_abandonments_status`

### 7.3 Data Integrity & Constraints

| Constraint | Purpose | Implementation |
|-----------|---------|-----------------|
| **Idempotency (abandonment)** | Prevent duplicate events | `external_id` UNIQUE |
| **Idempotency (payment)** | Prevent double-charge | `payment_id` UNIQUE |
| **Idempotency (message)** | Prevent message dupes | `whatsapp_message_id` UNIQUE |
| **One conversation per abandonment** | Avoid orphaned conversations | `abandonment_id` UNIQUE on conversations |
| **Webhook dedup** | Avoid reprocessing | `(webhook_type, external_id)` UNIQUE |
| **Foreign keys** | Referential integrity | ON DELETE CASCADE |

---

## 8. Deployment & Infrastructure

### 8.1 Deployment Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT TIERS                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Development │  │   Staging    │  │ Production   │     │
│  │  (Railway)  │  │  (Railway)   │  │  (Railway)   │     │
│  │             │  │              │  │              │     │
│  │ - git push  │  │ - PR merge   │  │ - tag push   │     │
│  │ - auto deploy│  │ - auto test  │  │ - auto build │     │
│  │ - 1x Node   │  │ - 1-2x Node  │  │ - 2-4x Node  │     │
│  │ - shared DB │  │ - shared DB  │  │ - dedicated  │     │
│  │ - shared    │  │ - dedicated  │  │ - dedicated  │     │
│  │   Redis     │  │   Redis      │  │   Redis      │     │
│  └─────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
└────────────────────────────────────────────────────────────┘
         │                │                    │
         │                │                    │
    GitHub Actions:      GitHub Actions:     GitHub Actions:
    - Test               - Test              - Test
    - Lint               - Lint              - Lint
    - Build              - Build             - Build
    - Deploy             - Deploy            - Deploy
                                             - Smoke tests
                                             - Alert if errors
```

### 8.2 Infrastructure as Code (IaC)

**Tools**: Docker + Railway + Terraform (optional)

**Production Checklist:**
- [ ] Environment variables (.env) secured in Railway secrets
- [ ] Database backups enabled (Supabase auto-backup)
- [ ] Monitoring alerts configured (Datadog/Sentry)
- [ ] Error tracking active (Sentry)
- [ ] Rate limiting configured (Redis)
- [ ] CORS configured for Meta webhooks
- [ ] SSL/TLS enabled (automatic with Railway)
- [ ] Load testing completed (k6)

### 8.3 Containerization (Docker)

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build TS
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start
CMD ["node", "dist/src/index.js"]
```

**Build & Push:**
```bash
docker build -t sara:latest .
docker push registry.railway.app/sara:latest
```

---

## 9. Scaling & Performance

### 9.1 Horizontal Scaling

**Architecture is stateless by design:**
- Each Node instance handles webhooks independently
- State lives in DB and Redis only
- Load balancing via Railway (automatic)

**Scaling Strategy:**

| Metric | Threshold | Action |
|--------|-----------|--------|
| **CPU** | > 70% for 5 min | +1 instance |
| **Memory** | > 80% for 5 min | +1 instance |
| **Queue depth** | > 100 jobs | +1 instance |
| **DB connections** | > 90% of pool | Alert only (don't auto-scale DB) |

**Database Scaling:**
- Supabase handles scaling (managed service)
- Monitor query performance (< 500ms)
- Add indexes if slow queries detected
- Cache frequently accessed data in Redis

**Redis Scaling:**
- Start with 512MB (cache + queue)
- Scale to 2GB if queue grows > 10k jobs

### 9.2 Performance Targets

| Target | Metric | SLA |
|--------|--------|-----|
| **First message latency** | Event → WhatsApp send | < 2 seconds |
| **Message processing** | Inbound → OpenAI → Outbound | 2-7 seconds |
| **DB query** | Conversation lookup | < 100ms |
| **OpenAI API** | Request → response | < 5 seconds (with fallback) |
| **WhatsApp API** | Send request → ack | < 1 second |
| **Webhook ACK** | Receive → 200 OK | < 100ms |

### 9.3 Caching Strategy

| Data | Cache Location | TTL | Rationale |
|------|----------------|-----|-----------|
| **Product offers** | Redis | 1 hour | Changes rarely |
| **Opt-out keywords** | Redis | 24 hours | Static reference data |
| **Conversation context** | None (hot load from DB) | - | Needs current state |
| **User opt-out status** | Memory (per request) | Request | Checked before every send |
| **Message dedup** | DB UNIQUE constraint | - | Source of truth |

---

## 10. Security Architecture

### 10.1 Authentication & Authorization

**For Webhooks** (Inbound):
- HMAC-SHA256 signature on request body
- Signature in `X-Hub-Signature-256` header
- Secret stored in environment variable
- Verification happens in middleware

**For Admin Endpoints**:
- (Phase 2) API key or JWT token
- Stored in secure header or Authorization bearer

### 10.2 Data Protection

| Layer | Method | Implementation |
|-------|--------|-----------------|
| **Transport** | TLS 1.3 | HTTPS only (enforced by Railway) |
| **At Rest** | AES-256 encryption | Supabase encryption by default |
| **In Memory** | Secrets never logged | Environment variables only |
| **In Transit (DB)** | SSL connections | Supabase SSL (automatic) |
| **In Transit (Cache)** | SSL to Redis | Redis Cloud SSL (automatic) |

### 10.3 Compliance

| Regulation | Requirement | Implementation |
|-----------|-------------|-----------------|
| **LGPD** | Data minimization | Store only: name, phone, conversation |
| **LGPD** | Right to deletion | `DELETE FROM users WHERE opted_out=true` (Phase 2) |
| **LGPD** | Data portability | Export conversations (Phase 2) |
| **WhatsApp ToS** | Template approval | Hardcoded template ID, no changes without re-approval |
| **WhatsApp ToS** | 24h window | Code enforces `last_user_message_at + 24h` check |
| **WhatsApp ToS** | Opt-out | Two-layer detection (keywords + AI) |

### 10.4 Input Validation

```typescript
// All user input validated at entry point
const abandonmentSchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/), // E.164
  name: z.string().min(1).max(255),
  productId: z.string().min(1).max(255),
  abandonmentId: z.string().min(1).max(255).unique(),
  value: z.number().positive()
});

// Database also enforces type constraints
```

---

## 11. Testing Strategy

### 11.1 Testing Pyramid

```
          ▲
         /│\
        / │ \  E2E Tests (Playwright)
       /  │  \  - Full journey (dashboard + API)
      /   │   \  - Smoke tests (Phase 2)
     ├─────────┤
    / │       │ \  Integration Tests (Jest + Testcontainers)
   /  │       │  \ - Webhook handling
  /   │       │   \ - DB transactions
 /    │       │    \ - OpenAI mocking
├──────────────────┤
│      │   │       │  Unit Tests (Jest)
│ API  │ AI │ DB   │  - Service logic
│ Svc  │Svc │ Repo │  - Utilities
│      │    │      │  - Validation
└──────────────────┘
```

### 11.2 Unit Tests

**Coverage Target**: > 80%

**Key Areas to Test:**
- OptOutDetection (deterministic + AI)
- AIService (prompt building, token counting)
- ComplianceService (24h window, template enforcement)
- Repository methods (queries, transactions)

**Example:**
```typescript
describe('OptOutDetection', () => {
  describe('deterministic', () => {
    it('should detect "parar" keyword', () => {
      expect(detectOptOutDeterministic('Parar!')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(detectOptOutDeterministic('REMOVER')).toBe(true);
    });
  });

  describe('AI fallback', () => {
    it('should detect "não tenho interesse" via OpenAI', async () => {
      const mock = mockOpenAI({ opted_out: true });
      const result = await detectOptOutAI('não tenho interesse', []);
      expect(result).toBe(true);
    });
  });
});
```

### 11.3 Integration Tests

**Setup**: Testcontainers for PostgreSQL + Redis

**Key Scenarios:**
1. **Abandonment workflow**: Event → DB → WhatsApp mock
2. **Message processing**: Inbound → OpenAI mock → Outbound
3. **Opt-out detection**: Deterministic → fallback
4. **Idempotency**: Duplicate event → already_processed
5. **State transitions**: conversation status transitions

**Example:**
```typescript
describe('Abandonment Service', () => {
  beforeAll(async () => {
    db = await startPostgres();
    redis = await startRedis();
  });

  it('should create abandonment and send template', async () => {
    const event = { phone: '+5511999...', name: 'João', ... };
    const result = await abandonmentService.handle(event);

    expect(result.status).toBe('received');
    expect(whatsappMock.send).toHaveBeenCalled();

    const stored = await db.query('SELECT * FROM abandonments WHERE external_id = ?', [event.abandonmentId]);
    expect(stored).toHaveLength(1);
  });
});
```

### 11.4 Load Testing

**Tool**: k6

**Scenarios:**
1. **Sustained load**: 100 req/s for 5 min
2. **Spike test**: Ramp to 500 req/s in 10s
3. **Soak test**: 50 req/s for 1 hour

**Script:**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 100 },  // ramp up
    { duration: '5m', target: 100 },  // stay
    { duration: '1m', target: 0 }     // ramp down
  ]
};

export default function () {
  const payload = {
    phone: '+5511999999999',
    name: 'João',
    productId: 'prod_123',
    abandonmentId: `abn_${Date.now()}_${Math.random()}`
  };

  const res = http.post('http://localhost:3000/webhook/abandonment', JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'latency < 2s': (r) => r.timings.duration < 2000
  });
}
```

---

## 12. Observability & Monitoring

### 12.1 Logging Strategy

**Tool**: Winston (JSON format)

**Log Levels** (by severity):
- `error`: Exceptions, API failures (alert if rate > 0.1%)
- `warn`: Timeouts, retries, non-critical issues
- `info`: Webhook received, message sent, state changes
- `debug`: DB queries, OpenAI calls (disabled in prod by default)

**Structured Logging Example:**
```typescript
logger.info('message_sent', {
  conversationId: conv.id,
  messageId: whatsappResponse.message_id,
  from: 'sara',
  tokenCount: aiResponse.tokens,
  latency: Date.now() - start,
  traceId: req.traceId
});
```

**Log Retention**: 30 days (Supabase/Datadog)

### 12.2 Metrics & APM

**Tools**: Prometheus + Grafana (or Datadog)

**Key Metrics:**

| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| `api.requests.total` | Counter | - |
| `api.requests.duration` | Histogram | p95 > 2s |
| `api.errors.total` | Counter | Rate > 0.1% |
| `openai.api.calls` | Counter | Cost tracking |
| `openai.api.latency` | Histogram | p95 > 5s |
| `whatsapp.api.latency` | Histogram | p95 > 1s |
| `db.query.duration` | Histogram | p95 > 500ms |
| `conversations.active` | Gauge | - (dashboard) |
| `webhooks.processed` | Counter | - |
| `opt_outs.total` | Counter | - |

**Dashboard (Grafana):**
```
┌──────────────────────────────────────────────────┐
│ Sara Monitoring Dashboard                        │
├──────────────────────────────────────────────────┤
│                                                  │
│ Uptime: 99.7% │ Requests/s: 42 │ Errors: 0.02%│
│                                                  │
│ ┌─ Latencies ──────┐ ┌─ Throughput ──────────┐ │
│ │ API p95: 1.2s    │ │ Abandonment: 150/day  │ │
│ │ OpenAI p95: 3.1s │ │ Converted: 8/day      │ │
│ │ DB p95: 250ms    │ │ Conversion Rate: 5.3% │ │
│ └──────────────────┘ └──────────────────────┘ │
│                                                  │
│ ┌─ Errors ──────────┐ ┌─ Cost ───────────────┐ │
│ │ WhatsApp: 2      │ │ OpenAI: $4.23/day    │ │
│ │ OpenAI: 1       │ │ Infrastructure: ...  │ │
│ │ DB: 0           │ │                      │ │
│ └──────────────────┘ └──────────────────────┘ │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 12.3 Error Tracking

**Tool**: Sentry

**Setup:**
```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true })
  ]
});

// Catch errors
fastify.setErrorHandler((error, req, res) => {
  Sentry.captureException(error, { req });
  res.status(500).send({ error: error.message });
});
```

**Alerts** (if error rate > 0.1%):
- Slack notification to #sara-alerts
- PagerDuty if critical (email to team)

---

## 13. Error Handling & Recovery

### 13.1 Error Classification

| Error Type | Cause | Recovery |
|-----------|-------|----------|
| **Validation Error** | Invalid input (phone format, etc.) | Reject with 400, log for analysis |
| **Signature Verification Failed** | HMAC mismatch or replay attack | Reject with 403, alert security |
| **User Opted Out** | User previously requested opt-out | Reject with silent 200 OK (for compliance) |
| **OpenAI Timeout** | LLM slow or unavailable | Fallback message, continue |
| **OpenAI Error** | API error (rate limit, etc.) | Fallback message, queue for retry |
| **WhatsApp API Error** | Meta API down or rate limited | Queue message for retry (Bull) |
| **Database Error** | Connection lost, query timeout | Retry transaction, alert ops |
| **Webhook Duplicate** | Same event processed twice | Detect via UNIQUE constraint, idempotent response |

### 13.2 Retry Strategies

**OpenAI (on timeout):**
- Immediate fallback message sent to user
- No retry (single-attempt only)

**WhatsApp API (on failure):**
- Exponential backoff: 1s, 2s, 4s, 8s
- Max 3 retries (24s total)
- If all fail: log alert, manual review

**Database (on connection error):**
- Circuit breaker pattern (fail fast after 3 errors)
- Retry after 5 second wait
- Alert ops if persistent

**Webhook Processing (general):**
- Always return 200 OK immediately (Meta expects quick response)
- Process asynchronously in background job
- If error: log, store in webhooks_log, manual review

---

## 14. Development Patterns

### 14.1 Project Structure

```
sara/
├── src/
│   ├── index.ts                    # Entry point
│   ├── server.ts                   # Fastify setup
│   ├── middleware/
│   │   ├── hmacVerification.ts
│   │   ├── correlationId.ts
│   │   └── validation.ts
│   ├── routes/
│   │   ├── abandonment.ts
│   │   ├── messages.ts
│   │   └── conversations.ts
│   ├── services/
│   │   ├── AbandonmentService.ts
│   │   ├── ConversationService.ts
│   │   ├── AIService.ts
│   │   ├── MessageService.ts
│   │   ├── ComplianceService.ts
│   │   └── OptOutDetection.ts
│   ├── repositories/
│   │   ├── UserRepository.ts
│   │   ├── AbandonmentRepository.ts
│   │   ├── ConversationRepository.ts
│   │   └── MessageRepository.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── hmac.ts
│   │   └── formatters.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── openai.ts
│   │   └── whatsapp.ts
│   └── types/
│       ├── index.ts                # Shared types
│       ├── models.ts               # DB models
│       └── api.ts                  # API request/response
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_add_indices.sql
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

### 14.2 Coding Patterns

**Error Handling:**
```typescript
try {
  // Operation
} catch (error) {
  logger.error('operation_failed', {
    error: error.message,
    stack: error.stack,
    traceId: req.traceId
  });
  throw new AppError('OPERATION_FAILED', 'Human message', 500);
}
```

**Database Transactions:**
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await userRepository.create(user);
  await abandonmentRepository.create(abandonment);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

**Service Dependency Injection:**
```typescript
class ConversationService {
  constructor(
    private conversationRepo: ConversationRepository,
    private messageRepo: MessageRepository,
    private aiService: AIService
  ) {}

  async handle(event: WebhookEvent) {
    // Implementation
  }
}
```

---

## 15. Decisions & Trade-offs

### 15.1 Key Architectural Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Fastify over Express** | Faster, modern plugins | Smaller ecosystem than Express |
| **TypeScript** | Type safety, better DX | Compilation step, learning curve |
| **Supabase over Firebase** | ACID, LGPD, PostgreSQL | More operational overhead |
| **Redis for cache** | Fast, multi-purpose | Another service to operate |
| **GPT-3.5 over GPT-4** | Cost ($0.0005 vs $0.015 per 1K tokens) | Less capable on edge cases |
| **Stateless APIs** | Horizontal scalability | Requires DB for state (latency trade-off) |
| **Event-driven** | Decoupled, scalable | Complexity in testing, debugging |
| **Webhook verification** | Security, compliance | Slight latency overhead |
| **Two-layer opt-out** | Reliability + cost-saving | Deterministic may miss nuance, AI adds cost |

### 15.2 Phase 2+ Considerations

**What's NOT in MVP:**
- Dashboard (Phase 2)
- Human escalation / handoff (Phase 2)
- A/B testing framework (Phase 2)
- Pinecone KB integration (Phase 2, optional)
- Email notifications (Phase 2)
- Advanced analytics/reporting (Phase 2)
- Multi-language support (Phase 2+)
- GraphQL API (Phase 2+)
- Webhook signature verification (Phase 2 – implement before prod)

**Extensibility Points:**
- Message templates (currently hardcoded, move to templates table)
- AI prompts (currently in code, move to YAML config)
- Opt-out keywords (already in table, easily managed)
- Product config (already in table, easily managed)
- Retry logic (Bull queue is extensible)

---

## Checklist for Implementation

### Pre-Development
- [ ] Create Git repository
- [ ] Setup CI/CD pipeline (GitHub Actions)
- [ ] Create Railway projects (dev, staging, prod)
- [ ] Create Supabase projects (dev, staging, prod)
- [ ] Create Redis instances (dev, staging, prod)
- [ ] Provision OpenAI API key
- [ ] Get Meta WhatsApp API credentials
- [ ] Configure environment variables

### Development
- [ ] Setup TypeScript + ESLint + Prettier
- [ ] Implement Fastify server with middleware
- [ ] Build all repositories (data access layer)
- [ ] Implement all services (business logic)
- [ ] Implement all routes (API endpoints)
- [ ] Add comprehensive tests (unit + integration)
- [ ] Add logging (Winston)
- [ ] Add error handling (Sentry)

### Pre-Production
- [ ] Load testing (k6)
- [ ] Security review (HMAC, input validation, data protection)
- [ ] LGPD compliance check
- [ ] Meta WhatsApp compliance check
- [ ] Database backup strategy
- [ ] Monitoring & alerting setup
- [ ] Documentation complete
- [ ] Runbook for operations

### Post-Launch
- [ ] Monitor metrics for 24h
- [ ] Collect feedback from stakeholders
- [ ] Plan Phase 2 features
- [ ] Schedule architecture review (quarterly)

---

## Summary

Sara's architecture is:
- **Stateless**: Scales horizontally
- **Event-driven**: Responds to webhooks
- **Compliance-first**: Meta policies embedded in code
- **Observable**: Comprehensive logging and monitoring
- **Resilient**: Error handling and retry strategies
- **Secure**: HMAC verification, data encryption, LGPD compliance
- **Cost-conscious**: Efficient AI usage, caching strategy
- **Testable**: Unit + integration + load testing

**Next Steps**:
1. @dev implements based on this architecture
2. @qa creates test plans
3. @devops sets up infrastructure
4. Scheduled review after MVP launch

---

**Document Status**: ✅ Ready for Development
**Last Updated**: 2026-02-05
**Architect**: Aria

— Aria, arquitetando o futuro 🏗️
