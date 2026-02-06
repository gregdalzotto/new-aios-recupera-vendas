# E2E Manual Test - SARA-2.5 WhatsApp Flow

## 📋 Objetivo
Validar o pipeline completo de processamento de mensagens WhatsApp com contexto de IA

---

## PASSO 1: Simular Recebimento de Abandono

**O que fazer:**
Execute este comando curl para disparar o webhook de abandono:

```bash
curl -X POST http://localhost:3000/webhook/abandonment \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=SIGNATURE_AQUI" \
  -d '{
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Gregori Dalzotto",
    "phone": "+5548999327881",
    "productId": "prod-comando-ia",
    "value": 291.60,
    "paymentLink": "https://go.reinoeducacao.com.br/subscribe/aqs-cmd-f01",
    "abandonmentId": "e2e-test-'$(date +%s)'",
    "timestamp": '$(date +%s)'
  }'
```

**Para calcular a signature:**
```bash
PAYLOAD='{"userId":"123e4567-e89b-12d3-a456-426614174000","name":"Gregori Dalzotto","phone":"+5548999327881","productId":"prod-comando-ia","value":291.60,"paymentLink":"https://go.reinoeducacao.com.br/subscribe/aqs-cmd-f01","abandonmentId":"e2e-test-1738838400","timestamp":1738838400}'

echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "a5d389e8df06c583f8f3853a8e404a9e" -hex
```

**Resultado esperado:**
```json
{
  "status": "processed",
  "abandonmentId": "e2e-test-...",
  "conversationId": "uuid-da-conversa",
  "userId": "123e4567-e89b-12d3-a456-426614174000"
}
```

✅ **Sucesso**: Você deve ver `conversationId` criado no respons.

---

## PASSO 2: Enviar Template Message

Agora vamos enviar a mensagem de template usando o `conversationId` do Passo 1.

**Código Node.js para enviar:**
```typescript
import { MessageService } from './src/services/MessageService';

const result = await MessageService.send(
  'CONVERSATION_ID_DO_PASSO_1', // substitua com o ID recebido
  '+5548999327881',
  '', // sem texto (é template)
  'template',
  {
    templateName: 'boas_vindas_rcc_comandor',
    templateParams: { 1: 'Gregori Dalzotto' },
    traceId: 'e2e-template-' + Date.now(),
  }
);

console.log('Resultado:', result);
// Status deve ser: "sent"
// WhatsAppMessageId deve vir preenchido
```

**Resultado esperado:**
```
Resultado: {
  messageId: 'uuid-da-mensagem',
  status: 'sent',
  whatsappMessageId: 'wamsg-xxxxxxx'
}
```

📱 **Você deve receber uma mensagem no WhatsApp agora!**

---

## PASSO 3: Você Responde → Processa com Contexto de IA

### 3a. Você responde no WhatsApp
- Abra WhatsApp
- Vá para a conversa com Sara (ou aquela que recebeu o template)
- Responda com uma pergunta, por exemplo:
  - "Quanto custa?"
  - "Quero mais info sobre o produto"
  - "Ainda tem desconto?"
  - Ou qualquer outra coisa

### 3b. Sara processa sua resposta
Quando você envia a mensagem, aqui é o que acontece:

1. **WhatsApp webhook** → Meta envia `POST /webhook/messages` com sua mensagem
2. **ProcessMessageHandler** executa:
   ```
   a) Carrega Conversation (já existe do Passo 1)
   b) Carrega Abandonment (carrinho com R$ 291,60, Comandor IA)
   c) Valida se você fez opt-out (não)
   d) Armazena sua mensagem recebida no histórico
   ```
3. **AIService.interpretMessage()** com CONTEXTO:
   ```
   System Prompt: "Você é Sara, assistente de vendas empática"

   Contexto enviado ao OpenAI:
   - Seu nome: Gregori Dalzotto
   - Seu produto: Comandor IA + RCC
   - Seu carrinho: R$ 291,60
   - Histórico: [mensagem template, sua pergunta]
   - Sua pergunta: "Quanto custa?"
   ```
4. **OpenAI responde** com resposta contextualizada (exemplo):
   ```
   "Oi Gregori! O Comandor IA + RCC está R$ 291,60.
    Você ainda tem 10% de desconto válido!
    Quer aproveitar agora? 💰"
   ```
5. **MessageService.send()** envia resposta no WhatsApp
6. **Você recebe a resposta de IA** no WhatsApp! 📱

---

## 📊 Validação Completa

| Etapa | O que validar | Status |
|-------|---------------|--------|
| 1 | Webhook de abandono cria Conversation | ✅ |
| 2 | Template enviado para WhatsApp | ✅ |
| 3 | WhatsApp recebe template | 📱 Você vê a mensagem |
| 4 | Você responde no WhatsApp | 💬 Você digita |
| 5 | Handler processa sua resposta | ⚙️ Backend |
| 6 | AIService chama OpenAI com contexto | 🤖 IA |
| 7 | Você recebe resposta no WhatsApp | 📱 Você vê a IA responder |

---

## 🔍 Debugging / Logs

Se algo não funcionar, verifique:

### Logs do servidor
```bash
tail -f logs/app.log | grep -i sara
```

Procure por:
- `✅ Message handlers registered` (handlers iniciados)
- `ProcessMessageHandler: Processing incoming message` (sua mensagem foi recebida)
- `AIService: Calling OpenAI` (IA foi acionada)
- `MessageService: Sending WhatsApp message` (envio acionado)

### Verificar Conversation criada
```sql
SELECT id, user_id, abandonment_id, message_count
FROM conversations
WHERE phone_number = '+5548999327881';
```

### Verificar mensagens armazenadas
```sql
SELECT sender_type, message_text, created_at
FROM messages
WHERE conversation_id = 'UUID_DO_PASSO_1'
ORDER BY created_at;
```

---

## ⚠️ Troubleshooting

### "Não recebi o template no WhatsApp"
- Verifique se o WhatsApp Access Token é válido
- Verifique se o Phone ID está correto
- Template pode estar em review - teste com mensagem de texto

### "Respondeu mas não recebi IA response"
- Verifique Redis: `redis-cli -n 0 keys "*"`
- Verifique se OpenAI API key é válida
- Verifique logs do ProcessMessageHandler

### "Erro de autenticação WhatsApp"
- Token expirou? (válido por 60 dias)
- Necessário regenerar em Meta Business Manager
- URL base correta? https://graph.instagram.com/v18.0/

---

## ✅ Success Checklist

- [ ] Passo 1: Webhook de abandono retorna `conversationId`
- [ ] Passo 2: Template enviado com sucesso (status: "sent")
- [ ] Passo 3: Você recebeu template no WhatsApp
- [ ] Passo 4: Você respondeu uma pergunta no WhatsApp
- [ ] Passo 5: Você recebeu resposta de IA no WhatsApp
- [ ] Resposta foi contextualizada (menciona seu produto/preço)?

**Se tudo passou: ✅ SARA-2.5 está 100% funcional!**
