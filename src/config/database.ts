import { Pool } from 'pg';
import { assertSafeIntegrationDatabase } from './test-database-guard.js';

assertSafeIntegrationDatabase();

const databasePort = Number(process.env.DB_PORT ?? 5432);
if (!Number.isInteger(databasePort) || databasePort <= 0) {
  throw new Error('DB_PORT deve ser um número inteiro positivo.');
}

export const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: databasePort,
  database: process.env.DB_NAME ?? 'oficina',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
});
