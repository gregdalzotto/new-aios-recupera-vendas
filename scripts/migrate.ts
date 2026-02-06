import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import logger from '../src/config/logger';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const migrationDir = resolve(__dirname, '../migrations');

  try {
    logger.info('Starting migrations...');

    // Create migrations table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    logger.info('Migrations table ready');

    // Get all migration files
    const migrationFiles = readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      logger.warn('No migration files found');
      return;
    }

    logger.info(`Found ${migrationFiles.length} migration files`);

    // Execute each migration
    for (const file of migrationFiles) {
      const migrationName = file.replace('.sql', '');
      const migrationPath = resolve(migrationDir, file);

      // Check if migration already executed
      const result = await pool.query(
        'SELECT id FROM migrations WHERE name = $1',
        [migrationName]
      );

      if (result.rows.length > 0) {
        logger.info(`⏭️ Migration already executed: ${migrationName}`);
        continue;
      }

      // Read and execute migration
      const sql = readFileSync(migrationPath, 'utf-8');

      try {
        logger.info(`Executing migration: ${migrationName}`);
        await pool.query(sql);

        // Record migration as executed
        await pool.query('INSERT INTO migrations (name) VALUES ($1)', [migrationName]);

        logger.info(`✅ Migration executed successfully: ${migrationName}`);
      } catch (error) {
        logger.error(`❌ Migration failed: ${migrationName}`, error);
        throw error;
      }
    }

    logger.info('✅ All migrations completed successfully');
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations().catch((error) => {
  logger.error('Migration failed', error);
  process.exit(1);
});
