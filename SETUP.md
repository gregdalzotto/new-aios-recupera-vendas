# 🚀 SARA - Setup & Configuration Guide

## Environment Variables - SEGURANÇA PRIMEIRA

Este projeto utiliza **variáveis de ambiente** para todas as credenciais e configurações sensíveis.

### ✅ Segurança Implementada

- **`.env` e `.env.test` nunca são commitadas** (em `.gitignore`)
- **`.env.example`** serve como template com documentação
- **Validação automática** ao iniciar a aplicação (via Zod)
- **Fail-fast** se alguma variável obrigatória estiver faltando

---

## 📋 Quick Setup (Desenvolvimento)

### 1. Copie o template
```bash
cp .env.example .env.local
```

### 2. Preencha as credenciais

Abra `.env.local` e adicione:

```env
# Básico
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database (Supabase)
DATABASE_URL=postgresql://user:password@host:port/database

# Redis (local ou cloud)
REDIS_URL=redis://username:password@host:port

# OpenAI API Key
OPENAI_API_KEY=sk-your-key-here

# WhatsApp
WHATSAPP_VERIFY_TOKEN=your-token
WHATSAPP_APP_SECRET=your-secret
WHATSAPP_PHONE_ID=123456789
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789
WHATSAPP_ACCESS_TOKEN=your-token
```

### 3. Pronto!
```bash
npm install
npm run dev
```

---

## 🔑 Credenciais Necessárias

### 1. **Supabase Database**
- Crie projeto em https://supabase.com
- Copie `DATABASE_URL` da seção de credenciais
- Formato: `postgresql://user:password@host:port/db`

### 2. **Redis (Bull Queue)**
- Use Redis Cloud: https://redis.com/try-free/
- Copie URL de conexão
- Formato: `redis://user:password@host:port`

### 3. **OpenAI API Key**
- Crie conta em https://platform.openai.com
- Gere API key em https://platform.openai.com/api-keys
- Começa com `sk-`

### 4. **WhatsApp Business API (Meta)**
- Configure em https://developers.facebook.com
- Phone ID: ID do número do WhatsApp
- Business Account ID: ID da conta comercial
- Access Token: Bearer token para API calls
- Verify Token & App Secret: Valores arbitrários (use `openssl rand -hex 16` para gerar)

---

## 🧪 Testing

### Para rodar testes com `.env.test`:

**IMPORTANTE**: `.env.test` JÁ TEM credenciais de teste (em .gitignore):
- Supabase test DB
- Redis test instance
- Placeholders para OpenAI e WhatsApp

Se quiser rodar testes com SUAS credenciais:

```bash
# Copia .env.test e edita com suas credenciais
cp .env.test .env.test.local

# Jest carrega automaticamente .env.test
npm test
```

---

## 📊 Arquivos de Configuração

| Arquivo | Propósito | Commitado? |
|---------|-----------|-----------|
| `.env.example` | Template com documentação | ✅ SIM |
| `.env` | Produção (não use, use Railway/Docker vars) | ❌ NÃO |
| `.env.local` | Desenvolvimento local | ❌ NÃO |
| `.env.test` | Testes (credenciais test + reais para Redis/DB) | ❌ NÃO |
| `.env.staging` | Staging | ❌ NÃO |

---

## 🏗️ Deployment (Production)

### Railway / Docker / Heroku:

Não crie arquivo `.env` em produção. Configure variáveis de ambiente no painel:

```bash
# Via CLI (exemplo Railway)
railway variables set NODE_ENV=production
railway variables set DATABASE_URL=postgresql://...
railway variables set REDIS_URL=redis://...
railway variables set OPENAI_API_KEY=sk-...
# etc
```

### Docker:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY .env.example .env.example  # SEM .env real!
RUN npm ci --only=production
# Variáveis passadas em runtime via -e ou --env-file
```

---

## 🔒 Boas Práticas

✅ **FAÇA:**
- Usar `.env.local` para desenvolvimento
- Usar secrets manager em produção
- Rotacionar credenciais periodicamente
- Nunca commitar arquivos `.env`
- Usar placeholders no `.env.example`

❌ **NÃO FAÇA:**
- Commitar `.env` com credenciais reais
- Hardcoding de secrets no código
- Usar mesma chave em dev/staging/prod
- Compartilhar credenciais por email/Slack
- Deixar `.env` em repositórios públicos

---

## 🚨 Se vazar uma credencial

1. **IMEDIATAMENTE** regenere a credencial:
   - OpenAI: https://platform.openai.com/api-keys (delete key)
   - Redis: reset password no painel
   - Supabase: rotate key
   - WhatsApp: gere novo token

2. Atualize `.env.local` com a nova credencial

3. Procure em Git history:
   ```bash
   git log --all --full-history -- .env
   git log -p -- .env | grep -i "password\|key\|secret"
   ```

4. Se estiver no histórico, faça:
   ```bash
   git filter-branch --tree-filter 'rm -f .env' HEAD
   git push --force
   ```

---

## 📝 Variáveis Suportadas

Veja `.env.example` para documentação completa de cada uma.

### Obrigatórias:
- `NODE_ENV` (development, staging, production, test)
- `DATABASE_URL` (PostgreSQL connection string)
- `REDIS_URL` (Redis connection string)
- `OPENAI_API_KEY` (sk-...)
- `WHATSAPP_VERIFY_TOKEN` (min 10 chars)
- `WHATSAPP_APP_SECRET` (min 20 chars)

### Opcionais (Phase 2):
- `SENTRY_DSN`
- `DATADOG_API_KEY`

---

## ✨ Validação Automática

Ao iniciar a aplicação, o sistema:

1. Lê todas as variáveis de `.env.local` (via jest.setup.cjs em testes)
2. Valida cada uma com Zod schema
3. Se alguma for inválida/faltando: **falha na inicialização** com mensagem clara
4. Garante segurança: credenciais não são logadas

Exemplo de erro:
```
❌ Invalid environment configuration:
  OPENAI_API_KEY: Must be a valid OpenAI API key
  WHATSAPP_PHONE_ID: Required
```

---

## 🆘 Troubleshooting

### "Cannot find module 'redis'"
```bash
npm install
npm run build
```

### "Invalid environment configuration"
- Verifique `.env.local` existe e tem todas as variáveis
- Compare com `.env.example`
- Formatos: DATABASE_URL deve começar com `postgresql://`, REDIS_URL com `redis://`

### Redis connection timeout
- Confirme credenciais Redis estão corretas
- Verifique firewall/IP whitelist no painel Redis
- Teste: `redis-cli -u redis://user:pass@host:port ping`

### Tests falhando
- `.env.test` deve estar bem formado (check syntax)
- Arquivo está em `.gitignore`, nunca será deletado
- Se resetar, recopie credenciais

---

**Última atualização**: 2026-02-05
**Pronto para**: EPIC 2 - Integração OpenAI + WhatsApp
