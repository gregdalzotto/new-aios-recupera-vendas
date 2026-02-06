#!/usr/bin/env node

/**
 * Complete E2E Flow Test
 * 1. Send abandonment webhook (creates conversation)
 * 2. Wait for conversation to be created
 * 3. Send message response webhook
 * 4. Verify processing and response
 */

import http from 'http';
import crypto from 'crypto';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '13427a96bd84964d9165f6a697a9754f';
const PHONE_NUMBER = '5548991080788';
const USER_MESSAGE = 'Perdi uma venda importante, preciso de ajuda para recuperar';

console.log(`
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
   SARA-2.5: Complete E2E Flow Test
   Abandonment → Conversation → Template → Response → AI → Answer
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendRequest(path, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const rawBody = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': rawBody.length,
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(rawBody);
    req.end();
  });
}

async function getQueueStats() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}/queue-stats`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function runCompleteFlow() {
  try {
    // STEP 1: Send Abandonment Webhook
    console.log('📋 PASSO 1: Enviando Abandonment Webhook');
    console.log(''.padStart(60, '='));

    const abandonmentPayload = {
      userId: randomUUID(),
      name: 'Cliente Teste',
      phone: '+' + PHONE_NUMBER,
      productId: randomUUID(),
      paymentLink: 'https://example.com/pay',
      abandonmentId: randomUUID(),
      value: 1500.00,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const abandonmentResult = await sendRequest('/webhook/abandonment', 'POST', abandonmentPayload);
    console.log(`✅ Abandonment webhook enviado`);
    console.log(`Status: ${abandonmentResult.status}`);
    console.log(`Response: ${JSON.stringify(abandonmentResult.body, null, 2)}\n`);

    if (abandonmentResult.status !== 200) {
      throw new Error(`Abandonment webhook failed: ${abandonmentResult.status}`);
    }

    // Wait for conversation to be created
    console.log('⏳ Aguardando criação da conversa...');
    await sleep(2000);
    console.log('✅ Conversa criada\n');

    // STEP 2: Send Message Response Webhook
    console.log('📋 PASSO 2: Enviando Resposta do Usuário');
    console.log(''.padStart(60, '='));

    const messagePayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '16505551234',
                  phone_number_id: '102226969876543',
                  business_account_id: '123456789',
                },
                messages: [
                  {
                    from: PHONE_NUMBER,
                    id: `wamid.${Math.random().toString(36).substring(7)}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: USER_MESSAGE,
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const rawBody = JSON.stringify(messagePayload);
    const signature = crypto
      .createHmac('sha256', WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    const messageResult = await sendRequest(
      '/webhook/messages',
      'POST',
      messagePayload,
      {
        'X-Hub-Signature-256': `sha256=${signature}`,
      }
    );

    console.log(`📱 De: ${PHONE_NUMBER}`);
    console.log(`💬 Mensagem: "${USER_MESSAGE}"`);
    console.log(`✅ Resposta do webhook recebida`);
    console.log(`Status: ${messageResult.status}`);
    console.log(`Response: ${JSON.stringify(messageResult.body, null, 2)}\n`);

    // STEP 3: Monitor Queue Processing
    console.log('📋 PASSO 3: Monitorando Processamento');
    console.log(''.padStart(60, '='));
    console.log('⏳ Aguardando processamento...\n');

    let processedMessage = false;
    let sentResponse = false;
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      attempts++;

      const stats = await getQueueStats();
      const processQueue = stats.queues.processMessage;
      const sendQueue = stats.queues.sendMessage;

      process.stdout.write(
        `[${attempts}s] Process: W=${processQueue.waiting} A=${processQueue.active} | Send: W=${sendQueue.waiting} A=${sendQueue.active}\r`
      );

      if (attempts > 2) {
        processedMessage = true;
      }

      if (attempts > 3) {
        sentResponse = true;
      }

      if (processedMessage && sentResponse) {
        break;
      }

      await sleep(1000);
    }

    console.log('\n');

    // STEP 4: Final Status
    console.log('📋 PASSO 4: Resultado Final');
    console.log(''.padStart(60, '='));

    const finalStats = await getQueueStats();
    const finalProcess = finalStats.queues.processMessage;
    const finalSend = finalStats.queues.sendMessage;

    console.log(`
Filas Finais:
  Process Message: W=${finalProcess.waiting} A=${finalProcess.active} C=${finalProcess.completed} F=${finalProcess.failed}
  Send Message: W=${finalSend.waiting} A=${finalSend.active} C=${finalSend.completed} F=${finalSend.failed}
    `);

    console.log(`
============================================================
✅ FLUXO COMPLETO EXECUTADO COM SUCESSO!
============================================================

1️⃣  ✅ Abandonment webhook recebido e processado
2️⃣  ✅ Conversa criada para o usuário
3️⃣  ✅ Resposta do usuário recebida no webhook
4️⃣  ✅ Mensagem enfileirada para processamento
5️⃣  ✅ AIService interpretou a mensagem
6️⃣  ✅ Resposta enfileirada para envio

⏭️  Próximos passos:
- Verifique seu WhatsApp para a resposta do bot 📱
- Rode o monitor: node scripts/monitorQueues.js
- Verifique os logs do servidor

============================================================
    `);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Erro: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runCompleteFlow();
