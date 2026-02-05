# 📘 BRIEF DE PRODUTO  
## Agente de Recuperação de Vendas – *Sara*

---

## 1. Visão Geral do Produto

**Nome do Agente:** Sara  
**Tipo:** Agente conversacional de recuperação de vendas  
**Canal:** WhatsApp (API oficial da Meta)  

**Objetivo Principal:**  
Recuperar vendas perdidas a partir de eventos de **abandono de carrinho**, conduzindo o usuário a concluir o pagamento de forma **humanizada, persuasiva e em conformidade com as políticas da Meta**.

O agente atua de forma automática, iniciando o contato via **template aprovado**, e evoluindo para uma conversa livre após a resposta do usuário, com foco em conversão.

---

## 2. Problema que o Produto Resolve

- Perda de receita por abandono de carrinho  
- Follow-ups manuais caros e pouco escaláveis  
- Mensagens genéricas que não lidam com objeções reais  
- Necessidade de operar 100% dentro das regras da Meta (WhatsApp Business API)

---

## 3. Objetivos do Produto

### 3.1 Objetivos de Negócio
- Recuperar parte relevante das vendas abandonadas  
- Automatizar o processo sem intervenção humana  
- Aumentar a taxa de conversão com abordagem contextual

### 3.2 Objetivos Técnicos
- Processar eventos de abandono em tempo real  
- Orquestrar mensagens WhatsApp via API oficial  
- Persistir histórico completo de conversas  
- Garantir compliance com as políticas da Meta  

---

## 4. Escopo da Primeira Fase (MVP)

### Incluído
- API backend (sem interface visual)  
- Recebimento de eventos de abandono de carrinho  
- Envio de template inicial aprovado pela Meta  
- Continuação da conversa após resposta do usuário  
- Tentativa de conversão com:
  - Link original de pagamento  
  - Link alternativo com desconto  
- Persistência no Supabase  
- Interpretação de mensagens via OpenAI  
- Base de conhecimento opcional via Pinecone  
- Respeito à janela de 24 horas  
- Webhook da Meta (GET + POST)

### Fora de Escopo
- Dashboard visual  
- Atendimento humano  
- Relatórios avançados  
- Multilíngue  

---

## 5. Fluxo Funcional de Alto Nível

### 5.1 Evento de Abandono
1. Sistema de pagamento envia evento de abandono  
2. API da Sara recebe o evento  
3. Dados capturados:
   - Nome do usuário  
   - Telefone (WhatsApp)  
   - Produto  
   - Link de pagamento  
   - ID do abandono  

### 5.2 Primeiro Contato (Template)
4. Envio de mensagem template aprovada  
5. Conversa só evolui após resposta do usuário  

### 5.3 Conversa Ativa
6. Sara interpreta e responde mensagens usando OpenAI  
7. Estratégia:
   - Priorizar link original  
   - Oferecer desconto apenas se necessário  

---

## 6. Regras de Negócio

- Desconto não obrigatório  
- Cada produto possui:
  - Link normal  
  - Link com desconto  
- Links configuráveis via `.env`  
- Conversa pode encerrar por:
  - Pedido do usuário  
  - Fim da janela de 24h  
  - Conversão concluída  

---

## 7. Compliance – Regras da Meta

- Mensagem inicial apenas via template aprovado  
- Conversa livre somente após resposta do usuário  
- Janela de 24h respeitada  
- Proibição de spam  
- Respeito a opt-out  

---

## 8. Arquitetura Técnica

### Componentes
- API Backend  
- WhatsApp Business API  
- OpenAI  
- Supabase  
- Pinecone (opcional)  
- Redis ou fila (a definir)

---

## 9. Endpoints Necessários

### 9.1 Webhook Meta – Validação (GET)

```js
const input = $input.first().json;
const hubMode = input.query["hub.mode"];
const hubChallenge = input.query["hub.challenge"];
const hubVerifyToken = input.query["hub.verify_token"];
```

### 9.2 Webhook Meta – Mensagens (POST)
- Recebe mensagens do usuário  
- Processa resposta da Sara  
- Persiste no Supabase  

### 9.3 Webhook Abandono de Carrinho (POST)
- Recebe evento do sistema de pagamento  
- Inicia fluxo de recuperação  

---

## 10. Persistência de Dados

**Banco:** Supabase  

Armazenar:
- Abandonos  
- Usuários  
- Conversas  
- Mensagens  
- Estado da conversa  
- Status da conversão  

---

## 11. Personalidade da Sara

- Tom humano e empático  
- Linguagem clara  
- Capaz de contornar objeções  
- Foco em ajudar, não pressionar  

---

## 12. Resultado Esperado

Este brief deve permitir ao AIOS:
- Gerar um PRD/PDR completo  
- Definir requisitos funcionais e técnicos  
- Identificar riscos e métricas de sucesso  
