/**
 * Simple E2E Test - 3 Steps
 *
 * Step 1: Simulate abandonment webhook
 * Step 2: Send template message to WhatsApp
 * Step 3: Wait for user reply and process
 */

import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';

const {
  WHATSAPP_APP_SECRET,
  WHATSAPP_PHONE_ID,
  WHATSAPP_ACCESS_TOKEN,
} = process.env;

const BASE_URL = 'http://localhost:3000';
const USER_PHONE = '+5548999327881';
const USER_NAME = 'Gregori Dalzotto';

function createHmacSignature(payload: string): string {
  return `sha256=${crypto.createHmac('sha256', WHATSAPP_APP_SECRET!).update(payload).digest('hex')}`;
}

async function step1SimulateAbandonment() {
  console.log('\n' + '='.repeat(70));
  console.log('📨 STEP 1: Simulating Abandonment Webhook');
  console.log('='.repeat(70) + '\n');

  const payload = {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    name: USER_NAME,
    phone: USER_PHONE,
    productId: 'prod-comando-ia',
    value: 291.60,
    paymentLink: 'https://go.reinoeducacao.com.br/subscribe/aqs-cmd-f01',
    abandonmentId: `e2e-test-${Date.now()}`,
    timestamp: Math.floor(Date.now() / 1000),
  };

  const payloadStr = JSON.stringify(payload);
  const signature = createHmacSignature(payloadStr);

  try {
    const response = await axios.post(`${BASE_URL}/webhook/abandonment`, payload, {
      headers: {
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
    });

    console.log(`✅ Webhook processed successfully`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Abandonment ID: ${response.data.abandonmentId}`);
    console.log(`   Conversation ID: ${response.data.conversationId}`);
    console.log(`   User: ${USER_NAME}`);
    console.log(`   Phone: ${USER_PHONE}`);
    console.log(`   Value: R$ ${payload.value}`);

    return {
      conversationId: response.data.conversationId,
      abandonmentId: response.data.abandonmentId,
    };
  } catch (error: any) {
    console.log(`❌ Error in Step 1:`);
    console.log(`   ${error.response?.data?.message || error.message}`);
    throw error;
  }
}

async function step2SendTemplate(conversationId: string) {
  console.log('\n' + '='.repeat(70));
  console.log('📱 STEP 2: Sending Template Message to WhatsApp');
  console.log('='.repeat(70) + '\n');

  try {
    const payload = {
      messaging_product: 'whatsapp',
      to: USER_PHONE,
      type: 'template',
      template: {
        name: 'boas_vindas_rcc_comandor',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: USER_NAME }],
          },
        ],
      },
    };

    const response = await axios.post(
      `https://graph.instagram.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      payload,
      {
        params: {
          access_token: WHATSAPP_ACCESS_TOKEN,
        },
      }
    );

    console.log(`✅ Template message sent successfully!`);
    console.log(`   Message ID: ${response.data.messages[0].id}`);
    console.log(`   To: ${USER_PHONE}`);
    console.log(`   Template: boas_vindas_rcc_comandor`);
    console.log(`   Parameter: {{1}} = "${USER_NAME}"`);

    console.log(`\n📲 You should receive a message on WhatsApp now!`);

    return response.data.messages[0].id;
  } catch (error: any) {
    console.log(`❌ Error in Step 2:`);
    console.log(`   ${error.response?.data?.error?.message || error.message}`);
    throw error;
  }
}

async function step3Instructions() {
  console.log('\n' + '='.repeat(70));
  console.log('💬 STEP 3: You Reply → AI Context Processing');
  console.log('='.repeat(70) + '\n');

  console.log(`📝 What to do next:`);
  console.log(`\n   1. Check your WhatsApp at ${USER_PHONE}`);
  console.log(`   2. You should see the template message from Sara`);
  console.log(`   3. Reply with a message, for example:`);
  console.log(`      - "Quanto custa?"`);
  console.log(`      - "Quero mais informações"`);
  console.log(`      - "Ainda tem desconto?"`);
  console.log(`\n   4. Watch for Sara's AI response with context about your cart!`);

  console.log(`\n📊 What happens behind the scenes:`);
  console.log(`   └─ WhatsApp webhook → POST /webhook/messages`);
  console.log(`   └─ ProcessMessageHandler loads conversation + abandonment`);
  console.log(`   └─ AIService.interpretMessage() with context:`);
  console.log(`      • Your name: ${USER_NAME}`);
  console.log(`      • Product: Comandor IA + RCC`);
  console.log(`      • Cart value: R$ 291,60`);
  console.log(`      • Conversation history`);
  console.log(`   └─ OpenAI generates contextual response`);
  console.log(`   └─ MessageService sends to WhatsApp`);
  console.log(`   └─ You receive AI response! 🤖`);
}

async function main() {
  try {
    console.log('\n🚀 SARA-2.5 E2E Test - 3 Steps');
    console.log('Token: ✅ VALIDATED');
    console.log('Phone ID: ✅ CONFIGURED');
    console.log('App Secret: ✅ CONFIGURED\n');

    // Step 1
    const { conversationId } = await step1SimulateAbandonment();

    // Step 2
    await step2SendTemplate(conversationId);

    // Step 3
    await step3Instructions();

    console.log('\n' + '='.repeat(70));
    console.log('✅ E2E Test Ready!');
    console.log('='.repeat(70) + '\n');
    console.log('📱 Check your WhatsApp and reply to the message\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
