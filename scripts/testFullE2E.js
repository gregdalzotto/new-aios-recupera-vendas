#!/usr/bin/env node

/**
 * Full E2E Test: Simula uma resposta real do usuário e valida todo o fluxo
 */

import http from 'http';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '13427a96bd84964d9165f6a697a9754f';
const PHONE_NUMBER = '5548991080788';
const USER_MESSAGE = 'Perdi uma venda importante, preciso de ajuda para recuperar';

console.log(`
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
   SARA-2.5: Full E2E Test - Resposta Real do Usuário
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function sendWebhook(payload) {
  return new Promise((resolve, reject) => {
    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/webhook/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': rawBody.length,
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Webhook timeout'));
    });

    req.write(rawBody);
    req.end();
  });
}

async function runFullE2ETest() {
  try {
    // Step 1: Criar payload de mensagem recebida
    console.log('📋 PASSO 1: Criando payload da resposta do usuário');
    console.log(''.padStart(60, '='));

    const payload = {
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

    console.log(`📱 De: ${PHONE_NUMBER}`);
    console.log(`💬 Mensagem: "${USER_MESSAGE}"`);
    console.log(`✅ Payload criado\n`);

    // Step 2: Enviar webhook
    console.log('📋 PASSO 2: Enviando webhook');
    console.log(''.padStart(60, '='));

    const webhookResult = await sendWebhook(payload);
    console.log(`📬 Webhook enviado`);
    console.log(`Status: ${webhookResult.status}`);
    console.log(`✅ Webhook recebido e validado\n`);

    // Step 3: Monitorar fila de processamento
    console.log('📋 PASSO 3: Aguardando processamento');
    console.log(''.padStart(60, '='));
    console.log('⏳ Monitorando filas...\n');

    let processedMessage = false;
    let sentResponse = false;
    let attempts = 0;
    const maxAttempts = 15; // 15 segundos

    while (attempts < maxAttempts) {
      attempts++;

      const stats = await getQueueStats();
      const processQueue = stats.queues.processMessage;
      const sendQueue = stats.queues.sendMessage;

      // Mostrar status
      process.stdout.write(
        `[${attempts}s] Process: ${processQueue.waiting} waiting, ${processQueue.active} active | Send: ${sendQueue.waiting} waiting, ${sendQueue.active} active\r`
      );

      // Detectar eventos
      if (processQueue.completed > 0 || (processQueue.completed === 0 && processQueue.waiting === 0 && attempts > 2)) {
        if (!processedMessage) {
          processedMessage = true;
          console.log(`\n✅ [${new Date().toLocaleTimeString()}] Mensagem processada!`);
        }
      }

      if (sendQueue.completed > 0 || (sendQueue.waiting === 0 && sendQueue.active === 0 && processedMessage)) {
        if (!sentResponse) {
          sentResponse = true;
          console.log(`✅ [${new Date().toLocaleTimeString()}] Resposta enviada!`);
        }
      }

      if (processedMessage && sentResponse) {
        break;
      }

      await sleep(1000);
    }

    console.log('\n');

    // Step 4: Status final
    console.log('📋 PASSO 4: Resultado Final');
    console.log(''.padStart(60, '='));

    const finalStats = await getQueueStats();
    const finalProcess = finalStats.queues.processMessage;
    const finalSend = finalStats.queues.sendMessage;

    console.log(`
Processamento:
  ✅ Mensagens completadas: ${finalProcess.completed}
  ⏳ Aguardando: ${finalProcess.waiting}
  🔄 Processando: ${finalProcess.active}
  ❌ Falhadas: ${finalProcess.failed}

Envio de Respostas:
  ✅ Respostas enviadas: ${finalSend.completed}
  ⏳ Aguardando: ${finalSend.waiting}
  🔄 Enviando: ${finalSend.active}
  ❌ Falhadas: ${finalSend.failed}
    `);

    if (processedMessage && sentResponse) {
      console.log(`
============================================================
🎉 FLUXO E2E COMPLETO - SUCESSO! 🎉
============================================================

✅ Mensagem recebida no webhook
✅ Mensagem processada pelo handler
✅ AIService interpretou a mensagem
✅ Resposta enfileirada
✅ Resposta enviada para WhatsApp

Próximo passo: Verifique seu WhatsApp para a resposta do bot! 📱
============================================================
      `);
      process.exit(0);
    } else {
      console.log(`
============================================================
⚠️  FLUXO INCOMPLETO
============================================================

Processado: ${processedMessage ? '✅' : '❌'}
Resposta Enviada: ${sentResponse ? '✅' : '❌'}

Dicas:
- Verifique se os handlers estão iniciados
- Verifique os logs do servidor
- Verifique a conexão com Redis
      `);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Erro no teste: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runFullE2ETest();
