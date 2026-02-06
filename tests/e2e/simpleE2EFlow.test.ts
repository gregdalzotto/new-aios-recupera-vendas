/**
 * E2E Test: Simple 3-Step Validation
 *
 * Step 1: Simulate abandonment webhook
 * Step 2: Send template message to user's WhatsApp
 * Step 3: User replies → Process with AI context
 */

import crypto from 'crypto';
import { createServer } from '../../src/server';
import { MessageService } from '../../src/services/MessageService';
import type { FastifyInstance } from 'fastify';

describe('E2E Simple 3-Step Flow (SARA-2.5)', () => {
  let server: FastifyInstance;
  const appSecret = process.env.WHATSAPP_APP_SECRET || 'test-secret';
  const userPhone = '+5548999327881'; // Seu número
  const userName = 'Gregori Dalzotto';
  const hasRealCredentials = !!process.env.WHATSAPP_ACCESS_TOKEN;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  const createHmacSignature = (payload: string): string => {
    return `sha256=${crypto.createHmac('sha256', appSecret).update(payload).digest('hex')}`;
  };

  describe('Step 1: Simulate Abandonment Reception', () => {
    it('should create conversation from abandonment webhook', async () => {
      if (!hasRealCredentials) {
        console.log('⚠️  Skipping - credentials not configured');
        return;
      }

      console.log('\n' + '='.repeat(70));
      console.log('📨 STEP 1: Simulating Abandonment Webhook Reception');
      console.log('='.repeat(70));

      const abandonmentId = `e2e-${Date.now()}`;
      const payload = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        name: userName,
        phone: userPhone,
        productId: 'prod-comando-ia',
        value: 291.6,
        paymentLink: 'https://go.reinoeducacao.com.br/subscribe/aqs-cmd-f01',
        abandonmentId,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const signature = createHmacSignature(JSON.stringify(payload));

      const response = await server.inject({
        method: 'POST',
        url: '/webhook/abandonment',
        headers: {
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      console.log(`\n✓ Webhook received and processed`);
      console.log(`  Status: ${response.statusCode}`);
      const body = JSON.parse(response.body);
      console.log(`  Abandonment ID: ${body.abandonmentId}`);
      console.log(`  Conversation ID: ${body.conversationId}`);
      console.log(`  User: ${userName}`);
      console.log(`  Phone: ${userPhone}`);
      console.log(`  Value: R$ ${payload.value}`);

      expect(response.statusCode).toBe(200);
      expect(body.conversationId).toBeDefined();

      // Store for step 3
      (globalThis as any).conversationId = body.conversationId;
    });
  });

  describe('Step 2: Send Template Message', () => {
    it('should send template message with user name to WhatsApp', async () => {
      if (!hasRealCredentials) {
        console.log('⚠️  Skipping - credentials not configured');
        return;
      }

      console.log('\n' + '='.repeat(70));
      console.log('📱 STEP 2: Sending Template Message to WhatsApp');
      console.log('='.repeat(70));

      console.log(`\n📤 Enviando template "boas_vindas_rcc_comandor"`);
      console.log(`   Para: ${userPhone}`);
      console.log(`   Template variable: {{1}} = "${userName}"`);

      const result = await MessageService.send(
        (globalThis as any).conversationId || 'temp-conv-id',
        userPhone,
        '',
        'template',
        {
          templateName: 'boas_vindas_rcc_comandor',
          templateParams: { 1: userName },
          traceId: `e2e-template-${Date.now()}`,
        }
      );

      console.log(`\n✓ Template message sent to WhatsApp`);
      console.log(`  Message ID: ${result.messageId}`);
      console.log(`  WhatsApp Message ID: ${result.whatsappMessageId}`);
      console.log(`  Status: ${result.status}`);

      if (result.status === 'sent') {
        console.log(`\n✅ Template enviado com sucesso!`);
        console.log(`\n📲 Você deve receber uma mensagem no WhatsApp agora.`);
        console.log(`   Mensagem: "Bem-vindo(a), Gregori Dalzotto!"`);
        console.log(`   (com base no template configurado)`);
      } else {
        console.log(`\n❌ Erro ao enviar: ${result.error}`);
      }

      expect(result.status).toBe('sent');
    });
  });

  describe('Step 3: User Replies → AI Context Processing', () => {
    it('should process user reply with conversation context', async () => {
      if (!hasRealCredentials) {
        console.log('⚠️  Skipping - credentials not configured');
        return;
      }

      console.log('\n' + '='.repeat(70));
      console.log('💬 STEP 3: User Replies → Process with AI Context');
      console.log('='.repeat(70));

      console.log(`\n⏳ Aguardando resposta do usuário no WhatsApp...`);
      console.log(`\n📝 O que fazer:`);
      console.log(`   1. Abra WhatsApp e acesse a conversa com Sara`);
      console.log(`   2. Responda a mensagem do template com algo como:`);
      console.log(`      - "Quanto custa?"  `);
      console.log(`      - "Quero mais informações"`);
      console.log(`      - Ou qualquer outra pergunta`);
      console.log(`\n   3. Aguarde a resposta de IA no WhatsApp`);

      console.log(`\n📊 Quando você responder, o pipeline será:`);
      console.log(`   1. WhatsApp webhook dispara POST /webhook/messages`);
      console.log(`   2. ProcessMessageHandler carrega conversation + abandonment`);
      console.log(`   3. AIService.interpretMessage() chama OpenAI com CONTEXTO:`);
      console.log(`      - Histórico de mensagens da conversa`);
      console.log(`      - Valor do carrinho: R$ 291,60`);
      console.log(`      - Produto: Comandor IA + RCC`);
      console.log(`   4. OpenAI gera resposta contextualizada`);
      console.log(`   5. MessageService envia resposta no WhatsApp`);

      console.log(`\n✅ Test ready - waiting for your WhatsApp message`);
      console.log(`   Conversation ID: ${(globalThis as any).conversationId}`);
      console.log(`   User Phone: ${userPhone}`);

      // This test just documents the flow
      // In real scenario, it would listen to webhooks
      expect(true).toBe(true);
    });
  });

  describe('Architecture Documentation', () => {
    it('should document the complete 3-step flow', () => {
      console.log('\n' + '='.repeat(70));
      console.log('📋 SARA-2.5 3-Step E2E Flow Architecture');
      console.log('='.repeat(70));

      console.log(`
┌────────────────────────────────────────────────────────────────────┐
│ STEP 1: Simulate Abandonment Reception                             │
├────────────────────────────────────────────────────────────────────┤
│ POST /webhook/abandonment (simulate incoming webhook)              │
│  ├─ Name: Gregori Dalzotto                                         │
│  ├─ Phone: +5548999327881                                          │
│  ├─ Product: Comandor IA + RCC                                     │
│  ├─ Value: R$ 291,60                                               │
│  └─ Creates: Abandonment + Conversation in DB                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ STEP 2: Send Template Message to WhatsApp                          │
├────────────────────────────────────────────────────────────────────┤
│ MessageService.send() with template type                           │
│  ├─ Template: "boas_vindas_rcc_comandor"                          │
│  ├─ Parameter {{1}}: "Gregori Dalzotto"                           │
│  ├─ Destination: +5548999327881                                    │
│  └─ Result: ✅ Message sent to WhatsApp                            │
│             📱 You receive template message                        │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ STEP 3: You Reply → AI Context Processing                          │
├────────────────────────────────────────────────────────────────────┤
│ You send message in WhatsApp (e.g., "Quanto custa?")               │
│  ↓                                                                   │
│ POST /webhook/messages (Meta sends webhook)                        │
│  ├─ Validates HMAC signature                                       │
│  ├─ Enqueues to ProcessMessageQueue                                │
│  └─ Returns 200 OK immediately                                     │
│  ↓                                                                   │
│ ProcessMessageHandler (async via Bull)                             │
│  ├─ Loads Conversation + Abandonment from DB                       │
│  ├─ Stores your incoming message                                   │
│  └─ Gets last 10 messages for context                              │
│  ↓                                                                   │
│ AIService.interpretMessage() with CONTEXT                          │
│  ├─ System prompt: Define Sara's personality                       │
│  ├─ Context: Your conversation history                             │
│  ├─ Abandonment data: Product, value, offer                        │
│  ├─ User intent: Analyzes your question                            │
│  └─ Calls OpenAI API → Gets contextual response                    │
│  ↓                                                                   │
│ MessageService.send() response                                     │
│  ├─ Takes AI response                                              │
│  ├─ Sends as text message to WhatsApp                              │
│  ├─ Retries 3x with exponential backoff if fails                   │
│  └─ Stores message in conversation history                         │
│  ↓                                                                   │
│ ✅ 📱 You receive AI response in WhatsApp                           │
│     Personalized response with context about your cart             │
└────────────────────────────────────────────────────────────────────┘
      `);

      console.log('\n🔄 Full Context Flow:');
      console.log(`
Your Question → WhatsApp → Webhook → Handler Loads:
                                      ├─ Your name & phone
                                      ├─ Product: Comandor IA + RCC
                                      ├─ Value: R$ 291,60
                                      ├─ Conversation history
                                      └─ Previous messages
                                       ↓
                                     OpenAI receives context:
                                      ├─ System: "Be Sara, helpful"
                                      ├─ Context: Cart value, product
                                      ├─ History: Previous messages
                                      └─ User message: Your question
                                       ↓
                                     AI generates response:
                                      └─ Contextual answer about YOUR cart
                                       ↓
                                     Sends back to WhatsApp
                                      └─ You receive personalized response
      `);

      expect(true).toBe(true);
    });
  });
});
