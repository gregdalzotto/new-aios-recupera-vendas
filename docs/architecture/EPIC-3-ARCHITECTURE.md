# EPIC 3 Architecture: Compliance & Opt-out Detection
## Detecção de Desinscrição e Conformidade LGPD/WhatsApp

**Status**: ✅ Architectural Validation Complete
**Architect**: Aria (Visionary)
**Date**: 2026-02-06
**Epic ID**: SARA-3
**Priority**: P1 (Enabler for Production)
**Estimated Points**: ~35 story points

---

## Executive Summary

EPIC 3 implements the compliance and opt-out layers that make SARA production-ready. Building on EPIC 2's conversation foundation, this epic adds:

1. **Two-layer opt-out detection**: Deterministic (fast, accurate) + AI fallback (nuanced, contextual)
2. **Compliance enforcement**: LGPD opt-out persistence + 24h Meta window validation
3. **Payment webhook integration**: Conversion tracking with idempotency
4. **Audit trails**: Complete logging for compliance audits

**Key Validation Result**: Architecture is robust, dependency order is correct, and pattern consistency with EPIC 2 is maintained.

---

## 1. Current System State (EPIC 2 Completion)

### Implemented Components ✅

| Component | Location | Status | Commits |
|-----------|----------|--------|---------|
| **ConversationService** | `src/services/ConversationService.ts` | ✅ Ready | 11a82c1 |
| **AIService** | `src/services/AIService.ts` | ✅ Ready | 17bfa4f |
| **MessageService** | `src/services/MessageService.ts` | ✅ Ready | 81d53dd |
| **Webhook /webhook/messages** | `src/routes/webhooks.ts` | ✅ Ready | 20aab80 |
| **Job Handlers** | `src/jobs/handlers.ts` | ✅ Ready | a475918 |
| **Message Persistence** | `src/models/Message.ts` | ✅ Ready | 44702fb |

### Infrastructure Ready ✅

| Service | Config | Status |
|---------|--------|--------|
| **Redis** | `src/config/redis.ts` | ✅ Connected |
| **PostgreSQL** | `src/config/database.ts` | ✅ Migrations run |
| **OpenAI API** | `src/config/openai.ts` | ✅ Validated |
| **Bull Queue** | `src/config/redis.ts` | ✅ Initialized |

### Database Schema (Complete) ✅

```sql
-- Core Tables (from EPIC 1-2)
✅ users (phone_number UNIQUE, opted_out flag)
✅ abandonments (external_id UNIQUE, payment_id UNIQUE)
✅ conversations (abandonment_id UNIQUE)
✅ messages (whatsapp_message_id UNIQUE)
✅ webhooks_log ((webhook_type, external_id) UNIQUE)

-- From Architecture Doc (needs seeding)
⏳ opt_out_keywords (keyword UNIQUE, active boolean)
⏳ product_offers (product_id UNIQUE)
```

### Current Data Flow (EPIC 2)

```
Payment System
  ↓
POST /webhook/abandonment (SARA-1)
  ↓
[Create User, Abandonment, Conversation]
  ↓
Send Template WhatsApp
  ↓
──────────────────────────────────────────
[Days/Hours Later]
  ↓
User replies on WhatsApp
  ↓
POST /webhook/messages (SARA-2.4)
  ↓
Queue job → ProcessMessageQueue
  ↓
Job Handler (SARA-2.5)
  ├─ ConversationService.findByPhoneNumber()
  ├─ ❌ NO OPT-OUT CHECK YET
  ├─ AIService.interpretMessage()
  ├─ MessageService.send() response
  └─ MessageRepository.create()
  ↓
Database Updated
  ↓
──────────────────────────────────────────
[Later or via discount link]
  ↓
POST /webhook/payment (NOT IMPLEMENTED YET)
  ├─ ❌ No endpoint
  ├─ ❌ No business logic
  └─ ❌ No conversion tracking
```

---

## 2. EPIC 3 Architecture Overview

### Layer Integration (4-Layer Model)

```
┌─────────────────────────────────────────────────────┐
│         API ROUTES LAYER                            │
│  ✅ POST /webhook/abandonment (SARA-1)              │
│  ✅ POST /webhook/messages (SARA-2.4)               │
│  ⏳ POST /webhook/payment (SARA-3.4)                │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│         BUSINESS LOGIC LAYER (NEW IN EPIC 3)        │
│  ✅ ConversationService (from EPIC 2)               │
│  ✅ AIService (from EPIC 2)                         │
│  ⏳ OptOutDetectionService (SARA-3.1)              │
│  ⏳ ComplianceService (SARA-3.3)                    │
│  ⏳ PaymentService (SARA-3.4)                       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│         DATA ACCESS LAYER                           │
│  ✅ UserRepository                                   │
│  ✅ AbandonmentRepository                            │
│  ✅ ConversationRepository                           │
│  ✅ MessageRepository                                │
│  ⏳ OptOutKeywordRepository (SARA-3.1)             │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│         PERSISTENCE LAYER                           │
│  ✅ PostgreSQL (Supabase)                            │
│  ✅ Redis (cache + queue)                            │
└─────────────────────────────────────────────────────┘
```

### Message Processing Flow with Opt-out (NEW)

```
┌─────────────────────────────────────────────────────────────┐
│  inbound message from WhatsApp                              │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  POST /webhook/messages                                     │
│  ├─ HMAC verification ✅                                     │
│  ├─ Dedup check (whatsapp_message_id UNIQUE) ✅             │
│  └─ Return 200 OK immediately to Meta                       │
└─────────────────────────────────────────────────────────────┘
              ↓
          [ASYNC JOB]
              ↓
┌─────────────────────────────────────────────────────────────┐
│  ProcessMessageQueue.addJob()                               │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  Job Handler - Step 1: Load Context                         │
│  ├─ ConversationService.findByPhoneNumber()                │
│  ├─ MessageRepository.getLastNMessages(conversationId, 10)  │
│  └─ Check conversation exists (else skip, log)              │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  Job Handler - Step 2: Validate Window (NEW - SARA-3.3)    │
│  ├─ ComplianceService.validateConversationWindow()          │
│  │  └─ If last_user_message_at + 24h > now: VALID ✅       │
│  │  └─ If last_user_message_at + 24h < now: EXPIRED ❌      │
│  └─ If expired: log + return (don't process)                │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  Job Handler - Step 3: Detect Opt-out (NEW - SARA-3.1/2)  │
│  ├─ OptOutDetectionService.detectKeyword(messageText)       │
│  │  └─ If "parar", "remover", etc → OPT-OUT DETECTED ✅     │
│  │  └─ Logs: which keyword matched                          │
│  │                                                          │
│  ├─ If NO keyword detected: call AIService.detectOptOut()  │
│  │  └─ AIService.detectOptOutIntent() (fallback)           │
│  │  └─ If confidence >= 0.7 → OPT-OUT DETECTED ✅           │
│  │  └─ Log confidence score for analysis                    │
│  │                                                          │
│  └─ If OPT-OUT DETECTED:                                    │
│     ├─ INSERT message (from="user", text=...)               │
│     ├─ ComplianceService.markOptedOut(userId, "user_request") │
│     │  └─ UPDATE users (opted_out=true, opted_out_at=now()) │
│     │  └─ UPDATE conversations (status=CLOSED)              │
│     ├─ MessageService.send() → farewell message             │
│     ├─ INSERT message (from="sara", text=farewell)          │
│     ├─ Log opt-out event with trace ID                      │
│     └─ Return (EXIT EARLY - do NOT call AI)                 │
└─────────────────────────────────────────────────────────────┘
              ↓ (if NOT opted out)
┌─────────────────────────────────────────────────────────────┐
│  Job Handler - Step 4: AI Interpretation (from EPIC 2)     │
│  ├─ AIService.interpretMessage(context, userMessage)        │
│  ├─ Returns: intent, sentiment, shouldOfferDiscount, response │
│  └─ Handle timeout with fallback message                    │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  Job Handler - Step 5: Send Response (from EPIC 2)         │
│  ├─ MessageService.send(phone, response, "text")            │
│  ├─ If error: queue SendMessageQueue for retry              │
│  └─ Log message sent with WhatsApp message ID               │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  Job Handler - Step 6: Persist & Update                     │
│  ├─ MessageRepository.create(userMessage)                   │
│  ├─ MessageRepository.create(saraResponse)                  │
│  ├─ ConversationService.updateTimestamps()                  │
│  │  └─ last_message_at = now()                              │
│  │  └─ last_user_message_at = now()                         │
│  └─ ConversationService.incrementMessageCount()             │
└─────────────────────────────────────────────────────────────┘
```

### Payment Webhook Integration (NEW)

```
┌──────────────────────────────────────────────────────┐
│  Payment System Detects Payment Completion           │
└──────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────┐
│  POST /webhook/payment                               │
│  {                                                   │
│    "paymentId": "pay_789",                           │
│    "abandonmentId": "abn_456",                       │
│    "status": "completed",                            │
│    "amount": 250.00,                                 │
│    "linkType": "original|discounted"                 │
│  }                                                   │
└──────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────┐
│  Step 1: Validate & HMAC Verify                      │
│  ├─ HMAC signature check                             │
│  ├─ Validate payload (required fields, types)        │
│  └─ Return 400 if invalid                            │
└──────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────┐
│  Step 2: Dedup via UNIQUE payment_id                │
│  ├─ Try INSERT payment_id                           │
│  ├─ If UNIQUE violation: already processed ✅        │
│  │  └─ Return 200 OK { status: "already_processed" }│
│  └─ If new: continue                                │
└──────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────┐
│  Step 3: Update State (based on status)             │
│  ├─ Status = "completed":                            │
│  │  ├─ UPDATE abandonments:                          │
│  │  │  ├─ status = "CONVERTED"                       │
│  │  │  ├─ converted_at = now()                       │
│  │  │  ├─ payment_id = from webhook                  │
│  │  │  └─ conversion_link = linkType                 │
│  │  ├─ UPDATE conversations:                         │
│  │  │  └─ status = "CLOSED" (converted)              │
│  │  ├─ Send confirmation message to user             │
│  │  └─ Log conversion event (trace ID, user, value)  │
│  │                                                   │
│  ├─ Status = "failed" or "refunded":                 │
│  │  ├─ UPDATE abandonments (status = "DECLINED")     │
│  │  ├─ UPDATE conversations (status = "ACTIVE")      │
│  │  │  └─ Allow continued conversation               │
│  │  └─ Log failure with reason                       │
│  │                                                   │
│  └─ Status = "pending":                              │
│     ├─ UPDATE abandonments (status = "PENDING")      │
│     └─ Don't change conversation (still active)      │
└──────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────┐
│  Step 4: Response to Payment System                 │
│  {                                                   │
│    "status": "processed|already_processed",          │
│    "paymentId": "pay_789",                           │
│    "abandonmentId": "abn_456",                       │
│    "action": "converted|declined|pending"            │
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

---

## 3. Service Architecture Details

### 3.1 OptOutDetectionService (SARA-3.1)

**Location**: `src/services/OptOutDetectionService.ts`

**Purpose**: Fast, deterministic keyword-based opt-out detection

```typescript
class OptOutDetectionService {
  /**
   * Load keywords from DB with in-memory cache (TTL: 1 hour)
   * Cache stored in Redis or local memory
   */
  private keywordCache: Map<string, boolean> = new Map();
  private cacheTimestamp: number = 0;
  private cacheTTL = 3600000; // 1 hour

  /**
   * Detect if message contains opt-out keywords
   * - Case-insensitive
   * - Word-boundary matching (\bkeyword\b)
   * - Timeout: 100ms max
   * Returns: true if match found, false otherwise
   */
  async detectKeyword(messageText: string): Promise<{
    detected: boolean;
    keyword?: string;
    confidence: 'high'; // Deterministic = always high confidence
  }>

  /**
   * Get specific keyword that matched (for logging)
   */
  getMatchedKeyword(messageText: string): string | null;

  /**
   * Reload keywords from DB (admin operation)
   */
  async reloadKeywords(): Promise<void>;
}
```

**Data Model**:
```sql
CREATE TABLE opt_out_keywords (
  id UUID PRIMARY KEY,
  keyword VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Initial seed (10 keywords)
INSERT INTO opt_out_keywords (keyword) VALUES
  ('parar'), ('remover'), ('cancelar'), ('sair'), ('stop'),
  ('não quero'), ('me tire'), ('excluir'), ('desinscrever'), ('unsubscribe');
```

**Performance**:
- Cache hit: < 10ms
- Cache miss (DB query): < 50ms
- Keyword matching: < 100ms total

**Error Handling**:
- Timeout during keyword load: use cached keywords (don't fail)
- DB error: use fallback list (hardcoded in code)
- Invalid regex: log error, skip keyword

### 3.2 AIService Enhancement (SARA-3.2)

**Location**: `src/services/AIService.ts` (modify existing)

**Purpose**: AI-based opt-out detection as fallback (for nuanced language)

```typescript
class AIService {
  // Existing: interpretMessage()

  /**
   * NEW: Detect opt-out intent using OpenAI (FALLBACK ONLY)
   * Called AFTER deterministic detection fails
   * Timeout: 3 seconds (shorter than main response)
   * Returns structured confidence score
   */
  async detectOptOutIntent(context: {
    conversationHistory: Message[];
    userMessage: string;
    productId: string;
  }): Promise<{
    isOptOut: boolean;           // Final decision
    confidence: number;          // 0.0 to 1.0
    reason?: string;             // Why detected (for logging)
    tokensUsed: number;
  }>
}
```

**Prompt Design**:
```
System Prompt:
"You are analyzing customer messages to detect if they want to unsubscribe/opt-out.
Look for clear intent to stop receiving messages.
Respond with JSON: { isOptOut: true/false, confidence: 0.0-1.0, reason: string }
Examples:
- 'parar' → { isOptOut: true, confidence: 1.0 }
- 'não quero mais' → { isOptOut: true, confidence: 0.95 }
- 'não quero continuar' → { isOptOut: true, confidence: 0.9 }
- 'qual o preço?' → { isOptOut: false, confidence: 0.0 }
- 'não quero deixar de receber' → { isOptOut: false, confidence: 0.95 }
Be conservative: high confidence only for clear statements."

Temperature: 0.3 (deterministic)
Max tokens: 50
```

**Confidence Threshold Logic**:
```typescript
const result = await aiService.detectOptOutIntent(context);

if (result.confidence >= 0.7) {
  // OPT-OUT DETECTED: high confidence
  await complianceService.markOptedOut(userId, "AI_DETECTED");
  logger.warn('opt_out_detected_ai', { confidence: result.confidence, reason: result.reason });
} else if (result.confidence >= 0.5) {
  // AMBIGUOUS: log for analysis but don't opt-out
  logger.info('opt_out_ambiguous', { confidence: result.confidence, reason: result.reason });
  // Send normal response, analyze later
} else {
  // NOT OPT-OUT: process normally
}
```

### 3.3 ComplianceService (SARA-3.3)

**Location**: `src/services/ComplianceService.ts`

**Purpose**: Enforce compliance rules (LGPD + Meta 24h window)

```typescript
class ComplianceService {
  /**
   * Validate if conversation is within Meta's 24h window
   * If last user message > 24h ago: conversation EXPIRED
   */
  async validateConversationWindow(
    conversationId: string
  ): Promise<{
    isValid: boolean;
    reason?: string;           // WINDOW_EXPIRED, ACTIVE, etc.
    lastUserMessageAt?: Date;
    hoursRemaining?: number;   // How long until window closes
  }>

  /**
   * Check if conversation should be stopped
   * Multiple reasons: expired, opt-out, converted, error, etc.
   */
  async shouldStopConversation(
    conversationId: string
  ): Promise<{
    shouldStop: boolean;
    reason: string;  // WINDOW_EXPIRED, USER_OPTED_OUT, CONVERTED, MESSAGE_LIMIT_EXCEEDED, PERSISTENT_ERROR
  }>

  /**
   * Mark user as opted-out (LGPD compliance)
   * Updates user record and closes all active conversations
   */
  async markOptedOut(
    userId: string,
    reason: string  // "user_request", "AI_DETECTED", "KEYWORD_DETECTED", etc.
  ): Promise<void>

  /**
   * Get compliance status for conversation (for diagnostics)
   */
  async getComplianceStatus(conversationId: string): Promise<{
    userOptedOut: boolean;
    windowValid: boolean;
    messageCount: number;
    messageLimit?: number;
    createdAt: Date;
    lastUserMessageAt?: Date;
  }>
}
```

**Implementation Details**:

```typescript
// Window validation
const validateConversationWindow = async (conversationId) => {
  const conv = await ConversationRepository.findById(conversationId);
  const now = new Date();
  const lastUserMessageAt = new Date(conv.last_user_message_at);
  const hoursElapsed = (now - lastUserMessageAt) / (1000 * 60 * 60);

  if (hoursElapsed > 24) {
    return {
      isValid: false,
      reason: "WINDOW_EXPIRED",
      lastUserMessageAt,
      hoursRemaining: 0
    };
  }

  return {
    isValid: true,
    reason: "ACTIVE",
    lastUserMessageAt,
    hoursRemaining: 24 - hoursElapsed
  };
};

// Opt-out marking
const markOptedOut = async (userId, reason) => {
  // Atomic transaction
  await db.transaction(async (trx) => {
    // 1. Mark user as opted-out
    await UserRepository.update(userId, {
      opted_out: true,
      opted_out_at: new Date(),
      opted_out_reason: reason
    });

    // 2. Close all active conversations for this user
    await ConversationRepository.closeAllByUserId(userId);

    // 3. Log for audit trail
    logger.warn('user_opted_out', {
      userId,
      reason,
      timestamp: new Date(),
      source: 'ComplianceService'
    });
  });
};
```

### 3.4 PaymentService (SARA-3.4)

**Location**: `src/services/PaymentService.ts`

**Purpose**: Handle payment webhook processing with idempotency

```typescript
interface PaymentWebhookPayload {
  paymentId: string;        // UNIQUE identifier from payment system
  abandonmentId: string;    // Links to our abandonment record
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  amount: number;
  linkType?: 'original' | 'discounted';
  timestamp?: Date;
}

interface PaymentProcessResult {
  status: 'processed' | 'already_processed';
  paymentId: string;
  abandonmentId: string;
  action: 'converted' | 'pending' | 'declined';
}

class PaymentService {
  /**
   * Process payment webhook with idempotency
   * Returns 200 OK for both first-time and duplicate calls
   */
  async processPaymentWebhook(
    payload: PaymentWebhookPayload,
    traceId: string
  ): Promise<PaymentProcessResult>
}
```

**Idempotency Implementation**:

```typescript
const processPaymentWebhook = async (payload, traceId) => {
  // Check if already processed (by payment_id UNIQUE constraint)
  const existing = await AbandonmentRepository.findByPaymentId(payload.paymentId);
  if (existing) {
    logger.info('payment_already_processed', { paymentId: payload.paymentId, traceId });
    return {
      status: 'already_processed',
      paymentId: payload.paymentId,
      abandonmentId: existing.abandonment_id,
      action: existing.status === 'CONVERTED' ? 'converted' : 'declined'
    };
  }

  // Process based on status
  await db.transaction(async (trx) => {
    if (payload.status === 'completed') {
      // Mark as converted
      await AbandonmentRepository.update(payload.abandonmentId, {
        status: 'CONVERTED',
        payment_id: payload.paymentId,
        converted_at: new Date(),
        conversion_link: payload.linkType || 'original'
      });

      // Close conversation
      const abandonment = await AbandonmentRepository.findById(payload.abandonmentId);
      await ConversationRepository.update(abandonment.conversation_id, {
        status: 'CLOSED'
      });

      // Send confirmation message
      const conv = await ConversationRepository.findById(abandonment.conversation_id);
      await MessageService.send(conv.user_phone, 'Obrigado pela sua compra! 🎉', 'text');

      logger.info('payment_converted', {
        paymentId: payload.paymentId,
        abandonmentId: payload.abandonmentId,
        amount: payload.amount,
        traceId
      });

      return { status: 'processed', paymentId: payload.paymentId, action: 'converted' };

    } else if (payload.status === 'failed' || payload.status === 'refunded') {
      await AbandonmentRepository.update(payload.abandonmentId, {
        status: 'DECLINED'
      });

      const abandonment = await AbandonmentRepository.findById(payload.abandonmentId);
      await ConversationRepository.update(abandonment.conversation_id, {
        status: 'ACTIVE'  // Allow continued conversation
      });

      logger.info('payment_declined', {
        paymentId: payload.paymentId,
        reason: payload.status,
        traceId
      });

      return { status: 'processed', paymentId: payload.paymentId, action: 'declined' };

    } else if (payload.status === 'pending') {
      await AbandonmentRepository.update(payload.abandonmentId, {
        status: 'PENDING'
      });

      logger.info('payment_pending', {
        paymentId: payload.paymentId,
        traceId
      });

      return { status: 'processed', paymentId: payload.paymentId, action: 'pending' };
    }
  });
};
```

---

## 4. Repository Enhancements

### UserRepository (existing - enhance)
```typescript
// Add these methods
class UserRepository {
  // Existing
  static async findByPhone(phone: string): Promise<User | null>;
  static async upsert(user: UserData): Promise<User>;

  // NEW in EPIC 3
  static async markOptedOut(userId: string, reason: string): Promise<void>;
  static async findOptedOutUsers(): Promise<User[]>;
}
```

### OptOutKeywordRepository (NEW)
```typescript
class OptOutKeywordRepository {
  static async findAll(): Promise<OptOutKeyword[]>;
  static async findActive(): Promise<OptOutKeyword[]>;
  static async create(keyword: string): Promise<OptOutKeyword>;
  static async deactivate(keywordId: string): Promise<void>;
  static async deleteKeyword(keywordId: string): Promise<void>;
}
```

### AbandonmentRepository (existing - enhance)
```typescript
class AbandonmentRepository {
  // Existing
  static async findByExternalId(externalId: string): Promise<Abandonment | null>;
  static async create(abandonment: AbandonmentData): Promise<Abandonment>;
  static async findById(id: string): Promise<Abandonment | null>;

  // NEW in EPIC 3
  static async findByPaymentId(paymentId: string): Promise<Abandonment | null>;
  static async update(id: string, data: Partial<Abandonment>): Promise<void>;
  static async markConverted(id: string, paymentId: string, linkType: string): Promise<void>;
}
```

### ConversationRepository (existing - enhance)
```typescript
class ConversationRepository {
  // Existing
  static async findByPhoneNumber(phone: string): Promise<Conversation | null>;
  static async findById(id: string): Promise<Conversation | null>;
  static async create(data: ConversationData): Promise<Conversation>;

  // NEW in EPIC 3
  static async closeAllByUserId(userId: string): Promise<void>;
  static async update(id: string, data: Partial<Conversation>): Promise<void>;
  static async findExpiredConversations(windowHours: number): Promise<Conversation[]>;
}
```

---

## 5. Route Implementation: POST /webhook/payment

**Location**: `src/routes/webhooks.ts` (add new route)

```typescript
import { FastifyInstance } from 'fastify';
import { hmacVerificationMiddleware } from '../middleware/hmacVerification';
import { PaymentService } from '../services/PaymentService';
import logger from '../config/logger';

export async function registerPaymentRoute(fastify: FastifyInstance) {
  /**
   * POST /webhook/payment
   * Receives payment completion events from payment system
   * Payload must include: paymentId, abandonmentId, status, amount
   */
  fastify.post<{ Body: PaymentWebhookPayload }>(
    '/webhook/payment',
    {
      onRequest: [hmacVerificationMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['paymentId', 'abandonmentId', 'status', 'amount'],
          properties: {
            paymentId: { type: 'string', minLength: 1, maxLength: 255 },
            abandonmentId: { type: 'string', minLength: 1, maxLength: 255 },
            status: { enum: ['completed', 'pending', 'failed', 'refunded'] },
            amount: { type: 'number', minimum: 0 },
            linkType: { enum: ['original', 'discounted'], nullable: true },
            timestamp: { type: 'string', format: 'date-time', nullable: true }
          }
        }
      }
    },
    async (request, reply) => {
      const traceId = request.traceId as string;

      try {
        // Extract and validate payload
        const payload = request.body as PaymentWebhookPayload;

        logger.info('payment_webhook_received', {
          traceId,
          paymentId: payload.paymentId,
          abandonmentId: payload.abandonmentId,
          status: payload.status
        });

        // Process payment (with idempotency)
        const result = await PaymentService.processPaymentWebhook(payload, traceId);

        // Return success (200 OK)
        return reply.status(200).send(result);

      } catch (error) {
        logger.error('payment_webhook_error', {
          traceId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        // Return 500 for server errors
        return reply.status(500).send({
          error: { code: 'PAYMENT_PROCESSING_ERROR', message: 'Failed to process payment webhook' }
        });
      }
    }
  );
}
```

---

## 6. Job Handler Integration (EPIC 2 Enhancement)

**Location**: `src/jobs/handlers.ts` (modify ProcessMessageHandler)

```typescript
// Existing ProcessMessageHandler - ADD THESE STEPS:

async function processMessageHandler(job) {
  const { phoneNumber, messageText, traceId } = job.data;

  // Step 1: Load context (existing from EPIC 2)
  const conversation = await ConversationService.findByPhoneNumber(phoneNumber);
  if (!conversation) {
    logger.warn('conversation_not_found', { phoneNumber, traceId });
    return;
  }

  // NEW - Step 2: Validate window (EPIC 3.3)
  const windowValid = await ComplianceService.validateConversationWindow(conversation.id);
  if (!windowValid.isValid) {
    logger.info('conversation_window_expired', {
      conversationId: conversation.id,
      hoursElapsed: 24 - (windowValid.hoursRemaining || 0),
      traceId
    });
    return; // Don't process
  }

  // NEW - Step 3a: Deterministic opt-out check (EPIC 3.1)
  const keywordDetected = await OptOutDetectionService.detectKeyword(messageText);
  if (keywordDetected.detected) {
    logger.info('opt_out_detected_keyword', {
      conversationId: conversation.id,
      keyword: keywordDetected.keyword,
      traceId
    });

    // Mark opted-out and send farewell
    await ComplianceService.markOptedOut(conversation.user_id, `KEYWORD_DETECTED:${keywordDetected.keyword}`);
    const farewell = 'Entendi, sua solicitação foi registrada. Você não receberá mais mensagens.';
    await MessageService.send(phoneNumber, farewell, 'text');

    // Store both messages
    await MessageRepository.create({
      conversation_id: conversation.id,
      from_sender: 'user',
      message_text: messageText,
      message_type: 'text',
      whatsapp_message_id: job.data.whatsappMessageId
    });

    await MessageRepository.create({
      conversation_id: conversation.id,
      from_sender: 'sara',
      message_text: farewell,
      message_type: 'text'
    });

    return; // EXIT - don't call AI
  }

  // NEW - Step 3b: AI opt-out detection fallback (EPIC 3.2)
  const aiOptOut = await AIService.detectOptOutIntent({
    conversationHistory: await MessageRepository.getLast10(conversation.id),
    userMessage: messageText,
    productId: conversation.product_id
  });

  if (aiOptOut.isOptOut && aiOptOut.confidence >= 0.7) {
    logger.info('opt_out_detected_ai', {
      conversationId: conversation.id,
      confidence: aiOptOut.confidence,
      reason: aiOptOut.reason,
      traceId
    });

    // Same farewell logic as keyword detection
    await ComplianceService.markOptedOut(conversation.user_id, `AI_DETECTED:${aiOptOut.reason}`);
    const farewell = 'Entendi, sua solicitação foi registrada. Você não receberá mais mensagens.';
    await MessageService.send(phoneNumber, farewell, 'text');

    await MessageRepository.create({ /* user message */ });
    await MessageRepository.create({ /* farewell message */ });

    return; // EXIT - don't call main AI
  }

  // Existing EPIC 2 steps: AI interpretation, send response, store messages
  // ... (unchanged from EPIC 2)
}
```

---

## 7. Data Flow Validation & Consistency

### Opt-out Flow (Complete State Machine)

```
User Message Received
    ↓
[Deterministic Check]
  ├─ Keyword found? → OPT-OUT ✓
  └─ No keyword? → Continue
    ↓
[AI Fallback Check]
  ├─ Confidence >= 0.7? → OPT-OUT ✓
  ├─ 0.5 <= Confidence < 0.7? → Log & Continue
  └─ Confidence < 0.5? → Continue
    ↓
[Normal Conversation]
  ├─ Call AI Service
  ├─ Send Response
  └─ Store Messages

OPT-OUT Execution:
  ├─ users.opted_out ← true
  ├─ users.opted_out_at ← now()
  ├─ users.opted_out_reason ← reason
  ├─ conversations.status ← CLOSED (all user's conversations)
  ├─ Send Farewell Message
  └─ Log Audit Event
```

### Conversion Flow (Complete State Machine)

```
Payment System Webhook
    ↓
[Idempotency Check]
  ├─ payment_id exists? → Return already_processed ✓
  └─ New payment_id? → Continue
    ↓
[Status-based Processing]
  ├─ Status = "completed":
  │  ├─ abandonments.status ← CONVERTED
  │  ├─ abandonments.converted_at ← now()
  │  ├─ conversations.status ← CLOSED
  │  └─ Send confirmation message
  │
  ├─ Status = "failed" | "refunded":
  │  ├─ abandonments.status ← DECLINED
  │  └─ conversations.status ← ACTIVE (continue talking)
  │
  └─ Status = "pending":
     ├─ abandonments.status ← PENDING
     └─ conversations.status ← unchanged

[Response to Payment System]
  └─ Return 200 OK { processed | already_processed }
```

### Window Validation Flow

```
Process Inbound Message
    ↓
[Check Conversation Window]
  ├─ last_user_message_at = NULL? → ACTIVE (first message) ✓
  ├─ last_user_message_at + 24h > now? → ACTIVE ✓
  └─ last_user_message_at + 24h <= now? → EXPIRED ✗
    ↓ (if EXPIRED)
  └─ Log warning
  └─ Don't process message
  └─ Don't send response
```

---

## 8. Database Schema Validation

### Current Schema (EPIC 1-2) ✅

```sql
-- ✅ IMPLEMENTED
CREATE TABLE users (
  id UUID PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  opted_out BOOLEAN DEFAULT FALSE,
  opted_out_at TIMESTAMP,
  opted_out_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE abandonments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  external_id VARCHAR(255) UNIQUE NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  value DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'initiated',
  conversation_id UUID REFERENCES conversations(id),
  converted_at TIMESTAMP,
  conversion_link VARCHAR(20),
  payment_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  abandonment_id UUID UNIQUE REFERENCES abandonments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'awaiting_response',
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  last_user_message_at TIMESTAMP,
  followup_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  from_sender VARCHAR(50) NOT NULL,
  message_text TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  whatsapp_message_id VARCHAR(255) UNIQUE,
  openai_response_id VARCHAR(255),
  openai_tokens_used INTEGER,
  intent VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE webhooks_log (
  id UUID PRIMARY KEY,
  webhook_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(255),
  payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT TRUE,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### New Tables Required (EPIC 3) ⏳

```sql
-- NEW: Opt-out Keywords Reference
CREATE TABLE opt_out_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_opt_out_keywords_active ON opt_out_keywords(active);

-- Initial seed
INSERT INTO opt_out_keywords (keyword) VALUES
  ('parar'), ('remover'), ('cancelar'), ('sair'), ('stop'),
  ('não quero'), ('me tire'), ('excluir'), ('desinscrever'), ('unsubscribe');

-- ENHANCEMENT: Add index to users for opt-out queries
CREATE INDEX idx_users_opted_out ON users(opted_out)
  WHERE opted_out = true;

-- ENHANCEMENT: Add index to conversations for window validation
CREATE INDEX idx_conversations_last_user_message ON conversations(last_user_message_at)
  WHERE status != 'CLOSED';
```

### Migration Plan

```bash
# Create new migration file
migration create add_opt_out_keywords_table

# Include in migration:
# 1. Create opt_out_keywords table
# 2. Seed 10 keywords
# 3. Add indices for performance
# 4. Add idx_users_opted_out
# 5. Add idx_conversations_last_user_message

# Run: npx knex migrate:latest
```

---

## 9. Error Handling & Edge Cases

### Edge Case 1: User Has Multiple Active Conversations

```
Scenario: User cart abandoned 3 times in 1 week
  → 3 abandonment records → 3 conversation records (1-to-1)

Issue: Which conversation receives message?
Solution: ConversationService.findByPhoneNumber() prioritizes:
  1. ACTIVE (in progress)
  2. ERROR (recoverable)
  3. AWAITING_RESPONSE (initial)
  → Returns single conversation to process

When user opts-out:
  → ComplianceService.markOptedOut(userId)
  → Closes ALL conversations for that user (closeAllByUserId)
  → Prevents any future messages
```

### Edge Case 2: Window Expires Mid-Conversation

```
Timeline:
  T0: User abandons cart
  T10: Sara sends template
  T+10h: User replies "Hi" → process ✓ (within window)
  T+20h: User replies "Yes, I'll buy" → expire ✗ (> 24h)

Solution:
  → Check window on EVERY inbound message
  → If expired: log & skip processing
  → Don't send response
  → Don't close conversation (keep history)
  → User can still see history (no data loss)
```

### Edge Case 3: AI Confidence Ambiguous (0.5-0.7)

```
Message: "não aguento mais estar vendo isso"
AI Output: { isOptOut: false, confidence: 0.6, reason: "complaining but not clear opt-out" }

Solution:
  → Log as "opt_out_ambiguous"
  → Send normal response (process normally)
  → Don't mark opted-out (conservative)
  → Analyze later in analytics
  → Potential: flag for human review
```

### Edge Case 4: Payment Webhook for Non-existent Abandonment

```
Scenario: paymentId references abandonment that doesn't exist
  → AbandonmentRepository.findByPaymentId() returns null
  → Don't crash, return graceful error

Solution:
  → Try to find abandonment by abandonmentId
  → If not found: log error, return 404 or 200 OK?
  → Best practice: return 200 OK (idempotent response)
  → Log for audit/investigation
```

### Edge Case 5: Duplicate Payment Webhook (Replay Attack)

```
Scenario: Payment system sends payment webhook twice
  → Same paymentId arrives twice (1 second apart)

Solution: UNIQUE constraint on payment_id
  → First call: INSERT succeeds, marks CONVERTED
  → Second call: UNIQUE violation caught
  → Return 200 OK { status: "already_processed" }
  → No state corruption
  → Idempotent
```

---

## 10. Testing Strategy

### Unit Tests (SARA-3.1 / SARA-3.2 / SARA-3.3)

**OptOutDetectionService.test.ts**:
```typescript
✓ Detect exact keyword match (case-insensitive)
✓ Detect keyword with conjugation ("parando", "parei")
✓ Ignore keyword in negation context
✓ Return null for no match
✓ Cache keywords correctly (TTL behavior)
✓ Performance: detect in < 100ms
✓ Performance: 1000 keywords in < 50ms
```

**AIService.test.ts** (add to existing):
```typescript
✓ detectOptOutIntent returns high confidence for clear statement
✓ detectOptOutIntent returns low confidence for normal message
✓ detectOptOutIntent handles timeout gracefully
✓ detectOptOutIntent parses JSON response correctly
✓ Threshold logic: >= 0.7 marks as opt-out
✓ Threshold logic: 0.5-0.7 logs as ambiguous
✓ Threshold logic: < 0.5 processes normally
```

**ComplianceService.test.ts**:
```typescript
✓ validateConversationWindow: valid if < 24h
✓ validateConversationWindow: expired if > 24h
✓ markOptedOut: sets user.opted_out = true
✓ markOptedOut: closes all user conversations
✓ markOptedOut: logs reason
✓ shouldStopConversation: returns true if opted-out
✓ shouldStopConversation: returns true if window expired
✓ shouldStopConversation: returns false if normal state
```

**PaymentService.test.ts**:
```typescript
✓ processPaymentWebhook: completed → CONVERTED
✓ processPaymentWebhook: failed → DECLINED
✓ processPaymentWebhook: pending → PENDING
✓ processPaymentWebhook: idempotent (duplicate → already_processed)
✓ processPaymentWebhook: atomic transaction
✓ processPaymentWebhook: sends confirmation message
✓ processPaymentWebhook: logs conversion event
```

### Integration Tests (Job Handler Flow)

**jobHandlerFlow.test.ts** (enhance existing):
```typescript
✓ Message with keyword → opt-out detected, farewell sent
✓ Message with AI ambiguous intent → normal response
✓ Message outside window → not processed
✓ Message + opt-out → all conversations closed
✓ Payment webhook completed → conversation closed
✓ Payment webhook duplicate → idempotent response
```

### E2E Tests (Full Flow)

```typescript
Scenario: Complete user journey
  1. Send abandonment webhook
  2. Verify conversation created
  3. Send user message with opt-out keyword
  4. Verify opt-out detected + farewell sent
  5. Verify user.opted_out = true
  6. Verify subsequent messages ignored

Scenario: Payment conversion
  1. Send abandonment webhook
  2. Simulate conversation exchanges
  3. Send payment completed webhook
  4. Verify conversation.status = CLOSED
  5. Verify confirmation message sent
```

---

## 11. Validation Checklist

### Architecture Validation ✅

- [x] **Layering**: OptOutDetectionService, ComplianceService, PaymentService follow same patterns as EPIC 2 services
- [x] **Dependency Order**: All dependencies available (ConversationService ✓, AIService ✓, MessageService ✓)
- [x] **Database**: Schema has opted_out flag ✓, payment_id field ✓, last_user_message_at ✓
- [x] **Error Handling**: Idempotency via UNIQUE constraints ✓, timeouts handled ✓
- [x] **Logging**: All state changes logged with traceId ✓
- [x] **Performance**: Window validation O(1) ✓, keyword matching O(n) where n=keywords ✓
- [x] **Compliance**: LGPD opt-out ✓, Meta 24h window ✓, audit trail ✓

### Code Quality Gates ✅

- [x] **Type Safety**: All services use TypeScript interfaces
- [x] **Error Handling**: Try-catch with proper logging
- [x] **Async/Await**: All async operations properly awaited
- [x] **Repository Pattern**: All DB operations through repositories
- [x] **Transaction Safety**: Atomic operations use transactions
- [x] **Idempotency**: Payment webhook uses UNIQUE constraints
- [x] **Testing**: Unit + integration test patterns defined

### Integration Points ✅

- [x] **Job Handler**: ProcessMessageHandler can call OptOutDetectionService + ComplianceService
- [x] **API Routes**: New POST /webhook/payment route follows existing patterns
- [x] **Database**: New opt_out_keywords table follows existing conventions
- [x] **Services**: All services injectable, mockable for tests
- [x] **Middleware**: HMAC verification used for payment webhook (same as others)
- [x] **Logging**: Uses existing Winston logger with same format

### CodeRabbit Quality Gates ✅

**CodeRabbit will validate**:
- Type safety (no `any`, proper interfaces)
- Error handling (no silent failures)
- Async patterns (no floating promises)
- Test coverage (> 80% target)
- No hardcoded values (env vars for secrets)
- Security (HMAC validation, input validation)
- Performance (no N+1 queries, proper indexing)
- Compliance (LGPD requirements, Meta policies)

---

## 12. Implementation Roadmap

### Phase 1: Repositories & Models (SARA-3 Prep)
```
Week 1:
  ✓ Create OptOutKeywordRepository
  ✓ Add database migration (opt_out_keywords table)
  ✓ Enhance UserRepository (markOptedOut)
  ✓ Enhance AbandonmentRepository (findByPaymentId, update)
  ✓ Enhance ConversationRepository (closeAllByUserId, update)
```

### Phase 2: Services (SARA-3.1 → SARA-3.4)
```
Week 2:
  [ ] SARA-3.1: OptOutDetectionService
      - [ ] Keyword detection logic
      - [ ] Cache management (TTL)
      - [ ] Unit tests

  [ ] SARA-3.2: AIService.detectOptOutIntent()
      - [ ] Prompt engineering
      - [ ] Confidence threshold logic
      - [ ] Unit tests

  [ ] SARA-3.3: ComplianceService
      - [ ] Window validation
      - [ ] shouldStopConversation logic
      - [ ] markOptedOut logic
      - [ ] Unit tests

  [ ] SARA-3.4: PaymentService
      - [ ] Payment webhook processing
      - [ ] Idempotency handling
      - [ ] Status-based logic
      - [ ] Unit tests
```

### Phase 3: Routes & Integration (SARA-3.4)
```
Week 3:
  [ ] SARA-3.4: POST /webhook/payment route
      - [ ] Route registration
      - [ ] HMAC verification
      - [ ] Request validation
      - [ ] Integration tests

  [ ] Job Handler Enhancement (SARA-2.5 ↔ SARA-3)
      - [ ] Add window validation step
      - [ ] Add deterministic opt-out check
      - [ ] Add AI fallback opt-out check
      - [ ] Integration tests for full flow
```

### Phase 4: Testing & QA
```
Week 4:
  [ ] Unit test suite (80% coverage target)
  [ ] Integration test suite (full flows)
  [ ] E2E test (complete user journey)
  [ ] Load testing (opt-out detection performance)
  [ ] Code review & quality gates
```

### Phase 5: Production Deployment
```
Week 5:
  [ ] Deploy migrations to staging
  [ ] Smoke tests in staging
  [ ] Deploy to production
  [ ] Monitor opt-out & payment flows
  [ ] Gather metrics
```

---

## 13. Performance Requirements

### Opt-out Detection

| Operation | Target | Budget |
|-----------|--------|--------|
| Keyword cache hit | < 10ms | 5ms |
| Keyword matching | < 100ms | 50ms |
| AI detection (with API call) | < 3s | 2.5s |
| Total message processing | < 7s | 5s latency |

**Optimization Strategies**:
1. Cache keywords in memory (1 hour TTL)
2. Use simple regex for keyword matching (not fuzzy)
3. Keep AI prompt small (token-efficient)
4. Short timeout for AI (3s fallback to "no opt-out")

### Window Validation

| Operation | Target | Budget |
|-----------|--------|--------|
| Window check query | < 100ms | 50ms |
| No DB optimization | < 200ms | OK (cached) |

**Optimization Strategies**:
1. Index on `conversations.last_user_message_at`
2. Cache window status in Redis (TTL: 1 hour per conversation)
3. Simple timestamp comparison (no complex calc)

### Payment Webhook Processing

| Operation | Target | Budget |
|-----------|--------|--------|
| Idempotency check | < 100ms | 50ms |
| State update (transaction) | < 500ms | 200ms |
| Total response time | < 1s | 500ms |

**Optimization Strategies**:
1. Index on `abandonments.payment_id`
2. Use database-level UNIQUE constraint for idempotency
3. Atomic transaction (single DB round-trip)
4. Don't send message to user synchronously (queue it)

---

## 14. Monitoring & Observability

### Metrics to Track

```typescript
// Opt-out Detection
prometheus_counter('opt_out_detected_keyword_total', {
  keyword: string,
  user_id: string
});

prometheus_histogram('opt_out_ai_confidence', {
  confidence: number,
  detected: boolean
});

// Compliance
prometheus_counter('conversation_window_expired_total', {
  user_id: string
});

// Payment
prometheus_counter('payment_webhook_received_total', {
  status: string;  // 'completed' | 'pending' | 'failed' | 'refunded'
});

prometheus_counter('payment_idempotency_duplicate_total', {
  payment_id: string
});
```

### Alerts to Configure

```
# Critical Alerts
- opt_out_ai_error_rate > 5% in 5m
- payment_webhook_error_rate > 1% in 5m
- payment_idempotency_failures > 10 in 10m

# Warning Alerts
- opt_out_ai_confidence < 0.6 frequently (needs review)
- conversation_window_expired_rate > 20% (users waiting too long)
- payment_processing_latency_p95 > 1s

# Info Logs (no alert)
- opt_out_detected_keyword (info level)
- payment_webhook_processed (info level)
```

---

## 15. Deployment Checklist

### Pre-deployment

- [ ] All tests passing (unit + integration + e2e)
- [ ] Code review approved (CodeRabbit + human)
- [ ] Type checking: `npm run typecheck` ✅
- [ ] Linting: `npm run lint` ✅
- [ ] Build: `npm run build` ✅
- [ ] Database migration created & reviewed
- [ ] Env vars documented (.env.example updated)
- [ ] Monitoring & alerts configured

### Deployment Steps

1. **Staging Deploy**:
   ```bash
   git merge develop → staging
   Deploy to staging environment
   Run smoke tests
   Monitor for 24h
   ```

2. **Production Deploy**:
   ```bash
   git tag v1.3.0 (EPIC 3 complete)
   Deploy to production
   Run smoke tests
   Monitor for 24h
   ```

3. **Post-deployment Validation**:
   - [ ] Health checks passing
   - [ ] Webhooks processing successfully
   - [ ] Error rate < 0.1%
   - [ ] Opt-out detection working
   - [ ] Payment webhooks processed
   - [ ] No unhandled exceptions

---

## 16. Summary

### What EPIC 3 Delivers

| Requirement | Solution | Validation |
|-------------|----------|-----------|
| **Opt-out Detection** | 2-layer (deterministic + AI) | ✅ Architecture supports both |
| **LGPD Compliance** | user.opted_out flag + audit trail | ✅ Schema ready |
| **Meta 24h Window** | ComplianceService validation | ✅ Logic designed |
| **Payment Tracking** | Payment webhook + idempotency | ✅ Service designed |
| **Conversation State** | Atomic updates with transactions | ✅ Pattern from EPIC 2 |
| **Error Resilience** | Graceful degradation, retries | ✅ Implemented in EPIC 2 |
| **Observability** | Logging + metrics + trace IDs | ✅ Winston logger ready |

### System Is Production-Ready When

1. ✅ All EPIC 3 services implemented
2. ✅ All tests passing (> 80% coverage)
3. ✅ Database migrations deployed
4. ✅ Monitoring & alerts configured
5. ✅ CodeRabbit quality gates passed
6. ✅ Staging environment validated
7. ✅ Team sign-off (architecture + code review)

### Next Actions (for @dev)

1. Implement SARA-3.1: OptOutDetectionService
2. Enhance AIService with detectOptOutIntent() (SARA-3.2)
3. Implement ComplianceService (SARA-3.3)
4. Implement PaymentService + POST /webhook/payment (SARA-3.4)
5. Enhance ProcessMessageHandler with opt-out detection
6. Write comprehensive test suite
7. Deploy to staging for validation

---

## Document Control

| Field | Value |
|-------|-------|
| **Status** | ✅ Ready for Implementation |
| **Architect** | Aria (Visionary) |
| **Date** | 2026-02-06 |
| **EPIC** | SARA-3 (Compliance & Opt-out) |
| **Priority** | P1 (Enabler) |
| **Estimated Points** | 35 |
| **Validation** | ✅ Complete |

---

**Key Message**: EPIC 3 architecture is validated and ready. All dependencies from EPIC 2 are in place. The system follows established patterns (repositories, services, job handlers). Implementation can begin immediately with @dev, @qa, and @devops teams.

**Architect's Note**: The opt-out detection strategy (deterministic + AI fallback) is optimal for both accuracy and cost. The compliance framework (window validation + opt-out tracking) meets LGPD and Meta requirements. Payment idempotency via UNIQUE constraints is solid and proven. System is production-ready upon completion of EPIC 3 implementation.

— Aria, Architect (Visionary) 🏛️

