# Practical E2E Testing Setup Guide

**Quick Start for Testing SARA End-to-End Flow**

---

## Prerequisites

- Node.js 20+ installed
- PostgreSQL or Supabase account
- Redis running
- WhatsApp Business Account (optional - we'll mock it)
- ngrok installed (`brew install ngrok` on macOS)

---

## Step 1: Setup Local Environment

### 1.1 Install Dependencies
```bash
npm install
```

### 1.2 Configure Environment
Copy `.env.example` to `.env.local` and update:

```bash
cp .env.example .env.local

# Edit .env.local with:
# - DATABASE_URL (local PostgreSQL or Supabase test instance)
# - REDIS_URL (local Redis)
# - OPENAI_API_KEY (for AI testing)
# - WHATSAPP credentials (can be dummy for local testing)
```

### 1.3 Start Dependencies

**Option A: Docker Compose (if available)**
```bash
docker-compose up -d postgres redis
```

**Option B: Local Services**
```bash
# Terminal 1: PostgreSQL
postgresql start

# Terminal 2: Redis
redis-server
```

### 1.4 Database Setup
```bash
# Run migrations
npm run db:migrate

# Verify tables exist
psql -U user -d sara_db -c "\dt"
```

---

## Step 2: Start SARA Server Locally

```bash
npm run dev
```

**Expected Output:**
```
✅ Server started on http://localhost:3000
✅ Database connected
✅ Redis connected
✅ Message handlers registered (BullMQ)
✅ Webhook routes registered
```

---

## Step 3: Expose Server via ngrok

In another terminal:

```bash
ngrok http 3000
```

**You'll get:**
```
Forwarding     https://abc123def456.ngrok.io -> http://localhost:3000
```

**Save this URL** - you'll need it for webhooks.

---

## Step 4: Update WhatsApp Webhook Settings

If testing against real WhatsApp (optional):

1. Go to Meta Business Manager
2. WhatsApp > Configuration
3. Update Webhook URL:
   ```
   https://abc123def456.ngrok.io/webhook
   ```
4. Verify Token: Use same as `WHATSAPP_VERIFY_TOKEN` in `.env.local`

---

## Step 5: Test Webhook Reception

### Test 5.1: Verify Webhook Setup

```bash
# Test webhook validation (GET)
curl -X GET "https://abc123def456.ngrok.io/webhook/messages?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=YOUR_TOKEN"

# Expected: Returns the challenge string (test123)
```

### Test 5.2: Send Abandonment Webhook

```bash
# Create a test script: test-abandonment.sh

#!/bin/bash

PHONE="+5511999999999"
CART_ID="cart-test-$(date +%s)"
AMOUNT="250.00"
SECRET="your-app-secret"

# Create payload
PAYLOAD=$(cat <<EOF
{
  "event_type": "abandonment",
  "phone_number": "$PHONE",
  "cart_id": "$CART_ID",
  "cart_value": $AMOUNT,
  "abandoned_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "product_names": ["Produto 1", "Produto 2"],
  "external_id": "ext-$CART_ID"
}
EOF
)

# Calculate HMAC
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# Send webhook
curl -X POST "https://abc123def456.ngrok.io/webhook/abandonment" \
  -H "X-Signature: sha256=$SIGNATURE" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

# Expected:
# {
#   "status": "success",
#   "conversationId": "conv-xxx",
#   "messageId": "msg-xxx"
# }
```

### Test 5.3: Verify Database

After sending abandonment webhook, check:

```bash
# Check if user was created
psql sara_db -c "SELECT * FROM users WHERE phone_number = '+5511999999999';"

# Check if abandonment was recorded
psql sara_db -c "SELECT * FROM abandonments WHERE phone_number = '+5511999999999';"

# Check if conversation was created
psql sara_db -c "SELECT * FROM conversations WHERE phone_number = '+5511999999999';"

# Check if message was sent (in jobs/queue)
redis-cli LRANGE bull:ProcessMessageQueue 0 -1
```

---

## Step 6: Simulate User Response

### Test 6.1: Send User Message

```bash
# When user responds in WhatsApp with "Qual o preço?"

PHONE="+5511999999999"
MESSAGE_TEXT="Qual o preço?"
MESSAGE_ID="msg-user-$(date +%s)"
SECRET="your-app-secret"

PAYLOAD=$(cat <<EOF
{
  "messaging_product": "whatsapp",
  "metadata": {
    "phone_number_id": "YOUR_PHONE_ID"
  },
  "messages": [{
    "id": "$MESSAGE_ID",
    "from": "$PHONE",
    "type": "text",
    "text": {
      "body": "$MESSAGE_TEXT"
    },
    "timestamp": "$(date +%s)"
  }]
}
EOF
)

# Calculate HMAC
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# Send message webhook
curl -X POST "https://abc123def456.ngrok.io/webhook/messages" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

# Expected:
# {
#   "status": "queued",
#   "messageId": "msg-user-xxx",
#   "jobId": "job-xxx"
# }
```

### Test 6.2: Monitor Job Processing

```bash
# Check if job was processed
redis-cli LRANGE bull:ProcessMessageQueue 0 -1

# Check server logs (should show AI processing)
# Look for: "Message interpretation started", "AI response generated"

# Check database for stored messages
psql sara_db -c "SELECT * FROM messages WHERE conversation_id = '...';"
```

---

## Step 7: Test AI Response Generation

### Test 7.1: Manual Message Processing

If job processing isn't automatic, manually trigger:

```bash
# Check bull queue status
npm run check-queue

# Or manually process via API (if exposed)
curl -X POST "https://abc123def456.ngrok.io/queue/process" \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "conv-xxx"}'
```

### Test 7.2: Verify AI Response

```bash
# Check if AI-generated response was stored
psql sara_db -c "SELECT * FROM messages WHERE role = 'assistant' ORDER BY created_at DESC LIMIT 1;"

# Check logs for:
# - "Message interpretation started"
# - "AI response generated"
# - "Response sent to WhatsApp"
```

---

## Step 8: Complete Flow Verification

### Checklist

- [ ] Server starts without errors
- [ ] ngrok tunnel established
- [ ] Abandonment webhook received (200 OK)
- [ ] User record created in DB
- [ ] Conversation created and marked AWAITING_RESPONSE
- [ ] User message received (200 OK)
- [ ] Message stored in DB
- [ ] Job queued for processing
- [ ] AI processes message
- [ ] AI response generated
- [ ] Response sent back to user
- [ ] Conversation state updated to ACTIVE
- [ ] All logs present and coherent

---

## Monitoring During Tests

### Terminal 1: Server Logs
```bash
npm run dev

# Watch for:
# ✅ "Webhook message received"
# ✅ "Message interpretation started"
# ✅ "AI response generated"
# ✅ "Response sent successfully"
```

### Terminal 2: Database Queries
```bash
watch 'psql sara_db -c "SELECT COUNT(*) as messages FROM messages; SELECT COUNT(*) as conversations FROM conversations;"'
```

### Terminal 3: Redis Monitoring
```bash
redis-cli MONITOR

# Watch for job entries/processing
```

### Terminal 4: ngrok Logs
```bash
ngrok http 3000 --log=stdout

# Watch for incoming webhook requests
```

---

## Troubleshooting

### Issue: "HMAC verification failed"
**Solution**: Ensure:
1. Secret matches `WHATSAPP_APP_SECRET` in `.env.local`
2. Payload is serialized exactly the same way
3. No extra whitespace or formatting

### Issue: "Message not being processed"
**Solution**: Check:
1. Redis is running: `redis-cli ping` → should return "PONG"
2. BullMQ workers started: Check server logs
3. Database has conversation: `SELECT * FROM conversations;`

### Issue: "AI not responding"
**Solution**: Check:
1. OpenAI key is valid and has credits
2. Network access to openai.com
3. Token limits not exceeded

### Issue: "Phone number format error"
**Solution**: Ensure phone numbers are E.164 format:
```
✅ +5511999999999 (correct)
❌ 5511999999999 (missing +)
❌ (11) 99999-9999 (wrong format)
```

---

## Next Steps After Validation

1. **Document Findings** → Add to validation report
2. **Fix Issues** → Create GitHub issues for bugs
3. **Proceed to SARA-4.4** → Docker containerization
4. **Deploy to Railway** → Production deployment

---

**Ready to test?** Start with Step 1 and work through each step sequentially.

For questions, check server logs and Redis queue status.

