/**
 * Webhook Load Tests - SARA-4.3
 * Tests: abandonment, message, and payment webhook endpoints
 * Validates HMAC signatures and idempotency under load
 */

import {
  config,
  scenarios,
  createAbandonmentPayload,
  createMessagePayload,
  createPaymentPayload,
  sendWebhookRequest,
  checkResponse,
  thinkTime,
  errorRate,
  requestDuration,
  requestCount,
} from './k6.config.js';
import { group, check } from 'k6';

export const options = {
  scenarios: {
    webhook_baseline: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },  // Ramp-up to 10 VUs
        { duration: '3m', target: 10 },  // Stay at 10 VUs
        { duration: '1m', target: 0 },   // Ramp-down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ...config.sla,
    'http_req_duration{endpoint:abandonment}': ['p(95)<500'],
    'http_req_duration{endpoint:message}': ['p(95)<500'],
    'http_req_duration{endpoint:payment}': ['p(95)<500'],
  },
};

export default function webhookLoadTest() {
  const testPhases = [
    {
      name: 'Abandonment Webhook',
      endpoint: '/webhook/abandonment',
      payloadFn: createAbandonmentPayload,
      iterations: 5,
    },
    {
      name: 'Message Webhook',
      endpoint: '/webhook/message',
      payloadFn: createMessagePayload,
      iterations: 5,
    },
    {
      name: 'Payment Webhook',
      endpoint: '/webhook/payment',
      payloadFn: createPaymentPayload,
      iterations: 5,
    },
  ];

  for (const phase of testPhases) {
    group(phase.name, function () {
      for (let i = 0; i < phase.iterations; i++) {
        const payload = phase.payloadFn();

        // Test valid signature
        let response = sendWebhookRequest(phase.endpoint, payload);
        checkResponse(response, 200, `${phase.name} - Valid signature accepted`);

        // Test idempotency (duplicate delivery)
        response = sendWebhookRequest(phase.endpoint, payload);
        checkResponse(response, 200, `${phase.name} - Idempotency: Duplicate handled`);

        // Test invalid signature
        const invalidSignatureResponse = http.post(
          `${config.baseURL}${phase.endpoint}`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': 'sha256=invalid_signature_12345',
              'X-Timestamp': new Date().toISOString(),
            },
          }
        );
        check(invalidSignatureResponse, {
          [`${phase.name} - Invalid signature rejected`]: (r) => r.status === 401 || r.status === 403,
        });

        thinkTime(200, 500);
      }
    });
  }
}
