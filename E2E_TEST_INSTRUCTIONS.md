# 🚀 E2E Test - Real WhatsApp Message

## Configuração Atual
- **App ID**: 856862210466339
- **Phone Number ID**: 727258347143266
- **Business Account**: 1274103757491989
- **Webhook URL**: https://337c-2804-1b3-8401-c0e7-1176-a787-6cd7-cb7e.ngrok-free.app/webhook/messages
- **Webhook Status**: ✅ VALIDATED (HMAC signature working)

## Passo-a-Passo do Teste

### 1️⃣ Enviar Mensagem WhatsApp
Envie uma mensagem de texto via WhatsApp para o número associado ao Phone ID configurado:

**Número**: Será fornecido pelo seu número de Comandor RCC configurado na Meta

**Mensagem**: Qualquer texto (ex: "Teste E2E", "Olá Sara")

> ⏱️ A mensagem será recebida pelo servidor em tempo real

### 2️⃣ O Servidor Fará:
```
1. Receber o webhook POST de /webhook/messages
2. Validar a assinatura HMAC ✅
3. Extrair dados da mensagem
4. Procurar conversation existente
5. Enfileirar mensagem para processamento
6. Responder com 200 OK para Meta
```

### 3️⃣ Monitorar os Logs
Fique de olho no console do servidor para ver:
- ✅ "Webhook message received"
- ✅ "HMAC verification passed"
- ✅ "Processing WhatsApp message"
- ✅ "Message enqueued for processing"

### 4️⃣ Esperado vs Realidade

**Esperado Idealmente**:
- Mensagem enfileirada
- Handler processa a mensagem
- AIService interpreta (chama OpenAI)
- MessageService envia resposta
- Você recebe resposta via WhatsApp

**Situação Atual** (Bull/Redis Issue):
- Mensagem é **enfileirada** ✅
- Handler **não processa** ⚠️ (Bull/Redis Lua script error)
- Você **não recebe resposta** ❌ (por enquanto)

> **Mas**: O webhook e HMAC validation estão **100% funcionando** ✅

## Instruções de Envio

### Via WhatsApp Web/Desktop:
1. Abra WhatsApp Web
2. Encontre o chat com seu número de Comandor RCC
3. Digite qualquer mensagem
4. Clique em enviar

### Via WhatsApp Mobile:
1. Abra o app WhatsApp
2. Acesse o chat configurado
3. Envie uma mensagem

## O que Procurar nos Logs

```
✅ Sucesso:
[info]: Webhook message received {
  "traceId": "xxx",
  "contentType": "application/json"
}

[debug]: HMAC verification passed {
  "traceId": "xxx",
  "method": "POST",
  "url": "/webhook/messages"
}

[info]: Processing WhatsApp message {
  "whatsappMessageId": "wamsg_xxx",
  "phoneNumber": "+5548999327881",
  "messageLength": 10
}

[info]: Message enqueued for processing {
  "conversationId": "xxx",
  "whatsappMessageId": "wamsg_xxx"
}

⚠️ Aviso (esperado - Bull issue):
[error]: Message queue error {
  "error": "Error initializing Lua scripts"
}
```

## Resumo do Teste

| Passo | Ação | Status |
|-------|------|--------|
| Enviar mensagem | Via WhatsApp | 👉 **AGORA** |
| Webhook recebido | POST /webhook/messages | ✅ **PRONTO** |
| HMAC validado | Signature verification | ✅ **PRONTO** |
| Dados extraídos | Parse JSON | ✅ **PRONTO** |
| Enfileirado | ProcessMessageQueue | ✅ **PRONTO** |
| Processado | Message Handler | ⏳ **AGUARDANDO Bull fix** |
| Resposta enviada | Via WhatsApp | ⏳ **AGUARDANDO Bull fix** |

---

## Próximos Passos Após Este Teste

1. **Se receber resposta**: 🎉 Tudo funcionando! Ir para SARA-2.6
2. **Se não receber**:
   - Bull/Redis precisa ser corrigido
   - Ou implementar processamento síncrono como alternativa
   - Ou usar outro job queue (BullMQ, Agenda, etc)

## Comando para Monitorar Logs

```bash
# Em outro terminal, monitorar logs em tempo real:
tail -f /tmp/server.log | grep -E "(Webhook|HMAC|Processing|enqueued|error)"
```

---

**Status**: Pronto para teste E2E! ✅
**Tempo Estimado**: 30-60 segundos até receber webhook
**Risco**: Zero - é apenas recebimento de dados, sem efeitos colaterais
