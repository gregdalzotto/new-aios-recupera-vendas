#!/usr/bin/env node

/**
 * Test Second Message - Live Monitoring
 * Sends a second test message and monitors processing in real-time
 */

import http from 'http';
import crypto from 'crypto';

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '13427a96bd84964d9165f6a697a9754f';
const PHONE_NUMBER = '5548991080788';

// Different test messages for variety
const testMessages = [
  'Qual é o melhor desconto que vocês podem oferecer?',
  'Quanto tempo levaria para receber o produto?',
  'Existe alguma promoção especial em andamento?',
  'Posso parcelar em quantas vezes?',
  'Quais são as formas de pagamento disponíveis?',
];

const userMessage = testMessages[Math.floor(Math.random() * testMessages.length)];

console.log(`
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
   SARA-2.5: Test Second Message (Live Monitoring)
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
    const req = http.get('http://localhost:3000/queue-stats', (res) => {
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

async function runTest() {
  try {
    // Step 1: Send message webhook
    console.log('📋 PASSO 1: Enviando Mensagem');
    console.log(''.padStart(70, '='));
    console.log(`📱 Número: ${PHONE_NUMBER}`);
    console.log(`💬 Mensagem: "${userMessage}"`);
    console.log('');

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
                    from: PHONE_NUMBER.replace('+', ''),
                    id: `wamid.${Math.random().toString(36).substring(7)}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: userMessage,
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

    const result = await sendRequest(
      '/webhook/messages',
      'POST',
      messagePayload,
      { 'X-Hub-Signature-256': `sha256=${signature}` }
    );

    console.log(`✅ Webhook enviado (Status: ${result.status})`);
    console.log('');

    // Step 2: Monitor queue
    console.log('📋 PASSO 2: Monitorando Processamento em Tempo Real');
    console.log(''.padStart(70, '='));

    let isProcessing = false;
    let lastActiveTime = Date.now();
    const timeout = 20000; // 20 segundo timeout

    for (let i = 0; i < 25; i++) {
      const stats = await getQueueStats();
      const processQueue = stats.queues.processMessage;
      const sendQueue = stats.queues.sendMessage;

      const hasJobs = processQueue.waiting > 0 || processQueue.active > 0 ||
                      sendQueue.waiting > 0 || sendQueue.active > 0;

      if (hasJobs) {
        isProcessing = true;
        lastActiveTime = Date.now();
      }

      // Display status
      const timestamp = new Date().toLocaleTimeString('pt-BR');
      const processStatus = processQueue.active > 0 ? '⚙️ PROCESSANDO' : '✅';
      const sendStatus = sendQueue.active > 0 ? '⚙️ ENVIANDO' : '✅';

      process.stdout.write(
        `[${timestamp}] ${processStatus} Process: W=${processQueue.waiting} A=${processQueue.active} | ${sendStatus} Send: W=${sendQueue.waiting} A=${sendQueue.active}\r`
      );

      if (!isProcessing && Date.now() - lastActiveTime > 2000) {
        console.log('');
        break;
      }

      await sleep(800);
    }

    console.log('');
    console.log('');

    // Step 3: Final status
    console.log('📋 PASSO 3: Resultado Final');
    console.log(''.padStart(70, '='));

    const finalStats = await getQueueStats();
    console.log(`
Process Message Queue:
  ⏳ Aguardando: ${finalStats.queues.processMessage.waiting}
  🔄 Processando: ${finalStats.queues.processMessage.active}
  ✅ Completados: ${finalStats.queues.processMessage.completed}
  ❌ Falhados: ${finalStats.queues.processMessage.failed}

Send Message Queue:
  ⏳ Aguardando: ${finalStats.queues.sendMessage.waiting}
  🔄 Enviando: ${finalStats.queues.sendMessage.active}
  ✅ Enviados: ${finalStats.queues.sendMessage.completed}
  ❌ Falhados: ${finalStats.queues.sendMessage.failed}
    `);

    console.log(`
============================================================
📊 RESULTADO
============================================================

✅ Mensagem enviada para processamento
✅ Handler processando resposta via AIService
✅ Resposta sendo enviada para WhatsApp

⏭️  Próximo: Verifique seu WhatsApp para a resposta do bot!

Você deverá receber uma resposta personalizada baseada em:
- Sua pergunta/mensagem
- Histórico da conversa
- Valor do carrinho abandonado
- Estratégias de recuperação de vendas

============================================================
    `);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Erro: ${error.message}`);
    process.exit(1);
  }
}

runTest();
