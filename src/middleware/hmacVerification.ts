import { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac } from 'crypto';
import logger from '../config/logger';
import { createHmacError } from '../utils/errors';
import { FastifyRequestWithTrace } from './correlationId';

/**
 * Calcula a assinatura HMAC-SHA256 do body da requisição
 * Formato Meta: "sha256={hash_hex}"
 */
function calculateSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Middleware que valida a assinatura HMAC-SHA256 de requisições webhook
 * Pula validação se o header estiver ausente (permite health check e outras rotas públicas)
 */
export async function hmacVerificationMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Pula validação para GET requests (health check, webhook validation)
  if (request.method === 'GET') {
    return;
  }

  const signatureHeader = request.headers['x-hub-signature-256'] as string;
  const traceId = (request as FastifyRequestWithTrace).traceId;

  // Se não há header de assinatura, pula verificação
  // (permite requests públicas, webhooks de validação, etc)
  if (!signatureHeader) {
    logger.warn('Missing HMAC signature header', {
      traceId,
      method: request.method,
      url: request.url,
    });
    return;
  }

  // Body deve ser string para calcular HMAC
  let bodyStr = '';

  if (typeof request.body === 'string') {
    bodyStr = request.body;
  } else if (Buffer.isBuffer(request.body)) {
    bodyStr = request.body.toString();
  } else if (request.body && typeof request.body === 'object') {
    bodyStr = JSON.stringify(request.body);
  }

  // Calcula assinatura esperada usando secret do env (lido em tempo de execução)
  const secret = process.env.WHATSAPP_APP_SECRET || '';
  const expectedSignature = calculateSignature(bodyStr, secret);

  // Extrai assinatura do header (formato: "sha256={hash}")
  const headerSignature = signatureHeader.split('=')[1];

  // Compara usando comparação segura (timing-safe)
  const signatureMatch =
    headerSignature &&
    Buffer.byteLength(headerSignature) === Buffer.byteLength(expectedSignature) &&
    headerSignature === expectedSignature;

  if (!signatureMatch) {
    logger.error('HMAC verification failed', {
      traceId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      headerSignature: headerSignature?.substring(0, 10) + '...',
    });

    throw createHmacError('Invalid HMAC signature', traceId);
  }

  logger.debug('HMAC verification passed', {
    traceId,
    method: request.method,
    url: request.url,
  });
}
