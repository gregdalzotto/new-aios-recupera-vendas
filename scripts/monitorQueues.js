#!/usr/bin/env node

/**
 * Real-time Queue Monitor
 * Monitora as filas ProcessMessage e SendMessage em tempo real
 */

import http from 'http';

const BASE_URL = 'http://localhost:3000';
let lastStats = null;
let messageCount = 0;

function clearScreen() {
  console.clear();
}

function getQueueStats() {
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
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function formatQueue(name, queue) {
  const total = queue.waiting + queue.active + queue.completed + queue.failed;
  const status = queue.active > 0 ? '⚙️ PROCESSANDO' : queue.waiting > 0 ? '⏳ AGUARDANDO' : '✅ VAZIO';

  return `
┌──────────────────────────────────────────────────┐
│ ${name.padEnd(45)} │
├──────────────────────────────────────────────────┤
│ Status: ${status.padEnd(38)} │
│ ⏳ Aguardando:    ${String(queue.waiting).padStart(2)}  🔄 Ativo:    ${String(queue.active).padStart(2)} │
│ ✅ Completos:    ${String(queue.completed).padStart(2)}  ❌ Falhados: ${String(queue.failed).padStart(2)} │
│ ⏱️  Atrasados:    ${String(queue.delayed).padStart(2)}  📊 Total:    ${String(total).padStart(2)} │
└──────────────────────────────────────────────────┘`;
}

function displayDashboard(stats) {
  clearScreen();

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║               📊 SARA-2.5: QUEUE MONITOR                      ║
║              Real-time Message Processing                     ║
╚═══════════════════════════════════════════════════════════════╝

Timestamp: ${new Date().toLocaleTimeString('pt-BR')}
Monitorando desde: ${messageCount} verificações

${formatQueue('PROCESS MESSAGE QUEUE', stats.queues.processMessage)}
${formatQueue('SEND MESSAGE QUEUE', stats.queues.sendMessage)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 FLUXO ESPERADO:
  1️⃣  Mensagem entra no webhook
  2️⃣  Enfileirada no PROCESS MESSAGE QUEUE
  3️⃣  Handler processa (AIService interpreta)
  4️⃣  Resposta enfileirada no SEND MESSAGE QUEUE
  5️⃣  Handler envia resposta via WhatsApp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Pressione Ctrl+C para parar
  `);
}

async function monitor() {
  console.log('Iniciando monitor de filas...');

  while (true) {
    try {
      messageCount++;
      const stats = await getQueueStats();
      displayDashboard(stats);

      // Detectar mudanças importantes
      if (lastStats) {
        const prevProcess = lastStats.queues.processMessage.waiting;
        const currProcess = stats.queues.processMessage.waiting;

        if (currProcess > prevProcess) {
          console.log(`\n🔔 [${new Date().toLocaleTimeString('pt-BR')}] Nova mensagem recebida!`);
        }

        if (currProcess < prevProcess) {
          console.log(`\n✅ [${new Date().toLocaleTimeString('pt-BR')}] Mensagem processada!`);
        }
      }

      lastStats = stats;

      // Atualizar a cada 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Erro ao conectar: ${error.message}`);
      console.log('Tentando reconectar em 3s...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

// Iniciar monitor
monitor().catch(error => {
  console.error('Monitor error:', error);
  process.exit(1);
});
