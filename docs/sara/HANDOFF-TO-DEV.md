# 🎯 Handoff: SARA Persona & Contexto Dinâmico → @dev

**De:** @architect (Aria)
**Para:** @dev (Dex)
**Data:** 2026-02-06
**Status:** 🚀 Pronto para implementação

---

## 📋 Resumo Executivo

SARA-2.5 já está **100% funcional end-to-end**. Agora precisa de um upgrade: **adicionar persona dinâmica e contexto estruturado** para melhorar qualidade das respostas.

**Escopo:** Integrar system prompt + contexto dinâmico no AIService
**Esforço:** 4-6 horas
**Complexidade:** Média (modificar AIService, handler, BD)
**Risco:** Baixo (não quebra fluxo existente)

---

## ✅ O Que Já Foi Feito

### By @architect:
- ✅ Definiu persona completa de SARA
- ✅ Criou system prompt refinado
- ✅ Estruturou schema de contexto dinâmico
- ✅ Escreveu guia de integração técnica
- ✅ Preparou exemplos e testes

### Documentação Gerada:
```
docs/sara/
├── README.md                           (índice)
├── persona-system-prompt.md            (system prompt)
├── contexto-dinamico-schema.md         (schema + exemplos)
├── guia-integracao-tecnica.md          (implementação)
└── HANDOFF-TO-DEV.md                   (este arquivo)
```

---

## 🎯 O Que Precisa Ser Feito

### Tarefa Principal: Integrar Persona + Contexto no AIService

#### Passo 1: Criar Interface de Tipos
**Arquivo:** `src/types/sara.ts` (novo)
**Tarefa:** Copiar TypeScript interfaces de `guia-integracao-tecnica.md` seção 2.1
**Tempo:** 15 min
**Checklist:**
- [ ] Criar arquivo com todas as interfaces
- [ ] Exportar tipos
- [ ] Validar no TypeScript

#### Passo 2: Atualizar AIService
**Arquivo:** `src/services/AIService.ts`
**Tarefas:**
- [ ] Adicionar método `loadSaraSystemPrompt()` (seção 2.1)
- [ ] Atualizar `interpretMessage()` para aceitar contexto (seção 2.2)
- [ ] Implementar `buildUserMessageWithContext()` (seção 2.3)
- [ ] Implementar `validateSaraContext()` (seção 2.4)
- [ ] Adicionar helper `getTimeDiff()`

**Tempo:** 1.5 hora
**Referência:** Seções 2.1-2.4 de `guia-integracao-tecnica.md`

#### Passo 3: Atualizar Handler
**Arquivo:** `src/jobs/handlers.ts`
**Tarefas:**
- [ ] Importar tipos SaraContextPayload
- [ ] Atualizar `processMessageHandler()` (chamar novo buildSaraContext)
- [ ] Implementar `buildSaraContext()` (seção 3)
- [ ] Passar contexto para AIService.interpretMessage()

**Tempo:** 1 hora
**Referência:** Seção 3 de `guia-integracao-tecnica.md`

#### Passo 4: Atualizar Banco de Dados
**Tarefas:**
- [ ] Criar migration: adicionar coluna `cycle_count` em `conversations`
- [ ] Criar migration: adicionar `discount_was_offered` em `payment_configs`
- [ ] Criar trigger SQL para incrementar ciclo após resposta

**Tempo:** 30 min
**Referência:** Seção 4 de `guia-integracao-tecnica.md`

#### Passo 5: Testes
**Tarefas:**
- [ ] Escrever testes unitários de `buildUserMessageWithContext()`
- [ ] Escrever testes de validação de contexto
- [ ] Testar end-to-end com webhook real
- [ ] Validar qualidade das respostas

**Tempo:** 1.5 hora
**Referência:** Seção 5 de `guia-integracao-tecnica.md`

---

## 📁 Arquivos a Modificar/Criar

```
src/
├── types/
│   └── sara.ts                         (NOVO - interfaces)
├── services/
│   └── AIService.ts                    (MODIF - adicionar métodos)
└── jobs/
    └── handlers.ts                     (MODIF - chamar buildSaraContext)

docs/sara/
├── persona-system-prompt.md            (REFERÊNCIA)
├── contexto-dinamico-schema.md         (REFERÊNCIA)
├── guia-integracao-tecnica.md          (REFERÊNCIA)
└── README.md                           (REFERÊNCIA)

database/
└── migrations/
    └── add_sara_tracking_columns.sql   (NOVO)
```

---

## 🔑 Pontos-Chave para Implementação

### 1. System Prompt é um Arquivo
```typescript
// Carregar do arquivo .md
const systemPrompt = await fs.readFile(
  'docs/sara/persona-system-prompt.md',
  'utf-8'
);

// Passar para OpenAI
const response = await openai.chat.completions.create({
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ]
});
```

### 2. Contexto é Injetado na Mensagem do Usuário
```typescript
// Montar contexto estruturado
const context = await buildSaraContext(...);

// Injetar na mensagem
const userMessage = await buildUserMessageWithContext(messageText, context);

// Passar para OpenAI
await interpretMessage(messageText, conversationId, traceId, context);
```

### 3. Validação é Crítica
```typescript
// Validar contexto ANTES de chamar OpenAI
if (context.conversation.cycleCount >= context.conversation.maxCycles) {
  logger.warn('Max cycles reached');
  // Encerrar conversa
}
```

### 4. Rastreamento de Ciclos
```sql
-- Incrementar ciclo quando SARA responde (outgoing message)
CREATE TRIGGER tr_increment_cycle_count
AFTER INSERT ON messages
FOR EACH ROW
WHEN (NEW.direction = 'outgoing')
EXECUTE FUNCTION increment_cycle_count();
```

---

## 📊 Estrutura de Contexto que @dev Receberá

A cada mensagem do usuário, o handler terá acesso a:

```json
{
  "user": {
    "id": "uuid",
    "name": "João",
    "phone": "+5548991080788"
  },
  "abandonment": {
    "id": "uuid",
    "product": "Curso Python",
    "cartValue": 150000,
    "currency": "BRL",
    "createdAt": "2026-02-06T10:00:00Z"
  },
  "conversation": {
    "state": "ACTIVE",
    "cycleCount": 2,
    "maxCycles": 5
  },
  "payment": {
    "originalLink": "https://...",
    "discountLink": "https://...?discount=15",
    "discountPercent": 15,
    "discountWasOffered": true
  },
  "history": [
    { "role": "user", "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "timestamp": "..." }
  ]
}
```

---

## 🧪 Teste Básico para Validar

1. **Enviar webhook de mensagem**
   ```bash
   POST /webhook/messages
   ```

2. **Verificar no log:**
   - [ ] "SARA context built" (context foi montado)
   - [ ] "Calling OpenAI with system prompt and context"
   - [ ] "Response generated" (resposta foi gerada)

3. **Verificar resposta:**
   - [ ] Mensagem é empática?
   - [ ] Usa informações do contexto (nome, valor, produto)?
   - [ ] Segue persona de SARA?

---

## 📚 Referências Rápidas

| Preciso de... | Vejo em... |
|---|---|
| Código de AIService | `guia-integracao-tecnica.md` seção 2 |
| Código de handler | `guia-integracao-tecnica.md` seção 3 |
| Schema de contexto | `contexto-dinamico-schema.md` |
| Exemplos de payload | `contexto-dinamico-schema.md` seção "Exemplos" |
| Persona de SARA | `persona-system-prompt.md` |
| Passo-a-passo completo | `guia-integracao-tecnica.md` |

---

## ⚠️ Pontos de Atenção

1. **System prompt é arquivo:**
   - Carregar no startup (cache)
   - Fallback se arquivo não existir

2. **Contexto é obrigatório:**
   - Validar antes de usar
   - Não permitir contexto incompleto

3. **Ciclos são rastreados:**
   - Incrementar no BD após resposta
   - Não permitir > 5 ciclos

4. **Desconto é pré-configurado:**
   - SARA não define desconto
   - Backend fornece nos links
   - SARA apenas comunica

5. **Histórico é limitado:**
   - Apenas últimas 10-20 mensagens
   - Para não inchar a chamada da API

---

## 🎬 Checklist de Implementação

```
Criação de Tipos:
  [ ] Criar src/types/sara.ts
  [ ] Exportar todas as interfaces
  [ ] Testar imports em AIService

AIService:
  [ ] Adicionar loadSaraSystemPrompt()
  [ ] Adicionar buildUserMessageWithContext()
  [ ] Adicionar validateSaraContext()
  [ ] Atualizar interpretMessage() assinatura
  [ ] Atualizar lógica de chamada OpenAI

Handler:
  [ ] Importar tipos SaraContextPayload
  [ ] Implementar buildSaraContext()
  [ ] Atualizar processMessageHandler()
  [ ] Passar contexto para AIService

Banco de Dados:
  [ ] Criar migration para cycle_count
  [ ] Criar migration para discount_was_offered
  [ ] Executar migrations
  [ ] Criar trigger SQL

Testes:
  [ ] Testes unitários de buildUserMessageWithContext
  [ ] Testes de validateSaraContext
  [ ] Teste end-to-end webhook
  [ ] Validar qualidade de respostas

Validação Final:
  [ ] npm run typecheck passa
  [ ] npm run lint passa
  [ ] npm test passa
  [ ] Teste manual com webhook real
```

---

## 🚀 Como Começar

1. **Ler documentação:**
   ```bash
   # Ordem recomendada
   1. README.md (visão geral)
   2. persona-system-prompt.md (entender SARA)
   3. contexto-dinamico-schema.md (entender dados)
   4. guia-integracao-tecnica.md (implementar)
   ```

2. **Estrutura base (30 min):**
   - Criar `src/types/sara.ts`
   - Copiar interfaces do guia

3. **AIService (90 min):**
   - Copiar métodos do guia
   - Testar carregamento de prompt

4. **Handler (60 min):**
   - Implementar buildSaraContext
   - Passar contexto para AIService

5. **BD (30 min):**
   - Criar migrations
   - Executar

6. **Testes (90 min):**
   - Escrever testes
   - Validar end-to-end

---

## 💬 Comunicação

**Se tiver dúvidas:**
1. Revisar seção relevante de `guia-integracao-tecnica.md`
2. Procurar nos exemplos de `contexto-dinamico-schema.md`
3. Revisar persona em `persona-system-prompt.md`
4. Perguntar ao @architect

---

## ✅ Critério de Sucesso

- [ ] Código implementado conforme guia
- [ ] Testes passam
- [ ] TypeScript sem erros
- [ ] Respostas de SARA seguem persona
- [ ] Contexto é injetado corretamente
- [ ] Ciclos são rastreados no BD
- [ ] Webhook real funciona end-to-end

---

## 📝 Após Conclusão

1. Avisar @architect que implementação foi concluída
2. Executar testes completos
3. Fazer QA das respostas com @qa
4. Se tudo OK → story pode ser marcada como concluída

---

**Status:** ✅ Handoff Pronto
**Próximo:** @dev começa implementação

Boa sorte! 🚀

---

**Preparado por:** @architect (Aria)
**Revisado por:** User
**Data:** 2026-02-06
