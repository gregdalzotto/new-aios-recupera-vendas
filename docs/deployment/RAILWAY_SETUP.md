# Railway Setup & Configuration Guide

**Status**: Step-by-Step Instructions
**Estimated Time**: 20-30 minutes
**Difficulty**: Medium

---

## What is Railway?

Railway is a cloud platform that simplifies deployment of containerized applications. It handles:
- ✅ Infrastructure management
- ✅ Auto-scaling
- ✅ SSL/TLS certificates
- ✅ Database management
- ✅ Environment variables
- ✅ Monitoring & logs

---

## Step 1: Prerequisites

### Create Accounts (if needed)
1. **Railway**: [railway.app](https://railway.app) (free tier available)
2. **GitHub**: Already have this for the repository

### Install Tools
```bash
# Install Railway CLI
npm install -g @railway/cli

# Verify installation
railway --version
# Expected output: railway/x.x.x
```

---

## Step 2: Login to Railway

```bash
# Login to Railway
railway login

# Follow browser prompt to authenticate
# After authentication, you'll get a token
```

---

## Step 3: Create Railway Project

```bash
# Initialize Railway in project directory
railway init

# Select: Create a new project
# Project name: sara-agent
# Region: South America (sa) or your preferred region

# Verify project creation
railway status
```

---

## Step 4: Add Services to Project

Railway will manage PostgreSQL and Redis for us.

### Add PostgreSQL

```bash
# Add postgres service
railway add

# In the interactive menu:
# Select: postgres-15-alpine
# This creates a PostgreSQL 15 database

# Verify
railway services
```

### Add Redis

```bash
# Add redis service
railway add

# In the interactive menu:
# Select: redis-7-alpine
# This creates a Redis 7 database

# Verify
railway services
```

### Add Application

The application service will be created from your GitHub repository.

---

## Step 5: Connect GitHub Repository

```bash
# Connect your GitHub repo to Railway
railway connect

# Follow prompts to:
# 1. Authorize Railway in GitHub
# 2. Select this repository
# 3. Select "main" branch for auto-deploy

# Enable auto-deployment
# This makes Railway automatically deploy when you push to main
```

---

## Step 6: Set Environment Variables

Railway auto-generates `DATABASE_URL` and `REDIS_URL` from the services you added.

### View Auto-Generated Variables

```bash
railway variables

# You should see:
# DATABASE_URL=postgresql://...
# REDIS_URL=redis://...
```

### Add API Keys & Secrets

Go to Railway Dashboard:

1. **Open Project**: `railway.app` → Your Project
2. **Select Service**: SARA App
3. **Click "Variables"**
4. **Add New Variables**:

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_ID=123456789012345
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789012345
WHATSAPP_APP_ID=123456789012345
WHATSAPP_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_VERIFY_TOKEN=your_secure_token_here
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_INITIAL=boas_vindas_rcc_comandor
LOG_LEVEL=info
```

### Add Secrets (Sensitive Values)

Use Railway "Secrets" for sensitive values (they're not logged):

1. **Click "Secrets"**
2. **Add each secret**:
   - OPENAI_API_KEY
   - WHATSAPP_APP_SECRET
   - WHATSAPP_ACCESS_TOKEN

---

## Step 7: Configure Deployment Settings

In Railway Dashboard > Settings:

### Build Settings
- **Dockerfile**: `./Dockerfile`
- **Root Directory**: `/` (default)

### Deployment Settings
- **Auto-deploy**: Enable (auto-deploy on push to main)
- **Health Check**: `/health`
- **Restart Policy**: On Failure

### Port & Environment
- **Port**: 3000
- **Memory**: 512MB (or more if needed)
- **CPU**: 0.5 core

---

## Step 8: Deploy Application

### Option A: Auto-Deploy (Recommended)

```bash
# Push to main branch
git add .
git commit -m "feat: add Docker configuration [SARA-4.4]"
git push origin main

# Railway automatically deploys
# Watch progress in Railway Dashboard
```

### Option B: Manual Deploy via CLI

```bash
# Trigger deployment
railway up

# Monitor deployment
railway logs
railway status

# Get public URL
railway domains
```

---

## Step 9: Verify Deployment

### Check Deployment Status

```bash
# View logs
railway logs

# Check status
railway status

# Expected output:
# Status: Running ✓
# Memory: 256MB / 512MB
# CPU: 0% / 50%
```

### Test API Endpoints

Get your Railway domain:

```bash
# Get public URL
railway domains

# Expected output: https://sara-agent-prod.railway.app
```

Test endpoints:

```bash
# Health check
curl https://sara-agent-prod.railway.app/health

# Expected: { "status": "ok" }

# Database status
curl https://sara-agent-prod.railway.app/api/status/db

# Metrics
curl https://sara-agent-prod.railway.app/metrics
```

---

## Monitoring & Management

### View Logs

```bash
# Tail logs (real-time)
railway logs -f

# Last N lines
railway logs --tail 50

# Filter by service
railway logs -s app
```

### Monitor Metrics

In Railway Dashboard:
- **CPU Usage**: Should be < 50%
- **Memory**: Should be < 50% of limit
- **Uptime**: Should be 100%

### View Database

```bash
# Connect to PostgreSQL
railway database shell

# List databases
\l

# Connect to sara_db
\c sara_db

# List tables
\dt

# Query users
SELECT * FROM users;
```

---

## Common Issues & Solutions

### Issue: Deployment fails

```bash
# 1. Check logs for errors
railway logs

# 2. Look for:
# - Build errors
# - Missing environment variables
# - Database connection issues

# 3. Fix and push again
git push origin main
# Railway auto-redeploys
```

### Issue: Application crashes

```bash
# 1. Check recent logs
railway logs --tail 100

# 2. Common causes:
# - Missing environment variables
# - Database connection failed
# - Out of memory

# 3. Restart service
railway restart

# 4. Increase memory if needed
# Dashboard > Settings > Memory: 1GB
```

### Issue: Can't connect to database

```bash
# 1. Verify DATABASE_URL is set
railway variables | grep DATABASE_URL

# 2. Test connection
railway database shell

# 3. Check PostgreSQL service is running
railway services

# 4. If missing, re-add:
railway add # Select postgres-15-alpine
```

---

## Environment Variables Checklist

Before deploying, ensure all these are set in Railway:

```
Required (No defaults):
□ OPENAI_API_KEY
□ WHATSAPP_PHONE_ID
□ WHATSAPP_BUSINESS_ACCOUNT_ID
□ WHATSAPP_APP_ID
□ WHATSAPP_APP_SECRET
□ WHATSAPP_VERIFY_TOKEN
□ WHATSAPP_ACCESS_TOKEN

Optional (Have defaults):
□ LOG_LEVEL (default: info)
□ SARA_MAX_CYCLES (default: 5)
□ SARA_WEBHOOK_RATE_LIMIT_MAX_REQUESTS (default: 10)

Auto-Generated (Don't set manually):
□ DATABASE_URL (from postgres service)
□ REDIS_URL (from redis service)
□ NODE_ENV (should be: production)
□ PORT (should be: 3000)
```

---

## Rollback to Previous Version

If something goes wrong:

```bash
# View deployment history
railway deployments

# Rollback to previous deployment
railway rollback [deployment-id]

# Example:
# railway rollback 5d4a8f9c-1234-5678-90ab-cdef12345678
```

---

## Cost Estimation

### Free Tier (Development)
- ✅ 500 hours/month per service
- ✅ PostgreSQL: Basic tier (free)
- ✅ Redis: Free tier
- ✅ Perfect for testing

### Paid Tier (Production - if needed)
- 💰 PostgreSQL: $0.30/day + storage
- 💰 Redis: $5/month + traffic
- 💰 App compute: $0.10/hour
- 📊 Monitor: `railway.app` → Billing

---

## Next Steps

After successful deployment:

1. **Update DNS** (if using custom domain)
2. **Setup WhatsApp Webhooks** to new Railway URL
3. **Monitor for 24 hours** - check logs regularly
4. **Setup Alerts** - in Railway Dashboard

---

## Support

### Documentation
- [Railway Docs](https://docs.railway.app/)
- [Railway CLI Reference](https://docs.railway.app/cli)
- [Common Issues](https://docs.railway.app/troubleshooting)

### Contact
- Railway Support: support@railway.app
- Community: Discuss.railway.app

---

**Status**: ✅ Ready to Deploy

