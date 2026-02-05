import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import logger from '../config/logger';

export interface FastifyRequestWithTrace extends FastifyRequest {
  traceId: string;
}

/**
 * Middleware que adiciona um UUID de correlação a cada requisição
 * para permitir rastreamento ponta-a-ponta de logs
 */
export async function correlationIdMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Gera novo UUID ou usa o existente no header
  const existingTraceId = request.headers['x-trace-id'] as string;
  const traceId = existingTraceId || randomUUID();

  // Adiciona o traceId à request para uso em handlers e services
  (request as FastifyRequestWithTrace).traceId = traceId;

  // Log da requisição com trace ID
  logger.info('Request received', {
    traceId,
    method: request.method,
    url: request.url,
    ip: request.ip,
  });
}
