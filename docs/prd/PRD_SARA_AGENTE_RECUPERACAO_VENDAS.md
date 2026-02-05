# Product Requirements Document (PRD)
## Sara – Agente de Recuperação de Vendas via WhatsApp

**Data:** 2026-02-05
**Versão:** 1.0
**Autor:** Morgan (PM)
**Status:** Approved for Development

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-02-05 | 1.0 | PRD inicial baseado em BRIEF_AGENTE_SARA.md | Morgan |

---

## 1. Visão do Produto

### Objetivo Principal

**Sara** é um agente conversacional de recuperação de vendas que opera via WhatsApp Business API, automatizando o contato com usuários que abandonaram seus carrinhos de compra. O agente conduz uma conversa humanizada e persuasiva com o objetivo de recuperar a venda, oferecendo a conclusão do pagamento através do link original ou, quando necessário, através de uma alternativa com desconto.

O produto opera **100% dentro das políticas da Meta**, respeitando templates aprovados, janelas de 24 horas e preferências de opt-out do usuário.

### Escopo da Primeira Fase (MVP)

**Incluído:**
- API backend sem interface visual
- Recebimento de eventos de abandono de carrinho via webhook
- Envio de template inicial aprovado pela Meta
- Continuação de conversa após resposta do usuário
- Estratégia de conversão com link original + link com desconto
- Persistência de histórico completo em Supabase
- Interpretação de mensagens via OpenAI
- Base de conhecimento opcional via Pinecone
- Respeito à janela de 24 horas
- Validação e recebimento de webhooks da Meta (GET + POST)

**Fora de Escopo (Fase 2+):**
- Dashboard visual
- Atendimento humano / escalação
- Relatórios avançados
- Suporte multilíngue
- Integração com múltiplas plataformas de pagamento

---

## 2. Problemas Resolvidos

| Problema | Impacto | Solução Sara |
|----------|---------|--------------|
| **Perda de receita por abandono** | Alto – múltiplas vendas perdidas diariamente | Recuperação automática e em escala |
| **Follow-ups manuais caros** | Médio-Alto – equipe de suporte sobrecarregada | Automação completa via API |
| **Mensagens genéricas** | Médio – baixa taxa de conversão | Conversa contextual com OpenAI |
| **Compliance complexo** | Alto – risco de bloqueio pela Meta | Respecto a templates, janelas e opt-out |

---

## 3. Objetivos

### 3.1 Objetivos de Negócio

1. **Recuperar receita perdida** – Converter parte significativa dos carrinhos abandonados em vendas concluídas
2. **Automatizar o processo** – Eliminar necessidade de intervalo humano no fluxo inicial de contato
3. **Escalar sem custo linear** – Aumentar volume de recuperações sem aumentar proporcionalmente a equipe
4. **Construir confiança na marca** – Comunicação empática reforça relacionamento com cliente

**Métrica de Sucesso Primária:** Taxa de conversão de carrinhos abandonados ≥ 5% (baseline: 0% sem abordagem)

### 3.2 Objetivos Técnicos

1. **Processar eventos em tempo real** – Latência < 2 segundos entre evento de abandono e envio da primeira mensagem
2. **Integração robusta com WhatsApp API** – 99.5% uptime e tratamento de falhas gracioso
3. **Persistência completa** – Histórico de todas as conversas, estados e eventos armazenados para análise
4. **Compliance automático** – Zero violações de políticas da Meta através de validações de sistema
5. **Interpretação inteligente** – Modelo de IA capaz de entender objeções e gerar respostas contextualmente apropriadas

---

## 4. Requisitos

### 4.1 Requisitos Funcionais

**RF1:** Sistema deve receber webhook de abandono de carrinho contendo: nome do usuário, telefone (WhatsApp), ID do produto, link de pagamento, ID único do abandono

**RF2:** Sistema deve enviar template de primeira mensagem (pré-aprovada pela Meta) sem necessidade de aprovação por humano, respeitando exatamente o formato aprovado

**RF3:** Após resposta do usuário, sistema deve iniciar conversa livre usando OpenAI para interpretar mensagem e gerar resposta contextual

**RF4:** Sistema deve rastrear estado da conversa (iniciada, em andamento, convertida, cancelada, timeout) e persistir todas as mensagens com timestamps

**RF5:** Durante conversa, sistema deve ser capaz de:
   - Responder a objeções de forma empática
   - Oferecer link original de pagamento como primeira opção
   - Oferecer link com desconto como segunda opção, se estratégica
   - Encerrar conversa de forma educada quando usuário solicitar

**RF6:** Sistema deve respeitar janela de 24 horas da Meta para envio de mensagens livres – após este período, apenas templates aprovados podem ser enviados proativamente, mas se o usuário responder, a janela é reaberta e a conversa continua normalmente (a oferta nunca expira)

**RF7:** Sistema deve consultar base de conhecimento (Pinecone, opcional) para suportar respostas sobre produtos específicos ou FAQs frequentes

**RF8:** Webhook de validação (GET) deve responder ao teste de conectividade da Meta com token verificado

**RF9:** Webhook de mensagens (POST) deve processar eventos de:
   - Mensagens recebidas do usuário
   - Confirmações de entrega
   - Confirmações de leitura

**RF10:** Sistema deve armazenar configuração de produtos (links de pagamento, desconto, % desconto) em tabela `product_offers` no Supabase – .env apenas para chaves/secrets e configs globais

**RF11:** Sistema deve respeitar opt-out de usuário através de:
   - **Regra determinística (primária):** matching de palavras-chave (parar, remover, cancelar, sair, stop, não quero mais, etc.)
   - **OpenAI (assistivo):** detecta intenções de opt-out em linguagem natural como fallback
   - **Validação:** sempre verificar `opted_out=true` antes de enviar qualquer mensagem

**RF12:** Todos os eventos devem ser logged com informações de debug para troubleshooting (timestamps, user IDs, message IDs, OpenAI tokens, erros)

### 4.2 Requisitos Não-Funcionais

**NFR1:** **Latência de primeira mensagem** – Tempo entre recebimento de evento de abandono e envio de template ≤ 2 segundos

**NFR2:** **Disponibilidade** – Sistema deve ter uptime de 99.5% (máximo 3.6 horas de downtime/mês)

**NFR3:** **Escalabilidade** – Arquitetura deve suportar crescimento de 10x no volume de mensagens sem redesenho

**NFR4:** **Segurança de dados** – Dados de usuário (nome, telefone, compra) criptografados em repouso em Supabase

**NFR5:** **Conformidade com regulamentações** – Sistema deve estar em conformidade com LGPD (Lei Geral de Proteção de Dados) e WhatsApp ToS

**NFR6:** **Retenção de dados** – Histórico de conversas mantido por no mínimo 6 meses para auditoria e análise

**NFR7:** **Performance de banco de dados** – Queries de histórico de conversa com índice apropriado devem responder em < 500ms

**NFR8:** **Taxa de erro de API** – Taxa de erro geral da API (5xx) não deve exceder 0.1%

**NFR9:** **Timeout de resposta OpenAI** – Se OpenAI não responder em 5 segundos, sistema deve usar fallback com mensagem pré-escrita

**NFR10:** **Webhook retry** – Notificações que falham devem ser retentadas com backoff exponencial (1s, 2s, 4s, 8s)

**NFR11:** **Idempotência de webhooks** – Todos os webhooks devem ser idempotentes:
   - `abandonments.external_id` (abandonmentId) → UNIQUE
   - `abandonments.payment_id` → UNIQUE
   - `messages.whatsapp_message_id` → UNIQUE
   - `webhooks_log` usa `external_id + webhook_type` para dedupe
   - Comportamento em duplicado: retorna `200 OK` com `{ "status": "already_processed" }` (não reprocessa)

---

## 5. Fluxos Funcionais de Alto Nível

### 5.1 Fluxo de Abandono de Carrinho → Primeira Mensagem

```
1. Sistema de pagamento detecta abandono
   ↓
2. Envia POST para webhook: /webhook/abandonment
   - Payload: { userId, name, phone, productId, paymentLink, abandonmentId, timestamp }
   ↓
3. API valida evento (dados obrigatórios presentes)
   ↓
4. Sistema verifica se usuário já existe em DB
   - Se não existe: cria registro em users table
   ↓
5. Cria registro de abandono em abandonments table
   ↓
6. Recupera template aprovado da Meta (pré-configurado em .env)
   ↓
7. Envia template via WhatsApp API
   - Template ID, parâmetros personalizados, phone number
   ↓
8. Cria conversa em conversations table com status="awaiting_response"
   ↓
9. Retorna 200 OK ao webhook caller
   - Se abandonmentId já existe (duplicado): retorna 200 OK com "already_processed"
```

**Tempo esperado:** < 2 segundos

### 5.2 Fluxo de Resposta do Usuário → Conversa

```
1. Usuário responde via WhatsApp
   ↓
2. Meta envia POST para webhook: /webhook/messages
   - Payload: { messageId, from, text, timestamp, whatsappBusinessAccountId }
   ↓
3. API valida assinatura do webhook (HMAC-SHA256 com app secret no header)
   ↓
4. Recupera contexto da conversa:
   - Busca abandonment_id baseado em phone number
   - Carrega histórico de mensagens (últimas 10)
   - Nota: resposta do usuário reabre janela de 24h da Meta
   ↓
5. Processa mensagem:
   - Envia histórico + nova mensagem para OpenAI
   - Aguarda resposta (timeout: 5s)
   ↓
6. Se OpenAI responde:
   - Processa resposta para contexto (identifica objeção, mood, intenção)
   - Injeta links (original + desconto) na resposta, se apropriado
   - Envia resposta via WhatsApp API
   ↓
7. Se OpenAI falha (timeout ou erro):
   - Envia mensagem fallback: "Um momento enquanto avalio sua solicitação..."
   - Loga erro para review manual
   ↓
8. Persiste mensagem recebida + resposta enviada em messages table
   ↓
9. Atualiza timestamps da conversa:
   - `last_message_at = now()` (qualquer mensagem)
   - `last_user_message_at = now()` (apenas inbound do usuário → usado para janela 24h)
   ↓
10. Atualiza status da conversa (em andamento)
   ↓
11. Retorna 200 OK ao Meta webhook
```

**Tempo esperado:** 2-7 segundos (incluindo tempo de OpenAI)

### 5.3 Fluxo de Conversão Completa

```
1. Conversão confirmada por webhook do gateway de pagamento:
   POST /webhook/payment { abandonmentId, status: "paid", ... }
   (Nota: WhatsApp Cloud API NÃO envia evento de clique em link)
   ↓
2. Sistema atualiza registro em abandonments table:
   - status = "converted"
   - converted_timestamp = now()
   - conversion_link = "original" | "discounted"
   ↓
3. Envia mensagem de confirmação: "Pagamento confirmado! Obrigado pela compra."
   ↓
4. Encerra conversa (status = "closed")
   ↓
5. Gera evento interno de conversão para relatórios
```

**Nota sobre intenção de pagar:**
- OpenAI pode inferir "intenção de pagar" ("Vou pagar agora", "Tá certo") para ajustar tom da conversa
- Mas isso NÃO é fonte de verdade para conversão – apenas o webhook de pagamento confirma

### 5.4 Fluxo de Encerramento por Solicitação do Usuário (Opt-out)

```
1. Usuário envia mensagem indicando desinteresse
   ↓
2. Sistema aplica detecção em duas camadas:
   a) REGRA DETERMINÍSTICA (primária, sempre executa primeiro):
      - Match exato de palavras-chave: parar, remover, cancelar, sair, stop,
        não quero, me tire, excluir, desinscrever, unsubscribe
      - Se match → opt-out IMEDIATO
   b) OpenAI (assistivo, fallback):
      - Se regra não matchou, OpenAI analisa intenção
      - Detecta linguagem natural: "não tenho interesse", "deixa pra lá"
   ↓
3. Se opt-out detectado (por regra OU OpenAI):
   - Marca registro em users como opted_out=true, opted_out_at=now()
   ↓
4. Atualiza abandono com status="declined" e conversa com status="closed"
   ↓
5. Envia mensagem de encerramento respeitosa
   ↓
6. Não envia mais mensagens para este usuário (mesmo em futuras campanhas)
   - IMPORTANTE: Verificar opted_out ANTES de qualquer envio
```

---

## 6. Estados do Agente Conversacional (Sara)

Sara opera através de **estados de conversa** que controlam seu comportamento:

### 6.1 Estados

**Estados de Conversa (`conversations.status`):**

| Estado | Descrição | Comportamento | Transição Para |
|--------|-----------|---------------|-----------------|
| **AWAITING_RESPONSE** | Template enviado, aguardando resposta | Sistema escuta, não envia proativas | ACTIVE |
| **ACTIVE** | Usuário respondeu, conversa em andamento | Sara responde com OpenAI, oferece links | CLOSED |
| **CLOSED** | Conversa finalizada (por qualquer razão) | Sistema não interage mais | - |
| **ERROR** | Erro ao processar mensagem | Envia fallback, logs erro | ACTIVE (retry) ou CLOSED |

**Estados de Abandono (`abandonments.status`):**

| Estado | Descrição | Trigger |
|--------|-----------|----------|
| **INITIATED** | Abandono recebido, template enviado | Webhook /abandonment |
| **ACTIVE** | Usuário respondeu, conversa em andamento | Primeira resposta do usuário |
| **CONVERTED** | Pagamento confirmado | Webhook /payment |
| **DECLINED** | Usuário recusou ou opt-out | Regra/OpenAI detecta opt-out |

### 6.2 Transições Válidas

**Conversação:**
```
AWAITING_RESPONSE → ACTIVE (usuário responde)
ACTIVE → CLOSED (abandono vira converted/declined, ou erro irrecuperável)
ACTIVE → ERROR (falha no processamento)
ERROR → ACTIVE (retry ok) ou CLOSED (timeout)
```

**Abandono:**
```
INITIATED → ACTIVE (primeira resposta do usuário)
ACTIVE → CONVERTED (webhook /payment)
ACTIVE → DECLINED (opt-out detectado)
```

### 6.3 Comportamentos por Estado

#### AWAITING_RESPONSE
- Objetivo: Aguardar que usuário responda ao template
- Timeout: Sem timeout (oferta não expira)
- Mensagens enviadas: Nenhuma (esperando resposta)
- Nota: Usuário pode responder a qualquer momento e a conversa será retomada

#### ACTIVE
- Objetivo: Conduzir conversa para conversão
- Tom: Empático, prestativo, sem pressão excessiva
- Estratégia:
  - Primeira oferta = link original
  - Segunda oferta (se objeção sobre preço) = link com desconto
- Máximo de ciclos: 5 trocas de mensagens antes de oferecer pausa ("Desejo pensar...")
- OpenAI instructions: Entender objeções, contornar, redirecionar para links

#### ERROR
- Objetivo: Informar ao usuário e logar para debug
- Mensagem ao usuário: "Desculpe, enfrentei um problema técnico. Tentarei novamente em breve."
- Log: Incluir stack trace, timestamp, user ID, message ID
- Retry strategy: Exponential backoff (1s, 2s, 4s, 8s) × 3 tentativas

#### CLOSED
- Objetivo: Estado final
- Ações: Nenhuma (conversa encerrada)
- Histórico: Mantido em DB para análise

---

## 7. Regras de Negócio

### 7.1 Estratégia de Preços

**RN1:** Desconto é **opcional** – não é necessário oferecer para todas as conversações
**RN2:** Cada produto tem configuração em tabela `product_offers` no Supabase:
   - `product_id` (chave)
   - `payment_link` (link original)
   - `discount_link` (link com desconto)
   - `discount_percent` (% do desconto)
   - `active` (boolean)

**RN3:** Estratégia de oferta:
   - Primeira abordagem: sempre link original
   - Segunda abordagem (se objeção): considerar link com desconto baseado em:
     - Histórico de OpenAI (usuário mencionou preço?)
     - Valor do carrinho (> R$ 500 = maior probabilidade de desconto)
     - Tentativas anteriores (max 3 ofertas antes de "pausar")

### 7.2 Gestão de Conversa

**RN4:** Conversa ativa = limite máximo de 5 ciclos de troca (10 mensagens total: 5 do usuário + 5 de Sara)
**RN5:** Follow-up "Ainda interessado?" após 30 minutos sem resposta:
   - Condições obrigatórias (TODAS devem ser verdadeiras):
     - `now() - last_user_message_at <= 24h` (dentro da janela Meta)
     - `opted_out = false`
     - `followup_sent = false` (max 1× por conversa)
     - `status = 'active'`
   - Se qualquer condição falhar: NÃO enviar
**RN6:** Se usuário não responde por 2 horas, manter em ACTIVE mas não enviar mais proativas

### 7.3 Dados e Privacidade

**RN7:** Opt-out é permanente – usuário nunca mais recebe mensagens (mesmo de futuras campanhas)
**RN8:** Dados de usuário (nome, telefone) usados apenas para:
   - Personalizar mensagens
   - Histórico de conversa
   - Relatórios anônimos de conversão
   - **NÃO** compartilhados com terceiros

**RN9:** Senhas, dados de pagamento, PII sensível: **NUNCA** armazenados ou transmitidos por Sara

### 7.4 Linkagem e Rastreamento

**RN10:** Cada abandonment_id é único e vinculado a:
   - Um usuario (phone number)
   - Uma conversa (conversationId)
   - Um histórico completo de mensagens

**RN11:** Links de pagamento gerados com tracking params (utm_source=sara, utm_medium=whatsapp, utm_campaign=cart_recovery)

---

## 8. Conformidade e Compliance (Meta / WhatsApp)

### 8.1 Políticas da Meta

**COMP1:** **Template Messaging**
   - Primeira mensagem deve usar template pré-aprovado pela Meta
   - Template não pode ser alterado sem re-aprovação
   - Violação = bloqueio de conta

**COMP2:** **24-Hour Window Rule**
   - Conversa livre só é permitida nas 24h após última mensagem do usuário
   - Cada resposta do usuário reabre a janela de 24h
   - Após 24h sem resposta: se Sara precisar iniciar contato, deve usar template aprovado
   - Nota: A oferta NUNCA expira - usuário pode converter a qualquer momento

**COMP3:** **Mensagem Spam**
   - Proibição de bulk unsolicited messaging
   - Cada mensagem deve ser resposta a evento (abandono) ou resposta do usuário
   - Proibido enviar mensagens "genéricas" sem contexto

**COMP4:** **Opt-Out Compliance**
   - Usuário tem direito de recusar
   - Detecção em duas camadas: regra determinística (primária) + OpenAI (assistiva)
   - Palavras-chave obrigatórias: parar, remover, cancelar, sair, stop, não quero, excluir
   - Sistema deve parar de enviar imediatamente após opt-out
   - SEMPRE verificar `opted_out=true` antes de qualquer envio

**COMP5:** **Webhook Verification (Meta)**
   - **GET (validação inicial):** usa `hub.verify_token` para confirmar ownership do endpoint
   - **POST (mensagens):** usa assinatura HMAC-SHA256 no header `X-Hub-Signature-256` com `app_secret`
   - Chaves armazenadas de forma segura em .env (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`)
   - Sistema rejeita webhooks com assinatura inválida (403 Forbidden)

### 8.2 Validações de Sistema

| Validação | Enforcement | Ação em Falha |
|-----------|-------------|--------------|
| Template message format | Parsing rigoroso | Rejeitar envio, log error |
| 24-hour window | Timestamp check (`last_user_message_at`) | Se Sara inicia contato após 24h, usar template aprovado |
| Opt-out list | Lookup `opted_out=true` antes de enviar | Skip usuário, não processar |
| Webhook signature (Meta) | HMAC-SHA256 via `X-Hub-Signature-256` | Rejeitar com 403 Forbidden |
| Webhook signature (Payment) | HMAC ou secret via header | Rejeitar com 403 Forbidden |
| Phone number validation | E.164 format | Rejeitar evento, log error |
| Idempotência | Check `external_id`/`payment_id`/`whatsapp_message_id` | 200 OK + "already_processed" |

### 8.3 Histórico e Auditoria

**COMP6:** Manter log completo de:
   - Todos os webhooks recebidos (metadata)
   - Todas as mensagens enviadas (timestamp, template ID, status)
   - Todas as mensagens recebidas (timestamp, conteúdo)
   - Todas as ações de opt-out (timestamp, reason)

**COMP7:** Relatório de compliance disponível para auditoria (quarterly)

---

## 9. Arquitetura Técnica

### 9.1 Componentes

```
┌─────────────────────────────────────────────────────────┐
│                    SARA SYSTEM                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐         ┌─────────────┐              │
│  │ Webhook Srv  │────────→│ Event Queue │              │
│  │ (Meta & Pay) │         │  (Redis?)   │              │
│  └──────────────┘         └─────────────┘              │
│         ▲                         │                      │
│         │                         ▼                      │
│  ┌──────────────┐         ┌─────────────┐              │
│  │ WhatsApp API │         │ Message Job │              │
│  │  (Outbound)  │         │   Worker    │              │
│  └──────────────┘         └─────────────┘              │
│         ▲                         │                      │
│         │                    ┌────┴─────┐               │
│         │                    ▼           ▼               │
│  ┌──────────────┐    ┌────────────┐ ┌──────────┐       │
│  │   API Core   │    │ OpenAI API │ │ Pinecone │       │
│  │ (Node/Ts)    │    │  (Intent)  │ │  (KB)    │       │
│  └──────────────┘    └────────────┘ └──────────┘       │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────────────────────┐                   │
│  │      Supabase (PostgreSQL)       │                   │
│  │  - Users                         │                   │
│  │  - Abandonments                  │                   │
│  │  - Conversations                 │                   │
│  │  - Messages                      │                   │
│  │  - Webhooks Log                  │                   │
│  └─────────────────────────────────┘                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 9.2 Stack Técnico (MVP)

| Layer | Tecnologia | Justificativa |
|-------|-----------|---------------|
| **Runtime** | Node.js 18+ | Performático, ecosistema maduro |
| **Framework** | Express.js ou Fastify | Leve, rápido para APIs |
| **Lang** | TypeScript | Type-safety, melhor DX |
| **DB** | Supabase (PostgreSQL) | Escalável, confiável, LGPD-ready |
| **Cache/Queue** | Redis | Para event queue e rate-limiting |
| **AI** | OpenAI API (GPT-4 ou 3.5) | SOTA para NLU e geração de texto |
| **Vector DB** | Pinecone | Opcional para knowledge base |
| **Deploy** | Docker + Cloud (AWS/GCP/Heroku) | Escalável, observável |
| **Logging** | Winston ou Pino | Estruturado, fácil debug |
| **Testing** | Jest + Supertest | Cobertura de unit + integration |

### 9.3 Endpoints

#### **POST /webhook/abandonment**
Recebe evento de abandono de carrinho

```json
{
  "userId": "customer_123",
  "name": "João Silva",
  "phone": "+5511999999999",
  "productId": "product_456",
  "paymentLink": "https://pay.example.com/cart/abc123",
  "abandonmentId": "abn_789",
  "timestamp": "2026-02-05T10:30:00Z",
  "value": 250.00
}
```

Resposta: `200 OK` com `{ "status": "received", "abandonmentId": "abn_789" }`

**Idempotência:** Se `abandonmentId` já existe, retorna `200 OK` com `{ "status": "already_processed" }` (não reenvia template)

#### **POST /webhook/messages** (Meta)
Recebe mensagens do usuário via WhatsApp

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "ENTRY_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "11987654321",
              "phone_number_id": "PHONE_NUMBER_ID",
              "webhook_timestamp": "1676217820"
            },
            "messages": [
              {
                "from": "5511999999999",
                "id": "wamid.xxx",
                "text": { "body": "Sim, quero pagar!" },
                "timestamp": "1676217818",
                "type": "text"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Resposta: `200 OK` (imediata)

#### **GET /webhook/messages?hub.mode=subscribe&hub.challenge=XXX&hub.verify_token=YYY**
Validação inicial de webhook da Meta (ownership do endpoint)

- Verifica `hub.verify_token` contra `WHATSAPP_VERIFY_TOKEN` em .env
- Resposta: `200 OK` com body = `hub.challenge` (se token correto)
- Se token incorreto: `403 Forbidden`

**Nota:** POST /webhook/messages usa assinatura HMAC-SHA256 (ver COMP5)

#### **GET /conversations/:conversationId**
Recupera histórico de conversa (interno)

Resposta:
```json
{
  "conversationId": "conv_123",
  "abandonmentId": "abn_789",
  "userId": "customer_123",
  "status": "active",
  "createdAt": "2026-02-05T10:30:00Z",
  "messages": [
    {
      "id": "msg_1",
      "from": "sara",
      "text": "Olá João! Vi que seu carrinho tem um produto legal...",
      "timestamp": "2026-02-05T10:30:05Z"
    },
    {
      "id": "msg_2",
      "from": "user",
      "text": "Oi, esqueci de comprar mesmo!",
      "timestamp": "2026-02-05T10:31:00Z"
    }
  ]
}
```

#### **POST /webhook/payment**
Recebe confirmação de pagamento do gateway (fonte de verdade para conversão)

**Segurança obrigatória:**
- Requer assinatura HMAC do gateway no header `X-Payment-Signature` (ou secret fixo em `X-Webhook-Secret`)
- Valida que `abandonmentId` existe no banco
- Valida `amount` e `productId` (se possível) para evitar fraude/bugs

```json
{
  "abandonmentId": "abn_789",
  "status": "paid",
  "paymentId": "pay_123",
  "amount": 250.00,
  "productId": "product_456",
  "linkType": "original",  // ou "discounted"
  "timestamp": "2026-02-05T10:45:00Z",
  "signature": "hmac_sha256_here"  // ou via header
}
```

Resposta: `200 OK` com `{ "status": "converted", "conversationId": "conv_123" }`

**Idempotência:** Se `paymentId` já foi processado, retorna `200 OK` com `{ "status": "already_processed" }`

**Ações executadas:**
1. Valida assinatura e `abandonmentId`
2. Atualiza `abandonments.status = 'converted'`
3. Registra `conversion_link`, `converted_at` e `payment_id`
4. Envia mensagem de confirmação via WhatsApp
5. Encerra conversa (`status = 'closed'`)

#### **POST /conversations/:conversationId/close**
Encerra conversa manualmente (admin)

Resposta: `200 OK` com `{ "status": "closed" }`

---

## 10. Persistência de Dados (Supabase)

### 10.1 Schema

#### **users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  opted_out BOOLEAN DEFAULT FALSE,
  opted_out_at TIMESTAMP,
  opted_out_reason TEXT,  -- Para compliance/auditoria (COMP6)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **product_offers** (configuração de produtos)
```sql
CREATE TABLE product_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(255) UNIQUE NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  payment_link VARCHAR(1024) NOT NULL,
  discount_link VARCHAR(1024),
  discount_percent DECIMAL(5, 2), -- ex: 10.00 = 10%
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_product_offers_product_id ON product_offers(product_id);
```

#### **abandonments**
```sql
CREATE TABLE abandonments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  external_id VARCHAR(255) UNIQUE NOT NULL,
  product_id VARCHAR(255) NOT NULL REFERENCES product_offers(product_id),  -- FK em string (MVP ok, fase 2 pode migrar pra UUID)
  value DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'initiated',
  -- Status: initiated, active, converted, declined
  conversation_id UUID REFERENCES conversations(id),
  converted_at TIMESTAMP,
  conversion_link VARCHAR(20), -- 'original' | 'discounted'
  payment_id VARCHAR(255) UNIQUE,  -- Idempotência: evita processar pagamento duplicado
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_abandonments_user_id ON abandonments(user_id);
CREATE INDEX idx_abandonments_external_id ON abandonments(external_id);
```

#### **conversations**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abandonment_id UUID REFERENCES abandonments(id),
  user_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'awaiting_response',
  -- Status: awaiting_response, active, closed, error
  -- Nota: converted/declined ficam em abandonments.status
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  last_user_message_at TIMESTAMP,  -- Para cálculo da janela de 24h
  followup_sent BOOLEAN DEFAULT FALSE,  -- Controle de "Ainda interessado?"
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_abandonment_id ON conversations(abandonment_id);

-- Garante 1 conversa por abandono (evita race condition)
ALTER TABLE conversations ADD CONSTRAINT uq_conversations_abandonment UNIQUE (abandonment_id);
```

#### **messages**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  from_sender VARCHAR(50) NOT NULL, -- 'sara' | 'user'
  message_text TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text', -- 'text' | 'template'
  whatsapp_message_id VARCHAR(255) UNIQUE,  -- Idempotência (UNIQUE permite múltiplos NULLs)
  -- Nota: obrigatório para inbound (usuário), opcional para outbound (pode ser preenchido após envio)
  openai_response_id VARCHAR(255), -- Para rastrear tokens usados
  openai_tokens_used INTEGER,
  intent VARCHAR(100), -- Detectado por OpenAI: 'price_question', 'objection', 'confirmation', etc
  metadata JSONB, -- { links_offered: [...], user_sentiment: ... }
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

#### **webhooks_log**
```sql
CREATE TABLE webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type VARCHAR(50) NOT NULL, -- 'abandonment' | 'whatsapp_message' | 'payment'
  external_id VARCHAR(255),
  payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT TRUE,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhooks_log_webhook_type ON webhooks_log(webhook_type);

-- Dedupe real: evita processar webhook duplicado
ALTER TABLE webhooks_log ADD CONSTRAINT uq_webhooks_log_type_external UNIQUE (webhook_type, external_id);
-- Handler: se conflito → 200 OK {status:"already_processed"}
```

#### **opt_out_keywords**
```sql
CREATE TABLE opt_out_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) UNIQUE NOT NULL, -- 'parar', 'remover', 'stop', etc.
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed inicial
INSERT INTO opt_out_keywords (keyword) VALUES
  ('parar'), ('remover'), ('cancelar'), ('sair'), ('stop'),
  ('não quero'), ('me tire'), ('excluir'), ('desinscrever'), ('unsubscribe');
```

### 10.2 Queries Críticas (Performance)

```sql
-- Encontrar conversa por phone number (usado em webhook de entrada)
-- Prioriza ACTIVE sobre AWAITING_RESPONSE (evita pegar abandono novo quando já existe conversa ativa)
SELECT c.* FROM conversations c
JOIN users u ON c.user_id = u.id
WHERE u.phone_number = $1 AND c.status IN ('active', 'awaiting_response', 'error')
ORDER BY
  CASE c.status
    WHEN 'active' THEN 1
    WHEN 'error' THEN 2
    WHEN 'awaiting_response' THEN 3
    ELSE 99
  END,
  c.created_at DESC
LIMIT 1;

-- Histórico de mensagens (com índice)
SELECT * FROM messages
WHERE conversation_id = $1
ORDER BY created_at DESC
LIMIT 50;

-- Abandonments não convertidos (para dashboard)
SELECT a.* FROM abandonments a
WHERE a.status NOT IN ('converted', 'declined')
ORDER BY a.created_at DESC;

-- Usuários opt-out (para compliance)
SELECT * FROM users WHERE opted_out = TRUE;
```

---

## 11. Personalidade e Tom da Sara

### 11.1 Persona da Sara

| Aspecto | Descrição |
|---------|-----------|
| **Nome** | Sara (feminino, aproximável) |
| **Papel** | Assistente de compras dedicado |
| **Tom** | Humano, empático, prestativo, sem pressão |
| **Conhecimento** | Produtos da loja, processos de pagamento |
| **Objetivo** | Ajudar cliente a completar compra, não "vender" |
| **Limites** | Não fala sobre política, religião, ou assuntos sensíveis |

### 11.2 Princípios de Comunicação

1. **Empatia primeiro** – "Entendo que R$ 250 é um valor, certo?"
2. **Solucionar objeções** – Oferecer alternativas, não insistir
3. **Transparência** – Explicar por que oferecendo desconto
4. **Respeito** – Se usuário diz não, aceitar e encerrar graciosamente
5. **Contexto** – Personalizar com nome do produto, valor, nome do usuário

### 11.3 Exemplos de Respostas

**Quando usuário questiona preço:**
> "Entendo que o preço é importante. Deixa eu te ajudar aqui com uma opção especial - posso oferecer um link de pagamento com R$ 25 de desconto. Isso funciona pra você?"

**Quando usuário diz "não obrigado":**
> "Tudo bem! Fico à disposição caso mude de ideia. Tenha um ótimo dia! 😊"

**Quando não consegue processar:**
> "Desculpa aí, não consegui entender bem. Você está interessado em completar a compra? Se sim, posso te enviar o link de novo."

---

## 12. Métricas de Sucesso

### 12.1 Métricas Primárias

| Métrica | Target | Baseline | Fórmula |
|---------|--------|----------|---------|
| **Taxa de Conversão** | ≥ 5% | 0% | Abandonos Convertidos / Total Abandonos |
| **Taxa de Resposta** | ≥ 40% | N/A | Usuários que responderam / Total templates enviados |
| **Latência de 1ª Msg** | ≤ 2s | N/A | Time(msg_sent) - Time(event_received) |
| **Uptime do Sistema** | ≥ 99.5% | N/A | Tempo up / Tempo total |

### 12.2 Métricas Secundárias

| Métrica | Target | Propósito |
|---------|--------|----------|
| **Avg Msgs/Conversa** | 2-4 | Otimizar eficiência de conversa |
| **Taxa de Opt-out** | < 2% | Evitar message fatigue |
| **Tempo de Conversão** | < 8min avg | Otimizar speed-to-conversion |
| **Desconto Usage** | 30-40% | Entender elasticidade de preço |
| **Erro Rate de API** | < 0.1% | Garantir estabilidade |
| **Token Cost/Conversa** | < $0.05 | Rentabilidade de OpenAI |

### 12.3 Dashboard de Acompanhamento

Métricas devem ser acessíveis em dashboard (fase 2):
- Conversões hoje / semana / mês
- Tempo médio de conversão
- Distribuição de respostas
- Taxa de erro
- Custo de operação (OpenAI + infrastructure)

---

## 13. Riscos e Pontos de Atenção

### 13.1 Riscos Técnicos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| **Failure na API do Meta** | Média | Alto | Rate limiting no client, retry com backoff, fallback message |
| **Throttling de OpenAI** | Baixa | Médio | Queue com batching, modelo 3.5 mais barato que 4 |
| **Dados corrompidos em DB** | Baixa | Alto | Backups diários, transaction logging, test coverage alto |
| **Exposição de dados de usuário** | Baixa | Crítico | Criptografia em repouso, HTTPS, validação de input |
| **Falha de webhook Meta** | Média | Médio | Webhook retry na side da Meta, webhook log para troubleshooting |
| **Janela de 24h Meta** | Baixa | Baixo | Verificar timestamp antes de envio proativo, usar template se necessário |

### 13.2 Riscos de Compliance

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| **Bloqueio de conta Meta** | Média | Crítico | Review rigoroso de template, usar template para mensagens proativas fora da janela, opt-out enforcement |
| **Violação de LGPD** | Baixa | Crítico | Criptografia, data minimization, audit logs, consent tracking |
| **Spam reports** | Média | Médio | Usar template para mensagens proativas fora da janela de 24h, respeitar opt-out |
| **Phishing accusation** | Baixa | Médio | Links de domínio confiável, branding correto no template |

### 13.3 Riscos de Negócio

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| **Churn de clientes por spam** | Média | Médio | Message volume control, quality over quantity strategy |
| **Baixa taxa de conversão** | Média | Médio | A/B testing de templates, iteração rápida de prompts OpenAI |
| **Custo de OpenAI incontrolável** | Média | Médio | Caching de respostas, modelo 3.5, token budgeting por conversa |
| **Falsos positivos em conversão** | Baixa | Baixo | Log de todas as detecções, manual review de edge cases |

### 13.4 Pontos de Atenção (Monitoramento Contínuo)

1. **Qualidade de respostas OpenAI** – Amostrar 10% de conversas weekly para avaliar qualidade
2. **Taxa de timeout da API Meta** – Alertar se > 1% de webhooks não receberem 200 OK
3. **Custo de operação** – Comparar receita gerada vs. custo de OpenAI + infrastructure
4. **Feedback de usuários** – Monitorar complaints em WhatsApp, redes sociais
5. **Compliance checklist** – Quarterly audit de conformidade com políticas Meta
6. **Retenção de dados** – Garantir limpeza de dados pessoais após 6 meses conforme LGPD

---

## 14. Requisitos Funcionais Não-Incluídos (Fase 2+)

- [ ] Dashboard visual de conversões e analytics
- [ ] Integração com múltiplas plataformas de pagamento
- [ ] Suporte multilíngue
- [ ] Atendimento humano (escalação)
- [ ] Customização de templates sem re-aprovação Meta
- [ ] A/B testing de mensagens
- [ ] Integração com CRM
- [ ] Previsão de churn (ML)
- [ ] Análise de sentiment em tempo real
- [ ] WhatsApp Groups (broadcast)

---

## 15. Próximas Etapas & Handoff

### 15.1 Para Architect (@architect)

O documento está pronto para arquitetura técnica. Solicitar:

1. **Definição de tech stack detalhada** (frameworks, libs, patterns)
2. **Desenho de componentes e data flow**
3. **Plano de deployment e scaling**
4. **Estratégia de testing (unit, integration, e2e)**
5. **Observability e logging strategy**

### 15.2 Para SM (@sm)

Após approval do PRD:

1. **Criar epics** baseado nas fases (API, Webhooks, OpenAI integration, etc)
2. **Gerar stories** com acceptance criteria detalhados
3. **Estimar complexidade** de cada story
4. **Priorizar roadmap** de desenvolvimento

### 15.3 Para DevOps (@devops)

Para infrastructure:

1. **Setup de Docker** e CI/CD pipeline
2. **Configuração de secrets** (Meta token, OpenAI key, etc)
3. **Database provisioning** (Supabase)
4. **Monitoring e alerting** (logs, error tracking)

---

## 16. Aprovações & Sign-off

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| **Product Manager** | Morgan | 2026-02-05 | ✓ |
| **Tech Lead / Architect** | [Pendente] | TBD | [ ] |
| **Business Owner** | [Pendente] | TBD | [ ] |

---

## Apêndices

### Apêndice A: Glossário

| Termo | Definição |
|-------|-----------|
| **Template Message** | Mensagem pré-aprovada pela Meta que pode ser enviada fora da janela de 24h |
| **24h Window** | Período de 24h após última mensagem do usuário durante o qual conversa livre é permitida (cada resposta reabre a janela) |
| **Abandonment Event** | Webhook do sistema de pagamento indicando carrinho não finalizado |
| **Conversão** | Pagamento confirmado via webhook do gateway (fonte de verdade) |
| **Opt-out** | Quando usuário solicita parar de receber mensagens |
| **OpenAI Intent** | Classificação automática do significado da mensagem do usuário |
| **Knowledge Base** | Base de dados de Pinecone com FAQs e info de produtos |

### Apêndice B: Referências

- [Meta WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [LGPD (Lei Geral de Proteção de Dados)](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd)
- [Supabase Documentation](https://supabase.com/docs)
- [Pinecone Documentation](https://docs.pinecone.io/)

---

**Document Status:** ✅ Approved for Development
**Last Updated:** 2026-02-05
**Next Review:** Upon start of Epic 1 development

---

*PRD criado por Morgan (PM) seguindo AIOS Framework & best practices de Product Management*
