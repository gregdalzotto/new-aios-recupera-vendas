# Documento de Arquitetura – Sara
## Agente de Recuperação de Vendas via WhatsApp

**Data:** 2026-02-05
**Versão:** 1.0
**Arquiteto:** Aria
**Status:** Pronto para Implementação

---

## Sumário

1. [Visão & Princípios](#1-visão--princípios)
2. [Stack Técnico](#2-stack-técnico)
3. [Arquitetura do Sistema](#3-arquitetura-do-sistema)
4. [Design de Componentes](#4-design-de-componentes)
5. [Fluxo de Dados](#5-fluxo-de-dados)
6. [Design de APIs](#6-design-de-apis)
7. [Arquitetura do Banco de Dados](#7-arquitetura-do-banco-de-dados)
8. [Deployment & Infraestrutura](#8-deployment--infraestrutura)
9. [Escalabilidade & Performance](#9-escalabilidade--performance)
10. [Arquitetura de Segurança](#10-arquitetura-de-segurança)
11. [Estratégia de Testes](#11-estratégia-de-testes)
12. [Observabilidade & Monitoramento](#12-observabilidade--monitoramento)
13. [Tratamento de Erros & Recuperação](#13-tratamento-de-erros--recuperação)
14. [Padrões de Desenvolvimento](#14-padrões-de-desenvolvimento)
15. [Decisões & Trade-offs](#15-decisões--trade-offs)

---

## 1. Visão & Princípios

### Visão Arquitetural

Sara é um **sistema conversacional orientado a eventos, sem estado** que:
- Processa eventos de abandono do WhatsApp em tempo real (< 2s de latência)
- Conduz conversas com IA para recuperar vendas
- Opera 100% dentro das limitações de conformidade da Meta
- Escala horizontalmente para lidar com crescimento de 10x sem redesenho
- Mantém trilhas de auditoria para conformidade e aprendizado

### Princípios Fundamentais

| Princípio | Aplicação em Sara |
|-----------|------------------|
| **APIs sem estado** | Cada manipulador de webhook é independente; estado vive apenas no BD |
| **Orientado a eventos** | Todas as ações são disparadas por webhooks (abandono, mensagem, pagamento) |
| **Idempotência** | Constraints UNIQUE previnem processamento duplicado |
| **Degradação Graciosa** | Timeout OpenAI → mensagem fallback, sistema continua |
| **Segurança em Primeiro** | Verificação HMAC-SHA256, dados criptografados, compliance LGPD |
| **Observável** | Cada ação registrada com IDs de rastreamento para debug |
| **Consciente de Custos** | GPT-3.5 mais barato, caching estratégico |
| **Conformidade por Design** | Janela 24h, verificações opt-out, templates enforçados no código |

---

## 2. Stack Técnico

### Linguagem & Runtime

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **Linguagem** | TypeScript | Type-safety, melhor experiência do dev, detecta erros em build |
| **Runtime** | Node.js 18+ | Engine V8, suporte excelente a async/Promise, ecosistema rico |
| **Gerenciador de Pacotes** | npm | Padrão, incluso com Node, auditoria de segurança forte |

### Framework & HTTP

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **Framework HTTP** | Fastify | Leve, roteamento rápido, ecosistema de plugins excelente, validação de schema |
| **Servidor** | HTTP nativo Node.js | Via Fastify; nenhum servidor externo necessário |
| **Validação de Requisição** | Fastify schema + Zod | Validação first-schema, type checking em runtime |

### Banco de Dados & Persistência

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **BD Principal** | Supabase (PostgreSQL) | Gerenciado, compatível LGPD, autenticação nativa, webhooks, RLS |
| **Query Builder** | Knex.js | Simples, SQL legível, suporte a migrações |
| **Cache** | Redis | Para rate limiting, deduplicação, estado temporário |
| **BD Vetorial** | Pinecone | Para KB/FAQs (opcional, Fase 2) |

**Por que Supabase ao invés de Firebase/DynamoDB?**
- PostgreSQL é ACID-compliant (crítico para transações financeiras)
- LGPD-ready (servidores EU disponíveis)
- Chaves estrangeiras garantem integridade de dados
- Queries complexas para analytics
- Sem vendor lock-in

### IA & NLU

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **LLM** | OpenAI API (GPT-3.5-turbo) | Eficiente em custo, NLU comprovado, inferência rápida (~1s) |
| **Embeddings** | OpenAI API (text-embedding-3-small) | Para integração Pinecone (Fase 2) |
| **Biblioteca de Prompts** | Arquivos YAML | Versionáveis, fácil A/B testing |

### APIs Externas

| Serviço | Propósito | Integração |
|---------|----------|-----------|
| **Meta WhatsApp API** | Enviar/receber mensagens | REST (https://graph.instagram.com) |
| **Gateway de Pagamento** | Receber webhooks de pagamento | Webhooks assinados com HMAC |
| **OpenAI API** | Interpretação de mensagens | REST + streaming para contexto |

### DevOps & Infraestrutura

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **Containerização** | Docker | Ambiente consistente dev/prod, escalabilidade fácil |
| **Deployment** | Railway ou AWS Lightsail | Simples, economicamente viável, bom para MVP |
| **Banco de Dados** | Supabase Cloud | PostgreSQL gerenciado, sem burden operacional |
| **Redis** | Redis Cloud ou Railway | Gerenciado, escalabilidade fácil |
| **Secrets** | Variáveis de ambiente + Vault | Simples para MVP, migrar para HashiCorp Vault Fase 2 |
| **CI/CD** | GitHub Actions | Grátis, integrado, suficiente para MVP |

### Logging & Monitoramento

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **Logs** | Winston (formato JSON) | Logging estruturado, integração fácil com analytics |
| **APM** | Datadog ou Stack Grafana Self-hosted | Rastreamento em tempo real, insights de performance |
| **Error Tracking** | Sentry | Captura automática, source maps, release tracking |
| **Métricas** | Prometheus | Padrão, funciona com Grafana |

### Testes

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **Testes Unitários** | Jest | Padrão, rápido, snapshot testing |
| **Testes Integração** | Jest + Testcontainers | Spin up BD real para testes |
| **Testes API** | Supertest | Biblioteca de assertion HTTP |
| **Testes E2E** | Playwright | Para Fase 2 (dashboard) |
| **Teste de Carga** | k6 | Leve, scriptável, bom para webhooks |

### Desenvolvimento

| Componente | Escolha | Justificativa |
|-----------|---------|---------------|
| **Linter** | ESLint | Padrão, extensível |
| **Formatter** | Prettier | Opinionado, zero-config |
| **Type Checking** | TypeScript | Linguagem compilada, modo strict |
| **IDE** | VS Code | Padrão, suporte excelente a TS |

---

## 3. Arquitetura do Sistema

### Diagrama de Sistema de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SISTEMAS EXTERNOS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐          │
│  │ Serviço de   │      │ Meta WhatsApp │      │ OpenAI API  │          │
│  │ Pagamento    │      │ (API + WH)    │      │ (REST)      │          │
│  │ (Webhook)    │      │               │      │             │          │
│  └──────────────┘      └──────────────┘      └──────────────┘          │
│         │                     │                      │                   │
└─────────│─────────────────────│──────────────────────│───────────────────┘
          │                     │                      │
          │ (webhook/payment)   │ (webhook/messages)   │ (chamada REST)
          │                     │                      │
          ▼                     ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SISTEMA BACKEND SARA                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   SERVIDOR FASTIFY                               │  │
│  │  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────┐  │  │
│  │  │ Roteador de │   │ Manipulador  │   │ Gerenciador de      │  │  │
│  │  │ Webhook     │   │ de Mensagem  │   │ Conversa            │  │  │
│  │  └─────────────┘   └──────────────┘   └─────────────────────┘  │  │
│  │         │                │                       │              │  │
│  │         └────────────────┴───────────────────────┘              │  │
│  │                       │                                          │  │
│  │                       ▼                                          │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │            CAMADA DE LÓGICA DE NEGÓCIO                   │  │  │
│  │  │                                                            │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │  │
│  │  │  │ Serviço de   │  │ Serviço de   │  │ Serviço de  │    │  │  │
│  │  │  │ Abandono     │  │ Conversa     │  │ IA (OpenAI) │    │  │  │
│  │  │  └──────────────┘  └──────────────┘  └─────────────┘    │  │  │
│  │  │                                                            │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │  │
│  │  │  │ Serviço de   │  │ Detecção de  │  │ Serviço de  │    │  │  │
│  │  │  │ Conformidade │  │ Opt-out      │  │ Mensagem    │    │  │  │
│  │  │  └──────────────┘  └──────────────┘  └─────────────┘    │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                       │                                          │  │
│  │                       ▼                                          │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │              CAMADA DE ACESSO A DADOS                    │  │  │
│  │  │  (Repositórios, Construtores de Query)                  │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                            │                                             │
│                            ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │              CAMADA DE PERSISTÊNCIA & CACHE                     │  │
│  │                                                                  │  │
│  │  ┌──────────────┐              ┌──────────────────────────┐    │  │
│  │  │ Supabase     │              │ Redis (Cache)            │    │  │
│  │  │ PostgreSQL   │              │ - Deduplicação           │    │  │
│  │  │              │              │ - Rate limiting          │    │  │
│  │  │ - users      │              │ - Sessões de conversa    │    │  │
│  │  │ - abandonos  │              │ - Cache de config        │    │  │
│  │  │ - convs      │              └──────────────────────────┘    │  │
│  │  │ - messages   │                                               │  │
│  │  │ - webhooks   │              ┌──────────────────────────┐    │  │
│  │  │ - products   │              │ Pinecone (Opcional)      │    │  │
│  │  │ - keywords   │              │ - Vetores KB (Fase 2)    │    │  │
│  │  │              │              └──────────────────────────┘    │  │
│  │  └──────────────┘                                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │           SERVIÇOS DE SUPORTE (Assíncrono)                      │  │
│  │                                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │  │
│  │  │ Fila de      │  │ Serviço de   │  │ Logs & Traces        │  │  │
│  │  │ Tarefas      │  │ Email/Alerta │  │ (Winston + Sentry)   │  │  │
│  │  │ (Bull)       │  │              │  │                      │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        │ (logs)             │ (traces)           │ (métricas)
        └────────────────────┴────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │ Stack de Observabilidade       │
            │ - Datadog / Grafana            │
            │ - Prometheus                   │
            │ - Sentry                       │
            │ - Logs Winston (JSON)          │
            └────────────────────────────────┘
```

### Camadas do Sistema

#### 1. **Servidor de API (Fastify)**
- **Responsabilidade**: Rotear webhooks, validar requisições, autenticar
- **Sem estado**: Nenhum estado de sessão; todo estado no banco de dados
- **Pontos de entrada**: 6 endpoints (POST /webhook/abandonment, POST /webhook/messages, etc.)
- **Middleware**: Verificação HMAC, validação de requisição, IDs de correlação

#### 2. **Camada de Lógica de Negócio**
Separada em serviços coesos:
- **AbandonmentService**: Receber eventos, validar, criar conversas
- **ConversationService**: Gerenciar estado da conversa, threading
- **AIService**: Chamar OpenAI, engenharia de prompt, gestão de tokens
- **MessageService**: Enviar mensagens WhatsApp, lógica de retry
- **ComplianceService**: Enforçar janela 24h, templates, opt-out
- **OptOutDetection**: Detecção em duas camadas (determinística + IA)

#### 3. **Camada de Acesso a Dados**
- **Repositórios**: Usuário, Abandono, Conversa, Mensagem, Produto
- **Query Builder**: Knex.js para geração SQL segura
- **Transações**: Garantir atomicidade (ex: converter abandono + enviar mensagem)

#### 4. **Camada de Persistência**
- **BD Principal**: Supabase (PostgreSQL)
- **Cache**: Redis para dedup, rate limiting, cache de sessão
- **BD Vetorial**: Pinecone para KB (Fase 2)

#### 5. **Tarefas Assíncronas/Background**
- **Fila**: Bull (apoiada por Redis)
- **Tarefas**: Retry de mensagem, verificações de conformidade, agregação de métricas
- **Frequência**: Tempo real + periódico (ex: limpeza de webhooks antigos)

#### 6. **Observabilidade**
- **Logging Estruturado**: Winston (formato JSON)
- **APM**: Datadog ou Prometheus + Grafana
- **Rastreamento de Erros**: Sentry
- **Tracing**: IDs de correlação em cada requisição

---

## 4. Design de Componentes

### 4.1 Servidor de API (Fastify)

```typescript
// Configuração principal
const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' }
});

// Middleware
fastify.register(require('@fastify/cors'));
fastify.addHook('preHandler', middlewareIdCorrelacao); // Adicionar IDs de rastreamento
fastify.addHook('preHandler', middlewareVerificacaoHmac); // Verificar assinaturas
fastify.addHook('preHandler', validacaoRequisicao); // Validação de schema

// Rotas
fastify.post('/webhook/abandonment', manipuladorAbandono);
fastify.post('/webhook/messages', manipuladorMensagem);
fastify.post('/webhook/payment', manipuladorPagamento);
fastify.get('/webhook/messages', manipuladorValidacaoWebhook);
fastify.get('/conversations/:id', manipuladorDetalheConversa);
fastify.post('/conversations/:id/close', manipuladorEncerrarConversa);

// Health check
fastify.get('/health', async (req, res) => ({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString()
}));
```

**Decisões-Chave de Design:**
- **Manipuladores sem estado**: Cada endpoint é independente
- **Validação rápida**: Validação de schema no ponto de entrada
- **IDs de Correlação**: Cada requisição recebe ID único de rastreamento
- **Verificação HMAC**: Antes de qualquer processamento

### 4.2 ServiçoAbandono

**Responsabilidade**: Receber eventos de abandono, criar estado inicial, enviar template

```
eventoAbandono
    ↓
Validar payload (telefone, produtoId, linkPagamento)
    ↓
Verificar opt-out (usuario.opted_out = false)
    ↓
Buscar config de produto do cache ou BD
    ↓
Criar/atualizar usuário
    ↓
Criar registro de abandono
    ↓
Criar registro de conversa (status=awaiting_response)
    ↓
Enviar template via WhatsApp
    ↓
Logar evento
    ↓
Retornar 200 OK com verificação de idempotência
```

**Tratamento de Idempotência:**
```typescript
// Constraint UNIQUE em abandonments.external_id previne duplicatas
// Se duplicata chegar:
try {
  await criarAbandono(evento);
} catch (err) {
  if (err.code === '23505') { // Violação de unique
    return { status: 'already_processed', abandonmentId: evento.abandonmentId };
  }
  throw err;
}
```

### 4.3 ServiçoConversa

**Responsabilidade**: Gerenciar estado da conversa, threading, persistência de mensagens

**Gerenciamento de Estado:**
```
conversations.status transições:
awaiting_response → active (primeira mensagem do usuário)
active → closed (abandonada, recusada, convertida, erro_max_retries)
error → active (retry sucesso) ou closed (timeout)
```

**Operações-Chave:**
1. **Carregar conversa**: Encontrar por número de telefone, priorizar ACTIVE > ERROR > AWAITING
2. **Atualizar estado**: Marcar ACTIVE após primeira mensagem
3. **Rastrear metadata**: last_message_at, last_user_message_at, message_count
4. **Enforçar limites**: Máx 5 trocas, sem proativas após 24h (a menos que template)

### 4.4 ServiçoIA (Integração OpenAI)

**Responsabilidade**: Interpretar mensagens, gerar respostas, gerenciar custos

```typescript
class ServicoIA {
  async interpretarMensagem(
    historicoConversa: Mensagem[],
    mensagemUsuario: string,
    contexto: { produtoId, valor_abandonado }
  ): Promise<{
    intencao: string; // 'price_question', 'objection', 'confirmation', etc.
    sentimento: string; // 'positive', 'neutral', 'negative'
    oferecerDesconto: boolean;
    resposta: string;
    tokens_usados: number;
  }> {
    // System prompt enforça conformidade
    const instructionSistema = `
      Você é Sara, assistente amigável de recuperação de carrinho.
      - Seja empático, não pushy
      - Respeite preferências do usuário
      - Se usuário disser "parar", "remover", etc → sugerir confirmação opt-out
      - Preferência de link: original primeiro, desconto só se objeção
      - Máximo ${COMPRIMENTO_MAXIMO_MENSAGEM} caracteres
    `;

    // Contexto do BD
    const mensagens = historicoConversa.map(m => ({
      role: m.de_quem === 'sara' ? 'assistant' : 'user',
      content: m.texto_mensagem
    }));

    // Chamar OpenAI com timeout
    const resultado = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        system: instructionSistema,
        messages: [...mensagens, { role: 'user', content: mensagemUsuario }],
        temperature: 0.7,
        max_tokens: 150
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new ErroTimeout()), 5000)
      )
    ]);

    // Fallback se timeout
    if (erro instanceof ErroTimeout) {
      return {
        intencao: 'desconhecido',
        resposta: 'Um momento enquanto avalio sua solicitação...',
        tokens_usados: 0
      };
    }

    return parseEEstruturar(resultado);
  }
}
```

**Otimização de Custo:**
- Usar GPT-3.5-turbo (~$0,0015/1K tokens vs GPT-4 ~$0,03/1K tokens)
- Cache de FAQs de produtos em Pinecone reduz prompt (Fase 2)
- Budget de tokens: ~100 tokens por mensagem (~$0,00015 por mensagem)
- 1000 mensagens/dia → ~$0,15/dia → ~$4,50/mês

### 4.5 DetecçãoOptOut (Duas Camadas)

**Camada 1: Determinística (Sempre Primeiro)**
```typescript
// Rápida, sem custo de IA
const PALAVRAS_CHAVE_OPTOUT = ['parar', 'remover', 'cancelar', 'sair', 'stop', ...];

function detectarOptOutDeterministico(mensagem: string): boolean {
  const normalizada = mensagem.toLowerCase().trim();
  return PALAVRAS_CHAVE_OPTOUT.some(palavra => normalizada.includes(palavra));
}
```

**Camada 2: OpenAI (Fallback)**
```typescript
async function detectarOptOutIA(
  mensagem: string,
  historicoConversa: Mensagem[]
): Promise<boolean> {
  // Chamada só se determinística retorna false
  const resposta = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    system: 'Detecte se usuário quer fazer opt-out. Retorne JSON: { opted_out: boolean }',
    messages: [{ role: 'user', content: mensagem }],
    temperature: 0.0
  });

  const parseado = JSON.parse(resposta.choices[0].message.content);
  return parseado.opted_out;
}
```

**Enforcement:**
```typescript
// Antes de QUALQUER envio de mensagem:
const usuario = await repositorioUsuario.buscar(numeroTelefone);
if (usuario.opted_out) {
  return { status: 'usuario_optou_sair', motivo: 'conformidade_lgpd' };
}
```

---

## 5. Fluxo de Dados

### 5.1 Fluxo Completo Abandono → Conversão

```
[1] EVENTO DE ABANDONO
    └─ Webhook do sistema de pagamento: POST /webhook/abandonment
       { userId, name, phone, productId, paymentLink, abandonmentId, value }

[2] VALIDAÇÃO
    ├─ Verificação de assinatura HMAC
    ├─ Formato de número de telefone (E.164)
    ├─ Campos obrigatórios presentes
    └─ Não optou sair

[3] OPERAÇÕES DE BANCO DE DADOS (Atômicas)
    ├─ INSERT/UPDATE users
    ├─ INSERT abandonos (UNIQUE external_id)
    ├─ INSERT conversas (UNIQUE abandonment_id)
    └─ INSERT webhooks_log (para auditoria)

[4] PRIMEIRA MENSAGEM
    ├─ Buscar template da config
    ├─ Personalizar (nome, produto)
    └─ Chamar Meta WhatsApp API: POST /messages
       Resposta: { message_id: "wamid.xxx" }

[5] LOG & RETORNO
    ├─ INSERT messages (from="sara", type="template")
    ├─ Update conversas (status="awaiting_response")
    └─ Retornar 200 OK { abandonmentId, conversationId }

───────────────────────────────────────────────────────────────────

[6] USUÁRIO RESPONDE (horas/dias depois)
    └─ Webhook da Meta: POST /webhook/messages
       { from: "+5511999...", text: "Oi!", timestamp, messageId }

[7] PROCESSAMENTO DE MENSAGEM
    ├─ Verificação de assinatura HMAC
    ├─ Verificação de dedup: whatsapp_message_id UNIQUE
    ├─ Encontrar conversa (por número de telefone)
    ├─ Verificar janela (last_user_message_at + 24h)
    └─ Verificar opt-out

[8] DETECÇÃO DE OPT-OUT
    ├─ Camada 1: Palavras-chave determinísticas → BLOQUEIO IMEDIATO
    └─ Camada 2: Interpretação OpenAI → se sem match

    Se optou sair:
    ├─ INSERT messages (from="user")
    ├─ UPDATE users (opted_out=true, opted_out_at=now())
    ├─ UPDATE conversas (status="closed")
    ├─ UPDATE abandonos (status="declined")
    └─ Enviar mensagem de despedida + SAIR

[9] SE NÃO OPTOU SAIR: INTERPRETAÇÃO DE IA
    ├─ Carregar últimas 10 mensagens (contexto de conversa)
    ├─ Chamar OpenAI com system prompt
    ├─ Processar intenção, sentimento, recomendação
    ├─ Fallback se timeout (usar resposta genérica)
    └─ Estimar tokens

[10] GERAÇÃO DE RESPOSTA & LINKS
    ├─ Resposta base de OpenAI
    ├─ Verificar se desconto deve ser oferecido:
    │  ├─ Intenção menciona preço? → Oferecer desconto
    │  ├─ Valor > R$500? → Oferecer desconto
    │  └─ Ofertas anteriores < 3? → Oferecer desconto
    ├─ Injetar links na resposta:
    │  ├─ Link 1: Original (sempre)
    │  └─ Link 2: Com desconto (condicional)
    └─ Validar comprimento da resposta

[11] ENVIAR & PERSISTIR
    ├─ Chamar Meta WhatsApp API: POST /messages
    │  Requisição: { to, type: "text", text: response }
    │  Resposta: { message_id }
    ├─ INSERT messages (from="sara", text=response)
    ├─ UPDATE conversas:
    │  ├─ status → "active"
    │  ├─ last_message_at = now()
    │  ├─ message_count++
    └─ Retornar 200 OK

───────────────────────────────────────────────────────────────────

[12] CONFIRMAÇÃO DE PAGAMENTO (do gateway)
    └─ Webhook do sistema de pagamento: POST /webhook/payment
       { abandonmentId, status: "paid", amount, paymentId, linkType }

[13] VALIDAÇÃO DE PAGAMENTO
    ├─ Verificação de assinatura HMAC
    ├─ Verificação de dedup: payment_id UNIQUE
    ├─ Encontrar abandono
    ├─ Validar montante corresponde
    └─ Verificar se ainda não foi convertido

[14] CONVERSÃO (Atômica)
    ├─ UPDATE abandonos:
    │  ├─ status = "converted"
    │  ├─ payment_id = do webhook
    │  ├─ conversion_link = original|discounted
    │  └─ converted_at = now()
    ├─ UPDATE conversas (status="closed")
    ├─ INSERT messages (from="sara", text="Obrigado!")
    └─ Logar evento de conversão

[15] NOTIFICAR USUÁRIO
    ├─ Enviar mensagem de confirmação
    └─ Opcional: Enviar recibo por email (Fase 2)

[16] RETORNAR
    └─ Retornar 200 OK { status: "converted", conversationId }
```

### 5.2 Diagrama de Sequência Temporal

```
Sistema de Pagamento  Webhook Meta      Backend Sara         Banco de Dados
     │                    │                 │                      │
     ├─ abandonment ───────────────────────→│                      │
     │               (webhook POST)         │                      │
     │                                      ├─ validate ───────────→│
     │                                      ├─ create user ────────→│
     │                                      ├─ create abandon ─────→│
     │                                      ├─ create conv ────────→│
     │                                      ←─ return IDs ────────│
     │                                      │                      │
     │                                      ├─ send template       │
     │                                      │  (WhatsApp API)      │
     │                                      │                      │
     │                                      ├─ persist msg ────────→│
     │                                      ←─ 200 OK ────────────│
     │                                      │                      │
     │                           [Usuário lê msg]                  │
     │                                      │                      │
     │                   ├─ user replies ───→│                      │
     │                   │ (webhook POST)    │                      │
     │                   │                   ├─ dedup check ────────→│
     │                   │                   ├─ load context ──────→│
     │                   │                   ←─ history ──────────│
     │                   │                   │                      │
     │                   │                   ├─ OpenAI call        │
     │                   │                   │  (2-5s)             │
     │                   │                   │                      │
     │                   │                   ├─ send response      │
     │                   │                   │ (WhatsApp API)      │
     │                   │                   │                      │
     │                   │                   ├─ persist msgs ──────→│
     │                   │                   ←─ 200 OK ───────────│
     │                   │                   │                      │
     │                   │          [mais trocas...]               │
     │                   │                   │                      │
     ├─ payment ────────────────────────────→│                      │
     │  (webhook POST)                       ├─ dedup check ────────→│
     │                                       ├─ find aband ────────→│
     │                                       ←─ record ───────────│
     │                                       │                      │
     │                                       ├─ update status ─────→│
     │                                       │  (converted)        │
     │                                       ├─ send confirm ──────→│
     │                                       │  message            │
     │                                       ├─ persist ──────────→│
     │                                       ←─ 200 OK ──────────│
     │                                       │                      │
```

---

## 6. Design de APIs

### 6.1 Especificações de Endpoints

Todos os endpoints usam **application/json** e retornam respostas estruturadas.

#### **POST /webhook/abandonment**

Recebe evento de abandono do sistema de pagamento.

**Requisição:**
```json
{
  "userId": "customer_123",
  "name": "João Silva",
  "phone": "+5511999999999",
  "productId": "prod_456",
  "paymentLink": "https://pay.example.com/cart/abc123",
  "abandonmentId": "abn_789",
  "timestamp": "2026-02-05T10:30:00Z",
  "value": 250.00
}
```

**Validações:**
- `phone`: Formato E.164 (+55XXXXXXX)
- `abandonmentId`: Único (constraint UNIQUE previne reprocessamento)
- `value`: Decimal positivo
- Todos os campos obrigatórios exceto `timestamp` (servidor define padrão)

**Resposta (200 OK):**
```json
{
  "status": "received",
  "abandonmentId": "abn_789",
  "conversationId": "conv_123"
}
```

**Resposta (200 OK) – Duplicata:**
```json
{
  "status": "already_processed",
  "abandonmentId": "abn_789",
  "conversationId": "conv_123"
}
```

**Erros:**
- `400 Bad Request`: Formato de telefone inválido, campo obrigatório faltando
- `403 Forbidden`: Assinatura HMAC inválida
- `500 Internal Server Error`: Falha em BD ou API WhatsApp (registrada, usuário deve retry)

**Verificação HMAC:**
```
Header: X-Hub-Signature-256: sha256=abcd1234...
Computação: HMAC-SHA256(app_secret, raw_body_bytes)
```

---

#### **POST /webhook/messages** (Meta → Sara)

Recebe mensagens de usuário do WhatsApp.

**Requisição:**
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
              "phone_number_id": "PHONE_ID",
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

**Resposta (200 OK):**
- Corpo vazio (reconhecimento instantâneo)
- Processamento acontece de forma assíncrona (fila de tarefas)

**Fluxo Interno:**
1. Validar assinatura (HMAC-SHA256)
2. Verificação de dedup (whatsapp_message_id UNIQUE)
3. Encontrar conversa (telefone → conversations.user_id)
4. Verificar janela (last_user_message_at + 24h)
5. Detectar opt-out (determinístico + IA)
6. Se opt-out: marcar usuario opted_out=true, enviar despedida, fechar conversa
7. Se ativo: chamar OpenAI, gerar resposta, enviar via WhatsApp
8. Persistir mensagens no BD

---

#### **GET /webhook/messages** (Validação Meta)

Verificação da Meta durante setup do webhook.

**Parâmetros de Query:**
- `hub.mode`: "subscribe"
- `hub.challenge`: Token aleatório da Meta
- `hub.verify_token`: Deve corresponder a `WHATSAPP_VERIFY_TOKEN`

**Resposta (200 OK):**
- Corpo: valor `hub.challenge` (como texto simples)

**Resposta (403 Forbidden):**
- Se token não corresponde
- Corpo: `{ "error": "Invalid verify token" }`

---

#### **POST /webhook/payment** (Gateway de Pagamento → Sara)

Confirma conclusão de pagamento.

**Requisição:**
```json
{
  "abandonmentId": "abn_789",
  "paymentId": "pay_123",
  "status": "paid",
  "amount": 250.00,
  "productId": "prod_456",
  "linkType": "original",
  "timestamp": "2026-02-05T10:45:00Z"
}
```

**Validações:**
- `paymentId`: Único (previne double-charging)
- `amount`: Corresponde ao valor do abandono
- `status`: Processar apenas se "paid"

**Resposta (200 OK):**
```json
{
  "status": "converted",
  "conversationId": "conv_123",
  "abandonmentId": "abn_789"
}
```

**Resposta (200 OK) – Duplicata:**
```json
{
  "status": "already_processed",
  "conversationId": "conv_123"
}
```

**Fluxo Interno:**
1. Validar assinatura (HMAC ou secret header)
2. Verificação de dedup (payment_id UNIQUE)
3. Encontrar abandono
4. Atualizar status=converted
5. Enviar mensagem de confirmação
6. Logar evento de conversão
7. Retornar 200 OK

---

#### **GET /conversations/:conversationId** (Admin/Interno)

Recupera histórico completo de conversa.

**Parâmetros de Query:**
- Nenhum (mas poderia adicionar `?limit=50`, `?offset=0` para paginação)

**Resposta (200 OK):**
```json
{
  "conversationId": "conv_123",
  "abandonmentId": "abn_789",
  "userId": "user_456",
  "userPhone": "+5511999999999",
  "userName": "João",
  "status": "active",
  "productId": "prod_456",
  "productValue": 250.00,
  "createdAt": "2026-02-05T10:30:00Z",
  "lastMessageAt": "2026-02-05T10:45:00Z",
  "messages": [
    {
      "id": "msg_1",
      "from": "sara",
      "text": "Olá João! Vi que seu carrinho...",
      "timestamp": "2026-02-05T10:30:05Z"
    },
    {
      "id": "msg_2",
      "from": "user",
      "text": "Oi, esqueci de comprar!",
      "timestamp": "2026-02-05T10:31:00Z"
    }
  ]
}
```

---

#### **POST /conversations/:conversationId/close** (Admin)

Fecha conversa manualmente (para testes/admin).

**Corpo da Requisição:** (opcional)
```json
{
  "reason": "manual_close"
}
```

**Resposta (200 OK):**
```json
{
  "status": "closed",
  "conversationId": "conv_123"
}
```

---

### 6.2 Formato de Resposta de Erro

Todos os erros seguem formato padrão:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Número de telefone deve estar no formato E.164",
    "details": {
      "field": "phone",
      "value": "11999999999"
    },
    "timestamp": "2026-02-05T10:30:00Z",
    "traceId": "12345-67890"
  }
}
```

**Códigos de Erro Comuns:**
- `VALIDATION_ERROR` (400)
- `HMAC_VERIFICATION_FAILED` (403)
- `USER_OPTED_OUT` (400)
- `CONVERSATION_NOT_FOUND` (404)
- `WEBHOOK_ALREADY_PROCESSED` (200 com status "already_processed")
- `OPENAI_TIMEOUT` (500 com fallback message enviada)
- `WHATSAPP_API_ERROR` (500 com retry enfileirado)
- `DATABASE_ERROR` (500)

---

## 7. Arquitetura do Banco de Dados

### 7.1 Schema (7 Tabelas)

Todas usam PostgreSQL com hospedagem Supabase.

#### **users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  opted_out BOOLEAN DEFAULT FALSE,
  opted_out_at TIMESTAMP,
  opted_out_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_opted_out ON users(opted_out);
```

#### **product_offers**
```sql
CREATE TABLE product_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(255) UNIQUE NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  payment_link VARCHAR(1024) NOT NULL,
  discount_link VARCHAR(1024),
  discount_percent DECIMAL(5, 2),
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
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  external_id VARCHAR(255) UNIQUE NOT NULL,
  product_id VARCHAR(255) NOT NULL REFERENCES product_offers(product_id),
  value DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'initiated',
  -- iniciado | ativo | convertido | recusado
  conversation_id UUID REFERENCES conversations(id),
  converted_at TIMESTAMP,
  conversion_link VARCHAR(20),
  -- 'original' | 'discounted'
  payment_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_abandonments_user_id ON abandonments(user_id);
CREATE INDEX idx_abandonments_external_id ON abandonments(external_id);
CREATE INDEX idx_abandonments_status ON abandonments(status);
CREATE INDEX idx_abandonments_payment_id ON abandonments(payment_id);
```

#### **conversations**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abandonment_id UUID REFERENCES abandonments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'awaiting_response',
  -- awaiting_response | active | closed | error
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  last_user_message_at TIMESTAMP,
  -- Para cálculo da janela de 24h da Meta
  followup_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_conversations_abandonment ON conversations(abandonment_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
```

#### **messages**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  from_sender VARCHAR(50) NOT NULL,
  -- 'sara' | 'user'
  message_text TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  -- 'text' | 'template'
  whatsapp_message_id VARCHAR(255) UNIQUE,
  -- Para dedup de inbound (pode ser NULL para outbound pré-envio)
  openai_response_id VARCHAR(255),
  openai_tokens_used INTEGER,
  intent VARCHAR(100),
  -- 'price_question' | 'objection' | 'confirmation' | 'opt_out' | 'unclear'
  metadata JSONB DEFAULT '{}',
  -- { links_offered: [...], sentiment: '...', suggested_action: '...' }
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

#### **webhooks_log**
```sql
CREATE TABLE webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type VARCHAR(50) NOT NULL,
  -- 'abandonment' | 'whatsapp_message' | 'payment'
  external_id VARCHAR(255),
  payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT TRUE,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_webhooks_log_type_external ON webhooks_log(webhook_type, external_id);
CREATE INDEX idx_webhooks_log_type ON webhooks_log(webhook_type);
```

#### **opt_out_keywords**
```sql
CREATE TABLE opt_out_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed inicial
INSERT INTO opt_out_keywords (keyword) VALUES
  ('parar'), ('remover'), ('cancelar'), ('sair'), ('stop'),
  ('não quero'), ('me tire'), ('excluir'), ('desinscrever'), ('unsubscribe');
```

### 7.2 Padrões de Query & Performance

#### **Encontrar conversa ativa por telefone (caminho quente)**
```sql
SELECT c.* FROM conversations c
JOIN users u ON c.user_id = u.id
WHERE u.phone_number = $1
  AND c.status IN ('active', 'awaiting_response', 'error')
ORDER BY
  CASE c.status
    WHEN 'active' THEN 1
    WHEN 'error' THEN 2
    WHEN 'awaiting_response' THEN 3
  END,
  c.created_at DESC
LIMIT 1;
```
**Índice**: `idx_users_phone`, `idx_conversations_status`

#### **Carregar histórico de conversa (para contexto de IA)**
```sql
SELECT * FROM messages
WHERE conversation_id = $1
ORDER BY created_at DESC
LIMIT 50;
```
**Índice**: `idx_messages_conversation_id`

#### **Verificar opt-out antes de enviar**
```sql
SELECT opted_out FROM users WHERE phone_number = $1;
```
**Índice**: `idx_users_phone`, `idx_users_opted_out`

#### **Obter abandonos ativos (para analytics)**
```sql
SELECT a.* FROM abandonments a
WHERE a.status IN ('initiated', 'active')
  AND a.created_at > NOW() - INTERVAL '7 days'
ORDER BY a.created_at DESC;
```
**Índice**: `idx_abandonments_status`

### 7.3 Integridade de Dados & Constraints

| Constraint | Propósito | Implementação |
|-----------|----------|---------------|
| **Idempotência (abandono)** | Prevenir eventos duplicados | `external_id` UNIQUE |
| **Idempotência (pagamento)** | Prevenir double-charge | `payment_id` UNIQUE |
| **Idempotência (mensagem)** | Prevenir dupes de mensagem | `whatsapp_message_id` UNIQUE |
| **Uma conversa por abandono** | Evitar conversas órfãs | `abandonment_id` UNIQUE em conversations |
| **Dedup de webhook** | Evitar reprocessamento | `(webhook_type, external_id)` UNIQUE |
| **Chaves estrangeiras** | Integridade referencial | ON DELETE CASCADE |

---

## 8. Deployment & Infraestrutura

### 8.1 Arquitetura de Deployment

```
┌────────────────────────────────────────────────────────────┐
│                    TIERS DE DEPLOYMENT                     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Desenvolvimento│  │   Staging    │  │ Produção     │     │
│  │  (Railway)  │  │  (Railway)   │  │  (Railway)   │     │
│  │             │  │              │  │              │     │
│  │ - git push  │  │ - PR merge   │  │ - tag push   │     │
│  │ - auto deploy│  │ - auto test  │  │ - auto build │     │
│  │ - 1x Node   │  │ - 1-2x Node  │  │ - 2-4x Node  │     │
│  │ - BD comum  │  │ - BD comum   │  │ - BD dedicado│     │
│  │ - Redis    │  │ - Redis      │  │ - Redis      │     │
│  │   comum     │  │   dedicado   │  │   dedicado   │     │
│  └─────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
└────────────────────────────────────────────────────────────┘
         │                │                    │
         │                │                    │
    GitHub Actions:      GitHub Actions:     GitHub Actions:
    - Teste              - Teste             - Teste
    - Lint               - Lint              - Lint
    - Build              - Build             - Build
    - Deploy             - Deploy            - Deploy
                                             - Smoke tests
                                             - Alerta se erros
```

### 8.2 Infraestrutura como Código (IaC)

**Ferramentas**: Docker + Railway + Terraform (opcional)

**Checklist de Produção:**
- [ ] Variáveis de ambiente (.env) seguras em secrets Railway
- [ ] Backups de banco de dados habilitados (Supabase auto-backup)
- [ ] Alertas de monitoramento configurados (Datadog/Sentry)
- [ ] Rastreamento de erro ativo (Sentry)
- [ ] Rate limiting configurado (Redis)
- [ ] CORS configurado para webhooks da Meta
- [ ] SSL/TLS habilitado (automático com Railway)
- [ ] Teste de carga concluído (k6)

### 8.3 Containerização (Docker)

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Instalar deps de produção apenas
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copiar fonte
COPY src ./src
COPY tsconfig.json ./

# Build TS
RUN npm run build

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Iniciar
CMD ["node", "dist/src/index.js"]
```

**Build & Push:**
```bash
docker build -t sara:latest .
docker push registry.railway.app/sara:latest
```

---

## 9. Escalabilidade & Performance

### 9.1 Escalabilidade Horizontal

**Arquitetura sem estado por design:**
- Cada instância Node manipula webhooks independentemente
- Estado vive apenas no BD e Redis
- Load balancing via Railway (automático)

**Estratégia de Scaling:**

| Métrica | Limiar | Ação |
|--------|--------|------|
| **CPU** | > 70% por 5 min | +1 instância |
| **Memória** | > 80% por 5 min | +1 instância |
| **Profundidade da fila** | > 100 tarefas | +1 instância |
| **Conexões BD** | > 90% do pool | Alerta apenas (não auto-scale BD) |

**Scaling de Banco de Dados:**
- Supabase gerencia scaling (serviço gerenciado)
- Monitorar performance de queries (< 500ms)
- Adicionar índices se queries lentas detectadas
- Cache dados frequentemente acessados em Redis

**Scaling de Redis:**
- Começar com 512MB (cache + fila)
- Escalar para 2GB se fila cresce > 10k tarefas

### 9.2 Targets de Performance

| Target | Métrica | SLA |
|--------|--------|-----|
| **Latência de 1ª mensagem** | Evento → envio WhatsApp | < 2 segundos |
| **Processamento de mensagem** | Inbound → OpenAI → Outbound | 2-7 segundos |
| **Query de BD** | Busca de conversa | < 100ms |
| **OpenAI API** | Requisição → resposta | < 5 segundos (com fallback) |
| **WhatsApp API** | Envio → ack | < 1 segundo |
| **Ack de webhook** | Receber → 200 OK | < 100ms |

### 9.3 Estratégia de Caching

| Dados | Local de Cache | TTL | Justificativa |
|-------|----------------|-----|---------------|
| **Ofertas de produto** | Redis | 1 hora | Raramente mudam |
| **Palavras-chave opt-out** | Redis | 24 horas | Dados de referência estáticos |
| **Contexto de conversa** | Nenhum (carregamento quente do BD) | - | Precisa estado atual |
| **Status opt-out do usuário** | Memória (por requisição) | Requisição | Verificado antes de cada envio |
| **Dedup de mensagem** | Constraint BD UNIQUE | - | Fonte de verdade |

---

## 10. Arquitetura de Segurança

### 10.1 Autenticação & Autorização

**Para Webhooks** (Entrada):
- Assinatura HMAC-SHA256 no corpo da requisição
- Assinatura em header `X-Hub-Signature-256`
- Secret armazenado em variável de ambiente
- Verificação acontece em middleware

**Para Endpoints Admin**:
- (Fase 2) API key ou token JWT
- Armazenado em header seguro ou Authorization bearer

### 10.2 Proteção de Dados

| Camada | Método | Implementação |
|--------|--------|---------------|
| **Transporte** | TLS 1.3 | HTTPS apenas (enforçado por Railway) |
| **Em repouso** | Criptografia AES-256 | Criptografia Supabase por padrão |
| **Em memória** | Secrets nunca logados | Apenas variáveis de ambiente |
| **Trânsito (BD)** | Conexões SSL | SSL Supabase (automático) |
| **Trânsito (Cache)** | SSL para Redis | Redis Cloud SSL (automático) |

### 10.3 Conformidade

| Regulação | Requisito | Implementação |
|-----------|----------|---------------|
| **LGPD** | Minimização de dados | Armazenar apenas: nome, telefone, conversa |
| **LGPD** | Direito de deleção | `DELETE FROM users WHERE opted_out=true` (Fase 2) |
| **LGPD** | Portabilidade de dados | Exportar conversas (Fase 2) |
| **WhatsApp ToS** | Aprovação de template | ID de template hardcoded, sem mudanças sem re-aprovação |
| **WhatsApp ToS** | Janela de 24h | Código enforça check `last_user_message_at + 24h` |
| **WhatsApp ToS** | Opt-out | Detecção em duas camadas (palavras-chave + IA) |

### 10.4 Validação de Entrada

```typescript
// Toda entrada de usuário validada no ponto de entrada
const schemaPedidoAbandono = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/), // E.164
  name: z.string().min(1).max(255),
  productId: z.string().min(1).max(255),
  abandonmentId: z.string().min(1).max(255).unique(),
  value: z.number().positive()
});

// Banco de dados também enforça constraints de tipo
```

---

## 11. Estratégia de Testes

### 11.1 Pirâmide de Testes

```
          ▲
         /│\
        / │ \  Testes E2E (Playwright)
       /  │  \ - Jornada completa (dashboard + API)
      /   │   \ - Smoke tests (Fase 2)
     ├─────────┤
    / │       │ \  Testes Integração (Jest + Testcontainers)
   /  │       │  \ - Manipulação de webhook
  /   │       │   \ - Transações BD
 /    │       │    \ - Mock OpenAI
├──────────────────┤
│      │   │       │  Testes Unitários (Jest)
│ Svc  │ AI│ BD    │  - Lógica de serviço
│ API  │Svc│ Repo  │  - Utilitários
│      │    │      │  - Validação
└──────────────────┘
```

### 11.2 Testes Unitários

**Target de Cobertura**: > 80%

**Áreas-Chave para Testar:**
- DetecçãoOptOut (determinística + IA)
- ServiçoIA (construção de prompt, contagem de tokens)
- ServiçoConformidade (janela 24h, enforcement de template)
- Métodos de repositório (queries, transações)

**Exemplo:**
```typescript
describe('DetecçãoOptOut', () => {
  describe('deterministica', () => {
    it('deve detectar palavra-chave "parar"', () => {
      expect(detectarOptOutDeterministico('Parar!')).toBe(true);
    });

    it('deve ser insensível a maiúsculas', () => {
      expect(detectarOptOutDeterministico('REMOVER')).toBe(true);
    });
  });

  describe('fallback de IA', () => {
    it('deve detectar "não tenho interesse" via OpenAI', async () => {
      const mock = mockOpenAI({ opted_out: true });
      const resultado = await detectarOptOutIA('não tenho interesse', []);
      expect(resultado).toBe(true);
    });
  });
});
```

### 11.3 Testes de Integração

**Setup**: Testcontainers para PostgreSQL + Redis

**Cenários-Chave:**
1. **Fluxo de abandono**: Evento → BD → Mock WhatsApp
2. **Processamento de mensagem**: Inbound → Mock OpenAI → Outbound
3. **Detecção de opt-out**: Determinística → fallback
4. **Idempotência**: Evento duplicado → already_processed
5. **Transições de estado**: Transições de status de conversa

**Exemplo:**
```typescript
describe('Serviço de Abandono', () => {
  beforeAll(async () => {
    db = await iniciarPostgres();
    redis = await iniciarRedis();
  });

  it('deve criar abandono e enviar template', async () => {
    const evento = { phone: '+5511999...', name: 'João', ... };
    const resultado = await servicoAbandono.manipular(evento);

    expect(resultado.status).toBe('received');
    expect(whatsappMock.send).toHaveBeenCalled();

    const armazenado = await db.query('SELECT * FROM abandonments WHERE external_id = ?', [evento.abandonmentId]);
    expect(armazenado).toHaveLength(1);
  });
});
```

### 11.4 Teste de Carga

**Ferramenta**: k6

**Cenários:**
1. **Carga sustentada**: 100 req/s por 5 min
2. **Teste de spike**: Ramp para 500 req/s em 10s
3. **Teste de soak**: 50 req/s por 1 hora

**Script:**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 100 },  // ramp up
    { duration: '5m', target: 100 },  // ficar
    { duration: '1m', target: 0 }     // ramp down
  ]
};

export default function () {
  const payload = {
    phone: '+5511999999999',
    name: 'João',
    productId: 'prod_123',
    abandonmentId: `abn_${Date.now()}_${Math.random()}`
  };

  const res = http.post('http://localhost:3000/webhook/abandonment', JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(res, {
    'status é 200': (r) => r.status === 200,
    'latência < 2s': (r) => r.timings.duration < 2000
  });
}
```

---

## 12. Observabilidade & Monitoramento

### 12.1 Estratégia de Logging

**Ferramenta**: Winston (formato JSON)

**Níveis de Log** (por severidade):
- `error`: Exceções, falhas de API (alerta se taxa > 0,1%)
- `warn`: Timeouts, retries, problemas não críticos
- `info`: Webhook recebido, mensagem enviada, mudanças de estado
- `debug`: Queries BD, chamadas OpenAI (desabilitado em prod por padrão)

**Exemplo de Logging Estruturado:**
```typescript
logger.info('message_sent', {
  conversationId: conv.id,
  messageId: respostaWhatsapp.message_id,
  from: 'sara',
  tokenCount: respostaIA.tokens,
  latency: Date.now() - inicio,
  traceId: req.traceId
});
```

**Retenção de Logs**: 30 dias (Supabase/Datadog)

### 12.2 Métricas & APM

**Ferramentas**: Prometheus + Grafana (ou Datadog)

**Métricas-Chave:**

| Métrica | Tipo | Limiar de Alerta |
|--------|------|------------------|
| `api.requests.total` | Counter | - |
| `api.requests.duration` | Histogram | p95 > 2s |
| `api.errors.total` | Counter | Taxa > 0,1% |
| `openai.api.calls` | Counter | Rastreamento de custo |
| `openai.api.latency` | Histogram | p95 > 5s |
| `whatsapp.api.latency` | Histogram | p95 > 1s |
| `db.query.duration` | Histogram | p95 > 500ms |
| `conversations.active` | Gauge | - (dashboard) |
| `webhooks.processed` | Counter | - |
| `opt_outs.total` | Counter | - |

**Dashboard (Grafana):**
```
┌──────────────────────────────────────────────────┐
│ Dashboard de Monitoramento Sara                  │
├──────────────────────────────────────────────────┤
│                                                  │
│ Uptime: 99.7% │ Req/s: 42 │ Erros: 0.02%       │
│                                                  │
│ ┌─ Latências ──────┐ ┌─ Throughput ──────────┐ │
│ │ API p95: 1.2s    │ │ Abandono: 150/dia     │ │
│ │ OpenAI p95: 3.1s │ │ Convertido: 8/dia     │ │
│ │ BD p95: 250ms    │ │ Taxa Conversão: 5.3%  │ │
│ └──────────────────┘ └──────────────────────┘ │
│                                                  │
│ ┌─ Erros ──────────┐ ┌─ Custo ───────────────┐ │
│ │ WhatsApp: 2      │ │ OpenAI: $4.23/dia     │ │
│ │ OpenAI: 1       │ │ Infraestrutura: ...   │ │
│ │ BD: 0           │ │                       │ │
│ └──────────────────┘ └──────────────────────┘ │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 12.3 Rastreamento de Erro

**Ferramenta**: Sentry

**Setup:**
```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true })
  ]
});

// Capturar erros
fastify.setErrorHandler((error, req, res) => {
  Sentry.captureException(error, { req });
  res.status(500).send({ error: error.message });
});
```

**Alertas** (se taxa de erro > 0,1%):
- Notificação Slack para #sara-alerts
- PagerDuty se crítico (email para time)

---

## 13. Tratamento de Erros & Recuperação

### 13.1 Classificação de Erro

| Tipo de Erro | Causa | Recuperação |
|-------------|-------|------------|
| **Erro de Validação** | Entrada inválida (formato telefone, etc.) | Rejeitar com 400, logar para análise |
| **Falha de Verificação Assinatura** | HMAC não corresponde ou ataque replay | Rejeitar com 403, alerta de segurança |
| **Usuário Optou Sair** | Usuário pediu opt-out anteriormente | Rejeitar com 200 OK silencioso (conformidade) |
| **Timeout de OpenAI** | LLM lento ou indisponível | Mensagem fallback, continuar |
| **Erro de OpenAI** | Erro de API (rate limit, etc.) | Mensagem fallback, enfileirar para retry |
| **Erro de API WhatsApp** | Meta API down ou rate limited | Enfileirar mensagem para retry (Bull) |
| **Erro de Banco de Dados** | Conexão perdida, timeout de query | Retry de transação, alerta ops |
| **Duplicata de Webhook** | Mesmo evento processado duas vezes | Detectar via constraint UNIQUE, resposta idempotente |

### 13.2 Estratégias de Retry

**OpenAI (em timeout):**
- Mensagem fallback imediata enviada ao usuário
- Sem retry (tentativa única apenas)

**WhatsApp API (em falha):**
- Backoff exponencial: 1s, 2s, 4s, 8s
- Máx 3 retries (24s total)
- Se todos falham: logar alerta, review manual

**Banco de Dados (em erro de conexão):**
- Padrão circuit breaker (falha rápida após 3 erros)
- Retry após espera de 5 segundos
- Alerta ops se persistente

**Processamento de Webhook (geral):**
- Sempre retornar 200 OK imediatamente (Meta espera resposta rápida)
- Processar assincronamente em tarefa de background
- Se erro: logar, armazenar em webhooks_log, review manual

---

## 14. Padrões de Desenvolvimento

### 14.1 Estrutura de Projeto

```
sara/
├── src/
│   ├── index.ts                    # Ponto de entrada
│   ├── server.ts                   # Setup Fastify
│   ├── middleware/
│   │   ├── hmacVerification.ts
│   │   ├── correlationId.ts
│   │   └── validation.ts
│   ├── routes/
│   │   ├── abandonment.ts
│   │   ├── messages.ts
│   │   └── conversations.ts
│   ├── services/
│   │   ├── AbandonmentService.ts
│   │   ├── ConversationService.ts
│   │   ├── AIService.ts
│   │   ├── MessageService.ts
│   │   ├── ComplianceService.ts
│   │   └── OptOutDetection.ts
│   ├── repositories/
│   │   ├── UserRepository.ts
│   │   ├── AbandonmentRepository.ts
│   │   ├── ConversationRepository.ts
│   │   └── MessageRepository.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── hmac.ts
│   │   └── formatters.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── openai.ts
│   │   └── whatsapp.ts
│   └── types/
│       ├── index.ts                # Tipos compartilhados
│       ├── models.ts               # Modelos de BD
│       └── api.ts                  # Requisição/resposta de API
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_add_indices.sql
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

### 14.2 Padrões de Codificação

**Tratamento de Erro:**
```typescript
try {
  // Operação
} catch (erro) {
  logger.error('operation_falhou', {
    error: erro.message,
    stack: erro.stack,
    traceId: req.traceId
  });
  throw new ErroAplicacao('OPERATION_FAILED', 'Mensagem humana', 500);
}
```

**Transações de Banco de Dados:**
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await repositorioUsuario.criar(usuario);
  await repositorioAbandono.criar(abandono);
  await client.query('COMMIT');
} catch (erro) {
  await client.query('ROLLBACK');
  throw erro;
} finally {
  client.release();
}
```

**Injeção de Dependência de Serviço:**
```typescript
class ServicoConversa {
  constructor(
    private repositorioConversa: RepositorioConversa,
    private repositorioMensagem: RepositorioMensagem,
    private servicoIA: ServicoIA
  ) {}

  async manipular(evento: EventoWebhook) {
    // Implementação
  }
}
```

---

## 15. Decisões & Trade-offs

### 15.1 Decisões Arquiteturais-Chave

| Decisão | Justificativa | Trade-off |
|---------|---------------|-----------|
| **Fastify sobre Express** | Mais rápido, plugins modernos | Ecosistema menor que Express |
| **TypeScript** | Type safety, melhor DX | Passo de compilação, curva aprendizado |
| **Supabase ao invés de Firebase** | ACID, LGPD, PostgreSQL | Mais overhead operacional |
| **Redis para cache** | Rápido, multi-propósito | Outro serviço para operar |
| **GPT-3.5 ao invés de GPT-4** | Custo ($0,0005 vs $0,015 por 1K tokens) | Menos capaz em edge cases |
| **APIs sem estado** | Escalabilidade horizontal | Requer BD para estado (trade-off latência) |
| **Orientado a eventos** | Desacoplado, escalável | Complexidade em testes, debug |
| **Verificação de webhook** | Segurança, conformidade | Overhead de latência leve |
| **Opt-out em duas camadas** | Confiabilidade + economia de custo | Determinística pode perder nuance, IA adiciona custo |

### 15.2 Considerações para Fase 2+

**O que NÃO está em MVP:**
- Dashboard (Fase 2)
- Escalação humana / handoff (Fase 2)
- Framework de A/B testing (Fase 2)
- Integração Pinecone KB (Fase 2, opcional)
- Notificações por email (Fase 2)
- Analytics/reporting avançado (Fase 2)
- Suporte multilíngue (Fase 2+)
- API GraphQL (Fase 2+)
- Verificação de assinatura de webhook (Fase 2 – implementar antes de prod)

**Pontos de Extensibilidade:**
- Templates de mensagem (atualmente hardcoded, mover para tabela de templates)
- Prompts de IA (atualmente no código, mover para config YAML)
- Palavras-chave opt-out (já em tabela, fácil gerenciar)
- Config de produto (já em tabela, fácil gerenciar)
- Lógica de retry (Bull queue é extensível)

---

## Checklist para Implementação

### Pré-Desenvolvimento
- [ ] Criar repositório Git
- [ ] Setup de pipeline CI/CD (GitHub Actions)
- [ ] Criar projetos Railway (dev, staging, prod)
- [ ] Criar projetos Supabase (dev, staging, prod)
- [ ] Criar instâncias Redis (dev, staging, prod)
- [ ] Provisionar chave API OpenAI
- [ ] Obter credenciais Meta WhatsApp API
- [ ] Configurar variáveis de ambiente

### Desenvolvimento
- [ ] Setup TypeScript + ESLint + Prettier
- [ ] Implementar servidor Fastify com middleware
- [ ] Construir todos os repositórios (camada de acesso a dados)
- [ ] Implementar todos os serviços (lógica de negócio)
- [ ] Implementar todas as rotas (endpoints de API)
- [ ] Adicionar testes abrangentes (unit + integration)
- [ ] Adicionar logging (Winston)
- [ ] Adicionar rastreamento de erro (Sentry)

### Pré-Produção
- [ ] Teste de carga (k6)
- [ ] Review de segurança (HMAC, validação de entrada, proteção de dados)
- [ ] Verificação de conformidade LGPD
- [ ] Verificação de conformidade WhatsApp
- [ ] Estratégia de backup de banco de dados
- [ ] Setup de monitoramento & alerting
- [ ] Documentação completa
- [ ] Runbook para operações

### Pós-Lançamento
- [ ] Monitorar métricas por 24h
- [ ] Coletar feedback de stakeholders
- [ ] Planejar features de Fase 2
- [ ] Agendar review de arquitetura (trimestral)

---

## Resumo

A arquitetura de Sara é:
- **Sem estado**: Escala horizontalmente
- **Orientada a eventos**: Responde a webhooks
- **Conformidade em primeiro**: Políticas Meta embutidas no código
- **Observável**: Logging e monitoramento abrangentes
- **Resiliente**: Tratamento de erros e estratégias de retry
- **Segura**: Verificação HMAC, criptografia de dados, conformidade LGPD
- **Consciente de custos**: Uso eficiente de IA, caching estratégico
- **Testável**: Testes unitários + integração + carga

**Próximos Passos**:
1. @dev implementa baseado nesta arquitetura
2. @qa cria planos de teste
3. @devops configura infraestrutura
4. Review de arquitetura agendado após lançamento MVP

---

**Status do Documento**: ✅ Pronto para Implementação
**Última Atualização**: 2026-02-05
**Arquiteto**: Aria

— Aria, arquitetando o futuro 🏗️
