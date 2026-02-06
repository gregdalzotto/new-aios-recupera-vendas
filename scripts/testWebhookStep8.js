import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';

// Credenciais do environment
const APP_SECRET = '13427a96bd84964d9165f6a697a9754f';
const WEBHOOK_URL = 'http://localhost:3000/webhook/messages';

// Payload do webhook - EXATAMENTE como será enviado
const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            messages: [
              {
                from: '+5548999327881',
                id: 'wamsg-test-manual',
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: {
                  body: 'Teste de webhook manual'
                }
              }
            ]
          }
        }
      ]
    }
  ]
};

// Converter para JSON string - MAS COM ESPAÇAMENTO CONSISTENTE
const payloadStr = JSON.stringify(payload);
console.log('📦 Payload to be sent:');
console.log(payloadStr);
console.log('');

// Calcular assinatura HMAC-SHA256
const signature = crypto
  .createHmac('sha256', APP_SECRET)
  .update(payloadStr)
  .digest('hex');

const fullSignature = `sha256=${signature}`;
console.log('🔐 Calculated Signature:');
console.log(`   ${fullSignature}`);
console.log('');

// Preparar headers
const headers = {
  'Content-Type': 'application/json',
  'x-hub-signature-256': fullSignature,
  'Content-Length': Buffer.byteLength(payloadStr)
};

console.log('📋 Headers:');
console.log(headers);
console.log('');

// Fazer a requisição
console.log('🚀 Sending webhook test...\n');

const url = new URL(WEBHOOK_URL);
const options = {
  hostname: url.hostname,
  port: url.port || 80,
  path: url.pathname,
  method: 'POST',
  headers: headers
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`\n✅ Response Status: ${res.statusCode}`);
    console.log('📄 Response Body:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(data);
    }

    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('\n✅ WEBHOOK TEST PASSED!');
      process.exit(0);
    } else {
      console.log('\n❌ WEBHOOK TEST FAILED!');
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
  process.exit(1);
});

// Enviar o payload
req.write(payloadStr);
req.end();
