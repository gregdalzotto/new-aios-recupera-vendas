# 🔧 EPIC 2 - Technical Fixes & Hardening Plan

**Created by:** @architect (Aria, Visionary)
**Date:** 2026-02-06
**Status:** Ready for Implementation
**Priority:** P1 (Must fix before EPIC 3)
**Estimated Effort:** 3-4 story points

---

## 🎯 Objective

Address critical and important technical risks identified in EPIC 2 to ensure production-readiness before EPIC 3 (Opt-out & Compliance).

**Outcomes:**
- ✅ Rate limiting enabled on webhook
- ✅ Robust OpenAI error handling with retry logic
- ✅ Configuration moved from hardcoded values to environment
- ✅ System prompt versioning preparation
- ✅ All tests passing (maintain 42+ tests)
- ✅ Zero security vulnerabilities

---

## 📋 Fix Tasks (Priority Order)

### TASK 1: Rate Limiting on Webhook (CRITICAL)

**Risk:** Webhook vulnerable to spam/abuse, no protection against rapid-fire requests

**Implementation Steps:**

1. **Install rate-limit library**
   ```bash
   npm install express-rate-limit
   ```

2. **Create `src/middleware/rateLimit.ts`**
   ```typescript
   import rateLimit from 'express-rate-limit';

   // Webhook rate limiter: 10 requests per 15 minutes per phone number
   export const webhookRateLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 10, // 10 requests per window
     message: 'Too many webhook requests from this number, please try again later',
     standardHeaders: true,
     legacyHeaders: false,
     keyGenerator: (req) => {
       // Use phone number as key (from Meta webhook payload)
       return req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || 'unknown';
     },
     skip: (req) => {
       // Skip rate limiting for test endpoints
       return req.path.includes('/webhook/test');
     }
   });
   ```

3. **Apply to webhook routes in `src/routes/webhooks.ts`**
   ```typescript
   import { webhookRateLimiter } from '../middleware/rateLimit';

   fastify.post('/webhook/messages',
     { preHandler: webhookRateLimiter },
     handleWhatsAppWebhook
   );
   ```

4. **Add test case**
   - Test that 11th request within 15 min window is rejected
   - Verify error message is returned
   - Document expected behavior

**Acceptance Criteria:**
- [ ] Rate limiter installed and configured
- [ ] Applied to POST /webhook/messages
- [ ] Test endpoint (/webhook/test/*) bypasses rate limiting
- [ ] At least 1 test validates rate limiting behavior
- [ ] Docs updated with rate limit policy

**Files to Modify:**
- `src/middleware/rateLimit.ts` (NEW)
- `src/routes/webhooks.ts` (MODIFY - add rate limiter)
- `src/index.ts` (MODIFY - register middleware if using global approach)
- `src/services/__tests__/webhooks.test.ts` (NEW - rate limit tests)

---

### TASK 2: OpenAI Error Handling & Retry Logic (CRITICAL)

**Risk:** OpenAI failures (network, API error, invalid response) can break message processing flow

**Implementation Steps:**

1. **Create `src/utils/retryWithBackoff.ts`**
   ```typescript
   interface RetryOptions {
     maxAttempts: number;
     delayMs: number;
     backoffMultiplier: number;
     onRetry?: (attempt: number, error: Error) => void;
   }

   export async function retryWithBackoff<T>(
     fn: () => Promise<T>,
     options: RetryOptions
   ): Promise<T> {
     let lastError: Error;

     for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
       try {
         return await fn();
       } catch (error) {
         lastError = error instanceof Error ? error : new Error(String(error));

         if (attempt < options.maxAttempts) {
           const delayMs = options.delayMs * Math.pow(options.backoffMultiplier, attempt - 1);
           options.onRetry?.(attempt, lastError);
           await new Promise(resolve => setTimeout(resolve, delayMs));
         }
       }
     }

     throw lastError!;
   }
   ```

2. **Create `src/services/OpenAIClientWrapper.ts`**
   ```typescript
   import { retryWithBackoff } from '../utils/retryWithBackoff';
   import logger from '../config/logger';

   export class OpenAIClientWrapper {
     private static readonly RETRY_CONFIG = {
       maxAttempts: 3,
       delayMs: 1000,
       backoffMultiplier: 2,
     };

     static async callOpenAI(
       messages: any[],
       systemPrompt: string,
       traceId: string
     ): Promise<any> {
       return retryWithBackoff(
         async () => {
           const response = await openaiClient.chat.completions.create({
             model: OPENAI_CONFIG.model,
             messages: [
               { role: 'system', content: systemPrompt },
               ...messages
             ],
             temperature: 0.7,
             max_tokens: 500,
             response_format: { type: 'json_object' }
           });

           return response;
         },
         {
           ...this.RETRY_CONFIG,
           onRetry: (attempt, error) => {
             logger.warn('OpenAI call failed, retrying', {
               attempt,
               traceId,
               error: error.message,
               nextRetryMs: 1000 * Math.pow(2, attempt)
             });
           }
         }
       );
     }
   }
   ```

3. **Update AIService to use wrapper**
   ```typescript
   // In AIService.interpretMessage()
   try {
     const response = await OpenAIClientWrapper.callOpenAI(
       userMessages,
       systemPrompt,
       finalTraceId
     );
     // ... parse response
   } catch (error) {
     // Fallback response
     logger.error('OpenAI failed after retries', { traceId: finalTraceId });
     return {
       response: 'Desculpa, tive um problema técnico. Pode tentar novamente em alguns momentos?',
       intent: 'unclear',
       sentiment: 'neutral',
       should_offer_discount: false,
       tokens_used: 0
     };
   }
   ```

4. **Add comprehensive error tests**
   - Test 3x retry on timeout
   - Test exponential backoff timing
   - Test fallback response on final failure
   - Test circuit breaker pattern (optional: stop retrying if 10 failures in a row)

**Acceptance Criteria:**
- [ ] Retry util created with exponential backoff
- [ ] OpenAI wrapper implements 3x retry with 1s initial delay
- [ ] Fallback response returned on final failure
- [ ] All errors logged with traceId
- [ ] At least 5 tests validate retry/fallback scenarios
- [ ] Timeout tests ensure no hanging requests

**Files to Modify:**
- `src/utils/retryWithBackoff.ts` (NEW)
- `src/services/OpenAIClientWrapper.ts` (NEW)
- `src/services/AIService.ts` (MODIFY - use wrapper)
- `src/services/__tests__/AIService.test.ts` (MODIFY - add error tests)

---

### TASK 3: Configuration Management (Hardcoded Values) (IMPORTANT)

**Risk:** Critical values (maxCycles, timeouts, prompts) hardcoded, requires redeployment to change

**Implementation Steps:**

1. **Update `.env` template**
   ```env
   # SARA Configuration
   SARA_MAX_CYCLES=5
   SARA_MESSAGE_HISTORY_LIMIT=20
   SARA_SYSTEM_PROMPT_CACHE_TTL_MS=3600000
   SARA_OPENAI_RETRY_MAX_ATTEMPTS=3
   SARA_OPENAI_RETRY_INITIAL_DELAY_MS=1000
   SARA_WEBHOOK_RATE_LIMIT_WINDOW_MS=900000
   SARA_WEBHOOK_RATE_LIMIT_MAX_REQUESTS=10
   ```

2. **Create `src/config/sara.ts`**
   ```typescript
   export const SARA_CONFIG = {
     maxCycles: parseInt(process.env.SARA_MAX_CYCLES || '5', 10),
     messageHistoryLimit: parseInt(process.env.SARA_MESSAGE_HISTORY_LIMIT || '20', 10),
     systemPromptCacheTtlMs: parseInt(process.env.SARA_SYSTEM_PROMPT_CACHE_TTL_MS || '3600000', 10),
     openai: {
       retryMaxAttempts: parseInt(process.env.SARA_OPENAI_RETRY_MAX_ATTEMPTS || '3', 10),
       retryInitialDelayMs: parseInt(process.env.SARA_OPENAI_RETRY_INITIAL_DELAY_MS || '1000', 10),
     },
     webhook: {
       rateLimitWindowMs: parseInt(process.env.SARA_WEBHOOK_RATE_LIMIT_WINDOW_MS || '900000', 10),
       rateLimitMaxRequests: parseInt(process.env.SARA_WEBHOOK_RATE_LIMIT_MAX_REQUESTS || '10', 10),
     }
   };
   ```

3. **Update AIService to use config**
   ```typescript
   // OLD: const maxCycles = 5;
   // NEW:
   import { SARA_CONFIG } from '../config/sara';
   const maxCycles = SARA_CONFIG.maxCycles;
   ```

4. **Update handlers to use config**
   ```typescript
   // OLD: const historyLimit = 20;
   // NEW:
   const historyLimit = SARA_CONFIG.messageHistoryLimit;
   ```

5. **Update retry config to use config**
   ```typescript
   // In OpenAIClientWrapper
   const retryConfig = {
     maxAttempts: SARA_CONFIG.openai.retryMaxAttempts,
     delayMs: SARA_CONFIG.openai.retryInitialDelayMs,
     backoffMultiplier: 2,
   };
   ```

**Acceptance Criteria:**
- [ ] SARA_CONFIG object created with all tunable parameters
- [ ] .env file updated with SARA_* variables
- [ ] All hardcoded values replaced with config references
- [ ] Config values logged at startup
- [ ] Tests verify config is loaded correctly

**Files to Modify:**
- `src/config/sara.ts` (NEW)
- `src/config/env.ts` (MODIFY - document SARA_* vars)
- `src/services/AIService.ts` (MODIFY - use config)
- `src/jobs/handlers.ts` (MODIFY - use config)
- `src/middleware/rateLimit.ts` (MODIFY - use config)
- `.env.example` (MODIFY - add SARA_* examples)

---

### TASK 4: System Prompt Cache TTL (IMPORTANT)

**Risk:** System prompt cached indefinitely, changes in runtime not reflected

**Implementation Steps:**

1. **Update AIService cache mechanism**
   ```typescript
   import { SARA_CONFIG } from '../config/sara';

   export class AIService {
     private static systemPromptCache: string | null = null;
     private static systemPromptCacheTime: number = 0;

     private static isCacheExpired(): boolean {
       const now = Date.now();
       return now - this.systemPromptCacheTime > SARA_CONFIG.systemPromptCacheTtlMs;
     }

     private static async loadSaraSystemPrompt(): Promise<string> {
       // Check cache validity
       if (this.systemPromptCache && !this.isCacheExpired()) {
         return this.systemPromptCache;
       }

       const promptPath = path.join(process.cwd(), 'docs', 'sara', 'persona-system-prompt.md');

       try {
         const content = await fs.readFile(promptPath, 'utf-8');
         this.systemPromptCache = content;
         this.systemPromptCacheTime = Date.now();
         logger.debug('System prompt loaded from file', {
           cacheExpiresIn: SARA_CONFIG.systemPromptCacheTtlMs
         });
         return content;
       } catch (error) {
         logger.warn('Failed to load SARA system prompt', {
           error: error instanceof Error ? error.message : String(error),
         });
         return SARA_SYSTEM_PROMPT;
       }
     }
   }
   ```

2. **Add cache invalidation endpoint (test only)**
   ```typescript
   // In webhooks.ts
   if (process.env.NODE_ENV !== 'production') {
     fastify.post('/webhook/test/invalidate-cache', async (request, reply) => {
       AIService.invalidateCache();
       return { status: 'cache_invalidated' };
     });
   }
   ```

3. **Add tests**
   - Test cache is returned on first call
   - Test cache is refreshed after TTL expires
   - Test invalidation endpoint (dev only)

**Acceptance Criteria:**
- [ ] Cache TTL implemented with configurable duration
- [ ] Cache expiration checked on each load
- [ ] File loaded only when cache expires
- [ ] Invalidation endpoint created (dev/test only)
- [ ] At least 2 tests validate cache behavior

**Files to Modify:**
- `src/services/AIService.ts` (MODIFY - add TTL tracking)
- `src/routes/webhooks.ts` (MODIFY - add invalidation endpoint)
- `src/services/__tests__/AIService.test.ts` (MODIFY - add cache TTL tests)

---

### TASK 5: Message History Limit Configuration (IMPORTANT)

**Risk:** History limited to 20 messages, hardcoded, no flexibility for longer conversations

**Implementation Steps:**

1. **Move message history limit to config**
   ```typescript
   // In handlers.ts
   const messageHistory = await MessageRepository.findByConversationId(
     conversation.id,
     SARA_CONFIG.messageHistoryLimit // Use config instead of hardcoded 20
   );
   ```

2. **Document in MessageRepository**
   ```typescript
   // Ensure findByConversationId accepts limit parameter
   static async findByConversationId(
     conversationId: string,
     limit: number = 20
   ): Promise<Message[]> {
     // ... implementation
   }
   ```

3. **Add note for EPIC 3**
   - Consider adaptive limit based on conversation age/size
   - Current: 20 messages is reasonable for MVP

**Acceptance Criteria:**
- [ ] Message history limit is configurable via SARA_CONFIG
- [ ] Tests verify correct number of messages fetched
- [ ] Documentation explains rationale (20 messages = ~5KB context)

**Files to Modify:**
- `src/jobs/handlers.ts` (MODIFY - use config limit)
- `src/config/sara.ts` (ENSURE - messageHistoryLimit config)
- `src/repositories/MessageRepository.ts` (VERIFY - limit parameter)

---

## 🧪 Testing Requirements

All fixes must include comprehensive tests:

| Task | Test Count | Coverage |
|------|-----------|----------|
| Rate Limiting | 4+ | Normal flow, limit exceeded, bypass test endpoint |
| OpenAI Error Handling | 6+ | Success, network error, timeout, parse error, retry backoff, fallback |
| Configuration | 3+ | Load from env, fallback to defaults, validate ranges |
| Cache TTL | 2+ | Cache hit, cache miss after TTL, invalidation |
| Message History | 2+ | Correct limit applied, more than limit available |

**Target:** Maintain 42+ tests passing, add 17+ new tests

---

## 📊 Success Criteria

All of the following must be true before marking complete:

- [ ] Rate limiting protects webhook (10 req/15min per phone)
- [ ] OpenAI failures retry 3x with exponential backoff
- [ ] Fallback response returned on final OpenAI failure
- [ ] All hardcoded values moved to `SARA_CONFIG`
- [ ] System prompt cache has 1-hour TTL
- [ ] `npm run typecheck` passes (0 errors)
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm test` passes (50+ tests)
- [ ] `npm run build` succeeds
- [ ] All changes documented in code comments
- [ ] `.env.example` updated with new SARA_* variables
- [ ] No breaking changes to existing API

---

## 📝 Implementation Order

**Recommended sequence:**

1. ✅ Task 3 (Config) — Foundation for other tasks
2. ✅ Task 1 (Rate Limiting) — Security-critical
3. ✅ Task 2 (OpenAI Error Handling) — Reliability-critical
4. ✅ Task 4 (Cache TTL) — Configuration-dependent
5. ✅ Task 5 (Message History) — Low-priority, depends on Task 3

**Estimated Duration:** 3-4 hours

---

## 🎯 Definition of Done

- All 5 tasks completed
- All acceptance criteria met
- All tests passing (50+)
- Code reviewed for security/performance
- Documentation updated
- No regression in existing functionality
- Ready for EPIC 3

---

## 📚 Handoff Note for @dev

This plan is designed for autonomous implementation. Each task is:
- ✅ **Self-contained** — Can be done in order
- ✅ **Well-scoped** — Specific files and changes listed
- ✅ **Testable** — Each has clear test requirements
- ✅ **Low-risk** — No breaking changes

**Start with Task 3** (config foundation), then proceed through Tasks 1, 2, 4, 5 in order.

Questions? Check the specific task section for detailed implementation steps.

---

**Created by:** Aria (Architect)
**For:** Dex (@dev) to implement
**Deadline:** Before EPIC 3 starts
**Status:** Ready for Development

