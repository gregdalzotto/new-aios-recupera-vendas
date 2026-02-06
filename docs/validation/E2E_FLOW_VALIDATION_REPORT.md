# E2E Flow Validation Report

**Date**: 2025-02-06
**Executor**: @dev (Dex) - Builder
**Mode**: Practical End-to-End System Testing
**Duration**: Investigation + Testing

---

## Executive Summary

Comprehensive validation of the complete SARA system flow from abandonment webhook reception through user interaction, AI processing, and response delivery. This investigation validates system readiness before Docker/production deployment.

**Objective**: Understand what works, identify gaps, and document issues before SARA-4.4 (Docker).

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SARA System Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. WEBHOOK RECEPTION (Fastify)                              │
│     └─ POST /webhook/abandonment                             │
│     └─ HMAC-SHA256 signature verification                    │
│     └─ Correlation ID logging                               │
│                                                               │
│  2. DATABASE PERSISTENCE (Supabase PostgreSQL)               │
│     └─ Users table                                           │
│     └─ Abandonments table                                    │
│     └─ Conversations table                                   │
│     └─ Messages table                                        │
│                                                               │
│  3. TEMPLATE DELIVERY (WhatsApp API)                         │
│     └─ Send initial template                                │
│     └─ Store message in DB                                   │
│                                                               │
│  4. MESSAGE QUEUE (Redis + BullMQ)                           │
│     └─ ProcessMessageQueue                                   │
│     └─ SendMessageQueue                                      │
│                                                               │
│  5. USER RESPONSE                                            │
│     └─ POST /webhook/message                                │
│     └─ Message processing job enqueued                       │
│                                                               │
│  6. OPT-OUT DETECTION                                        │
│     └─ Portuguese keyword detection                          │
│     └─ AI fallback (ambiguous cases)                        │
│                                                               │
│  7. AI PROCESSING (OpenAI)                                   │
│     └─ Message interpretation                               │
│     └─ Response generation                                   │
│     └─ Token counting                                        │
│                                                               │
│  8. MESSAGE SENDING (WhatsApp API)                           │
│     └─ Send AI-generated response                            │
│     └─ Update conversation state                             │
│                                                               │
│  9. STATE MANAGEMENT                                         │
│     └─ Conversation status transitions                       │
│     └─ Message history tracking                             │
│     └─ Cycle counting                                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Environment Validation

### ✅ Project Structure
```
src/
├─ config/           (Database, Logger, Prometheus)
├─ routes/           (Webhook endpoints)
├─ middleware/       (HMAC, Correlation ID, Rate Limit)
├─ jobs/             (Message/Payment processors - BullMQ)
├─ repositories/     (Data access layer)
├─ services/         (Business logic)
├─ models/           (Type definitions)
├─ queue/            (Bull job queues)
├─ types/            (TypeScript types)
└─ utils/            (Helpers, errors)
```

### ✅ Dependencies Installed
- **Framework**: Fastify 4.29.1
- **Database**: Supabase (@supabase/supabase-js), pg 8.18.0
- **Cache/Queue**: Redis 4.7.1, Bull 4.16.5, BullMQ 5.67.3
- **AI**: OpenAI 4.104.0 (gpt-3.5-turbo)
- **Monitoring**: Winston 3.19.0, prom-client 15.1.3
- **Testing**: Jest 29.7.0, ts-jest 29.4.6

### ✅ Environment Configuration
- `.env.local` exists with 26 configuration lines
- All required environment variables defined
- Node version: 20.19.31 (LTS)

---

## Phase 2: Startup & Connectivity Testing

### Step 1: Server Startup Readiness
**Command**: `npm run dev`

**Expected Behavior**:
- [ ] Fastify server initializes
- [ ] Logger (Winston) configured
- [ ] Database connection established
- [ ] Redis connection established
- [ ] BullMQ workers started
- [ ] Webhook routes registered
- [ ] Server listens on port 3000

**Status**: 🟡 Pending - Will test below

### Step 2: Database Connectivity
**Check**:
- [ ] PostgreSQL/Supabase connection works
- [ ] Tables exist (users, abandonments, conversations, messages)
- [ ] Initial schema is correct
- [ ] Can query data

**Status**: 🟡 Pending

### Step 3: Redis Connectivity
**Check**:
- [ ] Redis connection established
- [ ] Bull queues initialized
- [ ] Can enqueue jobs

**Status**: 🟡 Pending

---

## Phase 3: Webhook Reception & Processing

### Scenario 1: Abandonment Webhook Reception

**What we're testing**:
1. Can webhook be received?
2. Is HMAC signature validation working?
3. Is data stored in database?
4. Is conversation created?

**Flow**:
```
1. POST /webhook/abandonment (with valid HMAC)
   ↓
2. HMAC verification middleware
   ↓
3. Webhook handler processes
   ↓
4. Create/update user
   ↓
5. Create abandonment record
   ↓
6. Create conversation (AWAITING_RESPONSE)
   ↓
7. Send WhatsApp template
   ↓
8. Return 200 OK
```

**Expected Response**:
```json
{
  "status": "success",
  "conversationId": "conv-xxxx",
  "messageId": "msg-xxxx"
}
```

**Success Criteria**:
- [ ] HTTP 200 response received
- [ ] Conversation created in DB
- [ ] Template sent to WhatsApp
- [ ] Logs show successful flow
- [ ] No errors in console

**Status**: 🟡 Pending

---

### Scenario 2: User Message Reception

**What we're testing**:
1. Can incoming WhatsApp message be received?
2. Is message stored?
3. Is job queued for processing?

**Flow**:
```
1. POST /webhook/message (user responds)
   ↓
2. Webhook handler processes
   ↓
3. Store message in DB
   ↓
4. Enqueue ProcessMessageQueue job
   ↓
5. Return 200 OK immediately (async)
   ↓
6. Job processes in background
```

**Expected Response**:
```json
{
  "status": "queued",
  "messageId": "msg-xxxx",
  "jobId": "job-xxxx"
}
```

**Success Criteria**:
- [ ] HTTP 200 response received immediately
- [ ] Message stored in DB
- [ ] Job enqueued in Redis
- [ ] Job starts processing

**Status**: 🟡 Pending

---

## Phase 4: AI Processing & Response Generation

### Scenario 3: Opt-Out Detection

**What we're testing**:
1. Does Portuguese keyword detection work?
2. Is AI fallback triggered for ambiguous cases?
3. Is conversation closed on opt-out?

**Portuguese Keywords to Test**:
- não / nao
- parar / parando
- sair
- remover
- desinscrever
- bloquear

**Expected Behavior on Opt-Out**:
- [ ] Conversation marked as CLOSED
- [ ] No AI response generated
- [ ] User marked as opted_out
- [ ] No further messages sent

**Status**: 🟡 Pending

### Scenario 4: AI Response Generation

**What we're testing**:
1. Does OpenAI API call work?
2. Does message interpretation work?
3. Is response generated correctly?
4. Are tokens counted?

**Expected Behavior**:
- [ ] AI receives message context
- [ ] Generates appropriate response
- [ ] Response fits WhatsApp limits (4096 chars)
- [ ] Token counting works
- [ ] Timeout handling works

**Status**: 🟡 Pending

---

## Phase 5: Message Sending & State Management

### Scenario 5: Response Delivery

**What we're testing**:
1. Can response be sent back to user?
2. Is state updated correctly?
3. Is conversation marked as ACTIVE?
4. Are messages stored in history?

**Expected Flow**:
```
1. AI generates response
   ↓
2. SendMessageQueue job created
   ↓
3. Message sent to WhatsApp API
   ↓
4. Delivery status stored
   ↓
5. Conversation state updated to ACTIVE
   ↓
6. Message added to history
```

**Success Criteria**:
- [ ] Message sent successfully to WhatsApp
- [ ] Conversation state is ACTIVE
- [ ] Message stored in DB
- [ ] Timestamps recorded
- [ ] No errors in logs

**Status**: 🟡 Pending

---

## Phase 6: Database Consistency & Logging

### Scenario 6: Data Integrity

**What we're testing**:
1. Are all records properly related?
2. Are foreign keys correct?
3. Is audit trail complete?
4. Are timestamps consistent?

**Check**:
```sql
-- Users: phone_number, created_at
SELECT * FROM users WHERE phone_number = '+55...';

-- Abandonments: user_id, status, value
SELECT * FROM abandonments WHERE user_id = '...';

-- Conversations: abandonment_id, status, cycle_count
SELECT * FROM conversations WHERE abandonment_id = '...';

-- Messages: conversation_id, sender (user/bot), timestamp
SELECT * FROM messages WHERE conversation_id = '...';
```

**Success Criteria**:
- [ ] All relationships are correct
- [ ] No orphaned records
- [ ] Timestamps are consistent
- [ ] IDs are properly linked

**Status**: 🟡 Pending

### Scenario 7: Logging & Observability

**What we're testing**:
1. Are logs structured and readable?
2. Do logs contain necessary context?
3. Can we trace a request through the system?

**Check**:
- [ ] Winston logger outputs JSON in production mode
- [ ] Each log has: timestamp, level, correlationId, message
- [ ] Trace flow: webhook → DB → queue → AI → response

**Status**: 🟡 Pending

---

## Testing Checklist

### Quick Start (Local Testing)
```bash
# 1. Ensure dependencies running
docker-compose up -d postgres redis
npm install

# 2. Start server
npm run dev

# 3. In another terminal, start ngrok
ngrok http 3000

# 4. Get ngrok URL (e.g., https://abc123.ngrok.io)

# 5. Update WhatsApp webhook URL
# In Meta Business Manager:
# Webhook URL: https://abc123.ngrok.io/webhook

# 6. Test webhook with curl/Postman
curl -X POST https://abc123.ngrok.io/webhook/abandonment \
  -H "X-Signature: sha256=..." \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+5511999999999", "cart_id": "cart-123", ...}'
```

### Manual Test Cases

**Test 1: Abandonment Webhook**
- [ ] Send valid abandonment webhook with correct HMAC
- [ ] Verify 200 response
- [ ] Check database for created conversation
- [ ] Verify template sent to WhatsApp

**Test 2: User Response**
- [ ] User sends response via WhatsApp
- [ ] Verify message received in webhook
- [ ] Check job queued in Redis
- [ ] Verify AI response generated

**Test 3: Opt-Out Detection**
- [ ] User sends "não" or "parar"
- [ ] Verify conversation closed
- [ ] Verify no response sent
- [ ] Check user marked as opted_out

**Test 4: Complete Flow**
- [ ] Abandonment → Template → Response → AI → Message → Delivery
- [ ] All state transitions correct
- [ ] All records in database
- [ ] All logs present

---

## Known Issues & Gaps (To Be Discovered)

### Category 1: Setup/Configuration
- [ ] Issue: ...
- [ ] Workaround: ...
- [ ] Fix: ...

### Category 2: Webhook Processing
- [ ] Issue: ...
- [ ] Workaround: ...
- [ ] Fix: ...

### Category 3: Database
- [ ] Issue: ...
- [ ] Workaround: ...
- [ ] Fix: ...

### Category 4: AI Integration
- [ ] Issue: ...
- [ ] Workaround: ...
- [ ] Fix: ...

### Category 5: Message Delivery
- [ ] Issue: ...
- [ ] Workaround: ...
- [ ] Fix: ...

### Category 6: Error Handling
- [ ] Issue: ...
- [ ] Workaround: ...
- [ ] Fix: ...

---

## Validation Results (To Be Updated)

### Overall System Health: 🟡 PENDING

| Component | Status | Notes |
|-----------|--------|-------|
| Server Startup | 🟡 | Testing |
| Database Connection | 🟡 | Testing |
| Redis Connection | 🟡 | Testing |
| Webhook Reception | 🟡 | Testing |
| Template Delivery | 🟡 | Testing |
| Message Processing | 🟡 | Testing |
| AI Integration | 🟡 | Testing |
| Response Delivery | 🟡 | Testing |
| Database Consistency | 🟡 | Testing |
| Logging & Observability | 🟡 | Testing |

---

## Recommendations (To Be Updated)

### Before SARA-4.4 (Docker)
- [ ] Fix: ...
- [ ] Implement: ...
- [ ] Test: ...

### Can Wait (After Docker)
- [ ] Optimize: ...
- [ ] Enhance: ...
- [ ] Monitor: ...

### Not Applicable
- [ ] Already implemented: ...

---

## Next Steps

1. ✅ Start server: `npm run dev`
2. ✅ Setup ngrok tunnel
3. ✅ Test abandonment webhook
4. ✅ Simulate user response
5. ✅ Verify AI processing
6. ✅ Check message delivery
7. ✅ Document all findings
8. ✅ Create issue list for fixes

---

**Status**: 🟡 IN PROGRESS - Awaiting practical testing

**Last Updated**: 2025-02-06

