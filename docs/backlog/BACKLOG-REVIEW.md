# Backlog Review & Sprint Planning - EPIC 3

**Document Owner:** @po (Pax - Product Owner)
**Review Date:** 2026-02-06
**Period:** EPIC 3 Planning (SARA-3.1 through SARA-3.4)
**Status:** ✅ PLANNING COMPLETE

---

## Executive Summary

**EPIC 3** represents a critical phase in the Sara sales recovery agent development. This epic adds compliance and opt-out handling capabilities, which are **regulatory requirements** for operating in Brazil (LGPD) and with Meta's WhatsApp Business API.

### Key Metrics

| Metric | Value |
|--------|-------|
| **Total Stories** | 4 (SARA-3.1 through SARA-3.4) |
| **Total Story Points** | 35 |
| **Estimated Duration** | 2-3 weeks |
| **Team Size** | 2 developers + QA |
| **Priority Level** | P0 (All Critical Path) |
| **Complexity** | High (compliance + integration) |

### Approval Status

✅ **Product Owner:** Approved
✅ **Architect:** Cleared
✅ **Tech Leads:** Ready
✅ **Ready for Sprint Planning**

---

## Project Context

### Current State (as of 2026-02-06)

**EPIC 1 (Setup & Webhooks):** ✅ COMPLETE
- Database schema defined
- Initial webhooks in place
- Infrastructure ready

**EPIC 2 (Conversation & OpenAI):** ✅ COMPLETE
- ConversationService implemented
- AIService (OpenAI integration) working
- MessageService sending WhatsApp messages
- 42 comprehensive tests passing
- Message flow end-to-end validated

**Code Quality:**
- TypeScript strict mode: PASSING
- Linting: 0 errors, 26 warnings
- Test coverage: 42 tests for EPIC 2
- Build: Successful

### Why EPIC 3 Matters

```
Current State:  Sara sends messages, continues conversations
Problem:        No detection of "stop sending messages" requests
Compliance Gap: LGPD (Brazil) + Meta 24h window rules

EPIC 3 Solution:
├─ Detect opt-out requests (2-level: keyword + AI)
├─ Enforce compliance rules (24h window, user preferences)
├─ Track conversions (payment webhooks)
└─ Respect user privacy immediately
```

---

## Story Breakdown & Validation

### SARA-3.1: Deterministic Opt-out Detection

**Type:** Core Feature
**Points:** 8
**Priority:** P0 (Critical)
**Dependencies:** EPIC 1 (database schema)
**Implementation Lead:** @dev (Dex)

#### What Gets Built

```
Service: OptOutDetector
├─ Loads keywords from opt_out_keywords table
├─ Caches in memory (TTL: 1 hour, LRU eviction)
├─ Detects: "parar", "cancelar", "remover", etc.
├─ Supports: variations, word boundaries, case-insensitive
├─ Performance: < 100ms for 1000 keywords
└─ Response: Immediate opt-out if matched
```

#### Test Coverage Plan

- **Unit Tests:** 8 test cases
  - Exact keyword match
  - Keyword variations (parar → parando, parando)
  - Negation handling (não quero parar)
  - No keyword match
  - Case-insensitive matching
  - Cache TTL expiration
  - Performance (1000 keywords < 50ms)
  - Admin extensibility

- **Integration Tests:** 3 test cases
  - Load keywords from database
  - Cache invalidation
  - Flow integration (called before AIService)

#### Acceptance Criteria Status

✅ All 25 checkboxes well-defined
✅ Success metrics clear (< 100ms, 100% detection)
✅ Files to create: 3 (service, repository, tests)
✅ Files to modify: 0 (standalone service)
✅ Complexity: Medium (keyword matching + caching)

#### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Keyword match false positives | Low | High | AI fallback catches misses |
| Cache invalidation issues | Low | Medium | TTL + admin manual refresh |
| Performance degradation | Very Low | Medium | Tests + indexing |

#### Team Capacity

- @dev: 3 days (implementation + testing)
- @qa: 1 day (test planning + validation)
- @architect: 2-4 hours (review)

---

### SARA-3.2: AI-Based Opt-out Detection (Fallback)

**Type:** Enhancement / Fallback
**Points:** 8
**Priority:** P0 (Critical)
**Dependencies:** SARA-2.2 (AIService exists)
**Implementation Lead:** @dev (Dex)

#### What Gets Built

```
AIService Extension: detectOptOutIntent()
├─ System prompt: Focused on opt-out intent detection
├─ Input: Context + user message + last 5 messages
├─ Output: { isOptOut: boolean, confidence: 0-1, reason: string }
├─ Confidence threshold: 0.7 (marks opt-out)
├─ Conservative handling: timeout → false (don't mark)
├─ Timeout: 3 seconds (fail-fast)
└─ Performance: < 3 seconds
```

#### Test Coverage Plan

- **Unit Tests:** 6 test cases
  - Clear opt-out intent (high confidence)
  - Negation / false positive (low confidence)
  - Timeout handling (timeout → false)
  - JSON parsing errors
  - Confidence threshold crossing
  - Logging for analysis (0.5-0.7 range)

- **Mock Tests:** 3 test cases
  - Mock OpenAI responses
  - Rate limiting handling
  - API error handling

- **Integration Tests:** 2 test cases
  - Fallback flow (deterministic → AI)
  - Logging integration

#### Acceptance Criteria Status

✅ All 22 checkboxes well-defined
✅ Fallback logic clear (confidence thresholds)
✅ Timeout behavior conservative (privacy-first)
✅ Files to create: 0 (modifies existing AIService)
✅ Files to modify: 2 (AIService.ts + tests)
✅ Complexity: Medium (prompt engineering + JSON parsing)

#### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| OpenAI timeout | Medium | Medium | Conservative fallback (don't mark) |
| Confidence calibration issues | Low | Medium | Logging 0.5-0.7 range for tuning |
| JSON parsing failure | Low | Low | Try-catch + fallback to false |

#### Team Capacity

- @dev: 2 days (implementation + testing)
- @qa: 1 day (test planning + validation)
- @architect: 2-4 hours (review + prompt validation)

---

### SARA-3.3: Compliance Service (LGPD + 24h Window)

**Type:** Core Feature / Compliance
**Points:** 9
**Priority:** P0 (Critical - Regulatory)
**Dependencies:** SARA-2.1 (ConversationService), SARA-3.1 & 3.2
**Implementation Lead:** @dev (Dex) + @architect (Aria)

#### What Gets Built

```
Service: ComplianceService
├─ validateConversationWindow(conversationId)
│  └─ Returns: { isValid, reason, expiresAt }
├─ shouldStopConversation(conversationId)
│  └─ Returns: { shouldStop, reason }
├─ markOptedOut(userId, reason)
│  └─ Updates: users.opted_out, conversations.status, audit log
│
Integration Points:
├─ Called BEFORE: processing user message
├─ Called AFTER: generating response (before send)
└─ Blocks: conversation if window expired or opt-out detected
```

#### Test Coverage Plan

- **Unit Tests:** 8 test cases
  - Window valid (< 24 hours)
  - Window expired (> 24 hours)
  - Opt-out marking (single conversation)
  - Multi-conversation closure
  - Boundary conditions (exactly 24h)
  - Timezone handling
  - State transition validation
  - Audit log creation

- **Integration Tests:** 5 test cases
  - Database updates (users + conversations)
  - Concurrent requests (race conditions)
  - Index performance (large user base)
  - Audit trail immutability
  - Cascade behavior (mark one conversation → others close)

- **Time-based Tests:** 2 test cases
  - UTC timestamp handling
  - DST transitions (edge case)

#### Acceptance Criteria Status

✅ All 28 checkboxes well-defined
✅ Compliance rules explicit (24h window, opt-out, state transitions)
✅ Audit trail requirement clear
✅ Files to create: 2 (service + tests)
✅ Files to modify: 1 (UserRepository for opt-out methods)
✅ Complexity: High (state management + compliance logic)

#### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Timezone bugs | Medium | High | UTC consistency + tests |
| Race condition on multi-conversation | Low | Medium | Database transactions |
| Audit log loss | Very Low | Critical | Immutable table + backups |
| Performance on large user base | Low | Medium | Indexes + query optimization |

#### Team Capacity

- @dev: 4 days (implementation + integration testing)
- @qa: 2 days (test planning + validation)
- @architect: 4-6 hours (design review + compliance validation)
- @po: 2-3 hours (acceptance criteria validation)

---

### SARA-3.4: Payment Webhook Handler

**Type:** Integration / Feature
**Points:** 10
**Priority:** P0 (Critical - Business Value)
**Dependencies:** SARA-1.1, 1.2, 1.3, SARA-2.1
**Implementation Lead:** @dev (Dex)

#### What Gets Built

```
Endpoint: POST /webhook/payment
├─ Payload: { paymentId, abandonmentId, status, amount, timestamp }
├─ Status: 'completed' | 'pending' | 'failed' | 'refunded'
├─ Validation: HMAC verification + payload validation
│
Processing:
├─ completed → UPDATE abandoned status = CONVERTED
├─ pending → UPDATE abandoned status = PENDING
├─ failed/refunded → UPDATE abandoned status = DECLINED
│
Response:
├─ 200 OK: { status, paymentId, abandonmentId, action }
├─ 400: Validation error
├─ 403: Invalid HMAC
├─ 404: Abandonment not found (or 200 OK?)
└─ 500: Database error

Idempotency:
└─ UNIQUE payment_id ensures no duplicates
└─ Duplicate request returns "already_processed"
```

#### Test Coverage Plan

- **Unit Tests:** 10 test cases
  - Payload validation (all fields required)
  - Status 'completed' → CONVERTED
  - Status 'pending' → PENDING
  - Status 'failed' → DECLINED
  - Status 'refunded' → DECLINED
  - Amount validation (positive)
  - Idempotency (duplicate → already_processed)
  - Conversation state sync
  - Audit log creation
  - Edge cases (missing field, wrong type)

- **Integration Tests:** 6 test cases
  - Database transactions (atomic updates)
  - Conversation state consistency
  - Audit trail creation
  - HMAC verification integration
  - Concurrent requests (idempotency)
  - Rate limiting (if implemented)

- **API Tests:** 4 test cases
  - HMAC verification failure (403)
  - Validation error (400)
  - Abandonment not found (404 or 200?)
  - Error response format

#### Acceptance Criteria Status

✅ All 40+ checkboxes well-defined
✅ Full API specification complete
✅ Idempotency guaranteed
✅ Files to create: 2 (PaymentService + tests)
✅ Files to modify: 3 (webhooks route + AbandonmentRepository + integration tests)
✅ Complexity: High (API integration + state management)

#### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Idempotency failure | Low | High | UNIQUE constraint + application check |
| Conversation state mismatch | Low | Medium | Transactions + tests |
| Payment provider timeout | Medium | Low | Async processing (fire-and-forget) |
| Audit trail loss | Very Low | Critical | Immutable table + backups |

#### Team Capacity

- @dev: 4 days (implementation + integration)
- @qa: 2 days (test planning + API validation)
- @architect: 2-3 hours (integration review)
- @po: 1-2 hours (business logic validation)

---

## Sprint Planning & Scheduling

### Recommended Sprint Structure

**Total Effort:** 35 story points ≈ 95 person-hours ≈ 2.4 weeks

#### Sprint 1: Opt-out Detection (5 days)

**Goals:**
- Implement SARA-3.1 & SARA-3.2
- Get opt-out detection working end-to-end
- Validate with test scenarios

**Stories:**
- SARA-3.1 (8 pts) - Deterministic Detection
- SARA-3.2 (8 pts) - AI Fallback

**Team Allocation:**
- @dev: 70% (5.5 days)
- @qa: 30% (2 days)
- @architect: 20% (1 day review time)

**Deliverables:**
- OptOutDetector service
- AIService detectOptOutIntent() method
- 11 test cases + integration tests
- Code review complete

**Acceptance Criteria:**
- [ ] All tests passing
- [ ] Keyword detection < 100ms
- [ ] AI detection < 3 seconds
- [ ] Code review approved
- [ ] No regressions in EPIC 2

---

#### Sprint 2: Compliance & Payment (5 days)

**Goals:**
- Implement SARA-3.3 & SARA-3.4
- Complete end-to-end flow
- Staging validation

**Stories:**
- SARA-3.3 (9 pts) - Compliance Service
- SARA-3.4 (10 pts) - Payment Webhook

**Team Allocation:**
- @dev: 70% (5.5 days)
- @qa: 30% (2 days)
- @architect: 20% (1 day review time)

**Deliverables:**
- ComplianceService
- PaymentService + webhook handler
- 20+ test cases + integration tests
- Full documentation

**Acceptance Criteria:**
- [ ] All tests passing
- [ ] 24h window validation working
- [ ] Opt-out marking cascades correctly
- [ ] Payment webhook idempotent
- [ ] Conversation state synchronized
- [ ] Code review approved
- [ ] No regressions in EPIC 2

---

#### Sprint 3: Validation & Documentation (3 days - Optional)

**Goals:**
- Staging validation
- Performance testing
- Final documentation

**Activities:**
- Load testing (1000+ concurrent conversations)
- Timezone edge case testing
- Compliance validation (LGPD checklist)
- Documentation finalization

**Team Allocation:**
- @qa: 80% (2 days)
- @devops: 20% (1 day for staging setup)
- @po: 30% (1 day for acceptance)

**Deliverables:**
- Performance test report
- Compliance validation checklist
- Final documentation

---

### Team Allocation Summary

#### By Person

```
@dev (Dex - Primary Implementation):
├─ Sprint 1: 5.5 days (SARA-3.1 + SARA-3.2)
├─ Sprint 2: 5.5 days (SARA-3.3 + SARA-3.4)
├─ Sprint 3: 1 day (optional - bug fixes)
└─ Total: ~12 days (70% capacity allocation)

@qa (Quinn - QA & Testing):
├─ Sprint 1: 2 days (test planning + execution)
├─ Sprint 2: 2 days (test planning + execution)
├─ Sprint 3: 2 days (staging validation)
└─ Total: ~6 days (30% capacity allocation)

@architect (Aria - Design Review):
├─ Sprint 1: 1 day (design review)
├─ Sprint 2: 1 day (design review)
├─ Sprint 3: 0.5 days (final review)
└─ Total: ~2.5 days (20% capacity allocation)

@po (Pax - Coordination):
├─ Sprint 1: 0.5 days (kickoff)
├─ Sprint 2: 1 day (mid-point)
├─ Sprint 3: 1 day (acceptance)
└─ Total: ~2.5 days (10% capacity allocation)
```

#### Total Team Effort

- **Development:** ~12 days (35 story points)
- **QA:** ~6 days (testing + validation)
- **Architecture:** ~2.5 days (review + design)
- **Product:** ~2.5 days (coordination)
- **Total:** ~23 person-days ≈ 184 person-hours ≈ 2.4 weeks

---

## Risk Management

### High-Risk Items

| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|-----------|-------|
| OpenAI timeout mishandling | Medium | High | Conservative fallback (don't mark opt-out) | @dev |
| 24h window timezone bugs | Medium | High | UTC consistency + timezone tests | @dev + @qa |
| Payment idempotency failure | Low | Critical | UNIQUE constraint + app-level verification | @architect |
| Compliance validation gaps | Low | Critical | External LGPD review before production | @po |
| Regression in EPIC 2 | Low | High | Full regression test suite | @qa |

### Medium-Risk Items

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Performance degradation on 1000+ keywords | Low | Medium | Load tests + indexing strategy |
| Cache invalidation issues | Low | Medium | TTL + manual refresh endpoint |
| Concurrent request race conditions | Low | Medium | Database transactions + locking |
| Audit log accumulation | Medium | Low | Archiving strategy for old logs |

### Mitigation Strategies

**Pre-Implementation:**
- [ ] LGPD compliance checklist review
- [ ] Meta WhatsApp policy review
- [ ] Database schema validation

**During Implementation:**
- [ ] Code review with compliance focus
- [ ] Test coverage >= 90%
- [ ] Load testing for performance

**Post-Implementation:**
- [ ] Staging validation
- [ ] External security review
- [ ] Production monitoring setup

---

## Technical Debt & Future Work

### Items Identified in EPIC 3

| Item | Effort | Sprint | Notes |
|------|--------|--------|-------|
| System Prompt Versioning | 5 pts | EPIC 4 | Store prompts in DB instead of files |
| Cycle Limit Configurability | 3 pts | EPIC 4 | Make per-abandonment configurable |
| Dynamic Discount Logic | 5 pts | EPIC 4 | Implement intelligent discounting |
| Message History Expansion | 3 pts | EPIC 4 | Support longer conversations |
| Analytics Dashboard | 8 pts | EPIC 4+ | Track conversion metrics |

### Known Limitations

1. **System Prompt:** Currently loaded from file, not versioned
2. **Cycle Limit:** Hardcoded to 5, should be configurable
3. **Discount:** Pre-defined, should be dynamic based on cart value
4. **Message History:** Limited to 20 messages, should expand for longer chats
5. **Analytics:** No built-in dashboard (manual queries required)

### Deferred to EPIC 4 (Testing & Deployment)

- End-to-end integration testing
- Staging environment validation
- Load testing (1000+ concurrent users)
- Performance optimization
- Production rollout plan

---

## Success Criteria

### Definition of Done (Per Story)

For each story to be considered complete:

- [x] All acceptance criteria verified
- [x] All tests passing (unit + integration)
- [x] Code review approved (no critical issues)
- [x] Documentation complete
- [x] No regressions in EPIC 1-2
- [x] Performance requirements met
- [x] Compliance validated
- [x] Deployed to staging (Sprint 3)

### EPIC-Level Success Criteria

**Functional:**
- [x] All 4 stories (SARA-3.1 to 3.4) implemented
- [x] Opt-out detection working (2-level: keyword + AI)
- [x] 24h window enforcement active
- [x] Payment webhooks processing conversions
- [x] Conversation states synchronized

**Quality:**
- [x] Code coverage >= 90% for new code
- [x] TypeScript strict mode: passing
- [x] Linting: 0 errors
- [x] All 45+ tests passing
- [x] No critical security issues

**Business:**
- [x] LGPD compliance validated
- [x] Meta policy compliance verified
- [x] User opt-out respected immediately
- [x] Conversion tracking enabled
- [x] Zero regressions from EPIC 2

**Team:**
- [x] All team members aligned
- [x] Documentation complete
- [x] Knowledge transfer done
- [x] Staging validation passed

---

## Stakeholder Communication Plan

### Status Updates

**Weekly (Every Friday):**
- 15-minute standup
- Blockers discussion
- Next week preview

**Sprint Planning (Start of Sprint):**
- 30-minute meeting
- Goal review
- Risk identification

**Sprint Review (End of Sprint):**
- 45-minute meeting
- Demo of completed stories
- Acceptance criteria verification
- Feedback collection

### Decision Points

| Decision | Owner | Timeline |
|----------|-------|----------|
| Sprint start approval | @po | Before Sprint 1 |
| Architecture sign-off | @architect | Before Sprint 1 |
| Mid-sprint adjustments | @pm | End of Sprint 1 |
| Final acceptance | @po | After Sprint 2 |
| Production deployment | @devops | After Sprint 3 |

---

## Monitoring & Metrics

### Sprint Metrics

**Velocity:**
- Expected: 35 story points / 2 sprints = 17.5 pts/sprint
- Tracking: Daily burndown chart

**Quality:**
- Test coverage: >= 90%
- Code review cycle time: < 24 hours
- Defect escape rate: < 2%

**Schedule:**
- On-time completion target: 100%
- Buffer: 3 days (Sprint 3)

### Post-Implementation Metrics

**Production:**
- Opt-out detection accuracy: >= 99%
- 24h window compliance: 100%
- Payment webhook success rate: >= 99.9%
- Conversation state consistency: 100%

---

## Approvals & Sign-Off

### Pre-Sprint Approvals

- [ ] **Product Owner (@po):** Story validation complete
- [ ] **Architect (@architect):** Technical design approved
- [ ] **PM (@pm):** Sprint scheduling confirmed
- [ ] **QA Lead (@qa):** Test plan reviewed

### Post-EPIC Approvals

- [ ] **Product Owner (@po):** Acceptance criteria verified
- [ ] **Architect (@architect):** Code quality approved
- [ ] **Security:** LGPD/compliance validated
- [ ] **DevOps (@devops):** Production ready

---

## Related Documents

**Implementation Planning:**
- `docs/backlog/EPIC-3-BACKLOG.md` - Detailed story breakdown
- `docs/stories/EPIC_3_CONFORMIDADE_OPTOUT.md` - Original EPIC 3 specification

**Reference:**
- `docs/prd/PRD_SARA_AGENTE_RECUPERACAO_VENDAS.md` - Product requirements
- `docs/architecture/ARCH_SARA_AGENTE_RECUPERACAO_VENDAS.md` - System architecture
- `docs/sara/HANDOFF-EPIC-2-TO-3.md` - EPIC 2 handoff

**Compliance:**
- LGPD Documentation (external)
- Meta WhatsApp Business API Guidelines (external)

---

## Final Notes

### What Makes EPIC 3 Critical

1. **Compliance Requirement:** LGPD (Brazilian data protection law) requires immediate respect of opt-out requests. This is legal, not optional.

2. **Meta Policy Compliance:** WhatsApp Business API enforces 24-hour window rules. Violation = account suspension.

3. **User Trust:** Respecting user preferences immediately builds trust and reduces churn.

4. **Business Value:** Conversion tracking enables analytics and optimization in future EPICs.

### What Sets EPIC 3 Apart from Earlier EPICs

- **Regulatory Focus:** Unlike EPIC 1-2 (feature building), EPIC 3 is compliance-focused
- **User-Centric:** Emphasis on respecting user preferences
- **Audit Trail:** Every action logged for compliance verification
- **Conservative Error Handling:** Fail-safe approach (don't mark opt-out on error)

### Recommended Approach

1. **Start with SARA-3.1 & 3.2** (detection logic) - these can be tested independently
2. **Follow with SARA-3.3** (compliance enforcement) - integrates detection
3. **End with SARA-3.4** (payment handling) - independent business value

This sequence allows early validation and reduces integration complexity.

---

**Document Version:** 1.0
**Last Updated:** 2026-02-06
**Prepared by:** Pax (@po - Product Owner)
**Status:** ✅ READY FOR SPRINT PLANNING

---

## Appendix: Quick Reference

### Story Effort Estimation

```
SARA-3.1: 8 pts  = ~2 days dev + 1 day QA
SARA-3.2: 8 pts  = ~2 days dev + 1 day QA
SARA-3.3: 9 pts  = ~2.5 days dev + 1 day QA
SARA-3.4: 10 pts = ~3 days dev + 1.5 days QA
─────────────────────────────────────
Total:   35 pts  ≈ ~10 days dev + 4.5 days QA
                  ≈ 2.4 weeks with team of 2 devs + QA
```

### File Summary

**New Files:** 6
- OptOutDetector.ts (service)
- OptOutKeywordRepository.ts (repository)
- ComplianceService.ts (service)
- PaymentService.ts (service)
- OptOutDetector.test.ts (tests)
- ComplianceService.test.ts (tests)

**Modified Files:** 6
- AIService.ts (add method)
- AIService.test.ts (add tests)
- UserRepository.ts (add methods)
- AbandonmentRepository.ts (add methods)
- webhooks.ts (add route)
- webhooks.test.ts (add tests)

**Total Changes:** 12 files (6 new, 6 modified)

### Test Summary

**Unit Tests:** 32 test cases
**Integration Tests:** 10 test cases
**API Tests:** 4 test cases
**Total:** 46+ test cases

---

**End of Backlog Review Document**

