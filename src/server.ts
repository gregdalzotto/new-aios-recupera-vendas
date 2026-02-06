import fastify from 'fastify';
import cors from '@fastify/cors';
import logger from './config/logger';
import { HealthCheckResponse, Server } from './types/index';
import { correlationIdMiddleware } from './middleware/correlationId';
import { hmacVerificationMiddleware } from './middleware/hmacVerification';
import { captureRawBodyMiddleware } from './middleware/rawBodyCapture';
import { AppError } from './utils/errors';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerMessageHandlers } from './jobs/handlers';
import ProcessMessageQueue from './jobs/processMessageJob';
import SendMessageQueue from './jobs/sendMessageJob';

let startTime: number;

export async function createServer(): Promise<Server> {
  startTime = Date.now();

  const server = fastify({
    logger: false, // Use Winston instead
  });

  // Register CORS
  await server.register(cors, {
    origin: true,
  });

  // Capture raw body BEFORE JSON parsing (for webhook HMAC validation)
  await captureRawBodyMiddleware(server);

  // Register middleware in order: correlationId → hmacVerification
  server.addHook('preHandler', correlationIdMiddleware);
  server.addHook('preHandler', hmacVerificationMiddleware);

  // Register webhook routes
  await registerWebhookRoutes(server);

  // Register job message handlers (now using BullMQ - no Lua script issues)
  try {
    await registerMessageHandlers();
    logger.info('✅ Message handlers registered successfully (BullMQ)');
  } catch (error) {
    logger.error('Failed to register message handlers', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // Queue stats endpoint (for monitoring)
  server.get('/queue-stats', async (_request, _reply) => {
    try {
      const [processStats, sendStats] = await Promise.all([
        ProcessMessageQueue.getStats(),
        SendMessageQueue.getStats(),
      ]);

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        queues: {
          processMessage: {
            name: 'process-message',
            ...processStats,
          },
          sendMessage: {
            name: 'send-message',
            ...sendStats,
          },
        },
      };
    } catch (error) {
      logger.error('Error fetching queue stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: 'error',
        error: 'Failed to fetch queue stats',
      };
    }
  });

  // Health check endpoint
  server.get<{
    Reply: HealthCheckResponse;
  }>('/health', async (_request, _reply) => {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    const isAppError = error instanceof AppError;
    const statusCode = isAppError ? error.statusCode : error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    logger.error('Request error:', {
      traceId: isAppError ? error.traceId : undefined,
      type: isAppError ? error.type : 'UNKNOWN_ERROR',
      message,
      statusCode,
      url: request.url,
      method: request.method,
      stack: error.stack,
    });

    const response = isAppError
      ? error.toJSON()
      : {
          error: message,
          type: 'UNKNOWN_ERROR',
          message,
        };

    return reply.code(statusCode).send(response);
  });

  return server;
}

export async function startServer(server: Server, port: number = 3000): Promise<void> {
  try {
    await server.listen({ port, host: '0.0.0.0' });
    logger.info(`🚀 Server running on http://localhost:${port}`);
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

export async function stopServer(server: Server): Promise<void> {
  await server.close();
  logger.info('✅ Server stopped');
}
