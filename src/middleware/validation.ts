import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import logger from '../config/logger';
import { createValidationError } from '../utils/errors';
import { FastifyRequestWithTrace } from './correlationId';

/**
 * Factory para criar middleware de validação de schema Zod
 * Valida body, params e query da requisição
 */
export function createValidationMiddleware(schema: {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const traceId = (request as FastifyRequestWithTrace).traceId;
    const errors: Record<string, string[]> = {};

    // Valida body
    if (schema.body) {
      try {
        const validatedBody = schema.body.parse(request.body);
        (request as unknown as { validatedBody: unknown }).validatedBody = validatedBody;
      } catch (error) {
        if (error instanceof ZodError) {
          errors.body = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        }
      }
    }

    // Valida params
    if (schema.params) {
      try {
        const validatedParams = schema.params.parse(request.params);
        (request as unknown as { validatedParams: unknown }).validatedParams = validatedParams;
      } catch (error) {
        if (error instanceof ZodError) {
          errors.params = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        }
      }
    }

    // Valida query
    if (schema.query) {
      try {
        const validatedQuery = schema.query.parse(request.query);
        (request as unknown as { validatedQuery: unknown }).validatedQuery = validatedQuery;
      } catch (error) {
        if (error instanceof ZodError) {
          errors.query = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        }
      }
    }

    // Se houver erros, lança exceção
    if (Object.keys(errors).length > 0) {
      logger.warn('Schema validation failed', {
        traceId,
        method: request.method,
        url: request.url,
        errors,
      });

      throw createValidationError('Request validation failed', errors, traceId);
    }
  };
}

/**
 * Valida um valor contra um schema Zod
 */
export function validateSchema<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
