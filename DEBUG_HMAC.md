# HMAC Validation Debug Guide

## ✅ HMAC está funcionando corretamente!

Nossos testes passam com HMAC ativado. Se webhooks do Meta/WhatsApp real falharem, verifique:

---

## 🔍 Checklist para Webhook Real do Meta

### 1. **Verifique o Header da Assinatura**
```
Header esperado: X-Hub-Signature-256
Formato esperado: sha256=<hash_hexadecimal>
Exemplo: X-Hub-Signature-256: sha256=3a1b2c4d5e6f7a8b9c0d1e2f3a4b5c6d
```

❓ O Meta está enviando este header?
❓ O formato está correto?

### 2. **Verifique o Raw Body**
O HMAC é calculado sobre o **raw body (JSON não parseado)**.

⚠️ **Muito importante:** Se o body vem com diferentes:
- Espaçamentos
- Ordem de campos
- Caracteres de quebra de linha

Então o HMAC será diferente!

### 3. **Verifique a Senha (APP_SECRET)**
```bash
# Seu APP_SECRET deve ser:
WHATSAPP_APP_SECRET=13427a96bd84964d9165f6a697a9754f
```

❓ A senha no arquivo `.env` está correta?
❓ Você alterou a senha no Meta recentemente?

### 4. **Teste com curl para Validar**

Se você recebeu um webhook real do Meta, capture ele e teste:

```bash
# Você recebeu algo como:
POST /webhook/messages
X-Hub-Signature-256: sha256=abcd1234...
Body: {"object":"whatsapp_business_account",...}

# Teste localmente:
curl -X POST http://localhost:3000/webhook/messages \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=abcd1234..." \
  -d '{"object":"whatsapp_business_account",...}'
```

### 5. **Verifique os Logs**

Se HMAC falhar, você verá no `/tmp/server-debug.log`:

```
HMAC verification failed {
  "headerSignature": "abcd1234...",
  "expectedSignature": "1234abcd...",
  "bodyLength": 512,
  "secret": "134270a6..."
}
```

Compare:
- ✅ headerSignature (do Meta) == expectedSignature (calculado)
- ✅ bodyLength (tamanho do raw body)
- ✅ secret (primeiros 10 chars do APP_SECRET)

---

## 📋 O que o Meta Deveria Estar Enviando

```json
POST /webhook/messages
X-Hub-Signature-256: sha256=<calculated_hash>

{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "123456",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "...",
              "phone_number_id": "...",
              "business_account_id": "..."
            },
            "messages": [
              {
                "from": "5548991080788",
                "id": "wamid.xxx",
                "timestamp": "1234567890",
                "type": "text",
                "text": {
                  "body": "Sua mensagem aqui"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

---

## 🛠️ Se Ainda Falhar

1. **Ative logging detalhado** - Já adicionamos debug ao middleware
2. **Capture um webhook real** - Envie para seus logs e analise
3. **Teste com o webhook exato** - Use curl para reproduzir

---

## ✨ Status Atual

- ✅ HMAC validation funciona
- ✅ Raw body capture funciona
- ✅ Signature verification funciona
- ❓ Webhook real do Meta precisa ser validado

**Próximo passo:** Compartilhe um webhook real (sem dados sensíveis) para debugarmos!
