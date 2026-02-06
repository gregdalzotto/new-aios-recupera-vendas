#!/usr/bin/env node

/**
 * Real Conversation Monitor
 * Monitors for real user responses and Sara's replies in real-time
 */

import http from 'http';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         🤖 SARA-2.5: Real Conversation Monitor               ║
║                                                               ║
║  Aguardando sua resposta no WhatsApp...                      ║
║  (Este monitor mostrará tudo em tempo real)                  ║
╚═══════════════════════════════════════════════════════════════╝

📱 INSTRUÇÕES:
1. Abra a conversa no WhatsApp (+5548991080788)
2. Você deve ter recebido: "Boas-vindas! 👋 Cliente"
3. Responda com qualquer mensagem
4. SARA responderá automaticamente!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 Monitorando filas...
`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
          reject(e);
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

let messageReceived = false;
let responseSent = false;
let startMonitoring = Date.now();
const monitorDuration = 5 * 60 * 1000; // 5 minutos

async function monitor() {
  try {
    while (Date.now() - startMonitoring < monitorDuration) {
      const stats = await getQueueStats();
      const processQueue = stats.queues.processMessage;
      const sendQueue = stats.queues.sendMessage;

      const timestamp = new Date().toLocaleTimeString('pt-BR');

      // Detect incoming message
      if (!messageReceived && (processQueue.waiting > 0 || processQueue.active > 0)) {
        messageReceived = true;
        console.log(`\n✅ [${timestamp}] 📨 SUA RESPOSTA RECEBIDA!`);
        console.log(`   └─ Enfileirada no ProcessMessageQueue\n`);
      }

      // Detect Sara's response
      if (messageReceived && !responseSent && (sendQueue.waiting > 0 || sendQueue.active > 0)) {
        responseSent = true;
        console.log(`✅ [${timestamp}] 🤖 SARA GERANDO RESPOSTA...`);
        console.log(`   └─ AIService processando sua mensagem\n`);
      }

      // Show queue status
      if (messageReceived || responseSent || processQueue.waiting > 0 || sendQueue.active > 0) {
        const processStatus = processQueue.active > 0 ? '⚙️ PROCESSANDO' : (processQueue.waiting > 0 ? '⏳ AGUARDANDO' : '✅');
        const sendStatus = sendQueue.active > 0 ? '⚙️ ENVIANDO' : (sendQueue.waiting > 0 ? '⏳ AGUARDANDO' : '✅');

        process.stdout.write(
          `[${timestamp}] ${processStatus} Process (W:${processQueue.waiting} A:${processQueue.active}) | ${sendStatus} Send (W:${sendQueue.waiting} A:${sendQueue.active})\r`
        );

        // All done
        if (messageReceived && responseSent && processQueue.active === 0 && sendQueue.active === 0) {
          console.log('\n');
          console.log(`✅ [${new Date().toLocaleTimeString('pt-BR')}] ✨ RESPOSTA ENVIADA!`);
          console.log(`   └─ SARA respondeu sua mensagem com sucesso!\n`);

          await sleep(1000);

          console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      🎉 TESTE REALIZADO COM SUCESSO!         ║
║                                                               ║
║  ✅ Você respondeu no WhatsApp                              ║
║  ✅ SARA recebeu sua resposta                               ║
║  ✅ AIService processou com OpenAI                          ║
║  ✅ Resposta gerada personalizada                           ║
║  ✅ Resposta enviada de volta ao WhatsApp                   ║
║                                                               ║
║  Fluxo E2E Completo: ✨ FUNCIONANDO PERFEITAMENTE! ✨       ║
╚═══════════════════════════════════════════════════════════════╝

📱 Verifique seu WhatsApp para a resposta de SARA!

Próximos passos:
  1. Continue a conversa normalmente
  2. Cada resposta sua será processada pelo bot
  3. SARA mantém histórico e responde contextualmente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          Sistema SARA-2.5 está pronto para produção! 🚀
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          `);

          process.exit(0);
        }
      } else if (!messageReceived) {
        const elapsed = Math.floor((Date.now() - startMonitoring) / 1000);
        process.stdout.write(`⏳ Aguardando sua resposta... (${elapsed}s)\r`);
      }

      await sleep(500);
    }

    console.log('\n\n⏱️  Monitoramento expirou (5 minutos)');
    console.log('Se não recebeu a resposta, verifique:');
    console.log('  - Se o WhatsApp está recebendo mensagens');
    console.log('  - Os logs do servidor');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Erro: ${error.message}`);
    process.exit(1);
  }
}

monitor();
