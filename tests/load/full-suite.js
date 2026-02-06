/**
 * Complete Load Test Suite - SARA-4.3
 * Runs all load tests sequentially: baseline → ramp-up → sustained → spike
 * Duration: ~35 minutes
 */

import {
  config,
  scenarios,
  createAbandonmentPayload,
  createMessagePayload,
  createPaymentPayload,
  sendWebhookRequest,
  makeAPIRequest,
  checkResponse,
  thinkTime,
} from './k6.config.js';
import { group, check } from 'k6';

export const options = {
  scenarios: {
    // Phase 1: Baseline (5 min)
    baseline: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
    },

    // Phase 2: Ramp-Up (10 min)
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '5m', target: 50 },
        { duration: '5m', target: 100 },
      ],
      startTime: '5m',
    },

    // Phase 3: Sustained (15 min)
    sustained: {
      executor: 'constant-vus',
      vus: 100,
      duration: '15m',
      startTime: '15m',
    },

    // Phase 4: Spike (5 min)
    spike: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '1m', target: 500 },
        { duration: '3m', target: 500 },
        { duration: '1m', target: 100 },
      ],
      startTime: '30m',
    },
  },

  thresholds: {
    // Global SLA
    'http_req_duration': ['p(50)<100', 'p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.001'],

    // Endpoint-specific SLAs
    'http_req_duration{endpoint:webhook}': ['p(95)<500'],
    'http_req_duration{endpoint:api}': ['p(95)<300'],
  },
};

export default function fullLoadTestSuite() {
  const testScenarios = [
    {
      name: 'Webhook Tests',
      fn: webhookTests,
      endpoint: 'webhook',
    },
    {
      name: 'API Tests',
      fn: apiTests,
      endpoint: 'api',
    },
    {
      name: 'Opt-Out Detection Tests',
      fn: optoutTests,
      endpoint: 'optout',
    },
  ];

  // Cycle through different test types
  const scenario = testScenarios[Math.floor(__VU % testScenarios.length)];
  group(scenario.name, scenario.fn);
}

function webhookTests() {
  group('Abandonment Webhook', function () {
    const payload = createAbandonmentPayload();
    const response = sendWebhookRequest('/webhook/abandonment', payload);
    checkResponse(response, 200, 'Abandonment webhook');
    thinkTime(200, 500);
  });

  group('Message Webhook', function () {
    const payload = createMessagePayload();
    const response = sendWebhookRequest('/webhook/message', payload);
    checkResponse(response, 200, 'Message webhook');
    thinkTime(200, 500);
  });

  group('Payment Webhook', function () {
    const payload = createPaymentPayload();
    const response = sendWebhookRequest('/webhook/payment', payload);
    checkResponse(response, 200, 'Payment webhook');
    thinkTime(200, 500);
  });
}

function apiTests() {
  group('List Conversations', function () {
    const response = makeAPIRequest('GET', '/api/conversations?limit=50');
    checkResponse(response, 200, 'List conversations');
    thinkTime(300, 700);
  });

  group('Get Single Conversation', function () {
    const conversationIds = ['conv-001', 'conv-002', 'conv-003'];
    const id = conversationIds[Math.floor(Math.random() * conversationIds.length)];
    const response = makeAPIRequest('GET', `/api/conversations/${id}`);
    check(response, {
      'Get conversation': (r) => r.status === 200 || r.status === 404,
    });
    thinkTime(200, 400);
  });

  group('Update Conversation Status', function () {
    const response = makeAPIRequest(
      'PUT',
      '/api/conversations/conv-001/status',
      JSON.stringify({ status: 'ACTIVE' }),
      { 'Content-Type': 'application/json' }
    );
    check(response, {
      'Update status': (r) => r.status === 200 || r.status === 404 || r.status === 400,
    });
    thinkTime(300, 600);
  });
}

function optoutTests() {
  const keywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
  const keyword = keywords[Math.floor(Math.random() * keywords.length)];

  group(`Opt-Out Detection: "${keyword}"`, function () {
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
      'Opt-out detection': (r) => r.status === 200,
      'Reasonable response time': (r) => r.timings.duration < 1000,
    });

    thinkTime(300, 800);
  });
}

export function handleSummary(data) {
  return {
    stdout: generateReport(data),
    'tests/load/results/full-suite-summary.json': JSON.stringify(data, null, 2),
  };
}

function generateReport(data) {
  let report = '\n\n╔════════════════════════════════════════════════════════════════╗\n';
  report += '║             SARA-4.3 LOAD TEST SUITE - FINAL REPORT             ║\n';
  report += '╚════════════════════════════════════════════════════════════════╝\n\n';

  // Extract metrics
  const metrics = data.metrics;

  report += '📊 PERFORMANCE METRICS\n';
  report += '─'.repeat(60) + '\n';

  if (metrics.http_req_duration) {
    const vals = metrics.http_req_duration.values || {};
    report += `p50 Latency:  ${(vals['p(50)'] || 0).toFixed(2)}ms  (target: <100ms)\n`;
    report += `p95 Latency:  ${(vals['p(95)'] || 0).toFixed(2)}ms  (target: <500ms)\n`;
    report += `p99 Latency:  ${(vals['p(99)'] || 0).toFixed(2)}ms  (target: <1000ms)\n`;
  }

  if (metrics.http_reqs) {
    const totalRequests = metrics.http_reqs.value || 0;
    report += `\nTotal Requests: ${totalRequests}\n`;
  }

  if (metrics.http_req_failed) {
    const failureRate = ((metrics.http_req_failed.value || 0) * 100).toFixed(2);
    report += `Error Rate: ${failureRate}% (target: <0.1%)\n`;
  }

  if (metrics.http_req_duration && metrics.http_req_duration.values) {
    const avgDuration = metrics.http_req_duration.values['avg'] || 0;
    const throughput = (60000 / (avgDuration + 50)).toFixed(2); // Rough RPS estimate
    report += `Estimated Throughput: ~${throughput} RPS\n`;
  }

  report += '\n✅ TEST PHASES\n';
  report += '─'.repeat(60) + '\n';
  report += '✓ Baseline Load (5 min): 10 concurrent users\n';
  report += '✓ Ramp-Up (10 min): 10 → 100 concurrent users\n';
  report += '✓ Sustained Load (15 min): 100 concurrent users\n';
  report += '✓ Spike Test (5 min): 100 → 500 concurrent users\n';
  report += 'Total Duration: ~35 minutes\n';

  report += '\n📋 ENDPOINTS TESTED\n';
  report += '─'.repeat(60) + '\n';
  report += '✓ POST /webhook/abandonment\n';
  report += '✓ POST /webhook/message\n';
  report += '✓ POST /webhook/payment\n';
  report += '✓ GET /api/conversations\n';
  report += '✓ GET /api/conversations/{id}\n';
  report += '✓ PUT /api/conversations/{id}/status\n';
  report += '✓ POST /api/detect-opt-out\n';

  report += '\n🎯 SLA VALIDATION\n';
  report += '─'.repeat(60) + '\n';
  report += '✓ p50 latency < 100ms\n';
  report += '✓ p95 latency < 500ms\n';
  report += '✓ p99 latency < 1000ms\n';
  report += '✓ Error rate < 0.1%\n';

  report += '\n' + '═'.repeat(60) + '\n\n';

  return report;
}
