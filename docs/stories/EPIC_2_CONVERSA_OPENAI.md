# EPIC 2: Conversa + OpenAI + Mensagens
## Implementar Fluxo de Conversa e Interpretação de IA

**Epic ID**: SARA-2
**Status**: Ready for Development
**Prioridade**: P0 (Critical Path)
**Estimativa Total**: ~50 story points

**Objetivo do Epic:**
Implementar o fluxo completo de conversa entre usuário e Sara: gerenciamento de estados, chamadas ao OpenAI para interpretação inteligente de mensagens, envio de respostas via WhatsApp, e persistência de histórico.

**Entregas do Epic:**
- ServiçoConversa com gerenciamento de estados
- ServiçoIA integrado com OpenAI
- ServiçoMensagem para envio WhatsApp
- Webhook POST /webhook/messages funcional
- Histórico de conversa persistido
- Fallback para timeouts de OpenAI

---

## Story SARA-2.1: ServiçoConversa - Gerenciamento de Estados

**Como** desenvolvedor,
**Quero** gerenciar transições de estado de conversa,
**Para** rastrear progresso e enforçar regras de negócio.

### Acceptance Criteria

1. **ServiçoConversa criado** em `src/services/ConversationService.ts`:
   - [ ] Carrega conversa por phone number
   - [ ] Prioriza estado ACTIVE > ERROR > AWAITING_RESPONSE
   - [ ] Cria conversa nova se não existe
   - [ ] Atualiza estado baseado em eventos

2. **Estados Implementados:**
   - [ ] AWAITING_RESPONSE: esperando resposta do usuário
   - [ ] ACTIVE: conversa em andamento
   - [ ] CLOSED: conversa finalizada
   - [ ] ERROR: erro no processamento
   - [ ] Transições válidas apenas (AWAITING → ACTIVE, ACTIVE → CLOSED, etc.)

3. **Métodos do Serviço:**
   - [ ] `findByPhoneNumber(phone)`: retorna conversa + abandono context
   - [ ] `create(abandonment)`: cria nova conversa
   - [ ] `updateStatus(conversationId, newStatus)`: atualiza status
   - [ ] `incrementMessageCount(conversationId)`: incrementa counter
   - [ ] `updateTimestamps(conversationId)`: atualiza last_message_at, last_user_message_at
   - [ ] `isWithinWindow(conversationId)`: verifica se ainda está em janela 24h

4. **Integração com BD:**
   - [ ] USA ConversationRepository para queries
   - [ ] Transações atômicas (BEGIN/COMMIT)
   - [ ] Trata violations de constraints (ex: UNIQUE abandonment_id)

5. **Testes:**
   - [ ] Teste de carregamento por phone (encontra + prioriza correto)
   - [ ] Teste de criação de conversa nova
   - [ ] Teste de transições de estado válidas
   - [ ] Teste de rejeição de transições inválidas

### Notas Técnicas
- Usar transações DB para atomicidade
- Caching opcional em Redis (fase 2)
- Query deve ter índices (idx_users_phone, idx_conversations_status)

### Arquivos Afetados
- src/services/ConversationService.ts (novo)
- src/repositories/ConversationRepository.ts (novo - métodos para BD)
- tests/unit/ConversationService.test.ts (novo)

### Dependencies
- Story SARA-1.1, SARA-1.3

---

## Story SARA-2.2: ServiçoIA - Integração com OpenAI

**Como** desenvolvedor,
**Quero** chamar OpenAI para interpretar mensagens do usuário,
**Para** gerar respostas contextuais inteligentes.

### Acceptance Criteria

1. **ServiçoIA criado** em `src/services/AIService.ts`:
   - [ ] Conecta a OpenAI API (chave em .env)
   - [ ] Implementa `interpretMessage(context, userMessage)`
   - [ ] Retorna: intent, sentiment, shouldOfferDiscount, response, tokens_used

2. **Construção de Prompt:**
   - [ ] System prompt define personalidade Sara (empática, sem pressão)
   - [ ] Contexto inclui histórico de últimas 10 mensagens
   - [ ] Prompt menciona links a oferecer
   - [ ] Temperatura: 0.7 (criativo mas consistente)
   - [ ] Max tokens: 150

3. **Timeout Handling:**
   - [ ] Timeout de 5 segundos para resposta OpenAI
   - [ ] Se timeout: retorna mensagem fallback ("Um momento enquanto avalio...")
   - [ ] Log do timeout com trace ID
   - [ ] Sistema continua (não falha)

4. **Resposta Processada:**
   - [ ] Detecta intent: price_question, objection, confirmation, unclear
   - [ ] Detecta sentiment: positive, neutral, negative
   - [ ] Recomenda oferecer desconto se:
     - Intent menciona preço
     - Ou valor do carrinho > R$500
     - Ou menos de 3 ofertas já feitas
   - [ ] Conta tokens usados (para custo tracking)

5. **Error Handling:**
   - [ ] Rate limit error: log + retry recomendado (não falha imediato)
   - [ ] Auth error: log + falha com mensagem clara
   - [ ] Timeout: fallback message (critério 3)
   - [ ] Qualquer outro erro: log + fallback

6. **Testes:**
   - [ ] Teste com mensagem normal: retorna resposta válida
   - [ ] Teste com timeout: retorna fallback
   - [ ] Teste de detecção de intent (preço, objeção, etc.)
   - [ ] Teste de token counting

### Notas Técnicas
- Usar `openai.chat.completions.create()`
- Model: `gpt-3.5-turbo` (não gpt-4)
- Promise.race([openai call, timeout promise]) para timeout
- Store response_id para tracking (Fase 2: analytics)

### Arquivos Afetados
- src/services/AIService.ts (novo)
- src/config/openai.ts (novo - setup client)
- .env.example (adicionar OPENAI_API_KEY)
- tests/unit/AIService.test.ts (novo)

### Dependencies
- Story SARA-1.1

---

## Story SARA-2.3: ServiçoMensagem - Envio via WhatsApp

**Como** desenvolvedor,
**Quero** enviar mensagens para usuários via WhatsApp API,
**Para** manter conversa com Sara.

### Acceptance Criteria

1. **ServiçoMensagem criado** em `src/services/MessageService.ts`:
   - [ ] Implementa `send(phone, text, messageType)`
   - [ ] messageType: 'text' | 'template'
   - [ ] Retorna: messageId, status, error (se houver)

2. **Integração com Meta WhatsApp API:**
   - [ ] URL: `https://graph.instagram.com/v18.0/YOUR_PHONE_ID/messages`
   - [ ] Headers: Authorization: Bearer, Content-Type: application/json
   - [ ] Phone ID vem de .env (`WHATSAPP_PHONE_ID`)
   - [ ] Business Account ID vem de .env (`WHATSAPP_BUSINESS_ACCOUNT_ID`)

3. **Envio de Template (para primeira mensagem):**
   - [ ] Payload: `{ messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name: template_name, language: { code: "pt_BR" } } }`
   - [ ] Template ID em .env (já aprovado por Meta)
   - [ ] Retorna message_id se sucesso

4. **Envio de Texto Livre:**
   - [ ] Payload: `{ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: message } }`
   - [ ] Máximo 4096 caracteres (validação)
   - [ ] Retorna message_id se sucesso

5. **Retry Logic:**
   - [ ] Se erro 429 (rate limit): backoff exponencial (1s, 2s, 4s, 8s)
   - [ ] Max 3 retries
   - [ ] Se timeout > 5s: falha com log
   - [ ] Se falha permanente: enfileira em Bull (Story 2.5)

6. **Error Handling:**
   - [ ] 400: Bad request (validar payload antes)
   - [ ] 401: Token inválido (log + alerta)
   - [ ] 429: Rate limited (retry com backoff)
   - [ ] 500: Server error (retry depois)
   - [ ] Timeout: falha com log + retry na fila

7. **Testes:**
   - [ ] Teste com mock de API: envia + retorna message_id
   - [ ] Teste de retry com timeout
   - [ ] Teste de validação de comprimento

### Notas Técnicas
- axios ou fetch para HTTP calls
- Validar phone format E.164 antes de enviar
- Log de TODAS as chamadas (para compliance)
- Message ID é para rastreamento (armazenar em DB)

### Arquivos Afetados
- src/services/MessageService.ts (novo)
- src/config/whatsapp.ts (novo - setup client)
- .env.example (WHATSAPP_PHONE_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_ACCESS_TOKEN)
- tests/unit/MessageService.test.ts (novo)

### Dependencies
- Story SARA-1.1

---

## Story SARA-2.4: Webhook POST /webhook/messages (Receber Mensagens)

**Como** desenvolvedor,
**Quero** receber mensagens de usuários do WhatsApp,
**Para** processar respostas e gerar Sara responses.

### Acceptance Criteria

1. **Endpoint POST /webhook/messages implementado:**
   - [ ] Rota criada em `src/routes/webhooks.ts`
   - [ ] HMAC verification middleware executado
   - [ ] Aceita formato Meta: whatsapp_business_account entry/changes/messages
   - [ ] Retorna 200 OK imediatamente (Meta espera resposta rápida)

2. **Validação & Dedup:**
   - [ ] Extrai `whatsapp_message_id` de payload
   - [ ] Verifica UNIQUE constraint (evita duplicatas)
   - [ ] Se duplicata: ignora silenciosamente (já processada)

3. **Carregamento de Contexto:**
   - [ ] Extrai phone número de `from` field
   - [ ] Carrega conversa via ServiçoConversa
   - [ ] Carrega últimas 10 mensagens
   - [ ] Verifica se ainda está em janela 24h

4. **Processamento (Assíncrono):**
   - [ ] Enfileira tarefa em Bull para processamento assíncrono
   - [ ] Tarefa chama:
     - Detecção de opt-out (Story 3 faz isto)
     - ServiçoIA.interpretMessage()
     - ServiçoMensagem.send()
     - Persistência em DB
   - [ ] Retorna 200 OK imediatamente (antes de terminar processamento)

5. **Persistência de Mensagens:**
   - [ ] INSERT mensagem recebida em messages table
   - [ ] INSERT resposta de Sara em messages table
   - [ ] UPDATE conversation (last_message_at, last_user_message_at, message_count)
   - [ ] Log de todos os passos com trace ID

6. **Error Handling:**
   - [ ] 400: Invalid payload → log + 200 OK (Meta faz retry)
   - [ ] 403: HMAC inválido → rejeit + log
   - [ ] Erro no processamento assíncrono: log + queue retry
   - [ ] Sempre retorna 200 OK ao Meta (exceto HMAC fail)

7. **Testes:**
   - [ ] Teste com mensagem válida: 200 OK, tarefa enfileirada
   - [ ] Teste com mensagem duplicada: 200 OK, ignora
   - [ ] Teste com payload inválido: 400/200 OK, loga
   - [ ] Teste de fila: tarefa processada + DB atualizado

### Notas Técnicas
- Meta espera 200 OK em < 5 segundos
- NÃO processar síncronamente (tempo demais)
- Usar Bull queue para async
- Log TUDO (compliance)
- Dedup via UNIQUE whatsapp_message_id

### Arquivos Afetados
- src/routes/webhooks.ts (adicionar POST /webhook/messages)
- src/jobs/processWebhookMessage.ts (novo - job de processamento)
- src/queue/messageQueue.ts (novo - setup Bull)
- tests/integration/webhooks.test.ts (adicionar testes POST)

### Dependencies
- Story SARA-2.1, SARA-2.2, SARA-2.3, + Story SARA-3.1 (opt-out)

---

## Story SARA-2.5: Job Handlers para Processamento de Mensagens (Bull)

**Como** desenvolvedor,
**Quero** implementar os job handlers para processar mensagens assincronamente,
**Para** não bloquear respostas HTTP e permitir retries com falha.

**Status**: Infrastructure ready (queues created in SARA-2.4), handlers missing

### Acceptance Criteria

1. **ProcessMessageQueue Handler Implementado:**
   - [x] ProcessMessageQueue exists (`src/jobs/processMessageJob.ts`)
   - [x] Handler registrado que executa quando jobs chegam à fila
   - [x] Fluxo: ConversationService → AIService → MessageService → DB persist
   - [x] Extrai phoneNumber do job payload
   - [x] Carrega conversation context via ConversationService.findByPhoneNumber()
   - [x] Detecção de opt-out (se usuário pediu para sair, não responde)
   - [x] Chamada AIService.interpretMessage() com contexto
   - [x] Envio via MessageService.send() com tipo "response"
   - [x] Armazena em MessageRepository
   - [x] Atualiza ConversationService.updateTimestamps()
   - [x] Qualquer erro: loga com traceId + deixa Bull fazer retry automático

2. **SendMessageQueue Handler (Retry):**
   - [x] SendMessageQueue exists (`src/jobs/sendMessageJob.ts`)
   - [x] Handler para processar retries de mensagens falhadas
   - [x] Recebe conversationId/phoneNumber do payload
   - [x] Tenta enviar via MessageService.send()
   - [x] Se sucesso: retorna sent status
   - [x] Se falha: deixa Bull fazer retry até 3x com backoff exponencial
   - [x] Log de cada attempt com traceId

3. **Retry Behavior (Bull Automático):**
   - [x] Queues configuradas com attempts: 3 e backoff: exponential
   - [x] 1º attempt: executar imediatamente
   - [x] Se falha: retry após 1s (1000ms)
   - [x] Se falha: retry após 2s (2000ms)
   - [x] Se falhas 3x: move para 'failed' queue
   - [x] Failed jobs permanecem em Redis para inspeção/retry manual

4. **Application Bootstrap:**
   - [x] Handlers registrados na inicialização da app
   - [x] ProcessMessageQueue.registerHandler(processMessageHandler)
   - [x] SendMessageQueue.registerHandler(sendMessageHandler)
   - [x] Verificar que queues estão listening (logger output)

5. **Error Handling & Logging:**
   - [x] Cada handler loga: job started, completed, failed
   - [x] Log inclui: traceId, jobId, phoneNumber, error details
   - [x] Log format: JSON estruturado com timestamp
   - [x] Errors não são thrown (Bull faz retry), apenas logged

6. **Testes:**
   - [x] Teste unitário: processMessageHandler sucesso (context loaded → AI called → message sent)
   - [x] Teste unitário: sendMessageHandler sucesso
   - [x] Teste: opt-out detection (skip response if user opted out)
   - [x] Teste: job failure handling (graceful degradation)
   - [x] Teste mock: ConversationService, AIService, MessageService
   - [x] Teste: conversation not found error handling
   - [x] Test coverage: 5/5 tests PASSING

### Notas Técnicas

**Arquitetura Atual:**
```
POST /webhook/messages
  ↓
hmacVerificationMiddleware ✅
  ↓
WebhookHandler.postWebhookMessages() ✅
  ↓
ProcessMessageQueue.addJob() ✅
  ↓
❌ FALTA: Job handler que executa
  ├─> ConversationService.findByPhoneNumber()
  ├─> AIService.interpretMessage()
  ├─> MessageService.send()
  └─> MessageRepository.create()
  ↓
SendMessageQueue (para retries de falhas)
  ↓
❌ FALTA: Job handler para retry
```

**Configuração Bull:**
- ProcessMessageQueue: `{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`
- SendMessageQueue: mesmo config
- Redis: usa REDIS_URL do .env
- Job concurrency: processar 1 job por vez (não paralelo)

**Job Payload Structure:**
```typescript
// ProcessMessageQueue
interface ProcessMessageJobPayload {
  phoneNumber: string;           // E.164 format +55...
  messageText: string;           // User's message
  whatsappMessageId: string;     // Meta's unique ID
  traceId: string;               // Correlation ID
  conversationId?: string;       // Optional if already loaded
}

// SendMessageQueue
interface SendMessageJobPayload {
  messageId: string;             // Reference to Message record
  phoneNumber: string;
  messageText: string;
  traceId: string;
}
```

**Error Handling Examples:**
- ConversationService returns null: log warning, don't send message, mark as skipped
- AIService timeout: use fallback message, continue
- MessageService fails (API error): let Bull retry (don't throw, just log)
- Database errors: log with context, let Bull retry

### Arquivos Afetados

**New/Modified:**
- src/jobs/processMessageJob.ts (modify: add handler registration)
- src/jobs/sendMessageJob.ts (modify: add handler registration)
- src/index.ts ou src/server.ts (import + register handlers on startup)
- src/config/logger.ts (ensure structured JSON logging)
- tests/unit/jobHandlers.test.ts (novo - handler unit tests)
- tests/integration/jobFlow.test.ts (novo - E2E job flow)

**Already Exist (Use As-Is):**
- src/services/ConversationService.ts ✅
- src/services/AIService.ts ✅
- src/services/MessageService.ts ✅
- src/repositories/MessageRepository.ts ✅
- src/config/redis.ts ✅
- src/routes/webhooks.ts ✅

### Dependencies
- ✅ Story SARA-2.1: ConversationService
- ✅ Story SARA-2.2: AIService
- ✅ Story SARA-2.3: MessageService
- ✅ Story SARA-2.4: Webhook POST /webhook/messages
- ✅ Infrastructure: Redis, Bull queues, environment config

### Dev Agent Record - SARA-2.5

**Status**: ✅ COMPLETED
**Agent**: @dev (Dex)
**Start Time**: 2026-02-06 04:45 UTC
**Completion Time**: 2026-02-06 05:15 UTC

#### Implementation Summary

✅ **Job Handlers Implemented (src/jobs/handlers.ts - 300+ lines)**
- ProcessMessageHandler: Receives WhatsApp message → loads context → interprets with AI → sends response
  - Full workflow: validate conversation → check opt-out → store incoming → update timestamps
  - Get context from last 10 messages → call AIService → store response
  - Send via WhatsApp → update with message ID → handle failures gracefully
  - Comprehensive error logging with traceId

- SendMessageHandler: Retries failed message sends
  - Receives conversationId + phoneNumber + message text
  - Attempts to send via WhatsApp API
  - Returns sent/failed status for Bull to manage retries
  - Logs all attempts with traceId for tracking

✅ **Handler Registration**
- registerMessageHandlers() function coordinates both registrations
- Integrated into server.ts at startup (after webhook routes)
- Logs confirmation when handlers are ready
- Error handling if registration fails

✅ **Service Integration**
- Added ConversationService.isOptedOut(userId) - checks user opt-out flag
- Added MessageRepository.update() - flexible field updates
- Added necessary repository imports in handlers
- Proper error handling and logging throughout

✅ **Test Suite (tests/unit/jobHandlers.test.ts)**
- 5 comprehensive unit tests (all PASSING)
  1. Process message successfully (full flow)
  2. Return error if conversation not found
  3. Skip response if user opted out
  4. Send message on retry (success path)
  5. Return failed status on send error
- Proper mocking of all dependencies (ConversationService, AIService, MessageService, Repositories)
- Tests validate error handling, opt-out detection, retry logic

✅ **Code Quality**
- Build: ✅ PASSED (npm run build)
- TypeScript: ✅ All types correct
- Tests: ✅ 5/5 passing
- Commit: ✅ a475918 with detailed message

#### Files Modified
- src/jobs/handlers.ts (NEW - 300 lines)
- src/jobs/processMessageJob.ts (removed problematic import)
- src/jobs/sendMessageJob.ts (removed problematic import)
- src/server.ts (register handlers on startup)
- src/services/ConversationService.ts (added isOptedOut)
- src/repositories/MessageRepository.ts (added update method)
- tests/unit/jobHandlers.test.ts (NEW - test suite)

#### Validation Results
- ✅ npm run build: PASSED
- ✅ npm test (jobHandlers): 5/5 PASSED
- ✅ Full test suite: 238 passing tests (up from 176)

#### Story Points Delivered
**Estimated**: 8 pts
**Actual**: 8 pts
**Status**: ✅ ON ESTIMATE

#### Integration Test Suite (SARA-2.5-INT)
**Status**: ✅ COMPLETED
**Test Coverage**: 10 comprehensive integration tests
- ✅ Full message processing flow (receive → AI → send → store)
- ✅ Opt-out detection and user compliance
- ✅ Retry queue management on send failures
- ✅ Error recovery and resilience
- ✅ Database error handling
- ✅ Missing abandonment data handling
- ✅ AI service error graceful degradation
- ✅ Conversation not found scenarios
- ✅ Send handler retry success paths
- ✅ Send handler failure tracking

**Test Results**:
```
Test Suites: 2 passed (unit + integration)
Tests:       15 passed (5 unit + 10 integration)
Type Check:  ✅ PASSED
Linting:     ✅ PASSED (0 errors, 26 pre-existing warnings)
```

**Commit**: `01e08f0` - test: add comprehensive integration tests for SARA-2.5 job handlers

---

**Estimated Story Points**: 8 pts (handlers + tests + integration) ✅ COMPLETED
**Priority**: P0 (Critical - blocks production deployment) ✅ UNBLOCKED
**Owner**: @dev (Dex) ✅ COMPLETED
**Status**: ✅ READY FOR PRODUCTION - All tests passing, full validation complete

---

## EPIC 2 Status & Implementation Record

### Summary

**EPIC 2 contém 5 stories** que implementam o fluxo completo de conversa:
- ✅ **SARA-2.1**: Gerenciamento de estados de conversa
- ✅ **SARA-2.2**: Integração com OpenAI para IA interpretação
- ✅ **SARA-2.3**: Envio de mensagens via WhatsApp
- ✅ **SARA-2.4**: Webhook para receber respostas do usuário
- 🏗️ **SARA-2.5**: Processamento assíncrono com retry (handlers)

**Story Points:** ~50 pontos total (10+12+10+15+8)

### Implementação Executada

**Commits:**
```
20aab80 feat: implement SARA-2.4 webhook handler for receiving WhatsApp messages
81d53dd feat: implement SARA-2.3 MessageService with WhatsApp integration
17bfa4f feat: implement SARA-2.2 AIService - OpenAI integration for message interpretation
44702fb feat: add Message model, MessageRepository, and job queue infrastructure
11a82c1 feat: implement SARA-2.1 ConversationService, Redis rate limiter
d032efe refactor: prepare repositories and jobs for EPIC 2 message processing
```

### Status Atual

| Story | Status | Commits | Detalhes |
|-------|--------|---------|----------|
| SARA-2.1 | ✅ COMPLETA | 11a82c1 | ConversationService com 7 métodos, transições de estado |
| SARA-2.2 | ✅ COMPLETA | 17bfa4f | AIService com OpenAI, intent/sentiment detection, timeout handling |
| SARA-2.3 | ✅ COMPLETA | 81d53dd | MessageService com retry exponencial, validação E.164 |
| SARA-2.4 | ✅ COMPLETA | 20aab80 | Webhook POST /webhook/messages com HMAC, dedup, enfileiramento |
| SARA-2.5 | 🏗️ IN PROGRESS | d032efe (prep) | Infrastructure pronta, handlers precisam ser implementados |

### Bloqueador Crítico Removido

**Commit d032efe** resolveu bloqueadores:
- ✅ Adicionado `import 'dotenv/config'` para auto-loading
- ✅ Refatorado UserRepository.upsert() com two-step approach
- ✅ Adicionado `paymentLink` support em AbandonmentRepository
- ✅ Otimizado ConversationRepository.findByPhoneNumber() com JOIN
- ✅ Suporte ESM em job files (createRequire)

### Próximo Passo

**SARA-2.5 Job Handlers** - Pronto para @dev implementar:
1. ProcessMessageQueue handler (processamento de mensagens recebidas)
2. SendMessageQueue handler (retry de mensagens falhadas)
3. Testes E2E com seu phone number +5548999327881

---

### Sign-offs

- **Architect**: @architect (Aria) ✅ - Infraestrutura validada
- **Code Quality**: TypeScript ✅, Linting ✅ (26 warnings, 0 errors)
- **Status**: ✅ Ready for @dev - SARA-2.5 job handlers implementation
- **Product Owner**: @po (Pax) - pending approval

---

## Próxima Ação

**Chamar @dev para implementar SARA-2.5 com rigor AIOS:**
1. Story formal definida (veja acima)
2. Acceptance criteria claras
3. Dependências já implementadas
4. Testes estruturados

**Comando para @dev:**
```
@dev: Implemente SARA-2.5 (Job Handlers) seguindo story em docs/stories/EPIC_2_CONVERSA_OPENAI.md
```

— Aria (@architect), infraestrutura validada 🏛️
