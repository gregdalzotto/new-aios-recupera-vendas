# EPIC 3: Conformidade + Opt-out
## Detecção de Desinscrição e Conformidade LGPD/WhatsApp

**Epic ID**: SARA-3
**Status**: Ready for Development
**Prioridade**: P1 (Habilitador)
**Estimativa Total**: ~35 story points

**Objetivo do Epic:**
Implementar detecção de opt-out em dois níveis (determinística e IA), validar conformidade com janela de 24h da Meta, e processar eventos de pagamento para conversão. Garantir que respostas de usuários solicitando cancelamento sejam respeitadas imediatamente.

**Entregas do Epic:**
- Detecção determinística via keywords (SARA-3.1)
- Detecção via OpenAI como fallback (SARA-3.2)
- ServiçoConformidade com validações LGPD/24h (SARA-3.3)
- Webhook POST /webhook/payment funcional (SARA-3.4)
- Processamento idempotente de conversão

---

## Story SARA-3.1: Detecção Opt-out Determinística

**Como** desenvolvedor,
**Quero** detectar palavras-chave de opt-out em mensagens de usuários,
**Para** respeitar pedidos de cancelamento imediatamente sem processamento desnecessário.

### Acceptance Criteria

1. **ServiçoOptOutDetector criado** em `src/services/OptOutDetector.ts`:
   - [ ] Carrega keywords de opt_out_keywords table
   - [ ] Cache em memória (TTL: 1 hora)
   - [ ] Implementa `detectKeyword(messageText): boolean`
   - [ ] Implementa `getKeywordMatched(messageText): string | null`
   - [ ] Case-insensitive matching
   - [ ] Ignora acentuação (normaliza: é → e)

2. **Matching Logic:**
   - [ ] Suporta regex simples: `\bkeyword\b` (word boundaries)
   - [ ] Detecta variações: "parar" → "parei", "parando", "pode parar"
   - [ ] Detecta negações: ignora "não quero parar" (apenas "quero parar")
   - [ ] Prioritiza keywords por frequência (mais comuns primeiro)
   - [ ] Timeout de busca: máximo 100ms

3. **Keywords Pré-carregados** (default 10):
   - [ ] parar
   - [ ] remover
   - [ ] cancelar
   - [ ] sair
   - [ ] stop
   - [ ] não quero
   - [ ] me tire
   - [ ] excluir
   - [ ] desinscrever
   - [ ] unsubscribe
   - [ ] Admin pode adicionar novos via SQL

4. **Integração com ServiçoConversa:**
   - [ ] OptOutDetector chamado ANTES de AIService
   - [ ] Se keyword detectada: log + return early
   - [ ] Não envia para OpenAI
   - [ ] Mensagem de resposta: "Entendi, sua solicitação foi registrada. Você não receberá mais mensagens."

5. **Testes:**
   - [ ] Teste com mensagem exata: "parar" → detecta
   - [ ] Teste com variações: "parando", "para aí" → detecta
   - [ ] Teste com contexto negativo: "quero continuar não parar" → detecta
   - [ ] Teste sem keyword: "qual o preço?" → não detecta
   - [ ] Teste performance: 1000 keywords em < 50ms

### Notas Técnicas
- Usar Unicode normalization (NFD) para acentuação
- Implementar cache com LRU ou simple Map com timestamp
- Keywords são case-insensitive mas devem respeitar word boundaries
- Considerar contrações (não vou, tá, tá bom)

### Arquivos Afetados
- src/services/OptOutDetector.ts (novo)
- src/repositories/OptOutKeywordRepository.ts (novo - queries)
- tests/unit/OptOutDetector.test.ts (novo)

### Dependencies
- Story SARA-1.3 (opt_out_keywords table existir)

---

## Story SARA-3.2: Detecção Opt-out via OpenAI (Fallback)

**Como** desenvolvedor,
**Quero** usar OpenAI para detectar intenção de opt-out com compreensão contextual,
**Para** capturar pedidos de cancelamento que não correspondem a keywords pré-definidas.

### Acceptance Criteria

1. **Método em AIService** em `src/services/AIService.ts`:
   - [ ] Implementa `detectOptOutIntent(context, userMessage): { isOptOut: boolean, confidence: number, reason: string }`
   - [ ] Chamado APÓS detecção determinística (se não encontrou keyword)
   - [ ] Retorna rapidamente (timeout: 3 segundos)

2. **Prompt para Detecção de Opt-out:**
   - [ ] System prompt foca em detectar intenção CLARA de desinscrição
   - [ ] Contexto inclui histórico de últimas 5 mensagens
   - [ ] Instruções: "Responda com JSON: { isOptOut: true/false, confidence: 0-1, reason: string }"
   - [ ] Temperatura: 0.3 (mais determinístico)
   - [ ] Max tokens: 50

3. **Threshold de Confiança:**
   - [ ] Se `confidence >= 0.7`: considerar opt-out
   - [ ] Se `0.5 <= confidence < 0.7`: log para análise posterior
   - [ ] Se `confidence < 0.5`: não tratar como opt-out

4. **Tratamento de Timeout/Erro:**
   - [ ] Se timeout (3s): usar fallback "não detectar" (conservador)
   - [ ] Se erro OpenAI: log + skip fallback
   - [ ] Nunca marcar opt-out false positivo por segurança

5. **Fluxo de Decisão:**
   - [ ] Keyword detectado? → opt-out IMEDIATAMENTE (determinístico)
   - [ ] Keyword não detectado? → chamar OpenAI fallback (IA)
   - [ ] IA confidence >= 0.7? → opt-out
   - [ ] Senão → processar como conversa normal

6. **Testes:**
   - [ ] Teste com intent claro: "não quero mais receber" → isOptOut: true
   - [ ] Teste com negação: "não quero deixar de receber" → isOptOut: false
   - [ ] Teste com timeout: retorna false (fallback conservador)
   - [ ] Teste de JSON parsing: valida resposta

### Notas Técnicas
- Usar `JSON.parse()` com try-catch para resposta OpenAI
- Timeout 3s (mais curto que main AIService 5s)
- Log de confidence < 0.7 para treinamento posterior
- Cachear histórico de últimas 5 mensagens

### Arquivos Afetados
- src/services/AIService.ts (adicionar método detectOptOutIntent)
- tests/unit/AIService.test.ts (adicionar testes)

### Dependencies
- Story SARA-2.2 (AIService base existir)

---

## Story SARA-3.3: ServiçoConformidade - Validações LGPD & Janela 24h

**Como** desenvolvedor,
**Quero** enforçar regras de conformidade: janela de 24h Meta, LGPD opt-out, limite de mensagens,
**Para** cumprir regulações e evitar bloqueios.

### Acceptance Criteria

1. **ServiçoConformidade criado** em `src/services/ComplianceService.ts`:
   - [ ] Implementa `validateConversationWindow(conversationId): { isValid: boolean, reason?: string }`
   - [ ] Implementa `shouldStopConversation(conversationId): { shouldStop: boolean, reason: string }`
   - [ ] Implementa `markOptedOut(userId, reason): void`

2. **Validação de Janela 24h:**
   - [ ] Calcula diferença entre `last_user_message_at` e agora
   - [ ] Se > 24 horas: conversa EXPIRADA (não enviar)
   - [ ] Se <= 24 horas: conversa VÁLIDA (pode enviar)
   - [ ] Log com timestamp exato para debug

3. **Regras de Parada de Conversa:**
   - [ ] Conversa EXPIRADA (> 24h): reason = "WINDOW_EXPIRED"
   - [ ] Opt-out detectado: reason = "USER_OPTED_OUT"
   - [ ] Conversão realizada: reason = "CONVERTED"
   - [ ] Limite de mensagens atingido: reason = "MESSAGE_LIMIT_EXCEEDED" (TBD limite exato)
   - [ ] Erro persistente (>= 3 falhas): reason = "PERSISTENT_ERROR"

4. **Persistência de Opt-out:**
   - [ ] UPDATE users set opted_out = true, opted_out_at = NOW(), opted_out_reason = '{reason}'
   - [ ] UPDATE conversations set status = 'CLOSED' where user_id = ? and status != 'CLOSED'
   - [ ] Log de audit com user_id, timestamp, reason

5. **Integração com ServiçoConversa:**
   - [ ] Antes de processar mensagem, chamar validateConversationWindow()
   - [ ] Se falha: log + retornar sem processar
   - [ ] Antes de enviar resposta, chamar shouldStopConversation()
   - [ ] Se true: marcar conversa como CLOSED

6. **Testes:**
   - [ ] Teste de conversa dentro de 24h: válida
   - [ ] Teste de conversa após 24h: expirada
   - [ ] Teste de opt-out marking: users.opted_out = true
   - [ ] Teste de conversação multipla: marca todas como CLOSED

### Notas Técnicas
- Usar `Date.now()` ou `new Date()` para comparações
- Considerar timezone (UTC para BD, UTC+TZ para apresentação)
- Log de audit imutável (usar webhooks_log ou audit table)
- Performance: queries com índices (idx_conversations_user_id, idx_conversations_status)

### Arquivos Afetados
- src/services/ComplianceService.ts (novo)
- src/repositories/UserRepository.ts (adicionar update opt-out methods)
- tests/unit/ComplianceService.test.ts (novo)

### Dependencies
- Story SARA-2.1 (ConversationService), Story SARA-3.1 & SARA-3.2 (opt-out detection)

---

## Story SARA-3.4: Webhook POST /webhook/payment (Conversão)

**Como** desenvolvedor,
**Quero** receber eventos de pagamento/conversão do sistema de pagamento,
**Para** rastrear recuperação bem-sucedida e marcar conversas como convertidas.

### Acceptance Criteria

1. **Endpoint POST /webhook/payment implementado:**
   - [ ] Rota criada em `src/routes/webhooks.ts`
   - [ ] HMAC verification middleware executado
   - [ ] Aceita JSON com: paymentId, abandonmentId, status, amount, timestamp
   - [ ] Status esperados: 'completed', 'pending', 'failed', 'refunded'

2. **Validação de Payload:**
   - [ ] paymentId: string min 1, max 255, UNIQUE
   - [ ] abandonmentId: string min 1, max 255 (referência)
   - [ ] status: enum 'completed' | 'pending' | 'failed' | 'refunded'
   - [ ] amount: número positivo
   - [ ] Retorna 400 se qualquer campo inválido

3. **Processamento para Status 'completed':**
   - [ ] Localiza abandonment via abandonmentId
   - [ ] Valida idempotência: CHECK UNIQUE payment_id (deve ser primeira inserção)
   - [ ] Se duplicata: retorna 200 OK com `{ status: 'already_processed', paymentId }`
   - [ ] UPDATE abandonments set: status = 'CONVERTED', converted_at = NOW(), payment_id = paymentId, conversion_link = payment_link
   - [ ] UPDATE conversations set: status = 'CONVERTED'
   - [ ] Log de conversion com trace ID

4. **Processamento para Status 'pending':**
   - [ ] UPDATE abandonments set status = 'PENDING' (aguardando confirmação)
   - [ ] Não muda conversation status

5. **Processamento para Status 'failed' / 'refunded':**
   - [ ] UPDATE abandonments set status = 'DECLINED'
   - [ ] UPDATE conversations set status = 'ACTIVE' (pode continuar tentando)
   - [ ] Log com razão

6. **Resposta (200 OK):**
   ```json
   {
     "status": "processed",
     "paymentId": "pay_789",
     "abandonmentId": "abn_456",
     "action": "converted" | "pending" | "declined"
   }
   ```

7. **Tratamento de Erro:**
   - [ ] 400 Bad Request: validation error
   - [ ] 403 Forbidden: invalid HMAC
   - [ ] 404 Not Found: abandonment não existe (mas retornar 200 OK para Meta?)
   - [ ] 500 Internal Server Error: DB error

8. **Testes:**
   - [ ] Teste com payment 'completed': 200 OK, conversation CONVERTED
   - [ ] Teste com payment 'failed': 200 OK, conversation ACTIVE
   - [ ] Teste com payment duplicado: 200 OK com "already_processed"
   - [ ] Teste com abandonmentId inexistente: 404 ou 200 OK?
   - [ ] Teste com HMAC inválido: 403 Forbidden

### Notas Técnicas
- Idempotência via UNIQUE payment_id em abandonments table
- Sincronizar status entre abandonments e conversations
- Log de audit para rastreamento de conversões
- Considerar: se payment 'failed', conversa pode continuar → max 1 conversão por abandonment

### Arquivos Afetados
- src/routes/webhooks.ts (adicionar POST /webhook/payment)
- src/services/PaymentService.ts (novo - business logic)
- src/repositories/AbandonmentRepository.ts (adicionar update methods)
- tests/integration/webhooks.test.ts (adicionar testes POST payment)

### Dependencies
- Story SARA-1.1, SARA-1.2, SARA-1.3, Story SARA-2.1

---

## Summary

**EPIC 3 contém 4 stories** que implementam:
- ✅ Detecção determinística de opt-out (keywords)
- ✅ Detecção via IA como fallback (OpenAI)
- ✅ Validações de conformidade LGPD e janela 24h
- ✅ Processamento de eventos de pagamento/conversão

**Story Points Estimado:** ~35 pontos (8+8+9+10)

**Sequência de Implementação:**
1. SARA-3.1 (OptOutDetector determinístico)
2. SARA-3.2 (OpenAI fallback)
3. SARA-3.3 (ComplianceService)
4. SARA-3.4 (Payment webhook)

---

**Status**: Ready for @dev implementation
**Architect Sign-off**: @architect (Aria) ✅
**Product Owner**: @po (Pax) - pending approval

— River, removendo obstáculos 🌊
