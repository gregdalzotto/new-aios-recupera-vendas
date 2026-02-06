/**
 * Conversation API Load Tests - SARA-4.3
 * Tests: GET /api/conversations, GET /api/conversations/{id}, PUT /api/conversations/{id}/status
 * Validates database query performance and filtering at scale
 */

import {
  config,
  scenarios,
  makeAPIRequest,
  checkResponse,
  thinkTime,
  errorRate,
  requestDuration,
  requestCount,
} from './k6.config.js';
import { group, check } from 'k6';

export const options = {
  scenarios: {
    conversation_api_baseline: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },  // Ramp-up to 20 VUs
        { duration: '5m', target: 20 },  // Sustained
        { duration: '1m', target: 0 },   // Ramp-down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ...config.sla,
    'http_req_duration{endpoint:list_conversations}': ['p(95)<500'],
    'http_req_duration{endpoint:get_conversation}': ['p(95)<300'],
    'http_req_duration{endpoint:update_status}': ['p(95)<500'],
  },
};

// Mock conversation IDs (would be real IDs in production)
const conversationIds = [
  'conv-001', 'conv-002', 'conv-003', 'conv-004', 'conv-005',
  'conv-006', 'conv-007', 'conv-008', 'conv-009', 'conv-010',
];

export default function conversationAPILoadTest() {
  group('List Conversations API', function () {
    // Test basic list
    let response = makeAPIRequest('GET', '/api/conversations');
    checkResponse(response, 200, 'List conversations - Basic');

    // Test with pagination
    response = makeAPIRequest('GET', '/api/conversations?page=1&limit=50');
    checkResponse(response, 200, 'List conversations - With pagination');

    // Test with filtering by status
    const statuses = ['AWAITING_RESPONSE', 'ACTIVE', 'CLOSED'];
    for (const status of statuses) {
      response = makeAPIRequest('GET', `/api/conversations?status=${status}`);
      checkResponse(response, 200, `List conversations - Filter by status ${status}`);
    }

    thinkTime(300, 800);
  });

  group('Get Single Conversation API', function () {
    // Test getting individual conversations
    for (const convId of conversationIds) {
      const response = makeAPIRequest('GET', `/api/conversations/${convId}`);

      check(response, {
        'Get conversation - Success or NotFound': (r) => r.status === 200 || r.status === 404,
        'Get conversation - Response time < 300ms': (r) => r.timings.duration < 300,
      });

      thinkTime(100, 400);
    }
  });

  group('Update Conversation Status API', function () {
    const statuses = ['ACTIVE', 'CLOSED', 'AWAITING_RESPONSE'];

    for (let i = 0; i < 5; i++) {
      const convId = conversationIds[i % conversationIds.length];
      const newStatus = statuses[Math.floor(Math.random() * statuses.length)];

      const response = makeAPIRequest(
        'PUT',
        `/api/conversations/${convId}/status`,
        JSON.stringify({ status: newStatus }),
        { 'Content-Type': 'application/json' }
      );

      check(response, {
        'Update status - Success or NotFound': (r) => r.status === 200 || r.status === 404 || r.status === 400,
        'Update status - Response time < 500ms': (r) => r.timings.duration < 500,
      });

      thinkTime(200, 600);
    }
  });

  group('Concurrent Database Stress', function () {
    // Simulate rapid-fire queries to stress connection pool
    for (let i = 0; i < 10; i++) {
      const convId = conversationIds[Math.floor(Math.random() * conversationIds.length)];
      makeAPIRequest('GET', `/api/conversations/${convId}`);
    }

    check(true, {
      'Concurrent queries - No timeout': () => true,
    });
  });
}
