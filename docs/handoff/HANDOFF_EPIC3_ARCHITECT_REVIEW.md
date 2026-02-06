# Handoff: EPIC 3 → Architecture Quick Check

**From**: River (@sm - Scrum Master)
**To**: Aria (@architect - System Architect)
**Date**: 2025-02-06
**Purpose**: Structural validation, risk assessment, dependency review
**Timeline**: Quick check (1-2 hours)
**Scope**: Technical debt, architectural risks, structural adjustments needed before EPIC 4

---

## Executive Summary

EPIC 3 is complete with 39 story points delivered (4/4 stories):
- ✅ Code quality excellent (TypeScript strict, 90-95% coverage)
- ✅ QA gate passed (0 defects)
- ✅ Tests comprehensive (81 unit tests)
- ⏳ Awaiting: Architecture structural review for risks & dependencies

**Your task**: Verify architectural integrity, identify technical risks, recommend adjustments

---

## Services Delivered in EPIC 3

### 1. ConversationService (`src/services/ConversationService.ts` - 603 lines)

**Responsibilities**:
- Conversation state management (AWAITING_RESPONSE → ACTIVE → CLOSED)
- Conversation context loading (user, abandonment, message history)
- Cycle count tracking (max 5)
- Timestamp management (last_message_at, last_user_message_at)
- 24-hour window validation

**Dependencies**:
```typescript
// Direct imports
- ConversationRepository
- AbandonmentRepository
- UserRepository
- MessageRepository
- MessageService
- SaraContextPayload (types)
- SARA_CONFIG (config)
```

**Key Methods** (16 total):
- findByPhoneNumber(), create(), updateStatus()
- incrementMessageCount(), updateTimestamps()
- isWithinWindow(), getWithContext()
- isOptedOut(), loadForContext()
- getFullHistory(), getMetadata()
- updateLastMessageAt(), updateState()
- getCycleCount(), incrementCycleCount()

**Questions for Review**:
1. ⚠️ Is loading full message history (SARA_CONFIG.message.historyLimit) efficient?
2. ⚠️ Could conversation context loading (9 fields) cause memory issues at scale?
3. ⚠️ State machine (VALID_TRANSITIONS) - complete coverage?
4. ⚠️ Cycle count enforcement (max 5) - should this be configurable?

---

### 2. OptOutDetectionService (`src/services/OptOutDetectionService.ts` - 206 lines)

**Responsibilities**:
- Portuguese keyword detection (heuristic)
- AI fallback for ambiguous cases (OpenAI API)
- Confidence scoring
- User opt-out marking

**Dependencies**:
```typescript
// Direct imports
- OpenAI (axios-based integration)
- UserRepository
- logger
```

**Key Methods**:
- detectKeyword() - keyword matching + normalization
- detectOptOut() - keyword OR AI detection
- markOptedOut() - BD update
- getOptOutKeyword() - keyword logging

**Questions for Review**:
1. ⚠️ **FRAGILE DEPENDENCY**: OpenAI API with 10s timeout
   - What happens if API is down? (fallback to false - conservative)
   - Rate limit: 5 req/min - sufficient?
   - Retry logic: None currently (queue-based mitigation?)

2. ⚠️ **Performance**: Regex normalization on every message
   - accent-insensitive normalization (NFD) - cost?
   - Should this be cached?

3. ⚠️ **Keyword Detection**: Portuguese-only
   - English support? (No, by design)
   - Extensibility for other languages?

4. ⚠️ **AI Fallback Timeout**: 10s default
   - Is this too long? Too short?
   - Configurable?

---

### 3. ComplianceService (`src/services/ComplianceService.ts` - 194 lines)

**Responsibilities**:
- 24-hour window validation
- Message safety validation (XSS, SQL injection patterns)
- Compliance status checks
- Opted-out user checks

**Dependencies**:
```typescript
// Direct imports
- ConversationRepository
- logger
```

**Key Methods**:
- isWithin24HourWindow() - timestamp validation
- validateConversationWindow() - business logic
- shouldStopConversation() - composite check
- checkMessageSafety() - regex pattern matching
- getComplianceStatus() - status aggregation
- logComplianceDecision() - audit logging
- validateWebhookSignature() - basic validation

**Questions for Review**:
1. ⚠️ **Pattern Matching for Security**: XSS/SQL injection patterns
   - Heuristic-based, not bulletproof
   - False negatives: Unicode encoding, obfuscation tricks
   - Mitigation: Server-side query parameterization (✅ good)
   - But: What if pattern matching misses something?

2. ⚠️ **24-Hour Window Logic**:
   - Fallback from last_user_message_at → created_at
   - Edge case: Very old conversations with no recent messages
   - Timestamp timezone: UTC (correct)

3. ⚠️ **No Persistence of Compliance Decisions**:
   - Decisions logged but not stored in BD
   - Audit trail OK for now, but might need DB storage later

4. ⚠️ **validateWebhookSignature()**: Currently dummy (always true)
   - HMAC verification missing?
   - Should this check request signature?

---

### 4. PaymentService (`src/services/PaymentService.ts` - 306 lines)

**Responsibilities**:
- Payment webhook processing
- Idempotency enforcement (payment_id)
- Status mapping (10 external → 3 SARA statuses)
- Conversation state updates
- Conversion analytics

**Dependencies**:
```typescript
// Direct imports
- AbandonmentRepository
- ConversationService
- logger
```

**Key Methods**:
- processPaymentWebhook() - main webhook handler
- validatePayload() - input validation
- getPaymentStatus() - status lookup
- isConverted() - boolean check
- getUserConversionStats() - analytics

**Questions for Review**:
1. ✅ **Idempotency Well-Implemented**: payment_id unique check
   - Safe duplicate handling
   - Returns "already_processed" on retry

2. ⚠️ **Status Mapping**: 10 → 3 mapping
   - Complete? All known statuses mapped?
   - Unknown statuses → "pending" (conservative, good)
   - Extensibility: Adding new status requires code change

3. ✅ **Conversation State Update**: Integration with ConversationService
   - Clean coupling
   - State transitions validated

4. ⚠️ **Amount Handling**: Optional amount parameter
   - If amount provided, overwrites existing value
   - Edge case: Amount = null → no update? (current: COALESCE handles)
   - Should amount always be provided?

---

## Architecture Overview

### Current Structure (Post-EPIC 3)

```
src/
├── config/
│   ├── env.ts
│   ├── database.ts
│   ├── logger.ts
│   └── sara.ts
├── repositories/
│   ├── ConversationRepository.ts
│   ├── AbandonmentRepository.ts
│   ├── UserRepository.ts
│   ├── MessageRepository.ts
│   └── __tests__/
├── services/
│   ├── ConversationService.ts (NEW - EPIC 3.2)
│   ├── OptOutDetectionService.ts (NEW - EPIC 3.3)
│   ├── ComplianceService.ts (NEW - EPIC 3.3)
│   ├── PaymentService.ts (NEW - EPIC 3.4)
│   ├── AIService.ts (EPIC 2)
│   ├── MessageService.ts (EPIC 2)
│   └── __tests__/
├── routes/
│   ├── webhooks.ts (updated - new payment endpoint)
│   └── ...
├── jobs/
│   ├── handlers.ts (updated - enhanced message processing)
│   └── ...
└── types/
    └── sara.ts
```

**Patterns Observed**:
1. ✅ Clear separation: repositories (BD) → services (business logic) → routes (HTTP)
2. ✅ Dependency injection via imports (not constructor injection)
3. ✅ Logger injected globally
4. ✅ Configuration centralized (SARA_CONFIG)
5. ✅ Type safety: Enums for states, Interfaces for data

---

## Risk Assessment

### 🔴 Critical Risks: None

### 🟠 High-Priority Risks

#### Risk 1: OpenAI API Dependency (EPIC 3.3)
**Severity**: HIGH
**Location**: OptOutDetectionService
**Issue**:
- Single point of failure for ambiguous opt-out detection
- Rate limited (5 req/min)
- 10s timeout - requests could hang

**Impact**: If API down, opt-out detection falls back to keyword matching (conservative)
**Likelihood**: Medium (external dependency)
**Mitigation Current**: Queue-based processing, timeout, fallback to false
**Mitigation Recommended**:
- [ ] Monitor API failures in EPIC 4.5 (Sentry alerts)
- [ ] Add circuit breaker pattern (fail-safe after N errors)
- [ ] Implement exponential backoff for retries
- [ ] Cache AI decisions for repeated users (24h TTL?)

---

#### Risk 2: Message Safety Validation (EPIC 3.3)
**Severity**: HIGH
**Location**: ComplianceService.checkMessageSafety()
**Issue**:
- Heuristic-based regex patterns
- May have false negatives (unicode, obfuscation)
- Not foolproof

**Impact**: Malicious message could bypass validation
**Likelihood**: Low (parameterized queries protect DB)
**Mitigation Current**: Server-side DB parameterization ✅
**Mitigation Recommended**:
- [ ] Add logging for suspicious patterns (audit trail)
- [ ] Consider WAF-like rules for additional patterns
- [ ] Monitor production for bypasses
- [ ] User report mechanism for false negatives

---

#### Risk 3: Conversation History Size (EPIC 3.2)
**Severity**: MEDIUM
**Location**: ConversationService.loadForContext()
**Issue**:
- Loads full message history (configurable limit)
- History sent to OpenAI (token counting)
- Memory impact: 50KB per conversation × N concurrent conversations

**Impact**: Memory usage could spike with many concurrent conversations
**Likelihood**: Low (but possible at scale)
**Mitigation Current**: Configurable SARA_CONFIG.message.historyLimit
**Mitigation Recommended**:
- [ ] Load testing with realistic conversation counts (EPIC 4.3)
- [ ] Monitor memory usage in staging (EPIC 4.5)
- [ ] Consider lazy-loading history (load only recent messages)
- [ ] Archive old conversations after X days

---

#### Risk 4: Cycle Count Terminal Closure (EPIC 3.2)
**Severity**: MEDIUM
**Location**: ConversationService state machine
**Issue**:
- Conversation marked CLOSED after 5 cycles
- CLOSED is terminal state (no transitions possible)
- User cannot re-engage after max cycles

**Impact**: Conversation ends permanently (business decision)
**Likelihood**: High (by design)
**Mitigation Current**: Design decision documented
**Mitigation Recommended**:
- [ ] Document for support team: users cannot reopen conversations
- [ ] Consider "re-engagement flow" as future feature (EPIC 5)
- [ ] Monitor: how often conversations hit cycle limit?

---

### 🟡 Medium-Priority Risks

#### Risk 5: Payment Status Mapping Extensibility (EPIC 3.4)
**Severity**: MEDIUM
**Location**: PaymentService.STATUS_MAPPING
**Issue**:
- Hardcoded status mapping
- Adding new payment status requires code change + redeploy
- Risk of missing payment status → defaults to "pending"

**Impact**: New payment status silently mapped to "pending" (safe but not ideal)
**Likelihood**: Low (payment gateway unlikely to add new statuses frequently)
**Mitigation Current**: Conservative default ("pending"), comprehensive mapping
**Mitigation Recommended**:
- [ ] Consider config-based mapping (SARA_CONFIG or environment)
- [ ] Add logging for unmapped statuses (monitoring)
- [ ] Document known statuses clearly

---

#### Risk 6: Webhook Signature Validation (EPIC 3.3)
**Severity**: MEDIUM
**Location**: ComplianceService.validateWebhookSignature()
**Issue**:
- Currently dummy validation (always true)
- HMAC verification missing
- Webhooks could be spoofed

**Impact**: Fake webhooks could trigger state changes
**Likelihood**: Medium (external security risk)
**Mitigation Current**: None currently implemented
**Mitigation Recommended**:
- [ ] Implement HMAC-SHA256 verification for payment webhooks
- [ ] Store webhook secret securely in environment
- [ ] Validate in payment webhook handler
- [ ] Log validation failures

---

### 🟢 Low-Priority Risks

#### Risk 7: Timestamp Timezone Handling
**Severity**: LOW
**Location**: ConversationService, ComplianceService
**Issue**: UTC timestamps assumed, but no timezone normalization
**Impact**: Edge cases if timezone changes
**Mitigation**: Document timestamp expectations clearly

#### Risk 8: Error Message Exposure
**Severity**: LOW
**Location**: All services
**Issue**: Error messages might expose internal details
**Impact**: Information disclosure in error responses
**Mitigation**: Current mitigation good (generic error messages to clients)

---

## Fragile Dependencies Analysis

### Dependency 1: OpenAI API (OptOutDetectionService)

```
Service Chain:
OptOutDetectionService → OpenAI (axios) → External API

Fragility Level: 🔴 HIGH
Why Fragile:
  - External API (network latency, availability)
  - Rate limited
  - Timeout-dependent
  - No retry logic

Recommendation:
  - Implement circuit breaker
  - Add exponential backoff
  - Cache results (24h TTL)
  - Monitor in EPIC 4.5
```

---

### Dependency 2: Message History Loading (ConversationService)

```
Service Chain:
ConversationService → MessageRepository → Database

Fragility Level: 🟡 MEDIUM
Why Fragile:
  - History limit from SARA_CONFIG (runtime configurable)
  - No pagination for very large histories
  - Memory impact at scale

Recommendation:
  - Load testing with realistic data volumes
  - Consider lazy-loading
  - Archive old conversations
  - Monitor memory in EPIC 4.5
```

---

### Dependency 3: Conversation Repository Updates (All Services)

```
Service Chain:
ConversationService → ConversationRepository → Database

Fragility Level: 🟢 LOW
Why Fragile: Not really fragile
  - Direct repository queries
  - Parameterized (SQL injection safe)
  - Transaction handling assumed

Recommendation:
  - Verify transaction isolation level
  - Test concurrent updates
```

---

### Dependency 4: Payment Webhook Handler (PaymentService)

```
Service Chain:
POST /webhook/payment → PaymentService → AbandonmentRepository → Database
                      → ConversationService → ConversationRepository

Fragility Level: 🟡 MEDIUM
Why Fragile:
  - Complex flow with multiple repositories
  - No transaction handling visible
  - State update coupling

Recommendation:
  - Wrap payment processing in database transaction
  - Test duplicate webhook scenarios
  - Verify conversation state update on payment failure
```

---

## Structural Adjustment Recommendations

### Priority 1: Implement HMAC Webhook Validation
**File**: `src/services/ComplianceService.ts`
**Current**: validateWebhookSignature() always returns true
**Change**: Implement HMAC-SHA256 verification
**Effort**: Low (1-2 hours)
**Impact**: Security risk mitigation
**Blocking EPIC 4**: No

---

### Priority 2: Add Circuit Breaker for OpenAI
**File**: `src/services/OptOutDetectionService.ts`
**Current**: Direct API call with timeout, no retry
**Change**: Implement circuit breaker pattern
**Effort**: Medium (2-3 hours)
**Impact**: Resilience improvement
**Blocking EPIC 4**: No (mitigated by fallback)

---

### Priority 3: Verify Transaction Handling in Payment Webhook
**Files**: `src/services/PaymentService.ts`, `src/repositories/`
**Current**: No explicit transaction handling visible
**Change**: Wrap payment processing in database transaction
**Effort**: Medium (2-3 hours)
**Impact**: Data consistency
**Blocking EPIC 4**: No (functional but risky at scale)

---

### Priority 4: Document Fragile Dependencies
**Files**: All services
**Current**: Implicit assumptions
**Change**: Add architecture decision records (ADR)
**Effort**: Low (1-2 hours)
**Impact**: Operational clarity
**Blocking EPIC 4**: No

---

## Dependency Map (Structural)

```
Routes (HTTP)
    ↓
webhooks.ts
    ├─→ PaymentService → ConversationService → MessageRepository
    ├─→ OptOutDetectionService → OpenAI (FRAGILE)
    └─→ ComplianceService → ConversationRepository

Services
    ├─ ConversationService
    │   ├─→ ConversationRepository
    │   ├─→ AbandonmentRepository
    │   ├─→ UserRepository
    │   ├─→ MessageRepository (LARGE HISTORY RISK)
    │   └─→ MessageService
    │
    ├─ OptOutDetectionService
    │   ├─→ OpenAI API (FRAGILE)
    │   └─→ UserRepository
    │
    ├─ ComplianceService
    │   └─→ ConversationRepository
    │
    └─ PaymentService
        ├─→ AbandonmentRepository
        └─→ ConversationService

Repositories
    ├─ ConversationRepository → Database
    ├─ AbandonmentRepository → Database
    ├─ UserRepository → Database
    └─ MessageRepository → Database

Config
    └─ SARA_CONFIG (centralized, used by ConversationService)
```

**Observations**:
- ✅ Clean layering: routes → services → repositories → database
- ✅ Minimal cross-service coupling
- 🟠 OpenAI dependency is external (single fragile point)
- 🟠 ConversationService is central hub (many dependencies)
- ✅ Repositories are thin (BD abstraction only)

---

## Recommendations Summary

### Must Do Before EPIC 4
- None (no blocking issues)

### Should Do in EPIC 4
1. Load testing with realistic scale (EPIC 4.3)
2. Implement OpenAI circuit breaker (EPIC 4.5 or separate)
3. Add webhook HMAC validation (security, medium priority)
4. Transaction handling for payment webhook (data consistency)
5. Document fragile dependencies (operational clarity)

### Nice to Have (EPIC 5+)
1. Lazy-load conversation history
2. Archive old conversations
3. Re-engagement flow after cycle closure
4. Config-based payment status mapping
5. Cache AI opt-out decisions

---

## Pre-EPIC 4 Checklist

- [ ] Review this assessment
- [ ] Confirm risk levels acceptable
- [ ] Identify if any adjustments needed before EPIC 4
- [ ] Provide recommendations for EPIC 4 planning

---

## Questions for Architect

1. ⚠️ **OpenAI Dependency**: Should we implement circuit breaker before EPIC 4.5?
2. ⚠️ **Conversation History**: Should we load test with large conversation history?
3. ⚠️ **Webhook HMAC**: Should HMAC validation be EPIC 4 task or defer?
4. ⚠️ **Transaction Handling**: Do we need transaction wrapper for payment webhook?
5. ⚠️ **Cycle Closure**: Should re-engagement be designed for EPIC 5?

---

## Ready for Your Review

**All EPIC 3 code is available for structural review**:
- 4 new services fully implemented
- 81 unit tests comprehensive
- Type-safe patterns throughout
- Clean separation of concerns

**Time to review**: ~1-2 hours
**Recommend action**: Quick check + risk assessment

---

**Waiting for your architectural guidance** 🏛️

— River (@sm), for EPIC 3 team

---

**Attachments**:
- EPIC 3 QA Review: `docs/qa/EPIC_3_QA_REVIEW.md`
- EPIC 3 Closure: `docs/closure/EPIC_3_CLOSURE_REPORT.md`
- Lessons Learned: `docs/closure/EPIC_3_LESSONS_LEARNED.md`
