# Story: SARA-4.2 Testes de Integração com BD & Mocks

**Epic**: EPIC 4 - Testes + Deployment
**Points**: 10
**Status**: In Progress
**Owner**: @dev (Dex)
**Date Created**: 2025-02-06
**Dependency**: SARA-4.1 ✅

---

## Story

Write comprehensive integration tests with real PostgreSQL database and mocked external services (OpenAI, WhatsApp), validating complete business flows end-to-end.

---

## Acceptance Criteria

- [ ] Database setup/teardown automation for test runs
- [ ] Test fixtures created for seed data (users, conversations, messages, abandoned carts)
- [ ] Integration tests for webhook endpoints (abandonment, messages, payment)
- [ ] Complete flow tests (abandonment → user response → message interpretation → payment conversion)
- [ ] Opt-out workflow validation (keyword detection + AI fallback)
- [ ] State transition validation (conversation status flows)
- [ ] All integration tests passing with real DB
- [ ] No race conditions detected in concurrent scenarios
- [ ] Story marked "Ready for Review"

---

## Dev Notes

### SARA-4.2 Coverage Opportunity
Integration tests are high-value for coverage because they:
- Exercise full service chains (repository → service → job → queue → external API)
- Hit database operations (now mocked properly from SARA-4.1)
- Validate state management and transitions
- Test error handling across multiple layers

Expected coverage improvement: **+10-15% coverage** from integration tests

### Database Fixtures Strategy
Use factory functions to create consistent test data:
- Users with phone numbers and conversation history
- Conversations at different states (AWAITING_RESPONSE, ACTIVE, CLOSED)
- Messages with varied timestamps and sender types
- Payment records with different statuses

### External Service Mocking
- **OpenAI**: Mock `openai.chat.completions.create()` with structured JSON responses
- **WhatsApp**: Mock webhook payloads and API responses
- **Redis**: Already mocked from SARA-4.1

### Test Database Setup
Options:
1. **In-memory SQLite** (fast, good for unit/integration hybrids)
2. **Docker PostgreSQL** (realistic, slower setup)
3. **Supabase test instance** (matches production, requires credentials)

**Recommendation**: Start with Supabase test instance from .env.test, skip if unavailable

---

## Tasks

### Task 1: Database Factory & Fixtures
- [ ] Create database factory functions (users, conversations, messages, payments)
- [ ] Implement seed data helpers
- [ ] Create database cleanup helpers (truncate tables)
- [ ] Test fixtures are isolated between tests (no cross-contamination)

### Task 2: Webhook Integration Tests
- [ ] Test abandonment webhook payload processing
- [ ] Test message webhook payload processing
- [ ] Test payment webhook payload processing (with HMAC validation)
- [ ] Validate HMAC signature verification (CRITICAL from EPIC 3 review)
- [ ] Test webhook idempotency (duplicate handling)

### Task 3: Complete Flow Tests
- [ ] Abandonment creation → conversation initialized
- [ ] User sends message → stored and retrieved correctly
- [ ] AI interprets message → response generated
- [ ] Opt-out flow → conversation marked for closure
- [ ] Payment conversion → conversation marked as CONVERTED

### Task 4: Opt-Out Workflow Tests
- [ ] Keyword detection (Portuguese keywords like "não")
- [ ] AI fallback (timeout handling, conservative response)
- [ ] Conversation closure validation
- [ ] Opt-out tracking in database

### Task 5: State Transition Tests
- [ ] Valid transitions enforced (no invalid state jumps)
- [ ] Cycle count incremented correctly
- [ ] 24-hour window validation
- [ ] Conversation closure prevents further messages

### Task 6: Concurrent/Race Condition Tests
- [ ] Multiple simultaneous webhook deliveries (idempotency)
- [ ] Concurrent message receives on same conversation
- [ ] Race condition detection in cycle counting

### Task 7: Integration Test Validation
- [ ] Run full integration test suite
- [ ] Verify coverage improvement (should gain +10-15%)
- [ ] Check for flaky tests (run 3x to confirm stability)
- [ ] Document any test environment dependencies

---

## Testing

### Integration Test Execution
```bash
# Run integration tests only
npm test -- tests/integration/ --testPathPattern=integration

# Run with real database (requires .env.test config)
npm test -- tests/integration/ --runInBand

# Run with coverage
npm test -- tests/integration/ --coverage

# Run specific test
npm test -- tests/integration/webhooks.test.ts
```

### Database Setup
- Must have working DATABASE_URL in .env.test
- Tests will create/truncate tables automatically
- Cleanup happens in afterAll() hook

### Success Criteria
- All integration tests passing
- Overall coverage >75% (on track for SARA-4.3 to reach >80%)
- No test timeouts or flakiness
- End-to-end flows documented in test descriptions

---

## File List

### New Files
- `tests/integration/fixtures/userFactory.ts` - User creation helper
- `tests/integration/fixtures/conversationFactory.ts` - Conversation creation helper
- `tests/integration/fixtures/messageFactory.ts` - Message creation helper
- `tests/integration/fixtures/paymentFactory.ts` - Payment creation helper
- `tests/integration/fixtures/database.ts` - Database setup/teardown
- `tests/integration/webhooks-real.test.ts` - Webhook endpoint tests with DB
- `tests/integration/complete-flow.test.ts` - End-to-end workflow tests
- `tests/integration/opt-out-workflow.test.ts` - Opt-out detection tests
- `tests/integration/state-transitions.test.ts` - State machine validation tests
- `tests/integration/concurrency.test.ts` - Concurrent operation tests

### Modified Files
- `jest.setup.cjs` - Ensure database mocking compatible with integration tests
- `.env.test` - Already configured with test database

---

## Dev Agent Record

### Completion Checklist
- [ ] Database factories created (Task 1)
- [ ] Webhook integration tests written (Task 2)
- [ ] Complete flow tests written (Task 3)
- [ ] Opt-out workflow tests written (Task 4)
- [ ] State transition tests written (Task 5)
- [ ] Concurrent operation tests written (Task 6)
- [ ] All integration tests passing, coverage improved (Task 7)
- [ ] Story marked "Ready for Review"

### Debug Log
**SARA-4.2 Execution (Yolo Mode)**
- Starting integration test implementation
- Target: +10-15% coverage improvement from SARA-4.1 baseline (66-72%)

### Completion Notes
(Will be added upon story completion)

### Change Log
- 2025-02-06: Story created from EPIC 4 kickoff

---

## QA Results

**Gate Decision**: **INCOMPLETE - CRITICAL GAPS** (2025-02-06)

**Completion Status**:
- ✅ Task 1: Database factories created (UserFactory, ConversationFactory)
- ✅ Basic complete-flow tests: 5 tests passing
- ⚠️ Task 2: Webhook tests not yet created (CRITICAL)
- ❌ Task 3: Complete flow tests incomplete
- ❌ Task 4: Opt-out workflow tests not created
- ❌ Task 5: State transition tests not created
- ❌ Task 6: Concurrency tests not created

**Critical Security Gaps**:
1. **Webhook HMAC Validation** (CRITICAL): No payment webhook tests with signature verification
2. **Opt-Out Workflow** (CRITICAL): No keyword detection or closure tests
3. **State Transitions** (HIGH): No invalid state prevention tests
4. **Concurrency** (MEDIUM): No race condition detection

**Coverage Projection**:
- Current: 66-72% (from SARA-4.1)
- Expected if all tests complete: 76-87% (+10-15% improvement)
- **Risk**: May still not reach 80% target

**Recommendations**:
- DO NOT proceed to SARA-4.3 until webhook tests complete
- Prioritize HMAC validation tests (security critical)
- Create remaining factories (messageFactory.ts, paymentFactory.ts)
- Add opt-out and state transition tests in parallel

**Expected Timeline**: 3-4 sprints for completion + re-validation

See full report: docs/qa/EPIC_4_GATE_DECISION.md

---

**Dependencies**: SARA-4.1 ✅
**QA Gate**: All flows work end-to-end, no race conditions, coverage improved to >75%
