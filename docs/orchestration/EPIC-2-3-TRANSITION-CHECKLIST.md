# EPIC 2→3 TRANSITION CHECKLIST
## Detailed Handoff Requirements & Quality Gates

**Document**: EPIC 2 Closure → EPIC 3 Enablement
**Last Updated**: 2026-02-06 08:50 UTC
**Owner**: @aios-master (Orion)

---

## PRE-TRANSITION QUALITY GATES

### Gate 1: Code Compilation & Build ❌ BLOCKED

**Requirement**: `npm run build` must complete without errors

**Current Status**: ❌ FAILED
```
6 TypeScript compilation errors preventing build
├─ src/jobs/handlers.ts:248 - Type 'string | null' not assignable to type 'string'
├─ src/jobs/handlers.ts:257 - toISOString not on string type
├─ src/jobs/handlers.ts:266 - discountLink null assignment mismatch
├─ src/jobs/handlers.ts:269 - Property 'segment' missing on User type
├─ src/routes/webhooks.ts:565 - Property 'cycle_count' missing on Conversation
└─ src/middleware/rateLimit.ts:72 - onLimitReached not in Options type
```

**Responsible**: @dev
**Action Items**:
- [ ] Fix handlers.ts type mismatches (align with SaraPaymentContext)
- [ ] Add missing Conversation properties (cycle_count, others)
- [ ] Correct User type (add segment field or remove reference)
- [ ] Fix rateLimit middleware TypeScript Options type
- [ ] Run `npm run build` and verify success
- [ ] Run `npm run typecheck` and verify 0 errors

**Timeline**: 15-30 minutes
**Blocker for**: Everything else (no build = no merge)

---

### Gate 2: Test Coverage & Quality ⚠️ CONDITIONAL

**Requirement**: Test suite must pass with >= 95% coverage

**Current Status**: ⚠️ FAILING (381/418 = 91%)
```
37 test failures in AIService module:
├─ response_id undefined (expected 'chatcmpl-123')
├─ tokens_used undefined (expected 150)
├─ sentiment neutral vs positive
└─ Other mock assertion mismatches
```

**Responsible**: @dev
**Action Items**:
- [ ] Update AIService.test.ts mocks to match actual response structure
- [ ] Verify mock returns correct OpenAI response format:
  ```typescript
  {
    id?: string;  // response_id (chatgpt-*)
    usage?: { total_tokens?: number };  // tokens_used
    choices?: [{ message?: { content?: string } }];
  }
  ```
- [ ] Re-run `npm test` after fixes
- [ ] Target: 418/418 tests passing
- [ ] Verify coverage metrics:
  - Lines: >= 80% ✅
  - Functions: >= 80% ✅
  - Branches: >= 75% ✅

**Timeline**: 30-45 minutes
**Blocker for**: Merge to main, EPIC 3 start

---

### Gate 3: Code Quality & Linting ✅ PASS

**Requirement**: ESLint 0 errors, Prettier formatting applied

**Current Status**: ✅ PASSING
```
✅ ESLint: 0 errors, 174 warnings (acceptable)
✅ Prettier: Formatting applied
✅ Lines of code: ~2500 (EPIC 2 implementation)
```

**Responsible**: @dev
**Action Items**:
- [x] Linting already passes (no action needed)
- [ ] Confirm no new linting errors in fixes (Gate 1 + 2)

**Timeline**: 5 minutes (verification only)
**Status**: GREEN ✅

---

### Gate 4: Architecture & Design Review ⏳ IN PROGRESS

**Requirement**: Architecture patterns validated for EPIC 2 & 3

**Current Status**: ⏳ UNDER REVIEW
```
Components to Review:
├─ ProcessMessageQueue handler flow
├─ Service layer composition (ConversationService → AIService → MessageService)
├─ Error handling patterns
├─ Job retry mechanism (Bull queue config)
└─ Integration with EPIC 3 (opt-out detection points)
```

**Responsible**: @architect
**Action Items**:
- [ ] Review EPIC 2 service architecture
- [ ] Validate job handler flow and error paths
- [ ] Document architectural decisions (ADRs)
- [ ] Identify EPIC 3 integration points
- [ ] Create architecture diagram (Miro/Draw.io)
- [ ] Sign-off on design (email/document)

**Timeline**: 1-2 hours
**Blockers**: None (EPIC 2 code is already done, this is validation)
**Status**: AWAITING REVIEW

---

### Gate 5: Product Acceptance & Sign-off ⏳ PENDING

**Requirement**: Product owner confirms EPIC 2 meets acceptance criteria

**Current Status**: ⏳ CONDITIONAL (SARA-2.5 pending)
```
Stories Status:
├─ SARA-2.1 ConversationService: ✅ APPROVED
├─ SARA-2.2 AIService: ⚠️ CONDITIONAL (test mocks need fix)
├─ SARA-2.3 MessageService: ✅ APPROVED
├─ SARA-2.4 Webhook: ✅ APPROVED
└─ SARA-2.5 Job Handlers: ⏳ PENDING (TypeScript fixes needed)
```

**Responsible**: @po
**Action Items**:
- [ ] Review SARA-2.1 through SARA-2.4 acceptance (already approved)
- [ ] Validate SARA-2.5 after TypeScript fixes applied
- [ ] Sign-off on all 5 stories (written confirmation)
- [ ] Document any deviations from original AC

**Timeline**: 30 minutes (once @dev fixes complete)
**Status**: AWAITING @dev GATE 1 + 2

---

### Gate 6: Risk Assessment & Mitigation ⏳ IN PROGRESS

**Requirement**: Identified risks documented with mitigation plans

**Current Status**: ⏳ PARTIAL (5 risks identified, mitigations needed)

**Identified Risks**:

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| EPIC 2 build blocked by TypeScript errors | HIGH | CRITICAL | @dev fixes (30 min) |
| AIService mocks diverged from implementation | MEDIUM | HIGH | Update mocks (30 min) |
| Job handler race conditions under load | MEDIUM | MEDIUM | Load test + lock management |
| Rate limiter type safety | LOW | LOW | Fix typing + validate |
| EPIC 3 payment/expiry logic undefined | MEDIUM | MEDIUM | @po clarification |

**Responsible**: @analyst, @architect
**Action Items**:
- [ ] Create risk register document
- [ ] Define severity levels (CRITICAL, HIGH, MEDIUM, LOW)
- [ ] Document mitigation strategies for each risk
- [ ] Assign owners and timelines
- [ ] Schedule risk review (weekly during EPIC 3)

**Timeline**: 1 hour
**Status**: AWAITING INPUTS FROM @architect + @analyst

---

## EPIC 2 DELIVERABLES CHECKLIST

### Code Implementation

**Services** (Core Business Logic)
- [x] ConversationService: 220 lines, 7 methods
  - findByPhoneNumber, create, updateStatus, incrementMessageCount
  - updateTimestamps, isWithinWindow, isOptedOut
  - Test coverage: 95%

- [x] AIService: 180 lines
  - interpretMessage, detectOptOutIntent (for SARA-3.2)
  - Intent detection, sentiment analysis, token counting
  - Timeout handling (5 second promise race)
  - Test coverage: 85% (pending mock fixes)

- [x] MessageService: 150 lines
  - send (WhatsApp integration)
  - Exponential backoff (1s, 2s, 4s, 8s)
  - E.164 phone validation, character limit checks
  - Test coverage: 88%

**Repositories** (Data Access Layer)
- [x] ConversationRepository: CRUD operations
- [x] MessageRepository: Message persistence + update
- [x] UserRepository: User lookup/upsert
- [x] AbandonmentRepository: Abandonment tracking

**Webhooks & Routes**
- [x] POST /webhook/messages: 200+ lines
  - HMAC verification, message deduplication
  - Context loading, async job queueing
  - Test coverage: 90%

**Job Infrastructure**
- [x] ProcessMessageQueue handler: 150 lines
  - Receive message → load context → AI → send response
  - Opt-out detection integration
  - Error handling + logging

- [x] SendMessageQueue handler: 100 lines
  - Retry mechanism for failed sends
  - Exponential backoff via Bull
  - Status tracking

**Tests**
- [x] Unit tests: jobHandlers.test.ts (250 lines)
- [x] Integration tests: jobFlow.test.ts (350 lines)
- [x] Other service tests (AIService, MessageService, etc.)

**Total Codebase**:
- Lines of Code: ~2500
- Test Lines: ~1500
- Test Coverage: 381/418 tests passing (91%)

### Documentation

**Story Files** (Primary)
- [x] docs/stories/EPIC_2_CONVERSA_OPENAI.md (600+ lines)
  - SARA-2.1 through SARA-2.5 definitions
  - Acceptance criteria (detailed)
  - Implementation notes + technical decisions
  - Test results and sign-offs

**Code Comments**
- [x] JSDoc comments on public methods
- [x] Complex logic documented inline
- [x] Error handling explained

**Architecture Docs**
- [ ] Architecture decision records (ADRs) - PENDING @architect
- [ ] Service interaction diagram - PENDING @architect
- [ ] Data flow diagram - PENDING @architect

### Quality Artifacts

**Build Artifacts**
- [ ] dist/ folder (generated by `npm run build`) - ❌ BLOCKED
- [ ] Source maps for debugging - ❌ BLOCKED
- [ ] Package.json versioning - ✅ Ready

**Test Artifacts**
- [x] Jest coverage report (available via `npm test -- --coverage`)
- [x] Test results summary (418 tests, 381 passing)
- [ ] Load test results - NOT YET (for EPIC 4)

**Security Artifacts**
- [x] HMAC verification implemented
- [x] Credential masking in logs
- [ ] Security audit - PENDING @devops

---

## EPIC 3 ENABLEMENT REQUIREMENTS

### Story Definitions

**SARA-3.1: Deterministic Opt-out Detection**
- [x] Story defined in EPIC_3_CONFORMIDADE_OPTOUT.md
- [x] Acceptance criteria (8 AC items)
- [x] Dependencies: SARA-2.1 (ConversationService)
- [ ] Design review needed: @architect

**SARA-3.2: AI-based Opt-out Fallback**
- [x] Story defined with AC
- [x] Design: detectOptOutIntent method in AIService
- [x] Confidence threshold: 0.7
- [ ] Design review needed: @architect

**SARA-3.3: Compliance Service & Validations**
- [x] Story defined with AC (9 AC items)
- [x] Design: 3 core methods (validateWindow, shouldStop, markOptedOut)
- [ ] Design review needed: @architect
- [ ] AC Clarifications needed from @po:
  - Message limit definition
  - Expired conversation + late payment handling

**SARA-3.4: Payment Webhook Integration**
- [x] Story defined with AC (8 AC items)
- [x] Design: POST /webhook/payment endpoint
- [ ] Design review needed: @architect
- [ ] AC Clarifications needed from @po:
  - 404 vs 200 response for missing abandonment
  - Expired conversation + late payment handling

### Dependency Analysis

**EPIC 2 → EPIC 3 Service Dependencies**:
```
EPIC 3 Story          Uses EPIC 2 Service
═════════════════════════════════════════════════════════════
SARA-3.1              ConversationService.updateStatus()
(opt-out keywords)    ConversationRepository.updateStatus()

SARA-3.2              AIService.detectOptOutIntent()
(AI fallback)         + existing AIService methods

SARA-3.3              ConversationService methods (all 7)
(compliance)          ComplianceService.markOptedOut()
                      UserRepository.markOptedOut()

SARA-3.4              AbandonmentRepository methods
(payment webhook)     ConversationRepository.updateStatus()
                      Webhooks route pattern (from SARA-2.4)
```

**Test Dependencies**:
- SARA-3.1 tests depend on: ConversationService ✅
- SARA-3.2 tests depend on: AIService ✅
- SARA-3.3 tests depend on: All services + repositories ✅
- SARA-3.4 tests depend on: All repositories ✅

### Code Patterns to Follow (EPIC 2)

**Pattern 1: Service Layer Error Handling**
```typescript
// From AIService - follow this pattern
try {
  const response = await openai.chat.completions.create({ ... });
  return {
    intent: extracted.intent,
    sentiment: extracted.sentiment,
    shouldOfferDiscount: calculated,
    response: response.choices[0].message.content,
    tokens_used: response.usage.total_tokens,
    response_id: response.id,
  };
} catch (error) {
  if (error instanceof TimeoutError) {
    logger.warn('OpenAI timeout', { traceId, error });
    return fallbackResponse;
  }
  throw error;
}
```

**Pattern 2: Repository CRUD Operations**
```typescript
// From UserRepository - follow this pattern
async upsert(phone: string, data: Partial<User>): Promise<string> {
  const result = await db.query(
    'INSERT INTO users (phone_number, name, ...) VALUES ($1, $2, ...)
     ON CONFLICT (phone_number) DO UPDATE SET ...
     RETURNING id',
    [phone, data.name, ...]
  );
  return result.rows[0].id;
}
```

**Pattern 3: Job Handler Structure**
```typescript
// From processMessageJob - follow this pattern
async function processMessageHandler(job: Job) {
  const { phoneNumber, messageText, traceId } = job.data;

  try {
    // 1. Validate/load context
    const conversation = await ConversationService.findByPhoneNumber(phoneNumber);
    if (!conversation) throw new NotFoundError('Conversation');

    // 2. Check opt-out (add SARA-3.1 logic here)
    if (user.opted_out) {
      logger.info('User opted out, skipping', { traceId, phoneNumber });
      return;
    }

    // 3. Call AIService
    const aiResponse = await AIService.interpretMessage(context, messageText);

    // 4. Send response
    const sent = await MessageService.send(phoneNumber, aiResponse.response, 'response');

    // 5. Persist
    await MessageRepository.create({
      conversation_id: conversation.id,
      message_text: aiResponse.response,
      from_sender: 'sara',
      ...
    });

    return { status: 'processed', messageId: sent.messageId };
  } catch (error) {
    logger.error('Handler failed', { traceId, error });
    throw error; // Bull will retry
  }
}
```

**Pattern 4: Webhook Route Handler**
```typescript
// From webhooks.ts - follow this pattern
async function postWebhookPayment(request: FastifyRequest, reply: FastifyReply) {
  const { traceId } = request as any;

  // 1. Parse & validate
  const payload = AbandonmentWebhookSchema.parse(request.body);

  // 2. Call service
  const result = await PaymentService.processPayment(payload, traceId);

  // 3. Return response
  reply.code(200).send(result);
}
```

### Testing Strategy for EPIC 3

**Unit Tests Expected** (per story):
```
SARA-3.1: 5 tests (keyword matching, variations, performance, negation)
SARA-3.2: 4 tests (intent detection, confidence, timeout, parsing)
SARA-3.3: 5 tests (window validation, stop conditions, opt-out marking)
SARA-3.4: 5 tests (payment processing, idempotency, status updates)
Total: 19 unit tests
```

**Integration Tests Expected**:
```
SARA-3.1: Full message flow with keyword detection
SARA-3.2: Full message flow with AI fallback
SARA-3.3: Full workflow with compliance checks
SARA-3.4: Payment webhook → conversation state change
Total: 8+ integration tests
```

**Coverage Targets**:
- Lines: >= 80%
- Functions: >= 80%
- Branches: >= 75%
- Test Pass Rate: >= 95%

---

## MERGE READINESS CHECKLIST

**To Merge EPIC 2 to main Branch**:

### Pre-merge verification (5 checkboxes)
- [ ] **Gate 1**: `npm run build` completes successfully (0 TypeScript errors)
- [ ] **Gate 2**: `npm test` passes with 418/418 tests
- [ ] **Gate 3**: `npm run lint` shows 0 errors
- [ ] **Gate 4**: `npm run typecheck` shows 0 errors
- [ ] **Gate 5**: @po sign-off obtained (written)

### Code review (3 checkboxes)
- [ ] All files follow project style (ESLint + Prettier)
- [ ] No secrets in code (API keys, tokens removed from .env)
- [ ] Comments added for complex logic

### Documentation (4 checkboxes)
- [ ] EPIC 2 story (EPIC_2_CONVERSA_OPENAI.md) updated with completion
- [ ] README updated if new setup steps needed
- [ ] CHANGELOG entry for EPIC 2 completion
- [ ] Architecture ADRs documented (by @architect)

### Security (2 checkboxes)
- [ ] HMAC validation implemented and tested
- [ ] Secrets not logged (credential masking in place)

### Performance (2 checkboxes)
- [ ] No N+1 queries in service calls
- [ ] Timeouts configured (OpenAI 5s, message send 5s, opt-out detection 100ms)

### Final checks (3 checkboxes)
- [ ] All commits have descriptive messages
- [ ] No merge conflicts with main branch
- [ ] Branch is up-to-date with main

**TOTAL**: 19 checkboxes must be ✅ before merge

---

## POST-MERGE TASKS (EPIC 3 Sprint)

### Day 1: EPIC 3 Kickoff
- [ ] Sprint planning meeting (2 hours)
- [ ] Story assignment: SARA-3.1 → @dev
- [ ] Risk review: 5 identified risks
- [ ] Set up monitoring/alerting for EPIC 3 services

### Day 2-3: SARA-3.1 Implementation
- [ ] OptOutDetector service created
- [ ] Unit tests written (5 tests)
- [ ] Integration with ProcessMessageQueue tested
- [ ] Code review + merge

### Day 3-4: SARA-3.2 Implementation
- [ ] AIService.detectOptOutIntent method added
- [ ] Confidence threshold validation (0.7)
- [ ] Timeout handling (3 second limit)
- [ ] Unit + integration tests

### Day 4-5: SARA-3.3 Implementation
- [ ] ComplianceService created (3 methods)
- [ ] Window validation logic
- [ ] Opt-out marking with cascade
- [ ] 5 unit tests + integration tests

### Day 5: SARA-3.4 Implementation
- [ ] POST /webhook/payment endpoint
- [ ] Idempotency validation
- [ ] Status transitions (CONVERTED/PENDING/DECLINED)
- [ ] 5 unit tests + integration tests

### Day 6: Testing & QA
- [ ] End-to-end message flow test
- [ ] Payment webhook test
- [ ] Opt-out compliance test
- [ ] Load testing (if time permits)

### Day 7: Deployment Prep
- [ ] Final code review
- [ ] Documentation updates
- [ ] Runbook preparation
- [ ] Staging environment testing

---

## ESCALATION CONTACTS

**If Gate 1 (Build) blocks for > 30 min**:
- Escalate to: @architect + @aios-master
- Action: Code review to identify root cause

**If Gate 2 (Tests) blocks for > 45 min**:
- Escalate to: @analyst + @aios-master
- Action: Test coverage analysis + mock correction strategy

**If Gate 4 (Architecture) blocks for > 2 hours**:
- Escalate to: @aios-master
- Action: Expedited architecture review (2 hours max)

**If Gate 5 (Acceptance) blocks for > 1 hour**:
- Escalate to: @pm + @aios-master
- Action: Product refinement session (30 min)

---

## SUCCESS CRITERIA

**EPIC 2 Closure Complete When**:
1. ✅ All 6 TypeScript errors fixed
2. ✅ All 418 tests passing
3. ✅ npm run build completes successfully
4. ✅ npm run lint shows 0 errors
5. ✅ @po sign-off obtained
6. ✅ Code merged to main branch
7. ✅ Closure report documentation complete

**EPIC 3 Ready to Start When**:
1. ✅ EPIC 2 merged to main
2. ✅ @architect design review complete
3. ✅ 3 product clarification questions answered
4. ✅ Readiness score >= 80%
5. ✅ Risk register created
6. ✅ Team has consensus on sprint plan

---

**Document Status**: ACTIVE
**Last Updated**: 2026-02-06 08:50 UTC
**Next Review**: After Gate 1 completion (~09:30 UTC)

*Checklist maintained by @aios-master*
