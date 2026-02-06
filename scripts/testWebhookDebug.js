#!/usr/bin/env node

/**
 * Webhook Debug Tester
 * Tests the /webhook/debug endpoint to validate HMAC signatures
 */

import http from 'http';
import crypto from 'crypto';

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '13427a96bd84964d9165f6a697a9754f';
const PHONE_NUMBER = '5548991080788';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         📊 Webhook Debug Tool - HMAC Validation              ║
║                                                               ║
║  Este endpoint ajuda a debugar problemas com HMAC            ║
║  Mostra exatamente qual é a assinatura esperada vs recebida  ║
╚═══════════════════════════════════════════════════════════════╝

🔧 Como usar:

1. Você recebe um webhook do Meta/WhatsApp
2. Faça um POST para este endpoint com exatamente o mesmo:
   - Body (JSON)
   - Headers (incluindo X-Hub-Signature-256)

Exemplo com curl:
  curl -X POST http://localhost:3000/webhook/debug \\
    -H "Content-Type: application/json" \\
    -H "X-Hub-Signature-256: sha256=abcd1234..." \\
    -d '{...seu body aqui...}'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧪 Testando com exemplo de webhook...
`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendDebugRequest(payload, signature) {
  return new Promise((resolve, reject) => {
    const rawBody = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/webhook/debug',
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.write(rawBody);
    req.end();
  });
}

async function runDebugTest() {
  try {
    // Create test payload
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
                    from: PHONE_NUMBER.replace('+', ''),
                    id: 'wamid.test' + Date.now(),
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: 'Teste com assinatura correta',
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

    // Calculate correct signature
    const rawBody = JSON.stringify(payload);
    const correctSignature = crypto
      .createHmac('sha256', WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    console.log('📝 Teste 1: Assinatura CORRETA');
    console.log(''.padStart(70, '='));
    console.log(`✅ Enviando webhook com signature VÁLIDA...`);

    const result1 = await sendDebugRequest(payload, correctSignature);

    console.log(`
📊 Resultado:
  Signature Match: ${result1.signature.match ? '✅ SIM!' : '❌ NÃO'}
  Recebida: ${result1.signature.received.substring(0, 20)}...
  Esperada: ${result1.signature.expected.substring(0, 20)}...
  Body Size: ${result1.body.rawLength} bytes
`);

    // Test with wrong signature
    console.log('\n📝 Teste 2: Assinatura INCORRETA (para comparação)');
    console.log(''.padStart(70, '='));

    const wrongSignature = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
    console.log(`❌ Enviando webhook com signature INVÁLIDA...`);

    const result2 = await sendDebugRequest(payload, wrongSignature);

    console.log(`
📊 Resultado:
  Signature Match: ${result2.signature.match ? '✅ SIM!' : '❌ NÃO'}
  Recebida: ${result2.signature.received.substring(0, 20)}...
  Esperada: ${result2.signature.expected.substring(0, 20)}...
`);

    // Show how to use
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    🎯 Próximos Passos                        ║
╚═══════════════════════════════════════════════════════════════╝

Se você receber um webhook real do Meta que falha:

1. Capture o Body JSON completo
2. Capture o Header: X-Hub-Signature-256
3. Faça um POST para:

   curl -X POST http://localhost:3000/webhook/debug \\
     -H "Content-Type: application/json" \\
     -H "X-Hub-Signature-256: {COPIE_O_HEADER_AQUI}" \\
     -d '{COPIE_O_BODY_JSON_AQUI}'

4. A resposta mostrará:
   ✅ Se a signature é válida
   ✅ Qual é a esperada vs recebida
   ✅ Tamanho do body
   ✅ Análise do problema

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 Endpoint disponível em: http://localhost:3000/webhook/debug

Compartilhe a resposta completa para que eu possa debugar! 🔍
    `);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Erro: ${error.message}`);
    process.exit(1);
  }
}

runDebugTest();
