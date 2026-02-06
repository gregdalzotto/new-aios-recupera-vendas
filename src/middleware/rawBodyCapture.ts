import { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Extensão do FastifyRequest para armazenar raw body
 */
export interface FastifyRequestWithRawBody extends FastifyRequest {
  rawBody?: string;
}

/**
 * Registra um content type parser que captura o raw body ANTES do JSON parsing
 * Necessário para validação HMAC de webhooks
 */
export async function captureRawBodyMiddleware(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser(
    'application/json',
    async (request: FastifyRequest, payload: NodeJS.ReadableStream) => {
      // Ler todo o body
      let rawBody = '';
      for await (const chunk of payload) {
        rawBody += chunk.toString();
      }

      // Guardar raw body na request
      (request as FastifyRequestWithRawBody).rawBody = rawBody;

      // Parse e retornar como JSON
      try {
        return JSON.parse(rawBody);
      } catch (error) {
        throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}
