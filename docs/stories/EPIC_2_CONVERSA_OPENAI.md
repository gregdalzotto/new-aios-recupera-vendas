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

## Story SARA-2.5: Fila de Tarefas (Bull) & Job Processing

**Como** desenvolvedor,
**Quero** processar webhooks assincronamente,
**Para** não bloquear respostas HTTP e permitir retries.

### Acceptance Criteria

1. **Bull Queue Configurada:**
   - [ ] Redis configurado para queue (REDIS_URL em .env)
   - [ ] Queue criada com nome 'message-processing'
   - [ ] Settings: attempts: 3, backoff: exponential (1000, 2000, 4000, 8000)

2. **Job Handler:**
   - [ ] Processa eventos de webhook POST /webhook/messages
   - [ ] Chamadas sequenciais: ServiçoConversa → OptOutDetection → ServiçoIA → ServiçoMensagem → DB persist
   - [ ] Qualquer erro: loga com trace ID + deixa Bull fazer retry

3. **Retry Behavior:**
   - [ ] 1º attempt: executar imediatamente
   - [ ] Se falha: aguarda 1s antes de retry 2
   - [ ] Se falha: aguarda 2s antes de retry 3
   - [ ] Se falhas 3: move para 'failed' queue, alerta ops

4. **Monitoramento:**
   - [ ] Log de job started, completed, failed
   - [ ] Métrica: queue depth (# tarefas pending)
   - [ ] Alerta se queue > 100

5. **Testes:**
   - [ ] Teste de job sucesso (processado + DB atualizado)
   - [ ] Teste de job com erro (falha + retry)
   - [ ] Teste de retry com falhas múltiplas

### Notas Técnicas
- Bull usa Redis (compartilha com cache)
- Job data: { webhookPayload, phoneNumber, traceId }
- Sempre armazenar traceId em job para linking logs
- Failed jobs movem para 'failed' queue (manual inspection depois)

### Arquivos Afetados
- src/queue/messageQueue.ts (novo - setup + handlers)
- src/jobs/processWebhookMessage.ts (novo - job logic)
- src/utils/jobLogger.ts (novo - consistent logging)
- .env.example (REDIS_URL)
- tests/integration/jobs.test.ts (novo)

### Dependencies
- Story SARA-2.1, SARA-2.2, SARA-2.3

---

## Summary

**EPIC 2 contém 5 stories** que implementam:
- ✅ Gerenciamento de estados de conversa
- ✅ Integração com OpenAI para IA interpretação
- ✅ Envio de mensagens via WhatsApp
- ✅ Webhook para receber respostas do usuário
- ✅ Processamento assíncrono com retry

**Story Points Estimado:** ~50 pontos (10+12+10+15+3)

**Sequência de Implementação:**
1. SARA-2.1 (ConversationService)
2. SARA-2.2 (AIService)
3. SARA-2.3 (MessageService)
4. SARA-2.5 (Bull Queue)
5. SARA-2.4 (Webhook - depende de todos acima)

---

**Status**: Ready for @dev implementation
**Architect Sign-off**: @architect (Aria) ✅
**Product Owner**: @po (Pax) - pending approval

— River, removendo obstáculos 🌊
