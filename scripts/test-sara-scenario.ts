/**
 * Script de teste: Cenário completo SARA-2.5
 * - Cria usuário de teste Meta
 * - Cria abandono
 * - Simula webhook de template enviado
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testSaraScenario() {
  try {
    console.log('🧪 Iniciando cenário de teste SARA-2.5...\n');

    // 1. Criar/buscar usuário
    const phoneNumber = '+16315551181';
    console.log(`1️⃣  Verificando usuário: ${phoneNumber}`);

    let userId = await pool.query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (userId.rows.length === 0) {
      console.log('   ➜ Usuário não existe, criando...');
      userId = await pool.query(
        'INSERT INTO users (phone_number, name) VALUES ($1, $2) RETURNING id',
        [phoneNumber, 'Meta Test User']
      );
    }

    const user = userId.rows[0];
    console.log(`   ✅ Usuário: ${user.id}`);

    // 2. Criar/garantir produto
    console.log('\n2️⃣  Verificando produto...');

    let productId = await pool.query(
      "SELECT id FROM product_offers WHERE product_id = 'test-product-001'"
    );

    if (productId.rows.length === 0) {
      console.log('   ➜ Produto não existe, criando...');
      productId = await pool.query(
        `INSERT INTO product_offers
         (product_id, product_name, payment_link, discount_link, discount_percent)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          'test-product-001',
          'Curso Python Avançado',
          'https://pay.example.com/test',
          'https://pay.example.com/test?discount=15',
          15
        ]
      );
    }

    console.log(`   ✅ Produto: test-product-001`);

    // 3. Criar abandono
    console.log('\n3️⃣  Criando abandono...');

    const abandonmentId = randomUUID();
    const externalId = `msg_${Date.now()}`;

    const abandonment = await pool.query(
      `INSERT INTO abandonments
       (id, user_id, external_id, product_id, value, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, value`,
      [abandonmentId, user.id, externalId, 'test-product-001', 150.00, 'PENDING']
    );

    console.log(`   ✅ Abandono criado:`);
    console.log(`      ID: ${abandonment.rows[0].id}`);
    console.log(`      Valor: R$ ${abandonment.rows[0].value}`);

    // 4. Criar conversa
    console.log('\n4️⃣  Criando conversa...');

    const conversationId = randomUUID();
    const conversation = await pool.query(
      `INSERT INTO conversations
       (id, abandonment_id, user_id, status, message_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, cycle_count`,
      [conversationId, abandonmentId, user.id, 'AWAITING_RESPONSE', 0]
    );

    console.log(`   ✅ Conversa criada:`);
    console.log(`      ID: ${conversation.rows[0].id}`);
    console.log(`      Ciclo: ${conversation.rows[0].cycle_count}`);

    // 5. Simular webhook de template enviado
    console.log('\n5️⃣  Simulando webhook de template enviado...');

    const webhookId = randomUUID();
    await pool.query(
      `INSERT INTO webhooks_log
       (id, webhook_type, external_id, payload, signature_verified, processed)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        webhookId,
        'message_template_status_update',
        externalId,
        JSON.stringify({
          messaging_product: 'whatsapp',
          event: 'message_template_status_update',
          message_template_id: externalId,
          status: 'SENT',
          recipient_id: phoneNumber
        }),
        true,
        true
      ]
    );

    console.log(`   ✅ Webhook registrado`);

    // 6. Resumo do cenário
    console.log('\n' + '='.repeat(70));
    console.log('📋 RESUMO DO CENÁRIO DE TESTE');
    console.log('='.repeat(70));
    console.log(`
Usuário:
  • Telefone: ${phoneNumber}
  • ID: ${user.id}
  • Nome: Meta Test User

Produto:
  • ID: test-product-001
  • Nome: Curso Python Avançado
  • Valor: R$ 150.00
  • Desconto: 15%

Abandono:
  • ID: ${abandonmentId}
  • External ID: ${externalId}
  • Status: PENDING

Conversa:
  • ID: ${conversationId}
  • Status: AWAITING_RESPONSE
  • Ciclo: 0 / 5
  • Mensagens: 0

Próximos Passos:
1. ✨ Você vai responder a mensagem no WhatsApp com +${phoneNumber}
2. 🤖 O webhook chegará com sua resposta
3. 📨 SARA responderá com contexto dinâmico:
   - Nome do usuário
   - Valor do carrinho (R$ 150.00)
   - Histórico de mensagens
   - Opção de desconto (15%)
   - Ciclo atual da conversa

Quando SARA receber sua resposta, ela vai:
  📊 Analisar seu sentimento e intenção
  💬 Gerar resposta empática e contextualizada
  💰 Mencionar opção de desconto se apropriado
  📈 Rastrear ciclo da conversa (máx 5)
`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

testSaraScenario();
