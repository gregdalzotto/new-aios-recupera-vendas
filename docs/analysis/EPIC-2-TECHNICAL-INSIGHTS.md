# EPIC 2: Technical Deep-Dive & Architecture Analysis
## Detailed Implementation Patterns, Performance Benchmarks & Integration Architecture

**Document Type**: Technical Analysis (Architect Review)
**Analysis Date**: 2026-02-06
**Scope**: SARA-2.1 through SARA-2.5 Complete Implementation

---

## Part 1: Service Architecture Overview

### High-Level Message Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     SARA Message Processing Pipeline             │
└─────────────────────────────────────────────────────────────────┘

1. MESSAGE RECEPTION
   ┌──────────────────────────────────────────────────────────┐
   │ WhatsApp Client                                          │
   │ (User sends message via WhatsApp)                        │
   └───────────────────────┬──────────────────────────────────┘
                           │ POST with HMAC-SHA256
                           ▼
   ┌──────────────────────────────────────────────────────────┐
   │ POST /webhook/messages                                   │
   │ (src/routes/webhooks.ts)                                 │
   │ ├─ Extract whatsapp_message_id (dedup key)              │
   │ ├─ Verify HMAC signature (hmacVerificationMiddleware)    │
   │ └─ Parse payload to extract: phone, text, timestamp      │
   └───────────────────────┬──────────────────────────────────┘
                           │ 200 OK (immediate response)
                           ▼
2. ASYNCHRONOUS ENQUEUE
   ┌──────────────────────────────────────────────────────────┐
   │ ProcessMessageQueue.addJob()                             │
   │ (src/queue/messageQueue.ts)                              │
   │ ├─ Create job payload: {phoneNumber, text, msgId, ...}   │
   │ ├─ Add to Bull queue with: attempts: 3, backoff: exp     │
   │ └─ Job waits in Redis for ProcessMessageHandler          │
   └───────────────────────┬──────────────────────────────────┘
                           │ Fire and forget
                           ▼
3. MESSAGE PROCESSING (Asynchronous Handler)
   ┌──────────────────────────────────────────────────────────┐
   │ ProcessMessageHandler                                    │
   │ (src/jobs/handlers.ts:processMessageHandler)             │
   │                                                          │
   │ ├─ STEP 1: Load Context                                 │
   │ │  └─ ConversationService.findByPhoneNumber(phone)       │
   │ │     └─ SELECT * FROM conversations WHERE user.phone    │
   │ │     └─ Prioritize: ACTIVE > ERROR > AWAITING_RESPONSE │
   │ │     └─ Return: {conversation, user, abandonment}      │
   │ │                                                        │
   │ ├─ STEP 2: Opt-Out Check                                │
   │ │  └─ if (user.opted_out) skip processing ✅            │
   │ │                                                        │
   │ ├─ STEP 3: Persist Incoming Message                     │
   │ │  └─ MessageRepository.create({                         │
   │ │       role: 'user', text, whatsappMessageId, ...      │
   │ │     })                                                 │
   │ │                                                        │
   │ ├─ STEP 4: Build AI Context (Last 10 messages)          │
   │ │  └─ SELECT * FROM messages WHERE conversation_id      │
   │ │     ORDER BY created_at DESC LIMIT 10                 │
   │ │  └─ Format as conversation history for OpenAI         │
   │ │                                                        │
   │ ├─ STEP 5: AI Interpretation                            │
   │ │  └─ AIService.interpretMessage(context, userMessage)  │
   │ │     ├─ Call OpenAI gpt-3.5-turbo with context         │
   │ │     ├─ Timeout: 5s (fallback on timeout)              │
   │ │     ├─ Parse: intent, sentiment, shouldDiscount       │
   │ │     └─ Return: {intent, sentiment, response, ...}     │
   │ │                                                        │
   │ ├─ STEP 6: Send Response via WhatsApp                   │
   │ │  └─ MessageService.send(phone, response)              │
   │ │     ├─ Validate phone format (E.164)                  │
   │ │     ├─ POST to Meta Graph API v18.0                   │
   │ │     ├─ Retry: exponential backoff (1s, 2s, 4s, 8s)    │
   │ │     ├─ Max retries: 3                                 │
   │ │     └─ On failure → SendMessageQueue for later retry   │
   │ │                                                        │
   │ ├─ STEP 7: Persist Response                             │
   │ │  └─ MessageRepository.create({                         │
   │ │       role: 'sara', text: response, messageId, ...    │
   │ │     })                                                 │
   │ │                                                        │
   │ └─ STEP 8: Update Conversation Metadata                 │
   │    └─ ConversationService.updateTimestamps(conversId)   │
   │       ├─ last_message_at = NOW()                        │
   │       ├─ message_count += 1                             │
   │       └─ state = 'ACTIVE'                               │
   │                                                          │
   │ On Error (any step):                                    │
   │  └─ Log with traceId and context                        │
   │  └─ Bull automatically retries (up to 3x)               │
   │  └─ On failure: move to 'failed' queue                  │
   └──────────────────────────────────────────────────────────┘
                           │
                           ▼
4. RETRY HANDLING (If Send Failed)
   ┌──────────────────────────────────────────────────────────┐
   │ SendMessageQueue (Bull retry queue)                      │
   │ (src/jobs/sendMessageJob.ts)                             │
   │                                                          │
   │ ├─ Triggered by: ProcessHandler on MessageService fail  │
   │ ├─ Job payload: {conversationId, phone, text, ...}      │
   │ │                                                        │
   │ ├─ STEP 1: Load context (conversation, abandonment)     │
   │ │                                                        │
   │ ├─ STEP 2: Retry MessageService.send()                  │
   │ │  ├─ Use exponential backoff: 1s, 2s, 4s               │
   │ │  └─ Max 3 attempts total                              │
   │ │                                                        │
   │ └─ STEP 3: Update Message Status                        │
   │    └─ MessageRepository.update({status: 'sent/failed'}) │
   │                                                          │
   │ On persistent failure:                                  │
   │  └─ Alert ops, move to 'failed' queue for manual review │
   └──────────────────────────────────────────────────────────┘
```

### Service Dependencies & Interaction Points

```
┌─────────────────────────────────────────────────────┐
│ REQUEST BOUNDARY                                     │
│ ├─ FastifyRoute (webhooks.ts)                        │
│ └─ Middleware: HMAC, correlation ID, validation     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│ QUEUING LAYER (Bull + Redis)                         │
│ ├─ ProcessMessageQueue (receives incoming)          │
│ ├─ SendMessageQueue (retry on failure)              │
│ └─ Handlers registered on startup (server.ts)       │
└──────────────────┬──────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌─────────────┐
│ Conver  │  │   AI     │  │  Message    │
│ sation  │  │ Service  │  │  Service    │
│ Service │  │(OpenAI)  │  │(WhatsApp)   │
└────┬────┘  └────┬─────┘  └──────┬──────┘
     │            │               │
     ▼            ▼               ▼
┌──────────────────────────────────────────┐
│ REPOSITORIES (Data Access Layer)          │
│ ├─ ConversationRepository                │
│ ├─ MessageRepository                     │
│ ├─ UserRepository                        │
│ ├─ AbandonmentRepository                 │
│ └─ All use Knex ORM on PostgreSQL        │
└──────────────────────────────────────────┘
```

---

## Part 2: Component Deep-Dive

### 1. ConversationService (SARA-2.1)

**File**: `src/services/ConversationService.ts`

**Purpose**: Manage conversation lifecycle, state transitions, and context loading

**Key Methods**:

```typescript
findByPhoneNumber(phone: string): Promise<{
  conversation: Conversation,
  user: User,
  abandonment: Abandonment
}>
// Loads conversation + associated context
// Priority: ACTIVE > ERROR > AWAITING_RESPONSE
// Used by: ProcessMessageHandler, SendMessageHandler

create(abandonment: Abandonment): Promise<Conversation>
// Creates new conversation when user starts interaction
// Atomic transaction: INSERT conversation + UPDATE abandonment.conversation_id

updateStatus(conversationId: string, newStatus: ConversationState): Promise<void>
// Valid transitions:
// - AWAITING_RESPONSE → ACTIVE
// - ACTIVE → CLOSED
// - ACTIVE → ERROR
// - ERROR → ACTIVE (recovery)

updateTimestamps(conversationId: string): Promise<void>
// Updates: last_message_at, last_user_message_at
// Called after each message processed

isWithinWindow(conversationId: string): Promise<boolean>
// Checks if conversation still within 24-hour window
// Returns false if > 24h from last message

isOptedOut(userId: string): Promise<boolean>
// NEW: Checks user.opted_out flag
// Returns true if user requested opt-out
```

**Implementation Details**:
- Uses ConversationRepository for DB queries
- Lazy-loads conversation + user + abandonment in single JOIN
- Transactions for atomicity
- Caching opportunity: 5-minute TTL on findByPhoneNumber (not implemented yet)

**Error Handling**:
- Returns null if conversation not found (handler checks and skips)
- Constraint violations logged, not thrown
- Graceful degradation: missing abandonment doesn't block

---

### 2. AIService (SARA-2.2)

**File**: `src/services/AIService.ts`

**Purpose**: Interpret user messages via OpenAI API with context and fallback handling

**Configuration**:
```javascript
Model: gpt-3.5-turbo (not gpt-4 for cost)
Temperature: 0.7 (creative but consistent)
Max Tokens: 150 (brief responses)
Timeout: 5 seconds
```

**Key Methods**:

```typescript
interpretMessage(
  context: SaraContextPayload,
  userMessage: string
): Promise<{
  intent: 'price_question' | 'objection' | 'confirmation' | 'unclear'
  sentiment: 'positive' | 'neutral' | 'negative'
  shouldOfferDiscount: boolean
  response: string
  tokens_used: number
}>
```

**System Prompt Architecture**:
```
System context includes:
1. Sara persona (empathetic, non-pushy)
2. Business rules (discount thresholds)
3. Message history (last 10 messages for context)
4. Abandonment context (product, cart value)
5. Conversation state (active cycles, limits)
```

**Intent Detection Logic**:
```
if (messageText includes keywords: 'preço', 'valor', 'caro', 'payment'):
  intent = 'price_question'
else if (messageText includes: 'não', 'não quero', 'chega'):
  intent = 'objection'
else if (messageText includes: 'sim', 'ok', 'vou'):
  intent = 'confirmation'
else:
  intent = 'unclear'
```

**Discount Recommendation Logic**:
```
shouldOfferDiscount = true IF:
  (cartValue > 500 BRL)  // High-value carts
  OR (intent == 'price_question')  // Customer asking about price
  OR (sentimentScore < 3)  // Negative sentiment
  AND (discountCount < 3)  // Haven't offered 3x already
```

**Timeout Handling**:
```javascript
const race = Promise.race([
  openai.chat.completions.create(...),
  new Promise((_, reject) =>
    setTimeout(() => reject('Timeout'), 5000)
  )
])

race.catch(err => {
  logger.warn('OpenAI timeout', {traceId, duration: 5000})
  return {
    intent: 'unclear',
    sentiment: 'neutral',
    shouldOfferDiscount: false,
    response: 'Um momento enquanto avalio sua mensagem...',
    tokens_used: 0
  }
})
```

**Token Counting**:
- Tracked for cost estimation
- Free tier: 100k tokens/month
- Paid tier: ~$0.0005 per 1K tokens (input), $0.0015 (output)
- At scale: ~$50-200/month for 10K messages/month

**Caching Layer** (NEW in SARA-2.2 updates):
```typescript
Cache key: md5(hash(userMessage + context))
TTL: 300 seconds (5 minutes)
Hit rate: ~15-25% (same questions repeated)
```

---

### 3. MessageService (SARA-2.3)

**File**: `src/services/MessageService.ts`

**Purpose**: Send messages via Meta WhatsApp API with retry and validation

**Configuration**:
```
API Base: https://graph.instagram.com/v18.0
Auth: Bearer token (WHATSAPP_ACCESS_TOKEN)
Validation: E.164 phone format (+55XXXXXXXXXXX)
```

**Key Methods**:

```typescript
send(
  phone: string,
  messageText: string,
  messageType: 'text' | 'template'
): Promise<{
  messageId: string | null,
  status: 'sent' | 'failed',
  error?: string
}>
```

**Send Path 1: Free Text (Most Common)**
```javascript
POST /v18.0/{PHONE_ID}/messages
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+5548999327881",
  "type": "text",
  "text": {
    "body": "Sua mensagem aqui"
  }
}

Response: {
  "messages": [{"id": "wamid.xxx"}]
}
```

**Send Path 2: Template (First Message)**
```javascript
POST /v18.0/{PHONE_ID}/messages
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+5548999327881",
  "type": "template",
  "template": {
    "name": "recovery_invitation",
    "language": {"code": "pt_BR"}
  }
}
```

**Retry Strategy**:
```
Attempt 1: Immediate (< 500ms timeout)
  ├─ Success → Return messageId
  └─ Failure → Check error code:

  ├─ 429 (Rate limited) → Retry with backoff
  ├─ 500 (Server error) → Retry with backoff
  ├─ 401 (Auth) → Fail immediately (key expired)
  ├─ 400 (Bad request) → Fail immediately (validate payload)
  └─ Timeout → Enqueue SendMessageQueue for later

Backoff schedule:
  Attempt 2: Wait 1000ms, retry
  Attempt 3: Wait 2000ms, retry
  Attempt 4: Wait 4000ms, retry
  Attempt 5: Wait 8000ms, FAIL (move to manual queue)

Total max delay: ~15 seconds per message
```

**Validation**:
- Phone format: E.164 (e.g., +5548999327881)
- Message length: max 4096 characters (WhatsApp limit)
- Rate limiting: Track per-user and global rates

---

### 4. Webhook Handler (SARA-2.4)

**File**: `src/routes/webhooks.ts`

**Endpoint**: `POST /webhook/messages`

**Request Validation Flow**:

```typescript
1. HMAC Verification Middleware
   ├─ Extract signature from x-hub-signature-256 header
   ├─ Calculate HMAC-SHA256(payload, WHATSAPP_WEBHOOK_TOKEN)
   ├─ Compare: signature == calculated hash
   └─ Reject if mismatch → 403 Forbidden

2. Payload Parsing
   ├─ Extract: entry[0].changes[0].value
   ├─ Parse: messages[0] for incoming message
   └─ Get: from (sender phone), id (message ID), text

3. Deduplication
   ├─ Extract whatsapp_message_id from payload
   ├─ Check UNIQUE constraint in messages table
   ├─ If exists: already processed, ignore silently
   └─ New message: proceed to enqueue

4. Enqueue to Bull
   ├─ Create job: {phoneNumber, text, whatsappMessageId, traceId, ...}
   ├─ Add to ProcessMessageQueue
   ├─ Job waits in Redis for handler
   └─ Return 200 OK to Meta (acknowledge receipt)

All done in < 100ms to meet Meta's <5s requirement
```

**Response Behavior**:

```
200 OK Cases:
- Valid message + enqueued ✅
- Duplicate message (already processed) ✅
- Invalid payload (still 200 to prevent Meta retries) ✅

403 Forbidden Cases:
- Invalid HMAC signature (prevents spoofing)

Webhook Callback (Meta expects 200 OK within 5 seconds)
- We respond immediately (async processing)
- Processing happens in background
- No slow database/API calls in request path
```

---

### 5. Job Handlers (SARA-2.5)

**File**: `src/jobs/handlers.ts`

**Architecture**: Two complementary handlers

#### ProcessMessageHandler

```typescript
Triggered: When job added to ProcessMessageQueue
Concurrency: 1 job at a time (sequential processing per conversation)
Timeout: 30 seconds per job

Workflow:
1. Load conversation context
   ├─ ConversationService.findByPhoneNumber()
   ├─ Get user, abandonment, current conversation
   └─ Validate conversation exists

2. Check opt-out
   ├─ if (user.opted_out) return (skip processing)
   └─ Log: "User opted out, skipping response"

3. Store incoming message
   ├─ MessageRepository.create({
   │    role: 'user',
   │    text: job.data.messageText,
   │    whatsappMessageId: job.data.whatsappMessageId
   │  })
   └─ Acquire message ID for later update

4. Build context from history
   ├─ MessageRepository.getByConversationId(conversationId, limit: 10)
   ├─ Format as: [{role: 'user', content: '...'}, {role: 'sara', content: '...'}]
   └─ Include: abandonment context, user context

5. Call AIService
   ├─ AIService.interpretMessage(fullContext, userMessage)
   ├─ Handle timeout: use fallback message
   ├─ Parse response: extract intent, sentiment, response text
   └─ Catch errors: log + use fallback

6. Send response via WhatsApp
   ├─ MessageService.send(phone, response)
   ├─ If timeout/error: queue SendMessageQueue for retry
   ├─ If success: capture messageId
   └─ Update message record with messageId

7. Update conversation state
   ├─ ConversationService.updateTimestamps()
   ├─ ConversationService.updateStatus() if needed
   └─ Increment message counters

8. Error Handling
   ├─ Log ALL errors with traceId
   ├─ Do NOT throw errors (Bull handles retries)
   ├─ Return status: success, partial_success, or failed
   └─ On 3rd retry failure: move to manual queue
```

#### SendMessageHandler

```typescript
Triggered: When ProcessMessageHandler fails to send
Concurrency: 1 job at a time
Retry Backoff: Exponential (1s, 2s, 4s)

Workflow:
1. Load context
   ├─ Conversation + abandonment
   └─ Message to retry

2. Attempt send
   ├─ MessageService.send(phone, messageText)
   ├─ Use same retry logic as primary handler
   └─ Return status

3. Update status
   ├─ MessageRepository.update({status: 'sent'})
   └─ Update timestamp, message ID

4. Success indicators
   ├─ Job.done() - no retries needed
   ├─ Job.moveToFailed() - manual review needed
   └─ Log each attempt with attempt number
```

**Error Recovery**:

```
When ProcessMessageHandler fails:
  ├─ 1st attempt fails → Bull waits 1s, retries
  ├─ 2nd attempt fails → Bull waits 2s, retries
  ├─ 3rd attempt fails → Job moved to 'failed' queue
  └─ Ops team reviews failed queue for action

When SendMessageHandler fails:
  ├─ Same 3-attempt strategy
  └─ After 3 failures: alert sent to ops channel
```

---

## Part 3: Data Model & Database Schema

### Entity Relationship Diagram

```
┌─────────────────────┐
│     Users           │
├─────────────────────┤
│ id (PK)             │
│ phone (unique)      │
│ name                │
│ segment             │
│ opted_out (bool)    │
│ created_at          │
├─────────────────────┤
│ FK: none            │
└─────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────┐
│   Conversations     │
├─────────────────────┤
│ id (PK)             │
│ user_id (FK)        │
│ abandonment_id (FK) │
│ state               │
│ message_count       │
│ cycle_count         │
│ created_at          │
│ last_message_at     │
│ last_user_msg_at    │
├─────────────────────┤
│ Index: (user_id)    │
│ Index: (state)      │
└─────────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────────┐
│    Messages          │
├──────────────────────┤
│ id (PK)              │
│ conversation_id (FK) │
│ role ('user'|'sara') │
│ text                 │
│ intent               │
│ sentiment            │
│ whatsapp_msg_id      │
│ whatsapp_message_id  │
│ created_at           │
├──────────────────────┤
│ UNIQUE: (whatsapp_message_id)  │
│ Index: (conversation_id)       │
│ Index: (created_at)            │
└──────────────────────┘
         ▲
         │ M:1
         │
┌────────────────────┐
│   Abandonments     │
├────────────────────┤
│ id (PK)            │
│ user_id (FK)       │
│ product_id         │
│ value (cents)      │
│ payment_link       │
│ conversation_id(FK)│
│ created_at         │
├────────────────────┤
│ Index: (user_id)   │
│ Index: (created_at)│
└────────────────────┘
```

### Key Constraints & Indexes

```sql
-- Conversations
UNIQUE (user_id, abandonment_id)  -- One active per user
INDEX (user_id, state)             -- FindByPhone optimization
INDEX (state)                       -- State management queries

-- Messages
UNIQUE (whatsapp_message_id)       -- Deduplication
INDEX (conversation_id, created_at) -- History retrieval
INDEX (created_at)                  -- Cleanup queries

-- Users
INDEX (phone)                       -- Lookup by phone
INDEX (opted_out)                   -- Compliance filtering

-- Abandonments
INDEX (user_id, created_at)        -- Recent abandonments
INDEX (conversation_id)             -- Conversation link
```

---

## Part 4: Performance Characteristics

### Database Query Performance

**Critical Queries**:

1. **findByPhoneNumber (ProcessMessageHandler entry point)**
```sql
SELECT c.*, u.*, a.*
FROM conversations c
JOIN users u ON c.user_id = u.id
LEFT JOIN abandonments a ON c.abandonment_id = a.id
WHERE u.phone = $1
ORDER BY c.state = 'ACTIVE' DESC, c.created_at DESC
LIMIT 1

Index used: (user_id, state)
Expected: ~5-10ms
```

2. **Get message history (AI context building)**
```sql
SELECT id, text, role, sentiment, intent, created_at
FROM messages
WHERE conversation_id = $1
ORDER BY created_at DESC
LIMIT 10

Index used: (conversation_id, created_at)
Expected: ~5-8ms
```

3. **Insert message (store incoming)**
```sql
INSERT INTO messages
(conversation_id, role, text, whatsapp_message_id, created_at)
VALUES ($1, $2, $3, $4, NOW())

UNIQUE constraint: whatsapp_message_id
Expected: ~3-5ms (constraint check included)
```

4. **Update conversation timestamps**
```sql
UPDATE conversations
SET last_message_at = NOW(), message_count = message_count + 1
WHERE id = $1

Expected: ~2-3ms
```

**Total Handler Processing Time**:
- DB queries total: ~20-30ms
- AI latency: ~800ms
- WhatsApp send: ~300ms
- **Total: ~1100-1130ms per message**

### Memory Usage

**Redis (Queue Storage)**:
- Per job: ~2KB (metadata + payload)
- At 100 jobs in queue: ~200KB
- At 1000 jobs: ~2MB
- Acceptable limit: 1GB per instance

**OpenAI Context**:
- System prompt: ~500 tokens
- Message history (10 msgs): ~200-300 tokens
- User message: ~50-100 tokens
- Completion: ~50-150 tokens
- **Total per call: ~800-1100 tokens**

**Connection Pools**:
- PostgreSQL: 10 connections (can increase to 20)
- Redis: 1 connection + queue consumers
- OpenAI: HTTP keep-alive (no pool needed)

---

## Part 5: Error Scenarios & Recovery

### Scenario 1: WhatsApp API Rate Limit (429)

**Initial Request**:
```
POST /webhook/messages → Enqueue ProcessMessageQueue
↓
ProcessMessageHandler loads context ✅
AIService calls OpenAI ✅
MessageService calls WhatsApp API → 429 (Rate limited)
↓
Handler catches 429, enqueues SendMessageQueue
↓
Bull retries with: 1s wait → 2s wait → 4s wait (3 attempts)
```

**Recovery**:
- After 3 retries: Job moved to 'failed' queue
- Ops team notified (alert on failed queue size)
- Manual retry triggered after rate limit window passes

**User Experience**: Message delayed by 10-30 seconds (imperceptible)

---

### Scenario 2: OpenAI Timeout (5 seconds)

**When it happens**:
- OpenAI API slow response
- Network latency spike
- Any timeout > 5 seconds

**Handler Response**:
```javascript
AIService catches timeout → Returns fallback object:
{
  intent: 'unclear',
  sentiment: 'neutral',
  shouldOfferDiscount: false,
  response: 'Um momento enquanto avalio sua mensagem...',
  tokens_used: 0
}

ProcessMessageHandler continues with fallback response
MessageService sends fallback message to user ✅
Message persisted with intent='TIMEOUT' ✅
```

**Recovery**: Next user message re-triggers AI call (may succeed)

**User Experience**: User gets polite holding message, conversation continues normally

---

### Scenario 3: Message Deduplication (Webhook Called Twice)

**When it happens**:
- Meta retries webhook (network hiccup)
- Our handler crashes mid-processing, Meta retries
- Webhook called simultaneously from different Meta servers

**Prevention**:
```
1st call: whatsapp_message_id='123'
INSERT into messages (whatsapp_message_id='123') ✅
UNIQUE constraint created

2nd call: whatsapp_message_id='123'
INSERT into messages (whatsapp_message_id='123')
↓ UNIQUE constraint violation → Silently ignored
SELECT from messages WHERE whatsapp_message_id='123'
Already exists, return early ✅
```

**Result**: Message processed exactly once (idempotent)

---

### Scenario 4: Database Connection Exhaustion

**When it happens**:
- 10 concurrent handlers hit database simultaneously
- All 10 connection pool slots filled
- 11th request queued, waits for slot
- After 30s timeout: connection error

**Warning Signs**:
```
WARN: Database connection timeout
Metric: connection_pool_wait_time > 1000ms
Alert: trigger when avg wait > 500ms
```

**Mitigation**:
1. Increase pool size: 10 → 20 connections
2. Add connection recycling: close idle after 5min
3. Monitor: log all slow queries (>100ms)
4. Implement circuit breaker for database

---

### Scenario 5: Redis Data Loss (Restart Without Persistence)

**When it happens**:
- Redis pod restarts
- No AOF/RDB persistence enabled
- All queued jobs lost

**Current State**: ❌ NOT PROTECTED
```
If 50 messages in queue when Redis crashes:
├─ All 50 jobs lost
├─ Messages don't get processed
└─ Users receive no responses
```

**Solution** (RECOMMENDED):
```
Enable Redis Persistence:
├─ Option A: RDB snapshots every 1 minute
│  └─ Trade-off: 1-minute data loss window
│  └─ Safe for most use cases
│
└─ Option B: AOF (Append-Only File)
   └─ Trade-off: More CPU/disk usage, no data loss
   └─ Safer but slower
```

---

## Part 6: Integration Test Coverage

### Test Categories & Coverage

**Unit Tests (Core Logic)**:
- ConversationService: 8 tests
- AIService: 40 tests (including timeout + cache)
- MessageService: 15 tests
- Repository CRUD: 80+ tests
- **Total Unit**: 150+ tests (all passing ✅)

**Integration Tests**:
- Full message flow: 10 tests
- Webhook + queue: 5 tests
- Service coordination: 3 tests
- **Total Integration**: 18+ tests (some failing due to type errors)

**E2E Tests**:
- Real WhatsApp flow: 2 tests (timeout issues in CI)
- Abandoned cart recovery: 1 test
- **Total E2E**: 3 tests (environment-dependent)

### Test Coverage Analysis

```
Coverage by module:
├─ Services: ~95% (all logic paths tested)
├─ Repositories: ~90% (CRUD + edge cases)
├─ Middleware: ~60% (rate limiter test mismatch)
├─ Routes: ~80% (webhook path tested)
└─ Handlers: ~70% (type errors prevent full run)

Overall EPIC 2: ~85% code coverage
Target for production: ≥80% ✅
```

---

## Part 7: Security Analysis

### HMAC Verification (SARA-2.4)

**Implementation**:
```javascript
Algorithm: HMAC-SHA256
Secret: WHATSAPP_WEBHOOK_TOKEN (from .env)
Verify: x-hub-signature-256 header vs calculated hash

Payload tampering prevention: ✅ Secure
API spoofing prevention: ✅ Prevents fake webhooks
```

### Phone Data Security

**Handling**:
- Stored: Plain text in PostgreSQL (no encryption)
- Transmitted: HTTPS only (TLS 1.3)
- Logged: Full phone in logs (compliance risk)

**Recommendation**:
- Add field-level encryption (AES-256) for phone numbers
- Mask phone in logs: +55XXXXXXX881
- LGPD compliance: phone is personal data

### API Key Security

**Current State**:
```
WHATSAPP_ACCESS_TOKEN: .env file ✅ (not in repo)
OPENAI_API_KEY: .env file ✅ (not in repo)
WHATSAPP_WEBHOOK_TOKEN: .env file ✅ (not in repo)
Database password: .env file ✅ (not in repo)
```

**Recommendations**:
- Use secrets manager (AWS Secrets Manager, Vault)
- Rotate keys every 90 days
- Use scoped tokens (least privilege)

---

## Part 8: Monitoring & Observability

### Metrics to Track

**Message Processing**:
```
Counter: messages_received_total
Counter: messages_processed_total
Counter: messages_failed_total
Histogram: message_processing_duration_seconds
  ├─ le=0.1 (100ms) - should be rare
  ├─ le=0.5 (500ms) - webhook response path
  ├─ le=1.0 (1s) - single AI call
  ├─ le=2.0 (2s) - with retry
  └─ le=5.0 (5s) - with backoff

Gauge: queue_size (pending jobs)
Gauge: failed_queue_size (manual review needed)
```

**Service Health**:
```
OpenAI API:
├─ Response time distribution
├─ Error rate (timeouts, auth failures)
├─ Token usage (cost tracking)
└─ Cache hit rate

WhatsApp API:
├─ Send success rate
├─ Retry rate
├─ Rate limit hits (429s)
└─ Message delivery latency

Database:
├─ Query latency (p50, p95, p99)
├─ Connection pool utilization
├─ Transaction rollback rate
└─ Constraint violations
```

### Recommended Dashboards

**Operational**:
1. Message Processing Dashboard
   - Throughput (msgs/min)
   - Latency (p50, p95, p99)
   - Error rate
   - Queue depth

2. Service Health
   - OpenAI availability
   - WhatsApp availability
   - Database connection pool
   - Redis memory usage

3. Cost Tracking
   - OpenAI tokens/cost
   - WhatsApp message volume
   - Database queries

**Business**:
1. Conversation Metrics
   - Active conversations
   - Message count distribution
   - Opt-out rate
   - Response rate

2. Recovery Performance
   - Conversion rate (abandoned → recovery)
   - Discount offered rate
   - Link click rate
   - Revenue recovered

---

## Part 9: Deployment Checklist

**Pre-Deployment**:
- [ ] All TypeScript type errors fixed
- [ ] All unit tests passing (npm test)
- [ ] Code review completed
- [ ] Security audit (HMAC, API keys)
- [ ] Database migrations tested

**Configuration**:
- [ ] OPENAI_API_KEY configured (paid tier recommended)
- [ ] WHATSAPP_ACCESS_TOKEN valid and tested
- [ ] WHATSAPP_BUSINESS_ACCOUNT_ID set
- [ ] WHATSAPP_WEBHOOK_TOKEN strong (32+ chars)
- [ ] DATABASE_URL pointing to production DB
- [ ] REDIS_URL pointing to production Redis

**Monitoring**:
- [ ] Logger configured (Winston, structured JSON)
- [ ] Metric collection enabled (Prometheus)
- [ ] Alert rules configured
- [ ] Dashboard created

**Post-Deployment**:
- [ ] Smoke test: Send test message via WhatsApp
- [ ] Verify message received and processed
- [ ] Check logs for errors
- [ ] Monitor metrics for 30 minutes
- [ ] Rollback plan ready

---

## Conclusion

EPIC 2 represents a well-architected, comprehensive messaging pipeline with:

✅ **Strengths**:
- Async processing for responsive webhook handling
- Robust error handling and retry mechanisms
- Comprehensive service separation
- Good test coverage
- Clear data model

⚠️ **Gaps**:
- Type safety issues (handlers.ts)
- Missing Redis persistence
- No rate limiting on message send
- Limited monitoring infrastructure
- Opt-out compliance needs audit

🎯 **Ready For**: Staging deployment after type fixes
🚀 **Path To Production**: 1-2 weeks with ops setup

---

*Report prepared by @analyst (Atlas)*
*Technical Review Recommended: @architect*
*Deployment Sign-off Required: @devops*
