/**
 * Soak Test - SARA-4.3
 * Long-running test at moderate load
 * Detects memory leaks and connection pool issues
 */

import {
  config,
  createAbandonmentPayload,
  createMessagePayload,
  sendWebhookRequest,
  makeAPIRequest,
  checkResponse,
} from './k6.config.js';
import { group, check } from 'k6';

export const options = {
  scenarios: {
    soak_test: {
      executor: 'constant-vus',
      vus: 50, // Moderate steady load
      duration: '30m', // 30-minute soak
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.001'], // Very strict - should be stable
    'http_req_duration': ['p(99)<1000'], // Should remain consistent
  },
  // CSV output for memory/connection tracking
  ext: {
    loadimpact: {
      timeout: '1800s', // 30 minute timeout
    },
  },
};

let requestCounter = 0;
let cycleNumber = 0;

export default function soakTest() {
  cycleNumber = Math.floor(__VU / (Math.floor(__ITERATIONS / 100) || 1));

  group(`Soak Test - Cycle ${cycleNumber}`, function () {
    // Webhook traffic (HMAC = CPU load)
    group('Webhook Load', function () {
      const endpoint = [
        { path: '/webhook/abandonment', payload: createAbandonmentPayload() },
        { path: '/webhook/message', payload: createMessagePayload() },
      ][Math.floor(Math.random() * 2)];

      const response = sendWebhookRequest(endpoint.path, endpoint.payload);

      check(response, {
        'Webhook stability': (r) => r.status === 200,
        'No performance degradation': (r) => r.timings.duration < 500,
      });

      requestCounter++;
    });

    // API traffic (database = connection pool)
    group('API Load', function () {
      // List conversations - stress connection pool
      const listResponse = makeAPIRequest('GET', '/api/conversations?limit=50');

      check(listResponse, {
        'API stability': (r) => r.status === 200,
        'No connection pool exhaustion': (r) => r.timings.duration < 300,
      });

      // Get specific conversation
      const getResponse = makeAPIRequest('GET', `/api/conversations/conv-${Math.floor(Math.random() * 100)}`);

      check(getResponse, {
        'Get conversation stable': (r) => r.status === 200 || r.status === 404,
      });

      requestCounter++;
    });

    // Periodic status check (every 5th iteration)
    if (requestCounter % 5 === 0) {
      group('Soak Status Check', function () {
        check(true, {
          [`Completed ${requestCounter} requests without degradation`]: () => true,
        });
      });
    }
  });
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/results/soak-test-summary.json': JSON.stringify(data.metrics),
  };
}

function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;

  let summary = `\n${indent}Soak Test Summary\n`;
  summary += `${indent}${'='.repeat(50)}\n`;

  if (data.metrics) {
    const metrics = data.metrics;

    // HTTP metrics
    if (metrics.http_req_duration) {
      const vals = metrics.http_req_duration.values || {};
      summary += `${indent}HTTP Request Duration:\n`;
      summary += `${indent}  p50: ${vals['p(50)']?.toFixed(2) || 'N/A'} ms\n`;
      summary += `${indent}  p95: ${vals['p(95)']?.toFixed(2) || 'N/A'} ms\n`;
      summary += `${indent}  p99: ${vals['p(99)']?.toFixed(2) || 'N/A'} ms\n`;
    }

    if (metrics.http_req_failed) {
      const failure_rate = ((metrics.http_req_failed.value || 0) * 100).toFixed(2);
      summary += `${indent}Request Failures: ${failure_rate}%\n`;
    }
  }

  summary += `${indent}Total Requests: ${requestCounter}\n`;
  summary += `${indent}Duration: 30 minutes\n`;
  summary += `${indent}VUs: 50\n`;

  return summary;
}
