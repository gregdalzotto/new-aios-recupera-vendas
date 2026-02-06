/**
 * k6 Shared Configuration & Helpers
 * SARA-4.3 Load Testing
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');
export const requestDuration = new Trend('request_duration');
export const requestCount = new Counter('request_count');
export const activeVUs = new Gauge('active_vus');

// Global test configuration
export const config = {
  timeout: 30000, // 30s per request
  baseURL: __ENV.BASE_URL || 'http://localhost:3000',
  webhookSecret: __ENV.WEBHOOK_SECRET || 'test-secret-key-for-hmac',

  // SLA targets
  sla: {
    http_req_duration: ['p(95)<500', 'p(99)<1000', 'p(50)<100'],
    http_req_failed: ['rate<0.001'], // < 0.1%
  },

  // Timeouts
  http_timeout: 30000,
  setup_timeout: 60000,
  teardown_timeout: 60000,
};

// Helper: Generate HMAC-SHA256 signature for webhooks
export function generateHmacSignature(payload, secret) {
  const crypto = require('crypto');
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hash = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  return hash;
}

// Helper: Create webhook payload (abandonment)
export function createAbandonmentPayload() {
  return JSON.stringify({
    event_type: 'abandonment',
    phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
    cart_id: `cart-${Math.random().toString(36).substr(2, 9)}`,
    cart_value: Math.floor(Math.random() * 100000) / 100,
    abandoned_at: new Date().toISOString(),
  });
}

// Helper: Create webhook payload (message)
export function createMessagePayload() {
  const keywords = ['oi', 'olá', 'não', 'parar', 'sair', 'sim', 'ajuda'];
  return JSON.stringify({
    event_type: 'message',
    phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
    message_id: `msg-${Math.random().toString(36).substr(2, 9)}`,
    message_text: keywords[Math.floor(Math.random() * keywords.length)],
    received_at: new Date().toISOString(),
  });
}

// Helper: Create webhook payload (payment)
export function createPaymentPayload() {
  return JSON.stringify({
    event_type: 'payment',
    phone_number: `+55${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
    transaction_id: `txn-${Math.random().toString(36).substr(2, 9)}`,
    amount: Math.floor(Math.random() * 100000) / 100,
    status: 'completed',
    timestamp: new Date().toISOString(),
  });
}

// Helper: Send webhook request with HMAC validation
export function sendWebhookRequest(endpoint, payload, secret = config.webhookSecret) {
  const signature = generateHmacSignature(payload, secret);

  const headers = {
    'Content-Type': 'application/json',
    'X-Signature': `sha256=${signature}`,
    'X-Timestamp': new Date().toISOString(),
  };

  const response = http.post(`${config.baseURL}${endpoint}`, payload, {
    headers,
    timeout: `${config.http_timeout}ms`,
  });

  requestCount.add(1);
  requestDuration.add(response.timings.duration);

  return response;
}

// Helper: Make API request with metrics
export function makeAPIRequest(method, path, body = null, headers = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  let response;
  const url = `${config.baseURL}${path}`;

  switch (method.toUpperCase()) {
    case 'GET':
      response = http.get(url, { headers: defaultHeaders });
      break;
    case 'POST':
      response = http.post(url, body, { headers: defaultHeaders });
      break;
    case 'PUT':
      response = http.put(url, body, { headers: defaultHeaders });
      break;
    case 'DELETE':
      response = http.del(url, { headers: defaultHeaders });
      break;
    default:
      throw new Error(`Unknown HTTP method: ${method}`);
  }

  requestCount.add(1);
  requestDuration.add(response.timings.duration);

  if (response.status >= 400) {
    errorRate.add(1);
  }

  return response;
}

// Helper: Check response validity
export function checkResponse(response, expectedStatus = 200, description = 'Response OK') {
  const result = check(response, {
    [description]: (r) => r.status === expectedStatus,
    'no errors': (r) => r.status < 400,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!result) {
    errorRate.add(1);
  }

  return result;
}

// Helper: Think time (realistic user behavior)
export function thinkTime(minMs = 500, maxMs = 2000) {
  const duration = Math.random() * (maxMs - minMs) + minMs;
  sleep(duration / 1000);
}

// Helper: Load test scenarios
export const scenarios = {
  baseline: {
    vus: 10,
    duration: '5m',
    name: 'Baseline Load',
  },
  rampUp: {
    stages: [
      { duration: '2m', target: 10 },
      { duration: '5m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '2m', target: 10 },
    ],
    name: 'Ramp-Up Test',
  },
  sustained: {
    vus: 100,
    duration: '15m',
    name: 'Sustained Load',
  },
  spike: {
    stages: [
      { duration: '5m', target: 100 },
      { duration: '1m', target: 500 },
      { duration: '3m', target: 100 },
      { duration: '1m', target: 10 },
    ],
    name: 'Spike Test',
  },
  stress: {
    stages: [
      { duration: '2m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '2m', target: 500 },
      { duration: '2m', target: 1000 },
      { duration: '2m', target: 10 },
    ],
    name: 'Stress Test',
  },
  soak: {
    vus: 50,
    duration: '30m',
    name: 'Soak Test (Memory Leak Detection)',
  },
};

export default config;
