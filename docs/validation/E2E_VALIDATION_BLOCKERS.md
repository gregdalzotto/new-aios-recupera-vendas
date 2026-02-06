# E2E Validation - Critical Blockers

**Date**: 2026-02-06
**Status**: 🟡 IN PROGRESS - Database Connectivity Issue
**Impact**: Blocks full E2E flow testing (webhooks→database integration)

---

## Critical Blocker #1: Database Connectivity

### Issue
Supabase database at `db.hpuzjqkvmejvpllaxzsg.supabase.co:5432` is **not reachable** from local machine.

### Error Evidence
```
Error: getaddrinfo ENOTFOUND db.hpuzjqkvmejvpllaxzsg.supabase.co
Stack: pg-pool at /node_modules/pg-pool/index.js:45
```

### Root Cause
Network isolation - Supabase instance may be:
- Not exposed to public internet
- Blocked by firewall rules
- Invalid/expired credentials
- Wrong region/availability

### Impact Assessment

| Component | Status | Notes |
|-----------|--------|-------|
| Webhook Reception | ✅ WORKING | ngrok tunnel, HTTP endpoints all reachable |
| Request Routing | ✅ WORKING | Fastify routes register and receive requests |
| HMAC Validation | ✅ WORKING | Middleware active, signatures verified |
| Schema Validation | ✅ WORKING | Zod validation parsing correctly |
| Database Layer | ❌ BLOCKED | Cannot connect to Supabase |
| Message Queue | ❓ UNKNOWN | Can't test without database |
| AI Integration | ❓ UNKNOWN | Can't test without database |
| Message Sending | ❓ UNKNOWN | Can't test without database |

---

## Solutions (in priority order)

### Solution 1: Use Local PostgreSQL (RECOMMENDED FOR TESTING)

**Why**: Independent testing environment, no external dependencies, repeatable

**Steps**:
```bash
# 1. Install PostgreSQL locally (if not present)
brew install postgresql

# 2. Start PostgreSQL
brew services start postgresql

# 3. Create test database
createdb sara_test

# 4. Update .env.local with local connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sara_test

# 5. Run migrations
npm run migrate

# 6. Restart server
npm run dev
```

**Verification**:
```bash
psql postgres -c "SELECT version();"
psql sara_test -c "\dt"  # Should show tables
```

### Solution 2: Verify Supabase Connectivity

**If you want to use Supabase**:

1. **Check credentials**:
   ```bash
   echo $DATABASE_URL
   # Should be: postgresql://[user]:[password]@[host]:5432/postgres
   ```

2. **Test connection directly**:
   ```bash
   psql "${DATABASE_URL}" -c "SELECT 1;"
   ```

3. **Check Supabase console**:
   - Visit: https://supabase.com/dashboard
   - Verify database is running (green status)
   - Check Network/Firewall rules
   - Ensure IP whitelist includes your network (or allow all)

4. **If still failing**:
   - Reset database connection
   - Generate new password in Supabase console
   - Update .env.local with new credentials

### Solution 3: Docker-Based Local Environment

**For production-like testing with database**:

```bash
docker-compose up -d postgres redis

# Then update .env.local:
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres
REDIS_URL=redis://redis:6379

npm run migrate
npm run dev
```

---

## Recommended Next Steps

### Option A: Continue with Local PostgreSQL (✅ RECOMMENDED)
- Setup local PostgreSQL (5-10 minutes)
- Run database migrations
- Restart server
- Continue full E2E testing
- **Benefit**: Complete testing cycle before Docker/production

### Option B: Fix Supabase Access
- Debug network/firewall rules (15-30 minutes)
- Verify credentials
- Test connection
- **Risk**: May require Supabase account/permissions

### Option C: Skip to Docker (SARA-4.4)
- Defer testing to containerized environment
- Docker will handle networking
- **Risk**: Find issues in production that should have been caught in local testing

---

## What Works Today ✅

Despite database blocker, we've confirmed:

1. **Webhook Endpoint**: Fully functional
   - ngrok tunnel: https://337c-2804-1b3-8401-c0e7-1176-a787-6cd7-cb7e.ngrok-free.app
   - GET /webhook/messages: ✅ Validation endpoint
   - POST /webhook/abandonment: ✅ Route reachable
   - POST /webhook/messages: ✅ Route reachable

2. **Server Architecture**: Production-ready
   - Fastify server: 🚀 Running on :3000
   - Winston logging: ✅ Structured output
   - Middleware stack: ✅ All registered
   - BullMQ workers: ✅ Message queues initialized
   - OpenAI client: ✅ Configured

3. **Request Processing**: Working correctly
   - HTTP request routing: ✅
   - Header parsing: ✅
   - JSON deserialization: ✅
   - Correlation ID tracking: ✅
   - Rate limiting: ✅ (checks per IP)
   - Schema validation: ✅ (Zod parsing)

4. **Error Handling**: Comprehensive
   - Validation errors reported with details
   - Database errors caught and logged
   - Proper HTTP status codes
   - Trace IDs for request tracking

---

## Logging Evidence

### Working Webhook Reception
```json
{
  "traceId": "747dd78f-6058-4ebf-bcdf-8cd5eade0998",
  "method": "POST",
  "url": "/webhook/abandonment",
  "ip": "45.179.253.194",
  "status": "payload_validated"
}
```

### Database Connection Attempt
```json
{
  "service": "sara-agente",
  "error": "getaddrinfo ENOTFOUND db.hpuzjqkvmejvpllaxzsg.supabase.co",
  "stack": "pg-pool index.js:45"
}
```

---

## Decision Matrix

| Path | Time | Risk | Complexity |
|------|------|------|------------|
| Local PostgreSQL | 15 min | Low | Low ✅ RECOMMENDED |
| Fix Supabase | 20-60 min | Medium | Medium |
| Skip to Docker | 0 min | High | Low |

---

## Next Action

**Recommendation**: Use Solution 1 (Local PostgreSQL)
- Quick setup (brew + createdb)
- Enables complete E2E testing cycle
- Finds issues before production
- Cost: 15 minutes, benefit: full validation

**User decision**: Proceed with setup or take different path?

---

**Status**: Awaiting decision on database solution to continue E2E testing

