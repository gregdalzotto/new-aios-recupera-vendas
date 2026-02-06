import https from 'https';
import http from 'http';
import { URL } from 'url';

// Configurações
const config = {
  webhookUrl: 'https://337c-2804-1b3-8401-c0e7-1176-a787-6cd7-cb7e.ngrok-free.app/webhook/messages',
  verifyToken: 'sLRrzIJaOSGtl6jekXDBMRvX',
  whatsappPhoneId: '727258347143266',
  accessToken: 'EAAMLT8etIiMBQjU4mW4iz5sQwH5H512PrVlZCieun3TOIzYPTPvx6Jx8ZA9v7ZCAOQIMDHhfn0OQIrBR7QekZCU0uVqxornKf6aGmSfQ022F3sXbOa6CwIBYoZC5qtvzqZChetAtojnfCP8YJNpBhJi7SQhMnNXejjm2ZC0Tt7dUP9rRUkv60OeyNyaVFrtWwZDZD',
  templateName: 'boas_vindas_rcc_comandor',
  recipientPhone: '5548991080788', // Sem +
  userName: 'Cliente'
};

// ===== PASSO 1: Validar Challenge do Webhook =====
async function testWebhookChallenge() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 PASSO 1: Validar Challenge do Webhook (GET)');
  console.log('='.repeat(60));

  const url = new URL(config.webhookUrl);
  url.searchParams.append('hub.mode', 'subscribe');
  url.searchParams.append('hub.challenge', 'test_challenge_123');
  url.searchParams.append('hub.verify_token', config.verifyToken);

  console.log('\n🔗 URL:', url.toString());
  console.log('🔑 Verify Token:', config.verifyToken);

  return new Promise((resolve) => {
    https.get(url.toString(), (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('\n✅ Response Status:', res.statusCode);
        console.log('📄 Response Body:', data);

        if (res.statusCode === 200 && data === 'test_challenge_123') {
          console.log('\n✅ ✅ WEBHOOK VALIDATION SUCCESS! ✅ ✅');
          resolve(true);
        } else {
          console.log('\n❌ Webhook validation failed');
          resolve(false);
        }
      });
    }).on('error', (error) => {
      console.error('❌ Request error:', error);
      resolve(false);
    });
  });
}

// ===== PASSO 2: Enviar Template =====
async function sendTemplate() {
  console.log('\n' + '='.repeat(60));
  console.log('📨 PASSO 2: Enviar Template WhatsApp');
  console.log('='.repeat(60));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: config.recipientPhone,
    type: 'template',
    template: {
      name: config.templateName,
      language: {
        code: 'pt_BR'
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: config.userName
            }
          ]
        }
      ]
    }
  };

  const apiUrl = `https://graph.facebook.com/v18.0/${config.whatsappPhoneId}/messages`;

  console.log('\n📦 Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n🔗 API URL:', apiUrl);
  console.log('🔑 Using Access Token:', config.accessToken.substring(0, 20) + '...');

  return new Promise((resolve) => {
    const url = new URL(apiUrl);
    const body = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search + `?access_token=${config.accessToken}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('\n✅ Response Status:', res.statusCode);
        console.log('📄 Response Body:');
        try {
          const parsed = JSON.parse(data);
          console.log(JSON.stringify(parsed, null, 2));

          if (res.statusCode === 200) {
            console.log('\n✅ ✅ TEMPLATE SENT SUCCESS! ✅ ✅');
            console.log('Message ID:', parsed.messages?.[0]?.id);
            resolve(true);
          } else {
            console.log('\n❌ Template send failed');
            console.log('Error:', parsed.error?.message);
            resolve(false);
          }
        } catch {
          console.log(data);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

// ===== EXECUTAR TESTES =====
async function runTests() {
  console.log('\n');
  console.log('🚀'.repeat(30));
  console.log('   SARA-2.5: Webhook Validation & Template Send Test');
  console.log('🚀'.repeat(30));

  console.log('\n⚙️  Configuration:');
  console.log('  - Webhook URL:', config.webhookUrl);
  console.log('  - Template:', config.templateName);
  console.log('  - Recipient:', `+${config.recipientPhone}`);
  console.log('  - User Name:', config.userName);

  // Passo 1: Validar webhook
  const webhookOk = await testWebhookChallenge();

  // Passo 2: Enviar template
  const templateOk = await sendTemplate();

  // Resumo final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTADO FINAL');
  console.log('='.repeat(60));
  console.log('\n1️⃣  Webhook Challenge:', webhookOk ? '✅ PASSOU' : '❌ FALHOU');
  console.log('2️⃣  Template Send:', templateOk ? '✅ PASSOU' : '❌ FALHOU');

  if (webhookOk && templateOk) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM! 🎉');
    console.log('\nPróximo passo: Verifique seu WhatsApp para a mensagem');
  } else {
    console.log('\n⚠️  Alguns testes falharam. Verifique os logs acima.');
  }

  console.log('\n' + '='.repeat(60) + '\n');

  process.exit(webhookOk && templateOk ? 0 : 1);
}

// Executar
runTests();
