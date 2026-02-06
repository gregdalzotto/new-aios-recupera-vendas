# EPIC 3 Quick Start Guide for Developers

**For:** @dev (Dex) - Primary Implementation
**Purpose:** Fast reference during development
**Updated:** 2026-02-06

---

## TL;DR - 60 Second Overview

**EPIC 3** implements compliance (LGPD + Meta policy) and opt-out detection:

1. **SARA-3.1 (8 pts):** Keyword-based opt-out detection
   - Create `OptOutDetector` service
   - Detect: "parar", "cancelar", "remover", etc.
   - Performance: < 100ms

2. **SARA-3.2 (8 pts):** AI-based fallback detection
   - Add method to `AIService`: `detectOptOutIntent()`
   - Conservative: timeout → don't mark opt-out
   - Confidence threshold: 0.7

3. **SARA-3.3 (9 pts):** Compliance service (24h window + opt-out enforcement)
   - Create `ComplianceService`
   - Validate 24h window
   - Cascade opt-out to all user conversations
   - Immutable audit trail

4. **SARA-3.4 (10 pts):** Payment webhook handler
   - Add `POST /webhook/payment` endpoint
   - Process: completed → CONVERTED, pending → PENDING, failed → DECLINED
   - Idempotent (unique payment_id)

**Total:** 35 points, ~2 weeks, 46+ tests

---

## Sprint 1: Opt-out Detection (Days 1-5)

### Story SARA-3.1: Deterministic Opt-out Detection

**Goal:** When user sends "parar", detect immediately and respond

**Acceptance Criteria (abbreviated):**
1. Service `OptOutDetector` in `src/services/OptOutDetector.ts`
2. Load keywords from `opt_out_keywords` table
3. Cache in memory (TTL: 1 hour)
4. Methods: `detectKeyword(text)`, `getKeywordMatched(text)`
5. Case-insensitive, Unicode normalization
6. Performance: < 100ms for 1000 keywords
7. Integrate into message processing (called BEFORE AIService)

**Files to Create:**
- `src/services/OptOutDetector.ts`
- `src/repositories/OptOutKeywordRepository.ts`
- `tests/unit/OptOutDetector.test.ts`

**Files to Modify:**
- None (standalone service)

**Test Cases (8 tests):**
```typescript
// Test 1: Exact keyword match
"parar" → { detected: true, keyword: "parar" }

// Test 2: Keyword with variations
"parando" → { detected: true, keyword: "parar" }

// Test 3: Negation handling
"não quero parar" → { detected: true, keyword: "parar" }

// Test 4: No keyword
"qual o preço?" → { detected: false, keyword: null }

// Test 5: Case insensitive
"PARAR" → { detected: true }

// Test 6: Cache working (repeat keywords < 50ms)
// Test 7: Performance (1000 keywords < 50ms)
// Test 8: TTL expiration (cache invalidates after 1 hour)
```

**Key Implementation Notes:**
- Use `NFD` Unicode normalization (ü → u)
- Word boundaries: `\bkeyword\b`
- Cache: `Map` with timestamp or use `lru-cache` package
- Default 10 keywords: parar, remover, cancelar, sair, stop, não quero, me tire, excluir, desinscrever, unsubscribe

**Estimated Time:** 3 days (dev) + 1 day (QA)

**Code Review Checklist:**
- [ ] Queries parameterized (SQL injection prevention)
- [ ] Cache TTL working correctly
- [ ] Timeout handling (return false if > 100ms)
- [ ] Unicode normalization correct
- [ ] Error handling comprehensive
- [ ] Tests cover all acceptance criteria

---

### Story SARA-3.2: AI-Based Opt-out Detection (Fallback)

**Goal:** If keyword detection fails, use AI to understand context

**Acceptance Criteria (abbreviated):**
1. Method `detectOptOutIntent()` in `AIService`
2. Input: `{ context, userMessage, messageHistory }`
3. Output: `{ isOptOut: boolean, confidence: 0-1, reason: string }`
4. Confidence threshold: 0.7 (mark as opt-out), 0.5-0.7 (log), < 0.5 (ignore)
5. Timeout: 3 seconds (return false on timeout)
6. Temperature: 0.3, Max tokens: 50
7. Context: last 5 messages

**Files to Modify:**
- `src/services/AIService.ts` (add method)
- `tests/unit/AIService.test.ts` (add tests)

**Prompt Template:**
```
You are analyzing whether a user wants to opt out (stop receiving messages).

Context:
- User: [name]
- Cart value: [amount]
- Messages exchanged: [last 5 messages]

User's latest message: "[message]"

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "isOptOut": true/false,
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}
```

**Test Cases (6 tests):**
```typescript
// Test 1: Clear opt-out intent
"não quero mais receber mensagens" →
{ isOptOut: true, confidence: 0.95, reason: "Clear opt-out request" }

// Test 2: Negation (false positive prevention)
"não quero deixar de receber" →
{ isOptOut: false, confidence: 0.85, reason: "Negation detected" }

// Test 3: Timeout handling
(3 second delay) →
{ isOptOut: false, confidence: 0, reason: "Timeout - conservative fallback" }

// Test 4: JSON parsing error
(invalid JSON response) →
{ isOptOut: false, confidence: 0, reason: "Parse error - conservative" }

// Test 5: Confidence threshold (0.5-0.7 logged)
"acho que não quero..." →
{ isOptOut: false, confidence: 0.6, reason: "..." } // Logged for analysis

// Test 6: Low confidence
"não sei" →
{ isOptOut: false, confidence: 0.2, reason: "Unclear intent" }
```

**Key Implementation Notes:**
- Use `Promise.race()` for timeout handling
- Don't throw on timeout - return conservative (false)
- Log responses with confidence 0.5-0.7 for training
- Try-catch for JSON parsing
- Temperature: 0.3 (deterministic)
- Use `openai.chat.completions.create()`

**Estimated Time:** 2 days (dev) + 1 day (QA)

**Code Review Checklist:**
- [ ] Timeout correctly implemented (3s max)
- [ ] JSON parsing error handling
- [ ] Conservative fallback on any error
- [ ] Logging for 0.5-0.7 range
- [ ] Prompt engineering review
- [ ] Tests verify all thresholds

---

## Sprint 2: Compliance & Payment (Days 1-10)

### Story SARA-3.3: Compliance Service

**Goal:** Enforce 24h window, cascade opt-out, track state changes

**Acceptance Criteria (abbreviated):**
1. Service `ComplianceService` in `src/services/ComplianceService.ts`
2. Methods:
   - `validateConversationWindow(conversationId)` → { isValid, reason, expiresAt }
   - `shouldStopConversation(conversationId)` → { shouldStop, reason }
   - `markOptedOut(userId, reason)` → void (updates users + conversations + audit log)
3. Window calculation: `now - last_user_message_at > 24h` → EXPIRED
4. Stop reasons: WINDOW_EXPIRED, USER_OPTED_OUT, CONVERTED, MESSAGE_LIMIT_EXCEEDED, PERSISTENT_ERROR
5. Opt-out cascade: mark user opted_out = true, close ALL their conversations
6. Immutable audit log: log every opt-out with reason + timestamp

**Files to Create:**
- `src/services/ComplianceService.ts`
- `tests/unit/ComplianceService.test.ts`

**Files to Modify:**
- `src/repositories/UserRepository.ts` (add methods for opt-out marking)

**Test Cases (8 unit + 5 integration):**
```typescript
// Unit Tests
// Test 1: Window valid (< 24h)
(last_user_message_at = now - 12h) → { isValid: true }

// Test 2: Window expired (> 24h)
(last_user_message_at = now - 25h) → { isValid: false, reason: "WINDOW_EXPIRED" }

// Test 3: Boundary (exactly 24h)
(last_user_message_at = now - 24h) → { isValid: true }

// Test 4: Opt-out marking
markOptedOut(userId, "USER_OPTED_OUT") →
  users.opted_out = true,
  conversations.status = 'CLOSED',
  audit_log entry created

// Test 5-8: Other stop reasons, cascade behavior, audit trail

// Integration Tests
// Test 1: Multi-conversation closure
User has 3 conversations → mark opted_out → all 3 become CLOSED

// Test 2: Database atomicity
// Test 3: Concurrent requests (no race conditions)
// Test 4: Index performance
// Test 5: Audit log immutability
```

**Key Implementation Notes:**
- Use UTC timestamps consistently
- Transactions for atomicity (BEGIN/COMMIT)
- Indexes needed: `idx_conversations_user_id`, `idx_conversations_status`
- Audit log: immutable, with user_id + timestamp + reason
- Query: `SELECT conversations WHERE user_id = ? AND status != 'CLOSED'` (for cascade)

**Estimated Time:** 3.5 days (dev) + 1.5 days (QA)

**Code Review Checklist:**
- [ ] UTC timestamps used consistently
- [ ] Transactions for atomicity
- [ ] Cascade logic tested (multi-conversation)
- [ ] Audit log implementation (immutable)
- [ ] Performance acceptable (indices in place)
- [ ] Error handling comprehensive

---

### Story SARA-3.4: Payment Webhook Handler

**Goal:** Track successful conversions via payment webhooks

**Acceptance Criteria (abbreviated):**
1. Endpoint `POST /webhook/payment` in `src/routes/webhooks.ts`
2. Payload: `{ paymentId, abandonmentId, status, amount, timestamp }`
3. Validation: HMAC verification + required fields + positive amount
4. Processing by status:
   - `completed` → UPDATE abandonment: status = CONVERTED, converted_at = NOW()
   - `pending` → UPDATE abandonment: status = PENDING
   - `failed`/`refunded` → UPDATE abandonment: status = DECLINED
5. Idempotency: UNIQUE payment_id, duplicate returns 200 + "already_processed"
6. Response: 200 OK with action, or error (400/403/404/500)

**Files to Create:**
- `src/services/PaymentService.ts`

**Files to Modify:**
- `src/routes/webhooks.ts` (add POST /webhook/payment)
- `src/repositories/AbandonmentRepository.ts` (add payment update methods)
- `tests/integration/webhooks.test.ts` (add payment tests)

**Test Cases (10 unit + 6 integration + 4 API):**
```typescript
// Unit Tests
// Test 1: Status 'completed'
{ status: 'completed' } →
UPDATE abandonment: status = CONVERTED, converted_at = NOW()

// Test 2-4: Other statuses (pending, failed, refunded)

// Test 5: Payload validation (missing field)
{ abandonmentId: "" } → 400 Bad Request

// Test 6: Amount validation (negative)
{ amount: -100 } → 400 Bad Request

// Test 7: Idempotency (same paymentId twice)
First → 200 OK with "processed"
Second → 200 OK with "already_processed"

// Test 8-10: Edge cases

// Integration Tests
// Test 1: Database transaction (atomic)
// Test 2: Conversation state sync
// Test 3: Audit log creation
// Test 4-6: Concurrent requests, race conditions

// API Tests
// Test 1: Invalid HMAC → 403 Forbidden
// Test 2: Validation error → 400 Bad Request
// Test 3: Abandonment not found → 404 Not Found
// Test 4: Server error handling → 500 with error details
```

**Key Implementation Notes:**
- HMAC verification: already exists in middleware, reuse
- UNIQUE payment_id constraint prevents duplicates
- Application-level check: if payment_id exists → return already_processed
- Atomic transaction: UPDATE abandonment + UPDATE conversation + INSERT audit_log
- Conversation state sync: if abandoned.status = CONVERTED, conversation.status = CONVERTED

**Estimated Time:** 3 days (dev) + 1.5 days (QA)

**Code Review Checklist:**
- [ ] HMAC verification integration
- [ ] Idempotency working (UNIQUE constraint + app check)
- [ ] Transactions atomic
- [ ] Conversation state synchronized
- [ ] All status codes tested
- [ ] Audit trail created

---

## Integration Points

### Message Processing Flow (Where Opt-out Detection Runs)

```
POST /webhook/messages (from Meta)
    ↓
[1] HMAC verification ✅ (existing)
    ↓
[2] Load conversation ✅ (existing)
    ↓
[3] Store incoming message ✅ (existing)
    ↓
[4] OptOutDetector.detectKeyword(message) ← NEW (SARA-3.1)
    ├─ If detected: log + return opt-out response
    └─ If not detected: continue
    ↓
[5] AIService.detectOptOutIntent(context, message) ← NEW (SARA-3.2)
    ├─ If confidence >= 0.7: mark opt-out
    └─ If < 0.7: continue
    ↓
[6] ComplianceService.validateConversationWindow(convId) ← NEW (SARA-3.3)
    ├─ If expired: log + don't process
    └─ If valid: continue
    ↓
[7] AIService.interpretMessage(context) ✅ (existing)
    ↓
[8] ComplianceService.shouldStopConversation(convId) ← NEW (SARA-3.3)
    ├─ If should stop: mark CLOSED + don't send
    └─ If should continue: send response
    ↓
[9] MessageService.send() ✅ (existing)
    ↓
[10] Return 200 OK to Meta ✅ (existing)
```

### Payment Processing (New Flow)

```
POST /webhook/payment (from payment provider)
    ↓
[1] HMAC verification (existing middleware)
    ↓
[2] PaymentService.processPayment()
    ├─ Validate payload
    ├─ Check idempotency (payment_id unique)
    ├─ UPDATE abandonment status
    ├─ UPDATE conversation status
    ├─ CREATE audit log entry
    └─ Return 200 OK with action
```

---

## Database Schema Notes

### Tables You'll Use

**opt_out_keywords** (from EPIC 1)
```sql
CREATE TABLE opt_out_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(100) NOT NULL UNIQUE,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**users** (modify in SARA-3.3)
```sql
-- Add columns (if not exists)
ALTER TABLE users ADD COLUMN opted_out BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN opted_out_at TIMESTAMP;
ALTER TABLE users ADD COLUMN opted_out_reason VARCHAR(255);
```

**conversations** (from EPIC 2, no changes needed)
- Use existing: status, user_id, abandonment_id, created_at, last_message_at

**abandonments** (modify in SARA-3.4)
```sql
-- Add columns (if not exists)
ALTER TABLE abandonments ADD COLUMN payment_id VARCHAR(255) UNIQUE;
ALTER TABLE abandonments ADD COLUMN converted_at TIMESTAMP;
ALTER TABLE abandonments ADD COLUMN conversion_link VARCHAR(255);
```

**audit_log** (new for SARA-3.3)
```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Common Patterns You'll Use

### Pattern 1: Service with Caching

```typescript
// OptOutDetector pattern
class OptOutDetector {
  private cache = new Map<string, string[]>();
  private cacheTTL = 3600000; // 1 hour

  async detectKeyword(text: string): Promise<boolean> {
    const keywords = await this.getKeywords();
    // matching logic
  }

  private async getKeywords(): Promise<string[]> {
    // Return from cache or load from DB
  }
}
```

### Pattern 2: Timeout Handling

```typescript
// AIService pattern
async detectOptOutIntent(context, message): Promise<DetectionResult> {
  try {
    const result = await Promise.race([
      this.callOpenAI(context, message),
      this.timeout(3000)
    ]);
    return result;
  } catch (error) {
    // Conservative: don't mark opt-out on error
    return { isOptOut: false, confidence: 0 };
  }
}
```

### Pattern 3: Atomic Transaction

```typescript
// ComplianceService pattern
async markOptedOut(userId: string, reason: string): Promise<void> {
  const connection = await db.getConnection();
  try {
    await connection.query('BEGIN');

    // Update user
    await connection.query('UPDATE users SET opted_out = true WHERE id = ?', [userId]);

    // Close conversations
    await connection.query(
      'UPDATE conversations SET status = ? WHERE user_id = ? AND status != ?',
      ['CLOSED', userId, 'CLOSED']
    );

    // Audit log
    await connection.query(
      'INSERT INTO audit_log (user_id, action, reason) VALUES (?, ?, ?)',
      [userId, 'OPT_OUT', reason]
    );

    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  }
}
```

### Pattern 4: Idempotency Check

```typescript
// PaymentService pattern
async processPayment(paymentId: string, status: string): Promise<void> {
  // Check if already processed
  const existing = await this.abandonmentRepository.findByPaymentId(paymentId);
  if (existing) {
    return { status: 'already_processed', paymentId };
  }

  // Process payment
  // INSERT with UNIQUE constraint on payment_id prevents duplicates
}
```

---

## Testing Strategy

### What to Test (By Story)

**SARA-3.1 (OptOutDetector):**
- Exact keyword match
- Variations (stemming, inflections)
- Negation handling
- Case insensitivity
- Unicode normalization
- Performance (< 100ms)
- Cache TTL

**SARA-3.2 (AIService.detectOptOutIntent):**
- Confidence threshold (0.7, 0.5-0.7, < 0.5)
- Timeout handling (3s)
- JSON parsing errors
- Negation handling
- Clear intent detection

**SARA-3.3 (ComplianceService):**
- Window valid/expired (boundary: 24h)
- Opt-out marking (atomicity, cascade)
- Audit log creation
- Concurrent requests
- State transitions

**SARA-3.4 (PaymentService):**
- Status processing (all 4 statuses)
- Idempotency (duplicate payment_id)
- Conversation state sync
- HMAC verification integration
- Error responses (400, 403, 404, 500)

### Running Tests

```bash
# Unit tests
npm test src/services/OptOutDetector.test.ts
npm test src/services/AIService.test.ts
npm test src/services/ComplianceService.test.ts

# Integration tests
npm test tests/integration/webhooks.test.ts

# All tests
npm test

# Coverage report
npm test -- --coverage
```

---

## Performance Targets

| Component | Target | Measurement |
|-----------|--------|-------------|
| OptOutDetector | < 100ms | For 1000 keywords |
| AIService timeout | 3 seconds | Max latency |
| Database queries | < 10ms | Indexed queries |
| Compliance check | < 50ms | Window validation |
| Payment webhook | < 200ms | Full processing |

**How to Verify:**
```typescript
const start = Date.now();
const result = await detector.detectKeyword("test");
const duration = Date.now() - start;
expect(duration).toBeLessThan(100);
```

---

## Debugging Checklist

If something isn't working:

- [ ] Is HMAC verification passing? Check middleware logs
- [ ] Is database connection working? Test query directly
- [ ] Are UnicodeNormalization applied correctly? Test with special chars
- [ ] Is timeout working? Test with slow OpenAI response
- [ ] Are transactions atomic? Check DB consistency
- [ ] Is idempotency working? Insert same payment_id twice
- [ ] Are tests actually running? Check test count
- [ ] Is code being called? Add console.log or breakpoint

---

## Code Review Checklist (For Reviewers)

**Security:**
- [ ] SQL queries parameterized (no injection)
- [ ] HMAC verification required
- [ ] Sensitive data logged appropriately
- [ ] Timeouts prevent hanging

**Reliability:**
- [ ] Error handling comprehensive
- [ ] Timeouts implemented correctly
- [ ] Transactions atomic
- [ ] Idempotency guaranteed

**Performance:**
- [ ] Indexes in place
- [ ] Caching working
- [ ] Timeouts not too generous
- [ ] No N+1 queries

**Testing:**
- [ ] Unit test coverage >= 90%
- [ ] Integration tests present
- [ ] Edge cases tested
- [ ] Performance verified

---

## Quick Links

**Documentation:**
- Full specs: `docs/backlog/EPIC-3-BACKLOG.md`
- Sprint planning: `docs/backlog/BACKLOG-REVIEW.md`
- Validation summary: `docs/backlog/PO-VALIDATION-SUMMARY.md`

**Code References:**
- Existing AIService: `src/services/AIService.ts`
- Existing ConversationService: `src/services/ConversationService.ts`
- Existing webhook routes: `src/routes/webhooks.ts`

**Database:**
- Migration scripts: `migrations/`
- Schema inspection: `npm run migrate`

---

**Good luck!** This EPIC is well-planned and achievable. Focus on clean code, comprehensive testing, and the 4-day sprint tempo.

Questions? Reach out to @po (Pax), @architect (Aria), or @pm (Morgan).

