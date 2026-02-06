# EPIC 3 Planning Document

**Epic Title:** Conformidade + Opt-out (Compliance & User Opt-out Handling)
**Epic ID:** SARA-3
**Planned Date:** 2026-02-XX
**Status:** ✅ READY FOR PLANNING
**Prepared by:** River (Scrum Master)
**Date:** 2026-02-06

---

## Executive Summary

EPIC 3 builds on the completed message processing infrastructure of EPIC 2 to add compliance, opt-out handling, and conversion tracking. This epic ensures Synkra AIOS respects user preferences, maintains LGPD compliance, and tracks successful cart recoveries.

**Scope:**
- 5 new stories (SARA-3.1 through SARA-3.5)
- ~44 story points total
- Focus: User compliance, data privacy, conversion metrics

**Objectives:**
1. Detect when users want to opt out (deterministic + AI-based)
2. Enforce WhatsApp 24-hour message window compliance
3. Track successful conversions via payment webhooks
4. Implement comprehensive audit logging
5. Add advanced routing for different user scenarios

---

## Story Breakdown Strategy

### Breakdown Methodology

EPIC 3 is designed with **incremental complexity and dependency management**:

```
SARA-3.1 (Deterministic Opt-out)
    ↓ (dependency: keyword detection)
SARA-3.2 (AI-based Opt-out Fallback)
    ↓ (both feed into compliance)
SARA-3.3 (Compliance Service)
    ↓ (validates message eligibility)
SARA-3.4 (Payment Webhook)
    ↓ (parallel: advanced routing)
SARA-3.5 (Advanced Message Routing)
```

### Story Sequencing

**Phase 1 (Sprint 1): Compliance Foundation**
- SARA-3.1: Deterministic opt-out detection (8 points)
- SARA-3.3: Compliance service (8 points)

**Phase 2 (Sprint 2): Advanced Detection**
- SARA-3.2: AI-based opt-out fallback (10 points)
- SARA-3.5: Advanced routing (8 points)

**Phase 3 (Sprint 3): Conversion Tracking**
- SARA-3.4: Payment webhook & conversion tracking (10 points)

**Total Duration:** ~3 weeks (44 story points / ~15 points per sprint)

---

## SARA-3.1: Deterministic Opt-out Detection

**Story ID:** SARA-3.1
**Title:** Keyword-Based Opt-out Detection
**Estimated Points:** 8
**Priority:** P0 (Critical Path)

### User Story

```
As a Scrum Master,
I want users to be able to opt out using simple keywords,
So that we respect their preferences immediately without processing.
```

### Acceptance Criteria

#### 1. OptOutDetector Service Implementation
- [ ] Create `src/services/OptOutDetector.ts` (new)
- [ ] Implement `getInstance()` singleton pattern
- [ ] Load opt-out keywords from database on startup
- [ ] Cache keywords in memory with TTL (1 hour)
- [ ] Implement `detectKeyword(messageText): boolean`
- [ ] Implement `getKeywordMatched(messageText): string | null`

#### 2. Keyword Matching Logic
- [ ] Case-insensitive matching (normalize to lowercase)
- [ ] Unicode normalization (é → e, ã → a)
- [ ] Word boundary detection using regex: `\b{keyword}\b`
- [ ] Support variability detection:
  - "parar" matches "parando", "parei", "pode parar"
  - "cancelar" matches "cancelamento", "cancelada"
- [ ] Negation handling: "não quero parar" should NOT match
- [ ] Prioritize by frequency (most common keywords first)
- [ ] Search timeout: maximum 100ms per message

#### 3. Default Keywords (10 minimum)
```
parar, remover, cancelar, sair, stop,
não quero, me tire, excluir, desinscrever, unsubscribe
```
- [ ] Load from `opt_out_keywords` table
- [ ] Allow admin to add/remove keywords via SQL
- [ ] Log keyword matches with trace ID

#### 4. Integration with Message Processing
- [ ] Hook into `processMessageHandler()` BEFORE AIService call
- [ ] If keyword detected:
  - [ ] Return early (don't call OpenAI)
  - [ ] Mark user as opted out
  - [ ] Send confirmation message: "Entendi, sua solicitação foi registrada. Você não receberá mais mensagens."
  - [ ] Log with user ID, phone, matched keyword

#### 5. Database Updates
- [ ] Ensure `users.opted_out` boolean field exists
- [ ] Create `opt_out_keywords` table:
  ```sql
  CREATE TABLE opt_out_keywords (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(100) UNIQUE NOT NULL,
    language VARCHAR(10) DEFAULT 'pt_BR',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Index on `keyword` for fast lookup

#### 6. Testing Requirements
- [ ] Unit test: Detect exact keyword "parar" → true
- [ ] Unit test: Detect variation "parando" → true
- [ ] Unit test: Negation "quero continuar não parar" → true (matches "parar")
- [ ] Unit test: No match "qual o preço?" → false
- [ ] Unit test: Case insensitivity "PARAR" → true
- [ ] Unit test: Unicode "pará" normalized to "parar" → true
- [ ] Performance test: 1000 keywords in < 100ms
- [ ] Integration test: Message with keyword skips AIService

### Files to Create/Modify

**New Files:**
- `src/services/OptOutDetector.ts` (150 lines)
- `tests/unit/OptOutDetector.test.ts` (200 lines)

**Modified Files:**
- `src/jobs/handlers.ts` - Add opt-out detection to processMessageHandler
- `migrations/005_add_optout_keywords_table.sql` - New migration

**Estimated LOC:** 350 lines code + 200 lines tests

### Dependencies
- EPIC 2 complete (message processing)
- Database connection available
- User model with opted_out field

### Definition of Done
- [ ] All unit tests passing (8/8)
- [ ] Integration test with processMessageHandler passing
- [ ] Database migration executed
- [ ] Code reviewed by @architect
- [ ] Build passing (npm run build)
- [ ] ESLint passing
- [ ] TypeScript types correct

---

## SARA-3.2: AI-Based Opt-out Detection (Fallback)

**Story ID:** SARA-3.2
**Title:** OpenAI-based Intent Detection for Opt-out
**Estimated Points:** 10
**Priority:** P0 (Critical Path)
**Depends on:** SARA-3.1

### User Story

```
As a Scrum Master,
I want AI to detect subtle opt-out requests that don't match keywords,
So that we catch more user opt-outs even with creative phrasing.
```

### Acceptance Criteria

#### 1. New Method in AIService
- [ ] Implement `detectOptOutIntent(context, userMessage): { isOptOut: boolean, confidence: number, reason: string }`
- [ ] Called AFTER deterministic keyword detection (fallback)
- [ ] Return within 3-second timeout
- [ ] Return structured response with:
  - `isOptOut: boolean` - Clear yes/no
  - `confidence: 0.0-1.0` - How confident (0.9+ = action)
  - `reason: string` - Why we think it's opt-out

#### 2. Opt-out Detection Prompt
```
System Prompt Example:
"Você é um assistente para detectar intenção de cancelamento em mensagens.
Analise a mensagem do usuário e retorne JSON:
{
  'isOptOut': boolean,
  'confidence': 0.0-1.0,
  'reason': 'Motivo da detecção'
}

Detecte pedidos como:
- 'não quero mais'
- 'tire meu número'
- 'deixe de enviar'
- 'parei de interessar'
- Referências implícitas: 'seu produto é ruim'
- Urgency: 'para de me encher'
"
```

#### 3. Confidence Thresholds
- [ ] Confidence >= 0.9: Treat as definite opt-out
- [ ] Confidence 0.7-0.89: Log and review later
- [ ] Confidence < 0.7: Ignore (continue normal flow)
- [ ] Make thresholds configurable

#### 4. Integration with Message Processing
- [ ] Call in processMessageHandler AFTER keyword detection
- [ ] If isOptOut && confidence >= 0.9:
  - [ ] Mark user as opted out
  - [ ] Send confirmation message
  - [ ] Don't call interpretMessage()
- [ ] If confidence 0.7-0.89:
  - [ ] Log for manual review
  - [ ] Continue with normal response (safe approach)
- [ ] Timeout (> 3s): Treat as false (continue normally)

#### 5. Error Handling
- [ ] API errors: Fallback to false (don't opt out user accidentally)
- [ ] Rate limits: Retry with exponential backoff
- [ ] Timeouts: Log and continue (safe)
- [ ] JSON parse errors: Log, fallback to false

#### 6. Testing Requirements
- [ ] Unit test: Clear opt-out → confidence > 0.9
- [ ] Unit test: Subtle opt-out → confidence 0.7-0.89
- [ ] Unit test: Not opt-out → confidence < 0.7
- [ ] Unit test: Timeout handling (3s) → returns false
- [ ] Unit test: API error → returns false
- [ ] Integration test: Message flow with AI detection
- [ ] Mock test: Verify confidence thresholds

### Files to Create/Modify

**Modified Files:**
- `src/services/AIService.ts` - Add detectOptOutIntent method
- `src/jobs/handlers.ts` - Call AI detection in processMessageHandler
- `tests/unit/AIService.test.ts` - Add detection tests

**Estimated LOC:** 200 lines code + 150 lines tests

### Dependencies
- SARA-3.1 complete (keyword detection)
- OpenAI API key configured
- AIService working from EPIC 2

### Definition of Done
- [ ] detectOptOutIntent method implemented
- [ ] All unit tests passing (8/8)
- [ ] Integration test with processMessageHandler passing
- [ ] Confidence threshold handling verified
- [ ] Timeout handling working
- [ ] Code reviewed by @architect
- [ ] Build passing

---

## SARA-3.3: Compliance Service

**Story ID:** SARA-3.3
**Title:** LGPD & WhatsApp 24-hour Window Compliance
**Estimated Points:** 8
**Priority:** P0 (Critical Path)
**Depends on:** SARA-3.1

### User Story

```
As a Scrum Master,
I want to enforce WhatsApp message compliance rules,
So that we respect user preferences and follow platform guidelines.
```

### Acceptance Criteria

#### 1. ComplianceService Implementation
- [ ] Create `src/services/ComplianceService.ts` (new)
- [ ] Implement validation methods:
  - `canSendMessage(conversationId): boolean` - Check 24-hour window
  - `isUserOptedOut(userId): boolean` - Check opt-out status
  - `hasConversationExpired(conversationId): boolean` - Check expiration
  - `logComplianceEvent(userId, event, metadata): void` - Audit trail

#### 2. WhatsApp 24-hour Window Validation
- [ ] Get last_message_at from conversation
- [ ] Calculate time elapsed
- [ ] If > 24 hours:
  - [ ] Return false (can't send without user message first)
  - [ ] Log compliance event
  - [ ] Mark conversation as expired
- [ ] If <= 24 hours: Return true (within window)

#### 3. LGPD Compliance Checks
- [ ] User opted_out flag must be respected
- [ ] Verify user has not requested deletion
- [ ] Check retention period (30 days default for chats)
- [ ] Log all message sends for audit
- [ ] Anonymize PII in logs after retention period

#### 4. Conversation Lifecycle
- [ ] New conversation: Open, 24-hour window active
- [ ] User message received: Reset 24-hour timer
- [ ] 24 hours without user message: Mark expired
- [ ] User opt-out: Mark as opted_out, stop all messages
- [ ] Conversion (payment): Mark as CLOSED, archive

#### 5. Audit Logging
- [ ] Log structure:
  ```
  {
    event_type: 'message_sent|opted_out|expired|compliance_check',
    user_id: string,
    conversation_id: string,
    timestamp: ISO8601,
    reason: string,
    metadata: {
      window_hours: number,
      last_message_at: string,
      is_within_window: boolean
    }
  }
  ```
- [ ] Write to `compliance_audit_log` table
- [ ] Implement retention policy (90 days default)

#### 6. Database Updates
- [ ] Ensure tables exist:
  ```sql
  ALTER TABLE conversations ADD COLUMN:
    - expired_at TIMESTAMP,
    - expires_at TIMESTAMP,
    - last_user_message_at TIMESTAMP;

  CREATE TABLE compliance_audit_log (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50),
    user_id UUID,
    conversation_id UUID,
    timestamp TIMESTAMP DEFAULT NOW(),
    reason TEXT,
    metadata JSONB,
    is_compliance_violation BOOLEAN DEFAULT false
  );
  ```

#### 7. Testing Requirements
- [ ] Unit test: Message within 24h window → returns true
- [ ] Unit test: Message after 24h window → returns false
- [ ] Unit test: Opted-out user → blocks message
- [ ] Unit test: Expired conversation → returns false
- [ ] Unit test: Audit log records event
- [ ] Integration test: Full compliance check flow
- [ ] Edge case: Exactly 24h boundary

### Files to Create/Modify

**New Files:**
- `src/services/ComplianceService.ts` (200 lines)
- `tests/unit/ComplianceService.test.ts` (250 lines)
- `migrations/006_add_compliance_columns.sql` (new)

**Modified Files:**
- `src/jobs/handlers.ts` - Call compliance check before sending
- `src/server.ts` - Register compliance service

**Estimated LOC:** 450 lines code + 250 lines tests

### Dependencies
- SARA-3.1 complete (opt-out status)
- Database migrations from EPIC 2
- Conversation model

### Definition of Done
- [ ] ComplianceService fully implemented
- [ ] All unit tests passing (10/10)
- [ ] Integration with message processing verified
- [ ] Audit logging working
- [ ] Database migration executed
- [ ] Code reviewed by @architect
- [ ] Build passing

---

## SARA-3.4: Payment Webhook Handler

**Story ID:** SARA-3.4
**Title:** Conversion Tracking via Payment Webhook
**Estimated Points:** 10
**Priority:** P1 (Important)
**Parallel to:** SARA-3.5

### User Story

```
As a Scrum Master,
I want to track successful conversions when users pay,
So that we measure SARA's impact on cart recovery.
```

### Acceptance Criteria

#### 1. Payment Webhook Endpoint
- [ ] Create POST `/webhook/payment` endpoint
- [ ] Accept payment provider webhooks (e.g., Stripe, Shopify)
- [ ] Validate webhook signature (provider-specific)
- [ ] Return 200 OK within 5 seconds
- [ ] Enqueue async job for processing

#### 2. Conversion Logic
- [ ] Extract order ID / customer ID from webhook
- [ ] Find associated abandonment
- [ ] Find associated conversation
- [ ] Mark abandonment as RECOVERED
- [ ] Close conversation
- [ ] Update user conversion_count
- [ ] Log conversion event

#### 3. Data Model Updates
```sql
ALTER TABLE abandonments ADD COLUMN:
  - recovered_at TIMESTAMP,
  - recovery_source VARCHAR(50), -- 'whatsapp_sara' | 'direct' | 'other'
  - order_id VARCHAR(100),
  - order_value DECIMAL(10,2);

ALTER TABLE users ADD COLUMN:
  - conversions_count INT DEFAULT 0,
  - total_recovered_value DECIMAL(12,2) DEFAULT 0;

ALTER TABLE conversations ADD COLUMN:
  - recovered_at TIMESTAMP,
  - conversion_metadata JSONB;
```

#### 4. Idempotency Handling
- [ ] Payment webhooks can arrive multiple times
- [ ] Use order_id as idempotency key
- [ ] Check if conversion already processed
- [ ] Return success even if duplicate (idempotent)
- [ ] Log duplicate detection

#### 5. Error Handling
- [ ] 400: Invalid payload → log and return 200 OK (Meta pattern)
- [ ] 403: Invalid signature → reject silently
- [ ] 500: Processing error → queue retry, return 200 OK
- [ ] Missing abandonment → log, don't fail

#### 6. Conversion Analytics
- [ ] Track:
  - Conversion rate (conversions / total abandonments)
  - Average recovery value
  - Time to conversion
  - SARA cycle count at conversion
- [ ] Create `ConversionRepository.createConversionEvent()`
- [ ] Store in `conversion_events` table

#### 7. Testing Requirements
- [ ] Unit test: Valid webhook → creates conversion
- [ ] Unit test: Invalid signature → rejected
- [ ] Unit test: Duplicate webhook → idempotent
- [ ] Unit test: Missing abandonment → logged gracefully
- [ ] Integration test: End-to-end conversion flow
- [ ] Mock test: Provider webhook simulation

### Files to Create/Modify

**New Files:**
- `src/routes/webhooks.ts` - Add POST /webhook/payment
- `src/services/ConversionService.ts` (new, 200 lines)
- `src/repositories/ConversionRepository.ts` (new, 150 lines)
- `tests/integration/paymentWebhook.test.ts` (250 lines)
- `migrations/007_add_conversion_tracking.sql` (new)

**Estimated LOC:** 400 lines code + 250 lines tests

### Dependencies
- SARA-3.1 complete (basic compliance)
- Payment provider integration (configuration)
- Abandonment model

### Definition of Done
- [ ] POST /webhook/payment endpoint working
- [ ] Conversion logic implemented
- [ ] All unit tests passing (8/8)
- [ ] Integration test passing
- [ ] Idempotency verified
- [ ] Database migration executed
- [ ] Code reviewed by @architect
- [ ] Build passing

---

## SARA-3.5: Advanced Message Routing

**Story ID:** SARA-3.5
**Title:** State-Based Message Routing & Specialized Handlers
**Estimated Points:** 8
**Priority:** P1 (Important)
**Parallel to:** SARA-3.4

### User Story

```
As a Scrum Master,
I want to route messages to different handlers based on conversation state,
So that we can provide specialized responses for different scenarios.
```

### Acceptance Criteria

#### 1. Conversation State Machine
- [ ] Define state transitions:
  ```
  AWAITING_RESPONSE → OPTED_OUT (immediate)
  AWAITING_RESPONSE → ACTIVE (on user message)
  ACTIVE → AWAITING_RESPONSE (after SARA sends)
  ACTIVE → CLOSED (payment received)
  ACTIVE → EXPIRED (24h window exceeded)
  ACTIVE → OPTED_OUT (user requests)
  ```
- [ ] Validate transitions (reject invalid ones)
- [ ] Log state changes with audit trail

#### 2. Specialized Handlers
- [ ] Create handler registry:
  - `OptOutMessageHandler` - Handle opt-out flow
  - `ExpiredConversationHandler` - Handle expired message
  - `ConversionHandler` - Handle post-payment scenarios
  - `DiscountOfferHandler` - Special pricing responses
  - `DefaultHandler` - Normal AI response
- [ ] Route based on conversation state

#### 3. Handler Interface
```typescript
interface MessageHandler {
  canHandle(context: MessageContext): boolean;
  handle(context: MessageContext): Promise<MessageResponse>;
}

interface MessageContext {
  conversationId: string;
  state: ConversationState;
  userMessage: string;
  messageCount: number;
  cycleCount: number;
  lastMessageAt: Date;
  abandonmentValue: number;
}
```

#### 4. Default Response Messages
- [ ] Define per-state responses:
  - OPTED_OUT: Confirmation message
  - EXPIRED: "Would you like to hear our latest offer?"
  - ACTIVE (first message): Greeting + context
  - ACTIVE (follow-up): Contextual response
  - CLOSED: Thank you message

#### 5. Integration with Message Processing
- [ ] In `processMessageHandler()`:
  1. Load conversation state
  2. Check compliance (ComplianceService)
  3. Check opt-out (OptOutDetector + AIService)
  4. Find matching handler based on state
  5. Call handler
  6. Send response
  7. Update state

#### 6. Configuration Management
- [ ] Make handler responses configurable
- [ ] Store in database or config files
- [ ] Support A/B testing different responses
- [ ] Log which handler was used

#### 7. Testing Requirements
- [ ] Unit test: Route to correct handler per state
- [ ] Unit test: Reject invalid state transitions
- [ ] Unit test: Each handler produces valid response
- [ ] Integration test: Full message flow with routing
- [ ] Edge case: Concurrent state changes

### Files to Create/Modify

**New Files:**
- `src/handlers/MessageHandlerRegistry.ts` (150 lines)
- `src/handlers/OptOutMessageHandler.ts` (100 lines)
- `src/handlers/ExpiredConversationHandler.ts` (100 lines)
- `src/handlers/ConversionHandler.ts` (100 lines)
- `src/handlers/DefaultHandler.ts` (100 lines)
- `tests/unit/MessageHandlerRegistry.test.ts` (200 lines)

**Modified Files:**
- `src/jobs/handlers.ts` - Integrate handler routing
- `src/types/sara.ts` - Add MessageHandler interface

**Estimated LOC:** 550 lines code + 200 lines tests

### Dependencies
- SARA-3.1-3.4 mostly complete
- ComplianceService
- Conversation state tracking

### Definition of Done
- [ ] MessageHandlerRegistry implemented
- [ ] All handlers implemented
- [ ] All unit tests passing (10/10)
- [ ] Integration test passing
- [ ] State machine validated
- [ ] Code reviewed by @architect
- [ ] Build passing

---

## Development Schedule

### Sprint 1 (Week 1-2): Compliance Foundation
```
Monday:    Kickoff, story refinement
Tuesday:   SARA-3.1 development starts (@dev)
Wednesday: SARA-3.3 development starts (parallel)
Thursday:  Unit tests, code review
Friday:    Sprint review, integration testing
```

**Deliverables:** SARA-3.1, SARA-3.3 complete with tests

### Sprint 2 (Week 3): Advanced Detection
```
Monday:    Sprint planning, SARA-3.2 kickoff
Tuesday:   SARA-3.2 + SARA-3.5 parallel
Wednesday: Integration testing
Thursday:  Code review, refinement
Friday:    Sprint review
```

**Deliverables:** SARA-3.2, SARA-3.5 complete with tests

### Sprint 3 (Week 4): Conversion Tracking
```
Monday:    SARA-3.4 kickoff
Tuesday:   Full implementation
Wednesday: Integration testing
Thursday:  Code review, bug fixes
Friday:    Release readiness review
```

**Deliverables:** SARA-3.4 complete, EPIC 3 release ready

---

## Risk Assessment & Mitigation

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| AI timeout affecting opt-out detection | Medium | High | Implement 3s timeout, fallback to keyword detection |
| Payment webhook race conditions | Low | High | Implement idempotency keys, database locks |
| 24h window clock skew | Low | Medium | Use server time only, avoid client time |
| Compliance audit gaps | Medium | High | Implement comprehensive logging from day 1 |
| Complex state transitions | Medium | Medium | Use state machine validation, extensive testing |

### Mitigation Strategy

1. **AI Reliability:** Keyword detection as primary, AI as fallback
2. **Data Integrity:** Use database transactions for critical updates
3. **Testing:** High test coverage (>90%) for compliance-critical code
4. **Monitoring:** Real-time alerts for compliance violations
5. **Documentation:** Clear state diagrams and decision trees

---

## Testing Strategy

### Unit Tests (40+ tests)
- Service behavior in isolation
- Business logic validation
- Error handling scenarios
- Edge cases per story

### Integration Tests (20+ tests)
- Full message flow per story
- Multiple services working together
- Database operations
- Webhook processing

### E2E Tests (10+ tests)
- Complete user journey: Message → Opt-out → Confirmation
- Complete user journey: Message → Conversion → Closure
- Compliance verification
- State machine transitions

### Manual Testing
- Real WhatsApp messages to test number
- Payment webhook simulation (Postman/curl)
- Compliance audit log review
- UI verification (admin dashboard if available)

---

## Success Criteria

### EPIC 3 Definition of Done

- [ ] All 5 stories complete with code
- [ ] 70+ unit tests passing
- [ ] 20+ integration tests passing
- [ ] Build passing (npm run build)
- [ ] ESLint passing (0 errors)
- [ ] TypeScript passing (0 errors)
- [ ] All compliance scenarios tested
- [ ] Audit logs verified
- [ ] Documentation complete
- [ ] Team sign-off

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|------------|
| Test Coverage | >85% | npm test report |
| Build Success | 100% | npm run build |
| TypeScript Errors | 0 | npm run typecheck |
| ESLint Errors | 0 | npm run lint |
| Code Review | 100% | GitHub review checklist |
| Documentation | Complete | ReadMe, API docs |

---

## Dependencies & Prerequisites

### Code Dependencies
- ✅ EPIC 2 complete (message processing infrastructure)
- ✅ Database connection working
- ✅ Redis available for caching
- ✅ OpenAI API configured

### Infrastructure Dependencies
- ✅ WhatsApp Cloud API configured
- ⏳ Payment provider webhooks configured (Stripe/Shopify)
- ⏳ Ngrok or equivalent for local testing

### Team Dependencies
- ✅ @dev (Developer) available
- ✅ @architect (Tech Lead) for reviews
- ✅ @qa (QA) for testing
- ✅ @pm (Project Manager) for coordination

---

## Next Steps

### Immediate (Within 48 hours)
1. [ ] Review this planning document with @architect
2. [ ] Refine story acceptance criteria with team input
3. [ ] Identify any missing dependencies
4. [ ] Prepare test data (test users, abandonments)
5. [ ] Create GitHub issues for each story

### Pre-Development (Week of 2026-02-10)
1. [ ] Architect review session
2. [ ] Database schema review
3. [ ] Test strategy refinement
4. [ ] Development environment setup
5. [ ] Story estimation finalization

### Development Kickoff (2026-02-XX)
1. [ ] Sprint 1 begins with SARA-3.1 + SARA-3.3
2. [ ] Daily standups with team
3. [ ] Continuous code review
4. [ ] Parallel QA test preparation

---

## Resource Allocation

### Team Assignments

**SARA-3.1 (Deterministic Opt-out):**
- Dev: @dev
- Review: @architect
- Testing: @qa
- Estimated: 8 points / 5 days

**SARA-3.2 (AI-based Opt-out):**
- Dev: @dev
- Review: @architect
- Testing: @qa
- Estimated: 10 points / 6 days

**SARA-3.3 (Compliance Service):**
- Dev: @dev (parallel with SARA-3.1)
- Review: @architect
- Testing: @qa
- Estimated: 8 points / 5 days

**SARA-3.4 (Payment Webhook):**
- Dev: @dev
- Review: @architect
- Testing: @qa
- Estimated: 10 points / 6 days

**SARA-3.5 (Advanced Routing):**
- Dev: @dev (parallel with SARA-3.4)
- Review: @architect
- Testing: @qa
- Estimated: 8 points / 5 days

### Velocity

- **Sprint Capacity:** 44 story points
- **Team Velocity:** ~15 points/week (based on EPIC 2)
- **Duration:** 3 weeks

---

## Success Story Examples

### Scenario 1: User Opts Out
```
1. User sends: "parar"
2. OptOutDetector matches keyword
3. User marked as opted_out
4. Confirmation sent: "Entendi, sua solicitação foi registrada..."
5. No further messages sent
6. Audit logged: opt_out_event
```

### Scenario 2: Subtle Opt-out Request
```
1. User sends: "acho que não vou mais comprar"
2. OptOutDetector finds no match
3. AIService.detectOptOutIntent() called
4. AI returns: confidence 0.92, isOptOut=true
5. Same as Scenario 1
```

### Scenario 3: Successful Conversion
```
1. User messages back and forth
2. Payment webhook received (order_id=12345)
3. PaymentHandler.processConversion() called
4. Abandonment marked as RECOVERED
5. Conversation marked as CLOSED
6. Analytics updated (conversion rate, etc.)
7. Audit logged: conversion_event
```

### Scenario 4: 24-hour Window Expired
```
1. Conversation created, user gets message
2. 25 hours pass without user response
3. Next message attempt triggers ComplianceService
4. Check fails: window expired
5. Message queued for follow-up (with special "re-engagement" message)
6. Audit logged: window_expired_event
```

---

## Related Documentation

| Document | Link | Purpose |
|----------|------|---------|
| EPIC 2 Closure | [EPIC-2-CLOSURE.md](./EPIC-2-CLOSURE.md) | Reference completed work |
| EPIC 3 Stories | [EPIC_3_CONFORMIDADE_OPTOUT.md](../../stories/EPIC_3_CONFORMIDADE_OPTOUT.md) | Detailed story definitions |
| Message Flow | [guia-integracao-tecnica.md](./guia-integracao-tecnica.md) | Architecture reference |
| SARA Persona | [persona-system-prompt.md](./persona-system-prompt.md) | AI prompt reference |

---

## Approval & Sign-Off

**Epic Prepared by:** River (Scrum Master)
**Date:** 2026-02-06
**Status:** ✅ READY FOR TEAM REVIEW

**Next Approval Steps:**
1. [ ] @architect reviews and validates
2. [ ] @pm confirms resource availability
3. [ ] @dev confirms sprint capacity
4. [ ] @qa confirms testing capability
5. [ ] Team agrees on start date

---

## Summary

EPIC 3 represents the compliance and conversion tracking layer for Synkra AIOS. By implementing deterministic and AI-based opt-out detection, strict WhatsApp compliance, and conversion tracking, we create a responsible and measurable recovery system.

**Key Achievements Expected:**
- ✅ User preferences respected 100%
- ✅ LGPD/WhatsApp compliance enforced
- ✅ Conversion tracking enabled
- ✅ Advanced routing flexibility
- ✅ Comprehensive audit trail

**Timeline:** 3 weeks to completion
**Effort:** 44 story points
**Team:** 1 Dev + 1 Architect + 1 QA

---

*Planning Document Complete*
*Ready for team review and estimation refinement*
