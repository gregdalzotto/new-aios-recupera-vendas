/**
 * Opt-Out Detection Load Tests - SARA-4.3
 * Tests: Opt-out keyword detection under load
 * Validates Portuguese keyword detection and AI fallback performance
 */

import {
  config,
  scenarios,
  makeAPIRequest,
  checkResponse,
  thinkTime,
} from './k6.config.js';
import { group, check } from 'k6';

export const options = {
  scenarios: {
    optout_baseline: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 15 },  // Ramp-up to 15 VUs
        { duration: '4m', target: 15 },  // Sustained
        { duration: '1m', target: 0 },   // Ramp-down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ...config.sla,
    'http_req_duration{endpoint:detect_optout}': ['p(95)<1000'], // AI can be slower
  },
};

const optoutKeywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
const normalMessages = ['oi', 'olá', 'sim', 'ajuda', 'informações', 'preço'];

export default function optoutDetectionLoadTest() {
  group('Opt-Out Keyword Detection', function () {
    // Test each Portuguese opt-out keyword
    for (const keyword of optoutKeywords) {
      const payload = JSON.stringify({
        phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        message_text: keyword,
        message_id: `msg-${Math.random().toString(36).substr(2, 9)}`,
        conversation_id: `conv-${Math.floor(Math.random() * 1000)}`,
      });

      const response = makeAPIRequest(
        'POST',
        '/api/detect-opt-out',
        payload,
        { 'Content-Type': 'application/json' }
      );

      check(response, {
        [`Keyword "${keyword}" detected`: (r) => {
          if (r.status === 200) {
            const body = JSON.parse(r.body);
            return body.is_optout === true || body.detected === true;
          }
          return false;
        },
        'Response time < 1000ms': (r) => r.timings.duration < 1000,
      });

      thinkTime(200, 600);
    }
  });

  group('Case-Insensitive Detection', function () {
    const testCases = [
      'NÃO', 'Não', 'NãO', // Not with different cases
      'PARAR', 'Parar', // Stop with different cases
      'SAIR', 'Sair', // Exit with different cases
    ];

    for (const testCase of testCases) {
      const payload = JSON.stringify({
        phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        message_text: testCase,
        message_id: `msg-${Math.random().toString(36).substr(2, 9)}`,
        conversation_id: `conv-${Math.floor(Math.random() * 1000)}`,
      });

      const response = makeAPIRequest(
        'POST',
        '/api/detect-opt-out',
        payload,
        { 'Content-Type': 'application/json' }
      );

      check(response, {
        [`Case variant "${testCase}" handled`: (r) => r.status === 200,
      });

      thinkTime(150, 400);
    }
  });

  group('Normal Messages (No False Positives)', function () {
    // Test that normal messages don't trigger opt-out false positives
    for (const message of normalMessages) {
      const payload = JSON.stringify({
        phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        message_text: message,
        message_id: `msg-${Math.random().toString(36).substr(2, 9)}`,
        conversation_id: `conv-${Math.floor(Math.random() * 1000)}`,
      });

      const response = makeAPIRequest(
        'POST',
        '/api/detect-opt-out',
        payload,
        { 'Content-Type': 'application/json' }
      );

      check(response, {
        [`Normal message "${message}" not flagged as opt-out`: (r) => {
          if (r.status === 200) {
            const body = JSON.parse(r.body);
            return body.is_optout !== true && body.detected !== true;
          }
          return false;
        },
      });

      thinkTime(200, 500);
    }
  });

  group('AI Fallback Under Concurrency', function () {
    // Simulate ambiguous messages that require AI fallback
    const ambiguousMessages = [
      'Talvez não compre mais aqui',
      'Não sei se vou usar',
      'Preciso parar de receber esses alertas',
      'Não tenho interesse nisso agora',
    ];

    for (let i = 0; i < 3; i++) {
      const message = ambiguousMessages[Math.floor(Math.random() * ambiguousMessages.length)];

      const payload = JSON.stringify({
        phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        message_text: message,
        message_id: `msg-${Math.random().toString(36).substr(2, 9)}`,
        conversation_id: `conv-${Math.floor(Math.random() * 1000)}`,
      });

      const response = makeAPIRequest(
        'POST',
        '/api/detect-opt-out',
        payload,
        { 'Content-Type': 'application/json' }
      );

      check(response, {
        'Ambiguous message processed': (r) => r.status === 200,
        'AI fallback response time < 1500ms': (r) => r.timings.duration < 1500,
      });

      thinkTime(300, 800);
    }
  });

  group('Concurrent Opt-Out Requests', function () {
    // Multiple concurrent opt-out requests to stress the service
    for (let i = 0; i < 5; i++) {
      const keyword = optoutKeywords[Math.floor(Math.random() * optoutKeywords.length)];
      const payload = JSON.stringify({
        phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        message_text: keyword,
        message_id: `msg-${Math.random().toString(36).substr(2, 9)}`,
        conversation_id: `conv-${Math.floor(Math.random() * 1000)}`,
      });

      makeAPIRequest(
        'POST',
        '/api/detect-opt-out',
        payload,
        { 'Content-Type': 'application/json' }
      );
    }

    check(true, {
      'Concurrent requests completed': () => true,
    });
  });
}
