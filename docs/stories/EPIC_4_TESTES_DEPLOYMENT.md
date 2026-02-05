# EPIC 4: Testes + Deployment
## Garantir Qualidade, Confiabilidade e Observabilidade

**Epic ID**: SARA-4
**Status**: Ready for Development
**Prioridade**: P1 (Go-to-Market)
**Estimativa Total**: ~40 story points

**Objetivo do Epic:**
Implementar cobertura completa de testes (unitários, integração, carga), containerizar a aplicação com Docker, configurar deploy em Railway, e instrumentar observabilidade (logging, métricas, alertas) para suportar produção com confiança.

**Entregas do Epic:**
- Cobertura de testes unitários > 80%
- Suíte de testes de integração com BD real
- Testes de carga & performance baseline
- Docker image pronta para produção
- Deployment CI/CD no Railway
- Observabilidade com logs estruturados, métricas e alertas

---

## Story SARA-4.1: Testes Unitários - Cobertura Completa

**Como** desenvolvedor,
**Quero** testes unitários para todos os services e repositories,
**Para** garantir que lógica de negócio funciona conforme especificado.

### Acceptance Criteria

1. **Configuração Jest:**
   - [ ] Jest configurado em `jest.config.js`
   - [ ] Preset: `ts-jest`
   - [ ] Coverage thresholds: lines 80%, functions 80%, branches 75%
   - [ ] Test matches: `**/*.test.ts` em `tests/unit/`
   - [ ] `npm test` roda sem erros

2. **Testes de ConversationService (SARA-2.1):**
   - [ ] `findByPhoneNumber()`: retorna conversa ativa + prioriza corretamente
   - [ ] `create()`: cria nova conversa com status AWAITING_RESPONSE
   - [ ] `updateStatus()`: transições válidas (AWAITING → ACTIVE)
   - [ ] `updateStatus()`: rejeita transições inválidas com erro
   - [ ] `incrementMessageCount()`: incrementa counter
   - [ ] `isWithinWindow()`: valida janela 24h corretamente
   - [ ] Testes com mock de repository

3. **Testes de AIService (SARA-2.2):**
   - [ ] `interpretMessage()`: com input normal → retorna resposta válida
   - [ ] `interpretMessage()`: com timeout → retorna fallback message
   - [ ] `interpretMessage()`: token counting funciona corretamente
   - [ ] `interpretMessage()`: rate limit error logado (não falha)
   - [ ] `detectOptOutIntent()`: com intent claro → confidence alta
   - [ ] `detectOptOutIntent()`: timeout → retorna false (conservador)
   - [ ] Testes com mock de OpenAI client (axios mock)

4. **Testes de MessageService (SARA-2.3):**
   - [ ] `send()`: com mensagem válida → retorna messageId
   - [ ] `send()`: valida comprimento máximo (4096 chars)
   - [ ] `send()`: com timeout → falha com log
   - [ ] `send()`: retry logic com exponential backoff (mock)
   - [ ] `send()`: valida E.164 phone format

5. **Testes de OptOutDetector (SARA-3.1):**
   - [ ] `detectKeyword()`: "parar" → true
   - [ ] `detectKeyword()`: "parando" → true (variação)
   - [ ] `detectKeyword()`: case-insensitive → "PARAR" → true
   - [ ] `detectKeyword()`: accent-insensitive → "párar" → true
   - [ ] `detectKeyword()`: "qual o preço?" → false
   - [ ] `getKeywordMatched()`: retorna keyword exato encontrado

6. **Testes de ComplianceService (SARA-3.3):**
   - [ ] `validateConversationWindow()`: < 24h → válida
   - [ ] `validateConversationWindow()`: > 24h → expirada
   - [ ] `shouldStopConversation()`: conversa expirada → true
   - [ ] `shouldStopConversation()`: opted_out = true → true
   - [ ] `markOptedOut()`: atualiza users.opted_out = true
   - [ ] Testes com mock de repository

7. **Cobertura Mínima:**
   - [ ] Jest report gerado: `npm test -- --coverage`
   - [ ] Coverage > 80% lines, > 80% functions, > 75% branches
   - [ ] Nenhuma linha crítica sem teste
   - [ ] Falhas de teste bloqueiam build (exit code 1)

8. **Testes de Erros e Edge Cases:**
   - [ ] Null/undefined inputs → handled gracefully
   - [ ] Vazio string → handled
   - [ ] Dados malformados → caught e logado
   - [ ] Timeout/network errors → retried ou fallback

### Notas Técnicas
- Usar `jest.mock()` para dependencies
- Mock de BD: usar fixtures ou jest mock
- Mock de OpenAI: axios mock ou jest mock
- Fixtures em `tests/fixtures/` para dados reutilizáveis
- Snapshot tests para resposta OpenAI (se determinística)

### Arquivos Afetados
- jest.config.js (novo)
- tests/unit/ (diretório com todos os .test.ts)
- .eslintignore (adicionar dist/, node_modules/)
- package.json (adicionar script coverage)

### Dependencies
- Todas as stories anteriores (SARA-1 até SARA-3)

---

## Story SARA-4.2: Testes de Integração com BD & Mocks

**Como** desenvolvedor,
**Quero** testes de integração que validam fluxos ponta-a-ponta,
**Para** garantir que componentes funcionam juntos corretamente.

### Acceptance Criteria

1. **Setup de BD para Testes:**
   - [ ] Supabase test instance ou local PostgreSQL (pg)
   - [ ] Migrations rodadas automaticamente antes dos testes
   - [ ] Teardown: limpar dados após cada teste
   - [ ] Transactions: cada teste em sua própria transação (rollback)

2. **Testes de Webhook POST /webhook/abandonment (SARA-1.5):**
   - [ ] Payload válido → 200 OK, BD records criados
   - [ ] Payload duplicado (external_id repeat) → 200 OK com "already_processed"
   - [ ] Phone inválido → 400 Bad Request
   - [ ] HMAC inválido → 403 Forbidden
   - [ ] Verificar users + abandonments + conversations records

3. **Testes de Webhook GET /webhook/messages (SARA-1.4):**
   - [ ] Query válida com token correto → 200 OK + challenge
   - [ ] Token inválido → 403 Forbidden
   - [ ] Params faltando → 400 Bad Request

4. **Testes de Processamento de Webhook (SARA-2.4):**
   - [ ] POST /webhook/messages com payload válido → 200 OK imediatamente
   - [ ] Job enfileirado corretamente em Bull
   - [ ] Job processa: carrega conversa, chama AIService, envia resposta
   - [ ] Mensagem duplicada (whatsapp_message_id repeat) → ignorada
   - [ ] BD atualizado: messages + conversations records

5. **Testes de Fluxo Completo:**
   - [ ] Abandonment event → POST /webhook/abandonment
   - [ ] Usuário responde → POST /webhook/messages
   - [ ] Sistema processa → AIService interpreta
   - [ ] Sara responde → MessageService.send() (mock)
   - [ ] BD refleja histórico completo

6. **Testes de OptOut Workflow:**
   - [ ] Mensagem com keyword de opt-out → detectada
   - [ ] Usuario marcado como opted_out = true
   - [ ] Conversa marcada como CLOSED
   - [ ] Nenhuma mensagem de resposta enviada

7. **Testes de Payment Conversion (SARA-3.4):**
   - [ ] POST /webhook/payment com status 'completed' → abandonment CONVERTED
   - [ ] Payment duplicado → "already_processed"
   - [ ] Payment status 'failed' → abandonment DECLINED, conversa ativa

8. **Mock Externo:**
   - [ ] OpenAI API: mock com respostas pré-definidas
   - [ ] WhatsApp Meta API: mock com messageId
   - [ ] Redis: usar redis-mock ou local instance

### Notas Técnicas
- Usar database transactions para isolamento de testes
- Seed de dados via migrations ou fixtures
- `beforeAll()`: setup BD, connect Redis
- `afterAll()`: teardown, disconnect
- `beforeEach()`: truncate tables (ou transaction rollback)
- Test timeout: 10-30 segundos (DB operações são lentas)

### Arquivos Afetados
- tests/integration/ (novo diretório)
- tests/integration/webhooks.test.ts
- tests/integration/workflow.test.ts
- tests/setup.ts (novo - BD setup/teardown)
- jest.config.js (adicionar config para integração)

### Dependencies
- Todas as stories anteriores (SARA-1 até SARA-3)

---

## Story SARA-4.3: Testes de Carga & Performance

**Como** desenvolvedor,
**Quero** validar que Sara aguenta carga esperada sem degradação,
**Para** garantir performance em produção.

### Acceptance Criteria

1. **Setup de Teste de Carga:**
   - [ ] Ferramenta: k6, Artillery ou Apache JMeter
   - [ ] Configurado em `tests/load/`
   - [ ] Variáveis: BASE_URL, WEBHOOK_SECRET, NUM_USERS, DURATION

2. **Cenários de Teste:**
   - [ ] Baseline: 10 RPS (requests/sec) por 60 segundos
   - [ ] Stress: 100 RPS por 120 segundos (pico esperado)
   - [ ] Spike: aumento repentino de 10 para 500 RPS por 10s
   - [ ] Ramp-up: aumento gradual de 0 a 100 RPS em 2 minutos

3. **Métricas a Coletar:**
   - [ ] Response time: p50, p95, p99 (máximo aceitável: p99 < 2s)
   - [ ] Error rate: máximo 0.5% (99.5% sucesso)
   - [ ] Throughput: requisições/segundo
   - [ ] GC pauses (Node.js): não deve bloquear > 100ms

4. **Endpoints Testados:**
   - [ ] POST /webhook/abandonment (1000 abandonment events)
   - [ ] POST /webhook/messages (500 user messages)
   - [ ] GET /health (para verificar baseline)

5. **Performance Targets:**
   - [ ] POST /webhook/abandonment: < 200ms (média), < 1s (p99)
   - [ ] POST /webhook/messages: < 100ms (média), < 500ms (p99)
   - [ ] Queue processing: lag < 5 segundos (Bull queue)
   - [ ] DB queries: < 50ms (com índices corretos)

6. **Baseline Report:**
   - [ ] Gerar relatório em `tests/load/results/baseline.json`
   - [ ] Comparar com threshold: se p99 > threshold → teste falha
   - [ ] Incluir em CI/CD pipeline (após deployment)

7. **Testes:**
   - [ ] Teste baseline: 10 RPS × 60s → p99 < threshold
   - [ ] Teste stress: 100 RPS × 120s → error rate < 0.5%
   - [ ] Teste spike: responde corretamente mesmo em pico
   - [ ] Não há memory leaks (heap size estável)

### Notas Técnicas
- Usar k6 JavaScript API (fácil configuração)
- Simular HMAC signature válida em cada request
- Mock OpenAI com delay fixo (200ms)
- Mock MessageService com delay fixo (100ms)
- Redis deve ter recursos suficientes (Bull queue)
- Rodar em staging/prod-like environment

### Arquivos Afetados
- tests/load/baseline.k6.js (novo)
- tests/load/stress.k6.js (novo)
- tests/load/results/ (diretório para reports)
- package.json (adicionar script: `npm run load-test`)

### Dependencies
- Story SARA-4.2 (BD e mocks configurados)

---

## Story SARA-4.4: Docker & Deployment Railway

**Como** desenvolvedor,
**Quero** containerizar Sara em Docker e fazer deploy automático em Railway,
**Para** ter ambiente de produção escalável e reproducível.

### Acceptance Criteria

1. **Docker Image Criada:**
   - [ ] Dockerfile em raiz do projeto
   - [ ] Multi-stage build: stage 1 build (npm install, build), stage 2 runtime
   - [ ] Base image: `node:18-alpine` (slim)
   - [ ] Tamanho final: < 500MB
   - [ ] Health check endpoint: GET /health

2. **Dockerfile Best Practices:**
   - [ ] Layer caching otimizado: COPY package.json primeiro
   - [ ] Non-root user: `useradd -m nodeuser` (segurança)
   - [ ] CMD: `node dist/index.js`
   - [ ] Expose port: 3000
   - [ ] Healthcheck: `HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/health`

3. **Variáveis de Ambiente (runtime):**
   - [ ] DATABASE_URL (Supabase)
   - [ ] REDIS_URL (Redis instance)
   - [ ] OPENAI_API_KEY (OpenAI)
   - [ ] WHATSAPP_ACCESS_TOKEN (Meta)
   - [ ] WHATSAPP_PHONE_ID (Meta)
   - [ ] WHATSAPP_BUSINESS_ACCOUNT_ID (Meta)
   - [ ] WHATSAPP_APP_SECRET (HMAC secret)
   - [ ] WHATSAPP_VERIFY_TOKEN (webhook validation)
   - [ ] NODE_ENV: 'production'
   - [ ] LOG_LEVEL: 'info'

4. **CI/CD Pipeline (GitHub Actions):**
   - [ ] Trigger: push to `main` branch
   - [ ] Steps:
     1. Checkout code
     2. Run tests: `npm run test`
     3. Lint: `npm run lint`
     4. Typecheck: `npm run typecheck`
     5. Build Docker image: `docker build`
     6. Deploy to Railway: `railway deploy` (via CLI)

5. **Railway Configuration:**
   - [ ] New service criado no Railway dashboard
   - [ ] Conectado a Supabase (DATABASE_URL)
   - [ ] Conectado a Redis (REDIS_URL)
   - [ ] Environment variables configuradas
   - [ ] Port: 3000 (Railway auto-detects)
   - [ ] Node.js 18 runtime

6. **Deployment Script:**
   - [ ] Arquivo: `.github/workflows/deploy.yml`
   - [ ] `npm run build` compila TypeScript
   - [ ] Docker image tageada com commit SHA
   - [ ] Pushed para Railway container registry
   - [ ] Automatic rollout em Railway

7. **Pré-Deployment Checks:**
   - [ ] Testes passando 100%
   - [ ] Linting sem erros
   - [ ] Typecheck sem erros
   - [ ] Migrations SQL testadas

8. **Testes:**
   - [ ] Dockerfile builds sem erros
   - [ ] Container roda: `docker run -p 3000:3000 sara:latest`
   - [ ] GET /health retorna 200 OK
   - [ ] Environment vars carregadas corretamente
   - [ ] Railway deployment bem-sucedido

### Notas Técnicas
- Multi-stage build reduz tamanho (remove build tools)
- Non-root user previne ataques (container escape)
- Healthcheck permite Railway auto-recovery
- GitHub Actions requer `RAILWAY_TOKEN` in secrets
- Migrations: rodar antes do container iniciar (init script)

### Arquivos Afetados
- Dockerfile (novo)
- .dockerignore (novo)
- .github/workflows/deploy.yml (novo)
- .railway/ (Railway config, auto-criado)

### Dependencies
- Story SARA-4.1 e SARA-4.2 (testes passando)

---

## Story SARA-4.5: Observabilidade - Logs, Métricas e Alertas

**Como** desenvolvedor,
**Quero** ter visibilidade completa em produção: logs estruturados, métricas, alertas,
**Para** detectar e resolver problemas rapidamente.

### Acceptance Criteria

1. **Winston Logger Configurado:**
   - [ ] Integrado em todos os services
   - [ ] Formatos:
     - [ ] Dev: human-readable (colorized)
     - [ ] Prod: JSON estruturado (para parsing)
   - [ ] Níveis: debug, info, warn, error
   - [ ] Contexto: traceId, userId, conversationId, operation

2. **Log Samples (estrutura JSON):**
   ```json
   {
     "timestamp": "2025-01-15T10:30:45.123Z",
     "level": "info",
     "message": "Webhook received",
     "traceId": "uuid-123",
     "userId": "user-456",
     "operation": "POST /webhook/abandonment",
     "statusCode": 200,
     "duration": 45,
     "metadata": { "abandonmentId": "abn-789" }
   }
   ```

3. **Pontos de Log Críticos:**
   - [ ] Webhook recebido + HMAC verification
   - [ ] ConversationService: load, create, update status
   - [ ] AIService: interpretMessage, timeout/error
   - [ ] MessageService: send, retry, error
   - [ ] OptOutDetector: keyword matched
   - [ ] ComplianceService: window validation, opt-out marked
   - [ ] Payment processing: status changes
   - [ ] Job queue: enqueue, process, retry, failed
   - [ ] BD: queries lentas (> 100ms), erros

4. **Prometheus Métricas:**
   - [ ] Contador: `webhooks_received_total` (por tipo)
   - [ ] Contador: `messages_sent_total` (sucesso/falha)
   - [ ] Contador: `conversations_created_total`
   - [ ] Gauge: `active_conversations` (current count)
   - [ ] Gauge: `queue_depth` (Bull pending jobs)
   - [ ] Histogram: `webhook_process_duration_seconds` (p50, p95, p99)
   - [ ] Histogram: `db_query_duration_seconds`
   - [ ] Histogram: `openai_response_time_seconds`
   - [ ] Gauge: `node_memory_heap_used_bytes`
   - [ ] Gauge: `db_pool_available_connections`

5. **Endpoint Prometheus:**
   - [ ] GET /metrics retorna Prometheus formato
   - [ ] Registrado em Fastify
   - [ ] Não requer autenticação (IP whitelist se necessário)

6. **Alertas via Sentry:**
   - [ ] Sentry account criado
   - [ ] DSN em .env (`SENTRY_DSN`)
   - [ ] Integrado em middleware de erro
   - [ ] Logs errors + warnings
   - [ ] Contexto: user, trace, breadcrumbs
   - [ ] Alertas: error threshold (ex: > 1% error rate)

7. **Grafana Dashboard (Manual Setup):**
   - [ ] Query Prometheus metrics
   - [ ] Painel 1: Webhooks received/sec (timeseries)
   - [ ] Painel 2: Messages sent (success/failure rate)
   - [ ] Painel 3: Active conversations (gauge)
   - [ ] Painel 4: Queue depth (gauge)
   - [ ] Painel 5: Response times (histogram percentiles)
   - [ ] Painel 6: Error rate (% of requests)

8. **Logs Storage:**
   - [ ] CloudFlare Logpush (ou similar) para centralize logs
   - [ ] Ou ELK Stack (Elasticsearch + Kibana) local
   - [ ] Retenção: 30 dias

9. **Testes:**
   - [ ] GET /metrics retorna 200 OK com formato Prometheus
   - [ ] Métricas incrementam em eventos
   - [ ] Logs aparecem em stdout (JSON format)
   - [ ] Sentry capta errors

### Notas Técnicas
- prom-client library para Prometheus
- Sentry SDK for Node.js
- Winston com transports (console + file)
- Estruturar logs com consistent fields
- Trace IDs permitem seguir request ponta-a-ponta
- Breadcrumbs em Sentry: últimas 10 ações

### Arquivos Afetados
- src/config/logger.ts (novo - Winston setup)
- src/config/prometheus.ts (novo - metrics setup)
- src/middleware/errorHandler.ts (novo - error logging + Sentry)
- src/middleware/requestLogger.ts (novo - request/response logging)
- src/routes/metrics.ts (novo - GET /metrics endpoint)
- src/server.ts (registrar middleware + routes)
- .env.example (adicionar SENTRY_DSN)

### Dependencies
- Story SARA-4.4 (Docker/Railway setup)

---

## Summary

**EPIC 4 contém 5 stories** que implementam:
- ✅ Cobertura de testes unitários > 80%
- ✅ Suíte completa de testes de integração
- ✅ Testes de carga com baselines de performance
- ✅ Docker & CI/CD deployment em Railway
- ✅ Observabilidade com logs, métricas e alertas

**Story Points Estimado:** ~40 pontos (8+10+8+8+6)

**Sequência de Implementação:**
1. SARA-4.1 (Unit tests) - paralelizar com dev
2. SARA-4.2 (Integration tests) - após SARA-4.1
3. SARA-4.3 (Load tests) - após SARA-4.2
4. SARA-4.4 (Docker + Railway) - após SARA-4.3
5. SARA-4.5 (Observability) - após SARA-4.4

---

## Grand Finale: All Epics Delivered

| Epic | Stories | Story Points | Status |
|------|---------|--------------|--------|
| EPIC 1: Setup + Webhooks | 5 | ~40 | ✅ Ready |
| EPIC 2: Conversa + OpenAI | 5 | ~50 | ✅ Ready |
| EPIC 3: Conformidade + Opt-out | 4 | ~35 | ✅ Ready |
| EPIC 4: Testes + Deployment | 5 | ~40 | ✅ Ready |
| **TOTAL** | **19 stories** | **~165 points** | **✅ Ready for @dev** |

**Timeline Sugerido:**
- Fase 1 (EPIC 1): 1-2 semanas
- Fase 2 (EPIC 2): 1.5-2 semanas
- Fase 3 (EPIC 3): 1 semana
- Fase 4 (EPIC 4): 1-1.5 semanas
- **Total: ~6 semanas** para MVP completo

---

**Status**: Ready for @dev implementation
**Architect Sign-off**: @architect (Aria) ✅
**Product Owner**: @po (Pax) - pending approval

— River, removendo obstáculos 🌊

## Handoff para Próxima Fase

**@dev**: Todas as 4 epics com 19 stories estão prontas. Comece por SARA-1.1 (Setup Projeto).

**@pm**: Roadmap de features Phase 2+ já foi discutido em reuniões anteriores. PRD cobre MVP completo.

**@qa**: Testes especificados em cada story (SARA-4.1 até SARA-4.3 têm cobertura).

**@devops**: Railway setup ready (SARA-4.4). Considere CI/CD pipeline.

**@po**: Backlog priorizado. Métricas de sucesso em PRD.
