import { FastifyInstance, FastifyRequest } from 'fastify';

export interface FastifyRequestWithTrace extends FastifyRequest {
  traceId: string;
}

export type Server = FastifyInstance;

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
}

export interface WebhookPayload {
  [key: string]: unknown;
}
