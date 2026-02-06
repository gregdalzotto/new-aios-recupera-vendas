# EPIC 3: Message Processing & Abandonment Recovery

**Status:** Planning Complete
**Version:** 1.0
**Date:** 2026-02-06
**Project Manager:** @pm (Morgan)

---

## 📋 Executive Summary

EPIC 3 focuses on implementing the complete conversation flow for abandoned cart recovery through WhatsApp, building on EPIC 2's foundation (ConversationService, AIService, MessageService). This epic delivers the end-to-end abandonment recovery workflow with state management, conversation history, and quality gates.

**Key Deliverables:**
- [x] Story breakdown into 5 stories (SARA-3.1 through SARA-3.5)
- [x] Epic definition with success criteria
- [x] Dependencies and integration checkpoints documented
- [x] Quality gate definitions
- [x] Story templates with technical requirements

---

## 🎯 Epic Scope & Objectives

### Primary Objective
Implement the complete message processing and abandonment recovery conversation lifecycle, ensuring reliable persistence, state transitions, and recovery mechanisms.

### Epic Title
**EPIC 3: Message Processing & Abandonment Recovery**

### Success Criteria

| Criterion | Target | Owner |
|-----------|--------|-------|
| **Message Persistence** | 100% of incoming/outgoing messages persisted with metadata | @dev |
| **Conversation History** | All conversations retrievable with 50-message history | @dev |
| **Abandonment Tracking** | All abandonments tracked through complete lifecycle | @dev |
| **State Transitions** | All 5 conversation states properly transitioned | @dev |
| **Recovery Flow** | Complete cycle: init → active → response → closed/converted | @dev |
| **Test Coverage** | >85% code coverage for all services | @qa |
| **Performance** | Message processing < 2s latency (p95) | @dev |
| **Compliance** | All LGPD/WhatsApp policies enforced in code | @architect |
| **Documentation** | All APIs documented with examples | @dev |
| **Integration** | Seamless integration with EPIC 2 components | @dev |

---

## 📊 Epic Dependencies

### Incoming Dependencies (EPIC 2 Requirements)

EPIC 3 **requires completion** of EPIC 2:

| EPIC 2 Component | Status | Required For |
|------------------|--------|--------------|
| **ConversationService** | ✅ Complete | SARA-3.1, SARA-3.2, SARA-3.3 |
| **AIService (OpenAI)** | ✅ Complete | SARA-3.2, SARA-3.3, SARA-3.5 |
| **MessageService (WhatsApp)** | ✅ Complete | SARA-3.1, SARA-3.2, SARA-3.3 |
| **Webhook Handler (/webhook/messages)** | ✅ Complete | SARA-3.1, SARA-3.3 |
| **Job Queue (Bull + Redis)** | ✅ Complete | SARA-3.1, SARA-3.2, SARA-3.4 |
| **Message Model** | ✅ Complete | SARA-3.1 |
| **SaraContextPayload** | ✅ Complete | SARA-3.2, SARA-3.3 |

### Outgoing Dependencies (EPIC 3 Deliverables)

EPIC 3 provides foundation for:

| Epic/Feature | Dependency | Status |
|--------------|-----------|--------|
| **EPIC 4: Analytics & Reporting** | Message history, abandonment tracking data | Planned Q1 |
| **EPIC 5: Discount Logic** | Conversation state, message intent classification | Planned Q1 |
| **EPIC 6: Template Management** | Message storage with metadata, template tracking | Planned Q2 |
| **Dashboard (Phase 2)** | Conversation API, message retrieval | Planned Q2 |

---

## 📈 Timeline & Milestones

### Project Phases

```
EPIC 2 (Complete)     EPIC 3 Planning    EPIC 3 Development    Release
   Jan 27-Feb 6        Feb 6              Feb 7-20              Feb 21
      ↓                   ↓                    ↓                   ↓
   +--------+          +-------+          +----------+          +-----+
   │ READY  │          │ PLANNING
   +--------+          +-------+
                               │
                               └──→ [SARA-3.1]
                                   [SARA-3.2]
                                   [SARA-3.3]
                                   [SARA-3.4]
                                   [SARA-3.5]
                                   [Integration]
                                   [Release]
```

### Key Milestones

| Milestone | Target Date | Owner | Criteria |
|-----------|-------------|-------|----------|
| **Story Breakdown Complete** | 2026-02-06 | @pm | All 5 stories scoped |
| **SARA-3.1 Complete** | 2026-02-09 | @dev | Messages persisted, tested |
| **SARA-3.2 Complete** | 2026-02-11 | @dev | Conversation history working |
| **SARA-3.3 Complete** | 2026-02-13 | @dev | Abandonment flow tested |
| **SARA-3.4 Complete** | 2026-02-15 | @dev | State transitions validated |
| **SARA-3.5 Complete** | 2026-02-18 | @dev | All integration tests passing |
| **Code Review** | 2026-02-19 | @architect | Architecture compliance |
| **Release** | 2026-02-21 | @devops | Production deployment |

---

## 📖 Story Breakdown

### Story Overview Table

| Story ID | Title | Points | Owner | Dependencies | Status |
|----------|-------|--------|-------|--------------|--------|
| **SARA-3.1** | Message Persistence & Retrieval | 8 | @dev | EPIC 2 complete | Ready |
| **SARA-3.2** | Conversation History Management | 8 | @dev | SARA-3.1 | Ready |
| **SARA-3.3** | Abandonment Recovery Flow | 13 | @dev | SARA-3.1, SARA-3.2 | Ready |
| **SARA-3.4** | Cycle Management & State Transitions | 8 | @dev | SARA-3.2, SARA-3.3 | Ready |
| **SARA-3.5** | Integration Testing & Quality Gates | 10 | @qa | All stories | Ready |

**Total Story Points:** 47 pts
**Estimated Timeline:** 2 weeks
**Team Size:** 2-3 developers

---

## 📝 Detailed Story Specifications

### SARA-3.1: Message Persistence & Retrieval

**Story Points:** 8
**Epic:** EPIC 3
**Owner:** @dev
**Duration:** 2-3 days

#### Description
Implement complete message storage and retrieval system for conversations. Ensure all incoming (user) and outgoing (SARA) messages are persisted with full metadata for audit, analytics, and conversation context.

#### Acceptance Criteria

```
GIVEN a user sends a message via WhatsApp
WHEN the webhook is processed
THEN the message is persisted with:
  ✓ conversation_id (foreign key)
  ✓ from_sender ('sara' or 'user')
  ✓ message_text (full text content)
  ✓ whatsapp_message_id (for dedup)
  ✓ timestamp (creation time)
  ✓ metadata (intent, sentiment, links, etc.)

GIVEN a conversation exists
WHEN retrieving messages
THEN return paginated messages:
  ✓ Latest messages first
  ✓ Limit configurable (default 50)
  ✓ Offset support for pagination
  ✓ Include message type, intent, sentiment

GIVEN outgoing message from SARA
WHEN storing
THEN include:
  ✓ openai_response_id (if from AI)
  ✓ openai_tokens_used (for cost tracking)
  ✓ message_type ('text', 'template')
  ✓ sentiment (if available)

GIVEN message retrieval query
WHEN filtering
THEN support:
  ✓ Filter by conversation_id
  ✓ Filter by from_sender ('sara' or 'user')
  ✓ Filter by date range
  ✓ Search by text content (optional, phase 2)
```

#### Technical Requirements

1. **Database Layer**
   - Messages table already exists (from EPIC 2)
   - Ensure all indices are in place for performance
   - Add covering index: `(conversation_id, created_at)` if not present

2. **Message Repository**
   - `create(message: Message): Promise<Message>`
   - `findByConversationId(conversationId: UUID, limit?: number, offset?: number): Promise<Message[]>`
   - `findByWhatsappId(whatsappId: string): Promise<Message | null>` (for dedup)
   - `countByConversationId(conversationId: UUID): Promise<number>`

3. **Service Layer (MessageService)**
   - `storeIncomingMessage(conversationId, text, whatsappId, metadata): Promise<Message>`
   - `storeOutgoingMessage(conversationId, text, metadata): Promise<Message>`
   - `getConversationHistory(conversationId, limit?): Promise<Message[]>`

4. **Validation**
   - Message text not empty, < 4096 chars (WhatsApp limit)
   - conversation_id must exist (foreign key constraint)
   - whatsapp_message_id UNIQUE per conversation
   - from_sender must be 'sara' or 'user'

5. **Tests**
   - Unit: Message validation, sanitization
   - Unit: Repository CRUD operations
   - Integration: Message persistence end-to-end
   - Integration: Dedup detection (same whatsapp_message_id)

#### Integration Checkpoints

1. Verify messages table migrated successfully
2. Verify indices created for performance
3. Test dedup: Send same message twice, verify stored once
4. Test retrieval: Load conversation with 100+ messages

#### Quality Gates

- [ ] Code coverage > 85%
- [ ] No SQL injection vulnerabilities
- [ ] Pagination works correctly
- [ ] All CRUD operations tested
- [ ] Performance: query < 100ms for 100 messages

#### Definition of Done

- [x] Code written and tested
- [x] Code reviewed and merged
- [x] Documentation updated
- [x] All tests passing
- [x] Database migrations applied
- [x] Integrated with existing services
- [x] PR merged to develop

---

### SARA-3.2: Conversation History Management

**Story Points:** 8
**Epic:** EPIC 3
**Owner:** @dev
**Duration:** 2-3 days

#### Description
Implement conversation history system that tracks entire lifecycle of conversation: initial template, user responses, SARA responses, state changes. Build context loading for AI interpretation and provide history APIs for audit/review.

#### Acceptance Criteria

```
GIVEN a conversation exists in DB
WHEN loading for context
THEN return:
  ✓ User info (name, phone)
  ✓ Abandonment info (product, value, discount)
  ✓ Last 20 messages (ordered chronologically)
  ✓ Conversation state (active, awaiting, closed, error)
  ✓ Cycle count
  ✓ Last message timestamps

GIVEN conversation in ACTIVE state
WHEN retrieving for AI interpretation
THEN provide:
  ✓ Complete message history (paginated)
  ✓ Message metadata (intent, sentiment)
  ✓ Conversation metadata (cycle, state, duration)
  ✓ User context (SaraContextPayload format)

GIVEN conversation closed
WHEN retrieving final history
THEN include:
  ✓ Final status (converted, declined, abandoned)
  ✓ Closure reason
  ✓ Duration of conversation
  ✓ Message count
  ✓ Conversion link used (if any)

GIVEN user requests history
WHEN retrieving via API
THEN return paginated:
  ✓ Limit 50 messages default
  ✓ Offset support
  ✓ Include all metadata
  ✓ Properly formatted response

GIVEN conversation state change
WHEN persisting
THEN track:
  ✓ Previous state
  ✓ New state
  ✓ Timestamp of change
  ✓ Reason (optional)
```

#### Technical Requirements

1. **Data Structure (already in EPIC 2, extend if needed)**
   - Conversations table: id, abandonment_id, user_id, status, message_count, last_message_at, last_user_message_at, cycle_count
   - Messages table: conversation_id, from_sender, message_text, metadata, created_at

2. **ConversationService (extend existing)**
   - `loadForContext(conversationId): Promise<SaraContextPayload>`
   - `getFullHistory(conversationId, limit?, offset?): Promise<ConversationHistory>`
   - `getMetadata(conversationId): Promise<ConversationMetadata>`
   - `updateLastMessageAt(conversationId): Promise<void>`
   - `updateState(conversationId, newState, reason?): Promise<void>`

3. **Conversation Repository (extend existing)**
   - `findWithMessages(conversationId, limit?): Promise<ConversationWithMessages>`
   - `updateMetadata(conversationId, metadata): Promise<void>`
   - `getConversationStats(conversationId): Promise<ConversationStats>`

4. **SaraContextPayload (from EPIC 2, use as-is)**
   - Already defined in `/src/types/sara.ts`
   - Used for building AI context

5. **Tests**
   - Unit: Context building logic
   - Integration: Load full conversation with 20+ messages
   - Integration: State transitions tracked correctly
   - Performance: Load context for conversation in < 500ms

#### Integration Checkpoints

1. Verify SaraContextPayload structure matches AI expectations
2. Load conversation and verify all fields present
3. Test with conversations of varying message counts (5, 20, 100+)
4. Verify performance with large message counts

#### Quality Gates

- [ ] Context load time < 500ms
- [ ] All fields in SaraContextPayload populated correctly
- [ ] History API paginated correctly
- [ ] State changes tracked and auditable
- [ ] Code coverage > 85%

#### Definition of Done

- [x] Code written and tested
- [x] Integration with AIService verified
- [x] Context loading tested end-to-end
- [x] All tests passing
- [x] Performance benchmarks met
- [x] Documented with examples
- [x] PR merged to develop

---

### SARA-3.3: Abandonment Recovery Conversation Flow

**Story Points:** 13
**Epic:** EPIC 3
**Owner:** @dev
**Duration:** 4-5 days

#### Description
Implement the complete abandonment recovery conversation flow: from template dispatch through message exchanges to closure. Handle both successful conversions and natural conversation endings. Ensure compliance with WhatsApp 24-hour window and LGPD requirements.

#### Acceptance Criteria

```
GIVEN abandonment event received
WHEN processing
THEN execute flow:
  ✓ Create user if not exists
  ✓ Create abandonment record
  ✓ Create conversation (status: awaiting_response)
  ✓ Send template message via WhatsApp
  ✓ Persist template in message table
  ✓ Return 200 OK with conversation ID

GIVEN user responds to template
WHEN webhook received
THEN process:
  ✓ Verify HMAC signature
  ✓ Dedup: Check whatsapp_message_id unique
  ✓ Load conversation
  ✓ Check opt-out (compliance)
  ✓ Check 24-hour window
  ✓ Store incoming message
  ✓ Transition state: awaiting_response → active
  ✓ Call AIService to interpret
  ✓ Generate response
  ✓ Send response via WhatsApp
  ✓ Persist response message
  ✓ Update conversation metadata
  ✓ Return 200 OK

GIVEN conversation in ACTIVE state
WHEN user messages continuously
THEN handle:
  ✓ All messages processed through AI
  ✓ Context grows (message history)
  ✓ Intent/sentiment tracked
  ✓ Message count incremented
  ✓ Last message timestamps updated

GIVEN user says "yes" or confirms interest
WHEN processing message
THEN handle:
  ✓ Intent detected as 'confirmation' or 'objection_resolved'
  ✓ Send payment link
  ✓ Mark conversation ready for payment
  ✓ Optional: Store decision in metadata

GIVEN user opts out explicitly
WHEN processing message
THEN handle:
  ✓ Detect opt-out (deterministic + AI)
  ✓ Mark user as opted_out = true
  ✓ Send compliance message
  ✓ Close conversation (status: closed)
  ✓ Mark abandonment as declined
  ✓ No further messages sent to user

GIVEN payment confirmed
WHEN payment webhook received
THEN handle:
  ✓ Find abandonment
  ✓ Mark abandonment as converted
  ✓ Close conversation
  ✓ Record conversion link used
  ✓ Send thank you message
  ✓ Update analytics

GIVEN conversation inactive > 24 hours
WHEN checking window
THEN enforce:
  ✓ No proactive messages sent after 24h (unless template)
  ✓ Allow user to respond within 24h window
  ✓ After window: conversation auto-closes if inactive
```

#### Technical Requirements

1. **Abandonment Handling**
   - Handler: `POST /webhook/abandonment`
   - Verify HMAC signature
   - Validate payload (phone, product, value)
   - Create user, abandonment, conversation atomically
   - Dispatch template message
   - Log event in webhooks_log

2. **Message Webhook Processing**
   - Handler: `POST /webhook/messages`
   - Parse Meta webhook format
   - Verify HMAC (X-Hub-Signature-256)
   - Dedup check (whatsapp_message_id UNIQUE)
   - Load conversation by phone number
   - Check opt-out status
   - Check 24-hour window
   - Detect opt-out (two-layer: deterministic + AI)
   - Call AIService.interpretMessage()
   - Build response
   - Send via WhatsApp API
   - Persist all messages
   - Return 200 OK

3. **State Transitions**
   - awaiting_response → active (on first user message)
   - active → closed (on opt-out, payment, or timeout)
   - error → active (on successful retry)
   - error → closed (on max retries exceeded)

4. **24-Hour Window Enforcement**
   - Check: `conversation.last_user_message_at + 24h > now()`
   - If outside window: log, skip AI processing, respond with generic message
   - If inside window: proceed normally

5. **Opt-Out Detection**
   - Deterministic: Keywords in opt_out_keywords table
   - Fallback: Call OpenAI if deterministic fails
   - On detection: Update user, close conversation, log event

6. **Tests**
   - Integration: Complete flow abandonment → response → conversion
   - Integration: Opt-out detection (deterministic + AI)
   - Integration: 24-hour window enforcement
   - Integration: Idempotency (same webhook twice)
   - Integration: State transitions correct
   - Load test: 100 concurrent conversations

#### Integration Checkpoints

1. Create test abandonment, verify template sent
2. Send user response, verify AI processing
3. Verify conversation state transitions
4. Test opt-out detection
5. Test 24-hour window
6. Verify dedup prevents double-processing

#### Quality Gates

- [ ] All state transitions logged and correct
- [ ] 24-hour window enforced
- [ ] Opt-out detection > 95% accuracy
- [ ] Message dedup working (no duplicates)
- [ ] Performance: Complete flow < 5s
- [ ] Code coverage > 85%
- [ ] All compliance checks in place

#### Definition of Done

- [x] Code written and integration tested
- [x] All acceptance criteria met
- [x] Compliance verified (@architect)
- [x] Performance validated
- [x] Test scenario passing
- [x] Documentation complete
- [x] PR merged to develop

---

### SARA-3.4: Cycle Management & State Transitions

**Story Points:** 8
**Epic:** EPIC 3
**Owner:** @dev
**Duration:** 2-3 days

#### Description
Implement cycle management system to track conversation progression through maximum 5 cycles (message exchanges). Ensure proper state transitions between conversation states and support lifecycle management (active → inactive, closed → archived).

#### Acceptance Criteria

```
GIVEN new conversation created
WHEN initializing
THEN set:
  ✓ cycle_count = 0
  ✓ max_cycles = 5 (hardcoded, configurable phase 2)
  ✓ status = awaiting_response

GIVEN user message received
WHEN counting cycles
THEN increment:
  ✓ cycle_count by 1
  ✓ Only for user-initiated messages (not templates)
  ✓ Track in database via trigger or code
  ✓ Log in messages.metadata

GIVEN cycle_count == 5 (max reached)
WHEN processing next message
THEN handle:
  ✓ Process current message
  ✓ Send "thank you, have a nice day" message
  ✓ Close conversation (status: closed)
  ✓ Mark as reached_max_cycles
  ✓ No further messages processed

GIVEN conversation in ACTIVE state
WHEN checking state transitions
THEN allow:
  ✓ active → closed (on opt-out, payment, max cycles)
  ✓ active → error (on API failure)
  ✓ active → awaiting (NO - invalid)

GIVEN conversation in ERROR state
WHEN retrying
THEN:
  ✓ Retry message processing
  ✓ On success: error → active
  ✓ On failure: keep error state
  ✓ Max 3 retries before mark failed

GIVEN conversation state = CLOSED
WHEN querying
THEN support:
  ✓ Archive after 30 days (phase 2)
  ✓ Remain queryable for analytics
  ✓ Support bulk archival for old conversations

GIVEN multiple transitions possible
WHEN choosing state
THEN priority:
  ✓ Opt-out → closed (highest)
  ✓ Max cycles → closed
  ✓ Payment confirmed → closed
  ✓ Timeout/inactive → closed
  ✓ Error with retries → active or closed

GIVEN state change
WHEN logging
THEN record:
  ✓ from_state
  ✓ to_state
  ✓ reason
  ✓ timestamp
  ✓ user_id
  ✓ conversation_id
```

#### Technical Requirements

1. **Cycle Tracking**
   - Database: cycle_count column in conversations (BIGINT)
   - Trigger: Auto-increment on each user message (or code-level)
   - Validation: Check cycle_count < max_cycles before processing

2. **State Machine**
   - States: awaiting_response, active, closed, error
   - Transitions defined and enforced
   - State change audit trail in conversations_state_history (optional, phase 2)

3. **ConversationService (extend)**
   - `incrementCycleCount(conversationId): Promise<number>`
   - `getCycleCount(conversationId): Promise<number>`
   - `isMaxCyclesReached(conversationId): Promise<boolean>`
   - `transitionState(conversationId, toState, reason?): Promise<void>`
   - `validateStateTransition(fromState, toState): boolean`

4. **Configuration**
   - Max cycles: 5 (hardcoded for EPIC 3, config in EPIC 4)
   - Can be overridden per abandonment (phase 2)

5. **Tests**
   - Unit: Cycle count validation
   - Unit: State transition rules
   - Integration: 5-cycle conversation flow
   - Integration: Max cycle closure
   - Integration: State transitions audit trail

#### Integration Checkpoints

1. Create conversation, verify cycle_count = 0
2. Exchange 5 messages, verify cycle increments
3. On 5th message, verify conversation closes
4. Verify state transitions logged
5. Test invalid transitions rejected

#### Quality Gates

- [ ] Cycle count accurate (matches message count)
- [ ] Max cycles enforced (no message after 5)
- [ ] State transitions logged
- [ ] All transitions validated
- [ ] Code coverage > 85%

#### Definition of Done

- [x] Code written and tested
- [x] Cycle tracking verified accurate
- [x] State transitions enforced
- [x] Audit trail working
- [x] All tests passing
- [x] Documented with examples
- [x] PR merged to develop

---

### SARA-3.5: Integration Testing & Quality Gates

**Story Points:** 10
**Epic:** EPIC 3
**Owner:** @qa
**Duration:** 3-4 days

#### Description
Comprehensive integration testing of entire EPIC 3 flow. Validate all stories working together, performance targets met, compliance requirements enforced, and quality gates passed.

#### Acceptance Criteria

```
GIVEN complete EPIC 3 implementation
WHEN running end-to-end test scenario
THEN validate:
  ✓ Abandonment event processed
  ✓ Template message sent
  ✓ User response received and stored
  ✓ AI interprets message correctly
  ✓ SARA response generated and sent
  ✓ Message persisted with all metadata
  ✓ Conversation state updated
  ✓ Cycle incremented
  ✓ History retrievable
  ✓ All 5 cycles complete
  ✓ Conversation closes cleanly

GIVEN multiple concurrent conversations
WHEN processing simultaneously
THEN validate:
  ✓ All conversations processed independently
  ✓ No data leaks between conversations
  ✓ Performance remains < 2s per message
  ✓ Database connections healthy

GIVEN message retrieval request
WHEN querying conversation history
THEN validate:
  ✓ All messages present
  ✓ Correct order (chronological)
  ✓ All metadata included
  ✓ Pagination works correctly
  ✓ Query performance < 500ms

GIVEN opt-out scenario
WHEN user says "stop"
THEN validate:
  ✓ Opt-out detected (deterministic or AI)
  ✓ User marked opted_out = true
  ✓ Conversation closed
  ✓ No further messages sent
  ✓ Compliance logged

GIVEN 24-hour window check
WHEN message received after 24h
THEN validate:
  ✓ Message flagged as outside window
  ✓ Generic response sent
  ✓ No AI processing
  ✓ No cycle increment
  ✓ Conversation remains open for payment

GIVEN payment confirmation webhook
WHEN received
THEN validate:
  ✓ Abandonment marked converted
  ✓ Conversation closed
  ✓ Thank you message sent
  ✓ Analytics updated

GIVEN code quality check
WHEN running tests and linting
THEN validate:
  ✓ All unit tests passing (100%)
  ✓ All integration tests passing (100%)
  ✓ Code coverage > 85%
  ✓ No TypeScript errors
  ✓ Linting passes (0 critical errors)

GIVEN performance testing
WHEN load testing
THEN validate:
  ✓ Single message processing < 2s
  ✓ Context loading < 500ms
  ✓ Message persisting < 100ms
  ✓ p95 latency meets SLA
  ✓ No timeouts under normal load

GIVEN database integrity
WHEN running integrity checks
THEN validate:
  ✓ Foreign key constraints enforced
  ✓ UNIQUE constraints prevent duplicates
  ✓ No orphaned records
  ✓ Dedup detection working 100%

GIVEN documentation review
WHEN checking docs
THEN validate:
  ✓ All APIs documented
  ✓ Error codes explained
  ✓ Examples provided
  ✓ Compliance notes included
  ✓ Troubleshooting guide present
```

#### Technical Requirements

1. **Test Scenarios**
   - Happy path: Abandonment → template → response → conversion
   - Opt-out path: Abandonment → template → opt-out response → closed
   - Max cycles: Abandonment → 5 message exchanges → closed
   - Outside window: Message received after 24h → generic response
   - Concurrent: 10 conversations processed simultaneously

2. **Test Data**
   - Create test abandonment records (5-10)
   - Create test users (3-5)
   - Load test with 100 concurrent conversations
   - Performance baseline measurement

3. **Test Infrastructure**
   - Testcontainers for PostgreSQL
   - Mock OpenAI API
   - Mock WhatsApp API
   - Jest for test framework
   - k6 for load testing

4. **Quality Gates (must pass)**
   - Code coverage > 85%
   - All tests passing
   - TypeScript: 0 errors
   - Linting: 0 critical errors
   - Performance: p95 latency < 2s
   - Dedup detection: 100% accuracy

5. **Compliance Validation**
   - Verify LGPD opt-out enforcement
   - Verify WhatsApp 24h window
   - Verify template usage compliance
   - Verify HMAC verification

#### Integration Checkpoints

1. Run complete test scenario (happy path)
2. Run all concurrent conversation tests
3. Run performance tests and validate p95
4. Run code quality checks (coverage, lint, types)
5. Run compliance validation tests
6. Run database integrity checks

#### Quality Gates

- [ ] 100% of unit tests passing
- [ ] 100% of integration tests passing
- [ ] Code coverage > 85%
- [ ] TypeScript: 0 errors
- [ ] Linting: 0 critical errors
- [ ] Performance: p95 < 2s
- [ ] Compliance: All checks passing
- [ ] Database: All integrity checks passing

#### Definition of Done

- [x] All test scenarios created and passing
- [x] Performance testing completed
- [x] Code quality verified
- [x] Compliance validated
- [x] Documentation reviewed
- [x] Ready for production release
- [x] Staging deployment successful

---

## 🏗️ Technical Architecture

### Database Schema (Already Designed, from EPIC 2)

Key tables for EPIC 3:

```sql
-- Core conversation table
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  abandonment_id UUID REFERENCES abandonments(id),
  user_id UUID REFERENCES users(id),
  status VARCHAR(50) -- awaiting_response, active, closed, error
  cycle_count BIGINT DEFAULT 0,  -- Tracks message exchanges
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  last_user_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  from_sender VARCHAR(50), -- 'sara' or 'user'
  message_text TEXT,
  message_type VARCHAR(20), -- 'text' or 'template'
  whatsapp_message_id VARCHAR(255) UNIQUE,
  openai_response_id VARCHAR(255),
  openai_tokens_used INTEGER,
  intent VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail (optional, for phase 2)
CREATE TABLE conversations_state_history (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  from_state VARCHAR(50),
  to_state VARCHAR(50),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Routes)                        │
│  POST /webhook/abandonment  POST /webhook/messages           │
│  GET /conversations/:id    POST /conversations/:id/close     │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                 Service Layer (Business Logic)              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Abandonment  │  │ Conversation │  │ Message Service │   │
│  │ Service      │  │ Service      │  │                 │   │
│  │              │  │              │  │                 │   │
│  │ • Validate   │  │ • Load       │  │ • Store incoming│   │
│  │ • Create     │  │ • Context    │  │ • Store outgoing│   │
│  │ • Dispatch   │  │ • History    │  │ • Retrieve      │   │
│  │              │  │ • State      │  │ • Dedup check   │   │
│  │              │  │ • Cycles     │  │                 │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ AI Service   │  │ Opt-Out      │  │ Compliance      │   │
│  │              │  │ Detection    │  │ Service         │   │
│  │ • Interpret  │  │              │  │                 │   │
│  │ • Generate   │  │ • Detect     │  │ • 24h window    │   │
│  │ • Context    │  │ • AI fallback│  │ • LGPD checks   │   │
│  │              │  │              │  │ • Audit logging │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                 Repository Layer (Data Access)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ User     │  │Abandonment│  │Conversation│  │ Message   │  │
│  │Repository│  │Repository │  │Repository  │  │Repository │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                    PostgreSQL (Supabase)                    │
│  Tables: conversations, messages, users, abandonments, ...  │
└────────────────────────────────────────────────────────────┘
```

### Integration with EPIC 2

```
EPIC 2 Provides              EPIC 3 Uses For
─────────────────           ──────────────────
ConversationService    →    Loading context, managing state
AIService (OpenAI)     →    Interpreting messages
MessageService         →    Sending responses
Webhook handler        →    Receiving & validating
Job queue (Bull)       →    Async message processing
Message model          →    Storing messages
SaraContextPayload     →    Building AI context
```

---

## 📋 Story Templates

### Template: Development Story (Stories 3.1 - 3.4)

```markdown
# SARA-3.X: [Story Title]

**Story Points:** [8-13]
**Epic:** EPIC 3
**Owner:** @dev
**Duration:** [2-5 days]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
...

## Technical Requirements
1. Database/Schema changes (if any)
2. Service modifications
3. Repository/Repository additions
4. API endpoints (if any)
5. Validation rules
6. Tests required

## Integration Checkpoints
- [ ] Checkpoint 1
- [ ] Checkpoint 2
- [ ] Checkpoint 3

## Quality Gates
- [ ] Code coverage > 85%
- [ ] All tests passing
- [ ] Performance targets met
- [ ] No TypeScript errors

## Definition of Done
- [x] Code written and tested
- [x] Integrated with related stories
- [x] Code reviewed
- [x] All tests passing
- [x] Documented
- [x] PR merged to develop
```

### Template: QA Story (Story 3.5)

```markdown
# SARA-3.5: Integration Testing & Quality Gates

**Story Points:** 10
**Epic:** EPIC 3
**Owner:** @qa
**Duration:** 3-4 days

## Test Scenarios
1. **Happy Path**
   - Abandonment → Template → Response → Conversion
   - Acceptance: Full flow completes successfully

2. **Opt-Out Path**
   - Abandonment → Template → Opt-out Response
   - Acceptance: User marked opted_out, no further messages

3. **Max Cycles**
   - 5 message exchanges
   - Acceptance: Conversation closes after 5 cycles

4. **Performance Testing**
   - Load testing with 100+ concurrent conversations
   - Acceptance: p95 latency < 2s

5. **Compliance Validation**
   - LGPD opt-out enforcement
   - WhatsApp 24h window
   - Acceptance: All compliance checks passing

## Quality Gates
- [ ] Code coverage > 85%
- [ ] All tests passing (unit + integration)
- [ ] TypeScript: 0 errors
- [ ] Linting: 0 critical errors
- [ ] Performance: p95 < 2s
- [ ] Compliance: All checks passing

## Definition of Done
- [x] All scenarios tested
- [x] Performance validated
- [x] Compliance verified
- [x] Ready for production
```

---

## 🎯 Success Metrics

### Implementation Metrics

| Metric | Target | Owner |
|--------|--------|-------|
| **Code Coverage** | > 85% | @dev |
| **Test Pass Rate** | 100% | @qa |
| **Performance (p95)** | < 2s | @dev |
| **Dedup Accuracy** | 100% | @dev |
| **Opt-out Detection** | > 95% | @qa |
| **Compliance** | 100% | @architect |

### Business Metrics (Phase 2)

| Metric | Target | Owner |
|--------|--------|-------|
| **Conversation Completion** | > 80% | @pm |
| **Conversion Rate** | > 5% | @pm |
| **Avg Messages per Conversation** | 3-5 | @pm |
| **Cost per Message** | < $0.001 | @pm |

---

## 🚀 Deployment Plan

### Pre-Deployment

1. Code review by @architect
2. Performance testing on staging
3. Compliance audit
4. Database migration dry-run
5. Stakeholder sign-off

### Deployment

1. Merge develop → main
2. Deploy to production via CI/CD
3. Monitor error rates (target: < 0.1%)
4. Monitor performance (target: p95 < 2s)
5. Monitor database (target: connections healthy)

### Post-Deployment

1. 24-hour monitoring window
2. Collect feedback from stakeholders
3. Validate metrics
4. Plan EPIC 4 scope

---

## 📚 Documentation Requirements

### Code Documentation

- [ ] Service layer: Method signatures with JSDoc comments
- [ ] Complex logic: Inline comments explaining rationale
- [ ] API endpoints: Request/response examples
- [ ] Error handling: Error codes and recovery strategies

### API Documentation

- [ ] Endpoint specifications (method, path, query params)
- [ ] Request/response schemas
- [ ] Error codes and meanings
- [ ] Authentication requirements
- [ ] Rate limiting (if applicable)
- [ ] Example cURL requests

### Operations Documentation

- [ ] Database migration instructions
- [ ] Troubleshooting guide
- [ ] Performance tuning guide
- [ ] Alert runbook
- [ ] Rollback procedures

### User Documentation

- [ ] How conversations work (user-facing)
- [ ] FAQ for common scenarios
- [ ] Opt-out instructions
- [ ] Contact support process

---

## 🤝 Team Assignments

### Development Team

| Role | Person | Stories | Hours/Week |
|------|--------|---------|-----------|
| **Lead Developer** | @dev | 3.1, 3.2, 3.3, 3.4 | 40 |
| **QA Lead** | @qa | 3.5 | 30 |
| **Architect Reviewer** | @architect | Review, compliance | 10 |
| **Project Manager** | @pm | Planning, tracking | 15 |

### Decision-Making

- **Technical Decisions**: @architect approval required
- **Scope Changes**: @pm approval required
- **Release Decision**: @devops approval required
- **Compliance**: @architect verification required

---

## ⚠️ Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Performance degradation** | Medium | High | Load testing early, optimize queries |
| **Data consistency issues** | Low | High | Comprehensive testing, database constraints |
| **Opt-out detection misses** | Medium | Medium | Two-layer detection, manual audit |
| **Integration issues with EPIC 2** | Low | Medium | Integration tests, early validation |
| **Timeline slip** | Medium | Medium | Daily standup, clear blockers |

---

## 📞 Communication Plan

### Status Updates

- **Daily**: 10-minute standup (9am)
- **Weekly**: Full team sync (Friday 2pm)
- **Stakeholder Updates**: Every Monday (4pm)

### Decision Points

- **2026-02-09**: SARA-3.1 review
- **2026-02-11**: SARA-3.2 review
- **2026-02-13**: SARA-3.3 review
- **2026-02-15**: SARA-3.4 review
- **2026-02-18**: SARA-3.5 review
- **2026-02-19**: Final review & approval
- **2026-02-21**: Production release decision

---

## 📋 Checklist for Kickoff

- [ ] All stories estimated and accepted
- [ ] Team members assigned
- [ ] Database migrations planned
- [ ] Test infrastructure ready
- [ ] CI/CD pipeline configured
- [ ] Monitoring and alerting setup
- [ ] Documentation templates created
- [ ] Stakeholders aligned on scope
- [ ] Risk mitigation strategies approved
- [ ] Go/No-go decision made

---

## 📚 References

### EPIC 2 Handoff Documents

- `/docs/sara/HANDOFF-EPIC-2-TO-3.md` - Complete EPIC 2 summary
- `/docs/sara/README.md` - SARA architecture overview
- `/docs/sara/persona-system-prompt.md` - SARA personality definition
- `/docs/sara/contexto-dinamico-schema.md` - Context schema

### Architecture Documents

- `/docs/architecture/ARCH_SARA_AGENTE_RECUPERACAO_VENDAS-pt-br.md` - Complete system architecture

### Code References

- `/src/services/ConversationService.ts` - Conversation management
- `/src/services/AIService.ts` - AI interpretation
- `/src/services/MessageService.ts` - WhatsApp integration
- `/src/repositories/MessageRepository.ts` - Message persistence
- `/src/types/sara.ts` - Type definitions

---

## ✅ Approval & Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| **Project Manager** | Morgan (@pm) | 2026-02-06 | ✅ Approved |
| **Architect** | Aria (@architect) | Pending | ⏳ Review |
| **Tech Lead** | Dex (@dev) | Pending | ⏳ Review |
| **DevOps Lead** | Gage (@devops) | Pending | ⏳ Review |
| **Product Owner** | Pending | Pending | ⏳ Review |

---

**Document Version:** 1.0
**Last Updated:** 2026-02-06
**Status:** Ready for Team Review & Kickoff
**Next Review:** Upon completion of EPIC 3

---

*Prepared by:* @pm (Morgan, Strategist)
*For:* SARA Sales Recovery Agent Project
*Scope:* Message Processing & Abandonment Recovery
*Timeline:* 2 weeks (Feb 7-21, 2026)
