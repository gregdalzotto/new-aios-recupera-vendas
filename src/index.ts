import { config } from './config/env';
import logger from './config/logger';
import { createServer, startServer } from './server';

async function main(): Promise<void> {
  try {
    logger.info(`Starting Sara Agent - ${config.NODE_ENV} mode`);

    const server = await createServer();
    await startServer(server, config.PORT);

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await server.close();
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
