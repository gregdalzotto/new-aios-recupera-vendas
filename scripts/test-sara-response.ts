/**
 * Script de teste: Enfileirar mensagem de usuário
 * Simula uma resposta do usuário sendo enfileirada para processamento
 */

import ProcessMessageQueue, { ProcessMessagePayload } from '../src/jobs/processMessageJob';

async function testSaraResponse() {
  try {
    console.log('📨 Simulando resposta do usuário...\n');

    const phoneNumber = '+16315551181';
    const messageText = 'Oi, qual é o preço do curso? Tenho interesse mas preciso saber se pode pagar parcelado';
    const whatsappMessageId = `wamid.test_${Date.now()}`;
    const traceId = `trace_${Date.now()}`;

    const payload: ProcessMessagePayload = {
      phoneNumber,
      messageText,
      whatsappMessageId,
      traceId,
      conversationId: undefined  // Deixa o handler buscar por telefone
    };

    console.log('📝 Payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n');

    // Enfileirar a mensagem
    console.log('⏳ Enfileirando mensagem...');
    const job = await ProcessMessageQueue.addJob(payload);

    console.log(`✅ Mensagem enfileirada!`);
    console.log(`\nDetalhes do job:`);
    console.log(`  • Job ID: ${job.id}`);
    console.log(`  • Status: ${job.progress}%`);
    console.log(`  • Timestamp: ${new Date().toISOString()}`);

    console.log(`\n🤖 SARA vai processar esta mensagem:`);
    console.log(`  1️⃣  Carregar conversa do usuário ${phoneNumber}`);
    console.log(`  2️⃣  Buscar contexto dinâmico (usuário, abandono, histórico)`);
    console.log(`  3️⃣  Chamar OpenAI com sistema prompt + contexto injetado`);
    console.log(`  4️⃣  Analisar intenção e sentimento`);
    console.log(`  5️⃣  Gerar resposta contextualizada`);
    console.log(`  6️⃣  Enviar resposta via WhatsApp`);
    console.log(`  7️⃣  Incrementar ciclo da conversa`);

    console.log(`\n⏱️  A resposta deve chegar em ~5-10 segundos`);
    console.log(`\n📊 Acompanhe nos logs:`);
    console.log(`  • npm run dev`);
    console.log(`  • Procure por: "Processing incoming message"`);

    process.exit(0);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testSaraResponse();
