# 🌊 EPIC 3 Team Briefing & Kickoff

**Date:** 2026-02-06  
**Status:** EPIC 2 Complete ✅ | EPIC 3 Ready to Start  
**Duration:** 2 weeks (Feb 7-20)  
**Team:** 2 developers, 1 QA, 1 architect (oversight)

---

## 📊 EPIC 3 Overview

**Title:** Message Processing & Abandonment Recovery  
**Objective:** Complete conversation lifecycle with compliance & opt-out detection  
**Total Points:** 35 story points (5 stories)  
**Success Criteria:** ✅ 10 measurable objectives defined

### What We're Building

SARA agent now needs to:
1. **Detect when users opt-out** (say "stop", "cancel", "remove" in Portuguese)
2. **Enforce LGPD compliance** (immediate opt-out with audit trail)
3. **Respect Meta WhatsApp policies** (24-hour message window)
4. **Track conversions** (when user completes purchase)
5. **Test thoroughly** (46+ tests, >85% coverage)

---

## 🎯 5 Stories Breakdown

### SARA-3.1: Deterministic Opt-out Detection (8 pts, Days 1-3)
**What:** Fast keyword-based detection ("parar", "cancelar", "remover", etc)  
**How:** Create OptOutDetector service with caching (1h TTL)  
**Performance:** <100ms for 1000 keywords  
**Integration:** Called BEFORE AIService  
**Owner:** @dev

### SARA-3.2: AI-based Opt-out Fallback (8 pts, Days 3-5)
**What:** When keyword detection fails, ask GPT if user wants to opt out  
**How:** Add detectOptOutIntent() method to AIService  
**Threshold:** 0.7 confidence score  
**Timeout:** 3 seconds (fail-safe: don't mark as opt-out)  
**Owner:** @dev

### SARA-3.3: Compliance Service (9 pts, Days 5-8)
**What:** LGPD enforcement + 24h Meta window validation  
**How:** Create ComplianceService + atomic database transactions  
**Behavior:** When user opts out → close ALL their conversations + audit log  
**Owner:** @dev

### SARA-3.4: Payment Webhook Handler (10 pts, Days 8-12)
**What:** Track conversions when customer completes purchase  
**How:** POST /webhook/payment endpoint + idempotency via UNIQUE  
**States:** completed→CONVERTED, pending→PENDING, failed→DECLINED  
**Owner:** @dev

### SARA-3.5: Integration Testing & Quality Gates (10 pts, Days 10-14)
**What:** Comprehensive test suite + quality validation  
**How:** 46+ tests (unit + integration + E2E)  
**Coverage:** >85% code coverage  
**Owner:** @qa + @dev

---

## 🏗️ Architecture (Pre-validated ✅)

### Service Layer
```
ConversationService (EPIC 2) ────┐
                                 ├─→ AIService (EPIC 2) ────────┐
MessageService (EPIC 2) ─────────┤                              ├─→ Handlers
                                 ├─→ OptOutDetector (NEW) ──────┤
                                 ├─→ ComplianceService (NEW) ────┤
                                 └─→ PaymentService (NEW) ───────┘
```

### Database Schema (Minimal additions needed)
```sql
-- NEW (SARA-3.1)
CREATE TABLE opt_out_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- NEW (SARA-3.4)
ALTER TABLE abandonments ADD COLUMN payment_id VARCHAR(100) UNIQUE;
```

### Quality Gates (All defined)
- CodeRabbit: 0 CRITICAL issues
- Linting: 0 errors
- TypeScript: Strict mode
- Tests: 46+ passing
- Coverage: >85%
- Performance: <2s message latency

---

## 📅 Sprint Schedule

**Week 1 (Feb 7-13)**
- Sprint 1: SARA-3.1 & SARA-3.2 (opt-out detection) - 16 points
- Daily standups 9am
- Architecture review Friday

**Week 2 (Feb 14-20)**
- Sprint 2: SARA-3.3, SARA-3.4, SARA-3.5 - 19 points
- Integration testing
- Final QA & release prep
- Production deployment Feb 21

---

## 🚀 Team Assignments

| Role | Person | Story | Effort |
|------|--------|-------|--------|
| Backend Dev | @dev | SARA-3.1,3.2,3.3,3.4 | 28 pts |
| QA | @qa | SARA-3.5 + reviews | 10 pts |
| Architecture | @architect | Design review (10% time) | Oversight |

---

## ⚠️ Critical Dependencies

All from EPIC 2 (✅ Complete):
- ConversationService ✅
- AIService ✅
- MessageService ✅
- Webhook handler ✅
- Job queue ✅
- Message model ✅

**No blocking dependencies!** Can start immediately.

---

## 🎯 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Stories Complete | 5/5 | All acceptance criteria met |
| Test Coverage | >85% | `npm run coverage` report |
| Performance | <2s (p95) | Load testing results |
| Quality | 0 CRITICAL issues | CodeRabbit report |
| Compliance | 100% | Manual LGPD/Meta audit |

---

## 📋 Ready Checklist

- ✅ EPIC 2 deployed to master
- ✅ 5 stories fully defined (35 points)
- ✅ Architecture validated (55 KB blueprint)
- ✅ Quality gates established
- ✅ Team briefing materials ready
- ✅ Database schema planned
- ✅ All dependencies available
- ✅ Coding patterns documented

**Status:** 🟢 **READY TO KICKOFF**

---

## Questions?

- Architecture details? See `/docs/architecture/EPIC-3-ARCHITECTURE.md` (55 KB)
- Story specs? See `/docs/epics/EPIC-3-DEFINITION.md` (39 KB)
- Quick ref? See `/docs/backlog/EPIC-3-QUICK-START.md`
- Backlog? See `/docs/backlog/EPIC-3-BACKLOG.md`

— River 🌊
