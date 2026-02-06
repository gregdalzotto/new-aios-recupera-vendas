/**
 * Baseline Load Test - SARA-4.3
 * Quick validation test: 10 VUs for 5 minutes
 * Good for CI/CD integration and quick performance checks
 */

import {
  config,
  createAbandonmentPayload,
  createMessagePayload,
  createPaymentPayload,
  sendWebhookRequest,
  makeAPIRequest,
  checkResponse,
  thinkTime,
} from './k6.config.js';
import { group } from 'k6';

export const options = {
  scenarios: {
    baseline_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
    },
  },
  thresholds: {
    ...config.sla,
  },
};

export default function baselineLoadTest() {
  // Webhooks
  group('Webhook Endpoints', function () {
    const webhooks = [
      { path: '/webhook/abandonment', payload: createAbandonmentPayload() },
      { path: '/webhook/message', payload: createMessagePayload() },
      { path: '/webhook/payment', payload: createPaymentPayload() },
    ];

    const webhook = webhooks[Math.floor(Math.random() * webhooks.length)];
    const response = sendWebhookRequest(webhook.path, webhook.payload);
    checkResponse(response, 200, 'Webhook endpoint');

    thinkTime(300, 800);
  });

  // API
  group('Conversation API', function () {
    let response = makeAPIRequest('GET', '/api/conversations?limit=50');
    checkResponse(response, 200, 'List conversations');

    response = makeAPIRequest('GET', '/api/conversations/conv-001');
    checkResponse(response, 200, 'Get conversation');

    thinkTime(400, 1000);
  });

  // Opt-Out Detection
  group('Opt-Out Detection', function () {
    const keywords = ['não', 'parar', 'sair', 'remover', 'desinscrever', 'bloquear'];
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];

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

    checkResponse(response, 200, 'Opt-out detection');

    thinkTime(400, 1000);
  });
}

export function handleSummary(data) {
  const metrics = data.metrics;
  let summary = '\n\n✅ BASELINE TEST RESULTS\n';
  summary += '═'.repeat(50) + '\n';

  if (metrics.http_req_duration) {
    const vals = metrics.http_req_duration.values || {};
    summary += `p50: ${(vals['p(50)'] || 0).toFixed(2)}ms\n`;
    summary += `p95: ${(vals['p(95)'] || 0).toFixed(2)}ms\n`;
    summary += `p99: ${(vals['p(99)'] || 0).toFixed(2)}ms\n`;
  }

  if (metrics.http_req_failed) {
    summary += `Error Rate: ${((metrics.http_req_failed.value || 0) * 100).toFixed(2)}%\n`;
  }

  summary += '═'.repeat(50) + '\n\n';

  return {
    stdout: summary,
    'tests/load/results/baseline-summary.json': JSON.stringify(metrics, null, 2),
  };
}
