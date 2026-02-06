import https from 'https';
import { URL } from 'url';

const accessToken = 'EAAMLT8etIiMBQjU4mW4iz5sQwH5H512PrVlZCieun3TOIzYPTPvx6Jx8ZA9v7ZCAOQIMDHhfn0OQIrBR7QekZCU0uVqxornKf6aGmSfQ022F3sXbOa6CwIBYoZC5qtvzqZChetAtojnfCP8YJNpBhJi7SQhMnNXejjm2ZC0Tt7dUP9rRUkv60OeyNyaVFrtWwZDZD';
const appId = '856862210466339';
const phoneId = '727258347143266';

console.log('\n' + '='.repeat(60));
console.log('🔍 Validando Access Token');
console.log('='.repeat(60));

console.log('\n📊 Informações:');
console.log('  Token (primeiros 20 chars):', accessToken.substring(0, 20) + '...');
console.log('  App ID:', appId);
console.log('  Phone ID:', phoneId);

// Teste 1: Validar token com /me endpoint
const meUrl = new URL('https://graph.facebook.com/v18.0/me');
meUrl.searchParams.append('access_token', accessToken);

console.log('\n' + '-'.repeat(60));
console.log('Teste 1️⃣ : Validar Token (/me)');
console.log('-'.repeat(60));

https.get(meUrl.toString(), (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const response = JSON.parse(data);
      console.log('Response:', JSON.stringify(response, null, 2));

      if (res.statusCode === 200) {
        console.log('✅ Token é válido!');
        console.log('User/App ID:', response.id);
      } else {
        console.log('❌ Token inválido ou expirado');
        console.log('Erro:', response.error?.message);
      }
    } catch {
      console.log('Response:', data);
    }

    // Teste 2: Tentar enviar mensagem de teste
    console.log('\n' + '-'.repeat(60));
    console.log('Teste 2️⃣ : Enviar Mensagem de Texto');
    console.log('-'.repeat(60));

    const sendUrl = new URL(`https://graph.facebook.com/v18.0/${phoneId}/messages`);
    sendUrl.searchParams.append('access_token', accessToken);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5548991080788',
      type: 'text',
      text: {
        body: 'Teste de validação de token'
      }
    };

    const body = JSON.stringify(payload);

    const options = {
      hostname: sendUrl.hostname,
      path: sendUrl.pathname + sendUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res2) => {
      let data2 = '';

      res2.on('data', (chunk) => {
        data2 += chunk;
      });

      res2.on('end', () => {
        console.log('Status:', res2.statusCode);
        try {
          const response2 = JSON.parse(data2);
          console.log('Response:', JSON.stringify(response2, null, 2));

          if (res2.statusCode === 200) {
            console.log('✅ Mensagem enviada com sucesso!');
            console.log('Message ID:', response2.messages?.[0]?.id);
          } else {
            console.log('❌ Erro ao enviar');
            console.log('Erro:', response2.error?.message);
            console.log('Code:', response2.error?.code);
          }
        } catch {
          console.log('Response:', data2);
        }

        console.log('\n' + '='.repeat(60) + '\n');
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
    });

    req.write(body);
    req.end();
  });
}).on('error', (error) => {
  console.error('❌ Request error:', error);
});
