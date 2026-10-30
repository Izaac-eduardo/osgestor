import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const expectedDatabase = 'osgestor_restore_test';
const expectedHost = 'postgres';
const expectedCookie = 'osgestor_restore_session';

if (process.env.DB_NAME !== expectedDatabase || process.env.DB_HOST !== expectedHost || Number(process.env.DB_PORT) !== 5432 || process.env.RESTORE_DB_GUARD !== expectedDatabase || process.env.AUTH_COOKIE_NAME !== expectedCookie) {
  console.error('Backend restaurado recusado: configuração de destino ou isolamento inválida.');
  process.exit(1);
}

const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
try {
  const result = await pool.query('SELECT current_database() AS current_database');
  if (result.rows[0]?.current_database !== expectedDatabase) {
    console.error('Backend restaurado recusado: banco conectado diferente do esperado.');
    process.exitCode = 1;
  } else {
    await import('../dist/server.js');
  }
} finally {
  await pool.end();
}
