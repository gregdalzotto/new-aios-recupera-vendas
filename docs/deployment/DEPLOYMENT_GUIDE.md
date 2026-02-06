# SARA Deployment Guide

**Version**: 1.0
**Last Updated**: 2026-02-06
**Status**: Production Ready

---

## Quick Start (Local Docker)

### Prerequisites
- ✅ Docker Desktop installed ([download](https://www.docker.com/products/docker-desktop))
- ✅ Git and this repository cloned
- ✅ All required API credentials

### Steps (5 minutes)

```bash
# 1. Copy environment template and fill in values
cp .env.production.template .env.production
# Edit .env.production with your API keys

# 2. Build and start all services
docker-compose up -d

# 3. Verify services are running
docker-compose ps

# 4. Test the server
curl http://localhost:3000/health

# 5. View logs
docker-compose logs -f app
```

**Result**: SARA running at `http://localhost:3000` ✅

---

## Production Deployment (Railway)

### Step 1: Prepare Railway Project

```bash
# 1.1 Install Railway CLI
npm install -g @railway/cli

# 1.2 Login to Railway
railway login

# 1.3 Create new Railway project
railway init

# Select: Create new project
# Project name: sara-agent
# Region: South America (or your region)
```

### Step 2: Configure Services

```bash
# 2.1 Add PostgreSQL service
railway add # Select postgres-15-alpine

# 2.2 Add Redis service
railway add # Select redis-7-alpine

# 2.3 Push code to GitHub first
git add .
git commit -m "feat: add Docker configuration [SARA-4.4]"
git push origin main
```

### Step 3: Environment Variables

Railway will auto-generate connection strings for PostgreSQL and Redis.

```bash
# Set via Railway CLI or Dashboard:

# Auto-generated (don't change):
# - DATABASE_URL (from postgres service)
# - REDIS_URL (from redis service)

# Add manually in Railway Dashboard:
# Settings > Variables > Add Variable

# Required variables:
OPENAI_API_KEY=sk-proj-xxxx
WHATSAPP_PHONE_ID=123456
WHATSAPP_BUSINESS_ACCOUNT_ID=123456
WHATSAPP_APP_ID=123456
WHATSAPP_APP_SECRET=xxxx
WHATSAPP_VERIFY_TOKEN=xxxx
WHATSAPP_ACCESS_TOKEN=EAAxxxx
WHATSAPP_TEMPLATE_INITIAL=boas_vindas_rcc_comandor

# Optional (with defaults):
SARA_MAX_CYCLES=5
LOG_LEVEL=info
```

### Step 4: Deploy

```bash
# 4.1 Link GitHub repository
railway connect # Follow prompts

# 4.2 Enable auto-deployments
# Dashboard > GitHub > Enable auto-deploy from main

# 4.3 Deploy
railway up

# 4.4 Monitor deployment
railway status
railway logs
```

---

## Verification Checklist

### ✅ Local Docker Verification

```bash
# 1. Check container status
docker-compose ps

# 2. Check app logs
docker-compose logs app

# 3. Test health endpoint
curl http://localhost:3000/health

# 4. Test database connection
curl http://localhost:3000/api/status/db

# 5. View metrics
curl http://localhost:3000/metrics
```

### ✅ Production (Railway) Verification

```bash
# 1. Get Railway domain
railway domains

# 2. Test health endpoint
curl https://your-domain.railway.app/health

# 3. Check logs
railway logs

# 4. Monitor metrics
railway status

# 5. Test API endpoints
curl https://your-domain.railway.app/api/status/db
```

---

## Docker Commands Reference

### Build Image

```bash
# Build from Dockerfile
docker build -t sara-agent:latest .

# Build without cache
docker build --no-cache -t sara-agent:latest .

# Check image size
docker images | grep sara
```

### Run Container

```bash
# Using docker-compose (recommended)
docker-compose up -d

# Using docker directly
docker run -d \
  --name sara-app \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  sara-agent:latest

# Interactive mode
docker run -it \
  -p 3000:3000 \
  sara-agent:latest
```

### Management

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f app

# Stop services
docker-compose stop

# Restart services
docker-compose restart

# Remove everything (including volumes)
docker-compose down -v

# Execute command in container
docker-compose exec app npm run migrate

# Access container shell
docker-compose exec app sh
```

---

## Troubleshooting

### Issue: "Connection refused" to database

```bash
# 1. Check postgres is running
docker-compose ps postgres

# 2. Check logs
docker-compose logs postgres

# 3. Verify DATABASE_URL format
docker-compose exec app echo $DATABASE_URL

# 4. Test connection directly
docker-compose exec app psql $DATABASE_URL -c "SELECT 1;"
```

### Issue: "Cannot connect to Redis"

```bash
# 1. Check redis is running
docker-compose ps redis

# 2. Verify REDIS_URL
docker-compose exec app echo $REDIS_URL

# 3. Test connection
docker-compose exec app redis-cli -u $REDIS_URL ping
# Expected: PONG
```

### Issue: "Application won't start"

```bash
# 1. Check logs
docker-compose logs app

# 2. Rebuild image (clear cache)
docker-compose build --no-cache

# 3. Restart
docker-compose down && docker-compose up -d
```

### Issue: "Out of memory" errors

Increase memory limits in docker-compose.yml:

```yaml
deploy:
  resources:
    limits:
      memory: 2G  # Increased from 1G
```

Then restart:
```bash
docker-compose down && docker-compose up -d
```

---

## Backup & Recovery

### Database Backup

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U postgres sara_db > backup.sql

# Restore from backup
cat backup.sql | docker-compose exec -T postgres psql -U postgres sara_db
```

### Volume Backup

```bash
# Backup postgres data volume
docker run --rm -v sara_postgres_data:/data -v $(pwd):/backup \
  busybox tar czf /backup/postgres_backup.tar.gz -C /data .

# Backup redis data volume
docker run --rm -v sara_redis_data:/data -v $(pwd):/backup \
  busybox tar czf /backup/redis_backup.tar.gz -C /data .
```

---

## Monitoring & Logs

### View Logs

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs app

# Follow logs (real-time)
docker-compose logs -f app

# Last N lines
docker-compose logs --tail=50 app

# Since timestamp
docker-compose logs --since 2026-02-06T10:00:00 app
```

### Monitor Resources

```bash
# Docker stats (CPU, memory, I/O)
docker stats

# Check disk usage
docker system df

# Inspect container
docker inspect sara-app
```

---

## Performance Optimization

### Image Size Optimization
- ✅ Multi-stage build: ~250MB
- ✅ Alpine base image: ~110MB
- ✅ Production dependencies only

### Runtime Optimization
- ✅ Memory limit: 1GB
- ✅ CPU limit: 1 core
- ✅ Health checks: Auto-restart on failure
- ✅ Resource reservations: Guaranteed resources

### Network Optimization
- ✅ Internal docker network: No external port exposure
- ✅ Service discovery: Container names as hostnames
- ✅ Health checks: Prevent zombie containers

---

## Security Best Practices

### Implemented ✅

- [ ] Non-root user (nodejs)
- [ ] Read-only root filesystem (when possible)
- [ ] No secrets in Dockerfile
- [ ] Alpine Linux (minimal attack surface)
- [ ] Health checks (detect issues early)
- [ ] Resource limits (prevent DoS)

### Recommended for Production

```yaml
# Add to docker-compose.yml
security_opt:
  - no-new-privileges:true
read_only: true
tmpfs:
  - /tmp
  - /run
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE
```

---

## Rollback Procedure

### If deployment fails on Railway:

```bash
# 1. Check current status
railway status

# 2. View deployment history
railway deployments

# 3. Rollback to previous version
railway rollback [deployment-id]

# 4. Verify rollback
railway logs
curl https://your-domain.railway.app/health
```

---

## Cost Optimization

### Railway Pricing (as of Feb 2026)
- ✅ Free tier: Up to 500 hours/month per service
- ✅ PostgreSQL: $0.30/day base + storage
- ✅ Redis: Included in free tier (limited)
- ✅ Bandwidth: $0.10/GB

### Optimize Costs
1. Use free tier for development/testing
2. Scale resources down when not in use
3. Use Railway's reserved instances for production
4. Monitor resource usage regularly

---

## Support & Next Steps

### Documentation Links
- [Docker Documentation](https://docs.docker.com/)
- [Railway Documentation](https://docs.railway.app/)
- [PostgreSQL Docker Guide](https://hub.docker.com/_/postgres)
- [Redis Docker Guide](https://hub.docker.com/_/redis)

### Next Milestone: SARA-4.5
- [ ] Observability: Prometheus + Grafana
- [ ] Logging: ELK Stack integration
- [ ] Alerts: Automated incident detection
- [ ] Cost monitoring: Billing alerts

---

**Status**: ✅ Ready for Production Deployment

