/**
 * Stress Test - SARA-4.3
 * Progressive load increase until system breaks
 * Identifies breaking point and maximum capacity
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
} from './k6.config.js';
import { group, check } from 'k6';

export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50, name: 'Ramp to 50 VUs' },
        { duration: '2m', target: 100, name: 'Ramp to 100 VUs' },
        { duration: '2m', target: 200, name: 'Ramp to 200 VUs' },
        { duration: '2m', target: 500, name: 'Ramp to 500 VUs' },
        { duration: '2m', target: 1000, name: 'Ramp to 1000 VUs (Breaking Point)' },
        { duration: '2m', target: 50, name: 'Ramp down to 50 VUs' },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.05'], // Allow up to 5% failure under stress
    'http_req_duration': ['p(99)<5000'], // Allow longer response times under stress
  },
};

export default function stressTest() {
  group('Webhook Stress Test', function () {
    // Webhook requests - good stress test due to HMAC computation
    const payload = createAbandonmentPayload();
    const response = sendWebhookRequest('/webhook/abandonment', payload);

    check(response, {
      'Webhook response': (r) => r.status < 500,
      'No timeout': (r) => r.timings.duration < 30000,
    });
  });

  group('API Stress Test', function () {
    // List conversations - database-heavy query
    const listResponse = makeAPIRequest('GET', '/api/conversations?limit=100');

    check(listResponse, {
      'List conversations under stress': (r) => r.status < 500,
    });

    // Get specific conversation
    const getResponse = makeAPIRequest('GET', '/api/conversations/conv-001');

    check(getResponse, {
      'Get conversation under stress': (r) => r.status < 500,
    });

    // Update conversation status
    const updateResponse = makeAPIRequest(
      'PUT',
      '/api/conversations/conv-001/status',
      JSON.stringify({ status: 'ACTIVE' }),
      { 'Content-Type': 'application/json' }
    );

    check(updateResponse, {
      'Update conversation under stress': (r) => r.status < 500,
    });
  });

  group('Mixed Workload Stress Test', function () {
    // Mix of different endpoint types to stress full system
    const endpoints = [
      { fn: () => sendWebhookRequest('/webhook/abandonment', createAbandonmentPayload()) },
      { fn: () => sendWebhookRequest('/webhook/message', createMessagePayload()) },
      { fn: () => makeAPIRequest('GET', '/api/conversations') },
      { fn: () => makeAPIRequest('GET', '/api/conversations/conv-001') },
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const response = endpoint.fn();

    check(response, {
      'Mixed workload response': (r) => r.status < 500,
    });
  });
}
