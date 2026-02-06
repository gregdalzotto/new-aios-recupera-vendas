#!/usr/bin/env node

/**
 * Test OpenAI Connection
 * Validates API key and tests message interpretation
 */

import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log(`
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
   SARA-2.5: OpenAI Connection Test
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
`);

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not set in environment');
  process.exit(1);
}

console.log(`API Key loaded (length: ${OPENAI_API_KEY.length})`);
console.log(`Key starts with: ${OPENAI_API_KEY.substring(0, 10)}...`);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

async function testOpenAI() {
  try {
    console.log('\n📋 TEST 1: Simple Message');
    console.log(''.padStart(60, '='));

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
        },
        {
          role: 'user',
          content: 'Hello, what is 2+2?',
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    console.log(`✅ Connection successful!`);
    console.log(`Response: ${response.choices[0]?.message?.content}`);
    console.log(`Tokens used: ${response.usage?.total_tokens}`);

    // TEST 2: Sara System Prompt
    console.log('\n📋 TEST 2: Sara System Prompt');
    console.log(''.padStart(60, '='));

    const saraResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are Sara, an AI assistant specialized in recovering abandoned sales.
Always respond in Portuguese (Brazilian Portuguese - PT-BR).
Your goal is to understand the customer's objection and provide personalized solutions.

ALWAYS respond with a JSON object with this structure:
{
  "response": "Your response text in Portuguese",
  "intent": "one of: price_question, objection, confirmation, unclear",
  "sentiment": "one of: positive, neutral, negative",
  "should_offer_discount": true or false
}`,
        },
        {
          role: 'user',
          content: `Customer message: "Perdi uma venda importante, preciso de ajuda para recuperar"
Product: Produto Premium
Cart Value: R$1500.00

Analyze this customer message and provide a contextual Sara response.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    console.log(`✅ Sara response received!`);
    const content = saraResponse.choices[0]?.message?.content;
    console.log(`Raw response: ${content}`);

    try {
      const parsed = JSON.parse(content);
      console.log(`\n✅ JSON parsed successfully!`);
      console.log(`Response: ${parsed.response}`);
      console.log(`Intent: ${parsed.intent}`);
      console.log(`Sentiment: ${parsed.sentiment}`);
      console.log(`Should offer discount: ${parsed.should_offer_discount}`);
    } catch (e) {
      console.error(`❌ JSON parsing failed: ${e.message}`);
      console.error(`Response was: ${content}`);
    }

    console.log('\n' + ''.padStart(60, '='));
    console.log('✅ ALL TESTS PASSED!');
    console.log('OpenAI connection is working correctly!');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);

    if (error.status === 401) {
      console.error('❌ Authentication failed - API key is invalid or expired');
    } else if (error.status === 429) {
      console.error('❌ Rate limited - Too many requests to OpenAI');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused - Check internet connection');
    } else if (error.timeout) {
      console.error('❌ Request timeout - OpenAI taking too long to respond');
    }

    console.error(`\nFull error: ${JSON.stringify(error, null, 2)}`);
    process.exit(1);
  }
}

testOpenAI();
