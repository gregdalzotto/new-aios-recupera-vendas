# SARA - Arquitetura Completa de Persona e Contexto

## 📋 Visão Geral

SARA é uma agente conversacional especializada em recuperação de vendas abandonadas. Esta documentação define:

1. **Sua personalidade e valores** (persona)
2. **Como ela recebe dados dinâmicos** (contexto)
3. **Como implementar tudo isso tecnicamente** (integração)

---

## 📁 Documentos

### 1. **persona-system-prompt.md** 🎯
**O quê:** System prompt para OpenAI
**Para quem:** Para ser injetado nas chamadas de OpenAI
**Contém:**
- Identidade e arquétipo de SARA
- Princípios de comunicação
- Estratégia de conversa
- Limites críticos (compliance, opt-out, prompt injection)
- Validação interna antes de responder

**Uso:** Carregado no AIService e passado como `role: system` para OpenAI

---

### 2. **contexto-dinamico-schema.md** 📊
**O quê:** Schema JSON de contexto dinâmico
**Para quem:** Para montar e injetar dados em cada turno de conversa
**Contém:**
- TypeScript interface completa
- 4 exemplos de payloads reais
- Campos obrigatórios vs. opcionais
- Fluxo de injeção no AIService
- Cálculos (valores, descontos)
- Validações de segurança

**Uso:** Backend monta esse JSON e passa para AIService a cada mensagem

---

### 3. **guia-integracao-tecnica.md** 🔧
**O qué:** Passo-a-passo de implementação
**Para quem:** Para @dev implementar no código
**Contém:**
- Diagrama do fluxo completo
- 5 passos de implementação (interfaces, AIService, handler, BD, testes)
- Código pronto para copiar/colar
- Validações e tratamento de erros
- Checklist de implementação
- Testes unitários e E2E

**Uso:** Guia técnico durante implementação

---

## 🚀 Fluxo Resumido

```
1. Webhook de mensagem chega
   ↓
2. Backend busca conversa no BD
   ↓
3. Backend monta SaraContextPayload (JSON estruturado)
   ↓
4. AIService carrega system prompt + contexto
   ↓
5. Chama OpenAI com ambos
   ↓
6. OpenAI retorna resposta seguindo persona
   ↓
7. Resposta enfileirada e enviada ao usuário
```

---

## 🎯 Características Principais

### ✅ Persona de SARA
- Consultora confiável, não vendedora agressiva
- Empatia madura, clareza estratégica
- Sem urgência artificial, sem pressão
- Respeita "não" absolutamente
- Nunca revela internals

### ✅ Contexto Dinâmico
- Informações do usuário (nome, phone)
- Dados do carrinho (produto, valor, desconto)
- Estado da conversa (ciclo, máximo, estado)
- Histórico recente
- Links de pagamento

### ✅ Segurança
- Validação de contexto antes de usar
- Proteção contra prompt injection
- Compliance com Meta/LGPD
- Opt-out tratado com respeito
- Limite de ciclos (5 máximo)

### ✅ Implementação Técnica
- Injeção de contexto no AIService
- System prompt carregado de arquivo .md
- Validações robustas
- Rastreamento de ciclos no BD
- Testes unitários inclusos

---

## 📊 Estatísticas dos Documentos

| Documento | Linhas | Seções | Exemplos |
|-----------|--------|--------|----------|
| persona-system-prompt.md | 380 | 18 | 5 |
| contexto-dinamico-schema.md | 450 | 12 | 4 |
| guia-integracao-tecnica.md | 650 | 5 | 15+ |
| **Total** | **1.480** | **35** | **25+** |

---

## ✅ Status de Complitude

- [x] Persona definida com detalhe
- [x] Contexto dinâmico estruturado
- [x] Schema TypeScript pronto
- [x] Exemplos de payloads
- [x] Fluxo de integração mapeado
- [x] Código de exemplo incluído
- [x] Testes esboçados
- [x] Checklist de implementação
- [x] Documentação de segurança
- [x] Casos de uso cobertos

---

## 🎬 Próximas Etapas

### Para @dev:
1. Ler `guia-integracao-tecnica.md`
2. Implementar os 5 passos (interfaces, AIService, handler, BD, testes)
3. Testar com exemplos do `contexto-dinamico-schema.md`
4. Validar qualidade das respostas contra `persona-system-prompt.md`

### Para @qa:
1. Validar respostas seguem persona
2. Testar fluxos de objeção
3. Testar límite de ciclos
4. Testar opt-out

### Para @sm/@pm:
1. Métricas de sucesso = webhook de pagamento confirmado
2. Taxa de conversão esperada
3. Feedback do usuário

---

## 📞 Suporte e Perguntas

Se durante implementação surgir dúvida:
1. Revisar o documento relevante
2. Procurar na seção "Exemplos"
3. Procurar no "Checklist"
4. Perguntar ao @architect

---

## 📝 Versão e Histórico

- **Versão:** 1.0
- **Data:** 2026-02-06
- **Status:** ✅ Pronto para implementação
- **Próxima revisão:** Após primeira implementação e feedback

---

## 🏗️ Arquitetura de Alto Nível

```
┌──────────────────────────────────────────────────────────┐
│                   SARA - Sales Recovery Agent            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  System Prompt                                          │
│  (persona-system-prompt.md)                            │
│  ├─ Identidade: Consultora confiável                   │
│  ├─ Princípios: Empatia > Pressão                      │
│  ├─ Estratégia: Ofereça desconto após objeção          │
│  └─ Limites: 5 ciclos máx, respeite opt-out           │
│                                                          │
│  ↓                                                       │
│                                                          │
│  Contexto Dinâmico                                      │
│  (contexto-dinamico-schema.md)                         │
│  ├─ User: nome, phone, id                              │
│  ├─ Abandonment: produto, valor, desconto              │
│  ├─ Conversation: estado, ciclos, histórico            │
│  └─ Payment: links de pagamento                        │
│                                                          │
│  ↓                                                       │
│                                                          │
│  OpenAI API                                             │
│  (gpt-3.5-turbo)                                        │
│  ├─ Role system: system prompt                         │
│  └─ Role user: mensagem + contexto                     │
│                                                          │
│  ↓                                                       │
│                                                          │
│  Resposta                                               │
│  ├─ Empática, clara, sem pressão                       │
│  ├─ Contextualizada (conhece produto, valor)           │
│  └─ Estratégica (oferece desconto quando apropriado)   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

**Preparado por:** @architect (Aria)
**Para handoff a:** @dev
**Status:** ✅ Pronto para começar implementação
