import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

const EXPECTED_DATABASE = 'osgestor_docker_test';
const EXPECTED_HOST = 'postgres';
const EXPECTED_PORT = 5432;
const CONFIRMATION = 'APPLY_OSGESTOR_DOCKER_TEST';
const migrationDirectory = path.resolve(process.cwd(), 'database', 'migrations');

function requireExact(name: string, expected: string): string {
  const value = process.env[name]?.trim();
  if (value !== expected) throw new Error(`${name} deve ser exatamente ${expected}.`);
  return value;
}

function validateEnvironment(): void {
  requireExact('DB_NAME', EXPECTED_DATABASE);
  requireExact('POSTGRES_DB', EXPECTED_DATABASE);
  requireExact('DB_HOST', EXPECTED_HOST);
  const port = Number(process.env.DB_PORT ?? EXPECTED_PORT);
  if (port !== EXPECTED_PORT) throw new Error('DB_PORT deve ser 5432 para o serviço PostgreSQL Docker.');
  if (!process.env.DB_USER?.trim() || !process.env.DB_PASSWORD) throw new Error('DB_USER e DB_PASSWORD são obrigatórios.');
  if (process.env.DOCKER_MIGRATIONS_CONFIRM !== CONFIRMATION) throw new Error('Execução manual não confirmada.');
}

function stripOuterTransaction(sql: string): string {
  return sql
    .replace(/^\s*BEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;?\s*$/i, '')
    .trim();
}

async function loadMigrations(): Promise<Array<{ name: string; number: number; sql: string; checksum: string }>> {
  const names = (await readdir(migrationDirectory)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort();
  if (names.length !== 38 || names.some((name, index) => Number(name.slice(0, 3)) !== index + 1)) throw new Error('O conjunto de migrations deve conter exatamente 001–038, sem lacunas.');
  return Promise.all(names.map(async name => {
    const sql = await readFile(path.join(migrationDirectory, name), 'utf8');
    return { name, number: Number(name.slice(0, 3)), sql: stripOuterTransaction(sql), checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

async function ensureControlTable(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(120) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by VARCHAR(150) NOT NULL DEFAULT current_user,
    CONSTRAINT schema_migrations_checksum_chk CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
  )`);
  const columns = (await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations' ORDER BY ordinal_position",
  )).rows.map(row => row.column_name);
  const required = ['version', 'file_name', 'checksum_sha256', 'applied_at', 'applied_by'];
  if (!required.every(column => columns.includes(column))) throw new Error('schema_migrations existente é incompatível com o controle oficial.');
}

async function assertDockerConnection(client: PoolClient): Promise<void> {
  const result = await client.query<{ current_database: string; server_port: number }>('SELECT current_database(), inet_server_port() AS server_port');
  const row = result.rows[0];
  if (row?.current_database !== EXPECTED_DATABASE || Number(row.server_port) !== EXPECTED_PORT) throw new Error('A conexão confirmada não corresponde ao PostgreSQL Docker esperado.');
}

async function applyMigration(client: PoolClient, migration: { name: string; sql: string; checksum: string }): Promise<void> {
  const existing = await client.query<{ file_name: string; checksum_sha256: string }>(
    'SELECT file_name, checksum_sha256 FROM schema_migrations WHERE version=$1', [migration.name],
  );
  if (existing.rowCount) {
    const row = existing.rows[0]!;
    if (row.file_name !== migration.name || row.checksum_sha256 !== migration.checksum) throw new Error(`Checksum ou arquivo divergente para ${migration.name}.`);
    return;
  }
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations(version,file_name,checksum_sha256) VALUES($1,$2,$3)', [migration.name, migration.name, migration.checksum]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  validateEnvironment();
  const migrations = await loadMigrations();
  const pool = new Pool({ host: process.env.DB_HOST, port: EXPECTED_PORT, database: EXPECTED_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', ['osgestor:docker:migrations']);
    await assertDockerConnection(client);
    await client.query('BEGIN');
    try { await ensureControlTable(client); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; }
    for (const migration of migrations) await applyMigration(client, migration);
    console.log('Migrations Docker 001–038 concluídas com sucesso.');
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', ['osgestor:docker:migrations']).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

void main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na rotina de migrations Docker.'); process.exitCode = 1; });
