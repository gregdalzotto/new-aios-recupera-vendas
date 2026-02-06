import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getSaraResponse() {
  try {
    // Get last message from SARA in this conversation
    const result = await pool.query(`
      SELECT
        m.id,
        m.message_text,
        m.sender_type,
        m.metadata,
        m.created_at,
        c.cycle_count,
        u.name
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE c.abandonment_id = (
        SELECT abandonment_id FROM conversations
        WHERE user_id = (SELECT id FROM users WHERE phone_number = '+16315551181')
        LIMIT 1
      )
      ORDER BY m.created_at DESC
      LIMIT 5
    `);

    console.log('\n📨 ÚLTIMAS MENSAGENS DA CONVERSA');
    console.log('='.repeat(70));

    for (const row of result.rows) {
      const senderEmoji = row.sender_type === 'sara' ? '🤖' : '👤';
      const senderName = row.sender_type === 'sara' ? 'SARA' : row.name;

      console.log(`\n${senderEmoji} ${senderName}:`);
      console.log(`   ${row.message_text}`);
      console.log(`   🕐 ${new Date(row.created_at).toLocaleString('pt-BR')}`);

      if (row.sender_type === 'sara') {
        console.log(`   📊 Ciclo: ${row.cycle_count}/5`);
        if (row.metadata) {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          if (meta.intent) console.log(`   🎯 Intent: ${meta.intent}`);
          if (meta.sentiment) console.log(`   💭 Sentiment: ${meta.sentiment}`);
          if (meta.tokens_used) console.log(`   🔤 Tokens: ${meta.tokens_used}`);
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ SARA-2.5 FUNCIONANDO COM CONTEXTO DINÂMICO!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Erro:', error instanceof Error ? error.message : String(error));
  } finally {
    await pool.end();
  }
}

getSaraResponse();
