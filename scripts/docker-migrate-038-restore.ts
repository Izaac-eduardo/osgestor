import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

const EXPECTED_DATABASE = 'osgestor_restore_test';
const EXPECTED_HOST = 'postgres';
const EXPECTED_PORT = 5432;
const MIGRATION_NAME = '038_edicao_manual_servicos_categorias.sql';
const PREVIEW_CONFIRMATION = 'PREVIEW_OSGESTOR_RESTORE_038';
const APPLY_CONFIRMATION = 'APPLY_OSGESTOR_RESTORE_038';
const migrationPath = path.resolve(process.cwd(), 'database', 'migrations', MIGRATION_NAME);

function argumentMode(): 'preview' | 'apply' {
  const preview = process.argv.includes('--preview');
  const apply = process.argv.includes('--apply');
  if (preview === apply) throw new Error('Use exatamente um modo: --preview ou --apply.');
  return apply ? 'apply' : 'preview';
}

function requireExact(name: string, expected: string): string {
  const value = process.env[name]?.trim();
  if (value !== expected) throw new Error(`${name} deve ser exatamente ${expected}.`);
  return value;
}

function validateEnvironment(mode: 'preview' | 'apply'): void {
  requireExact('DB_NAME', EXPECTED_DATABASE);
  requireExact('POSTGRES_DB', EXPECTED_DATABASE);
  requireExact('DB_HOST', EXPECTED_HOST);
  if (Number(process.env.DB_PORT ?? EXPECTED_PORT) !== EXPECTED_PORT) throw new Error('DB_PORT deve ser 5432.');
  if (!process.env.DB_USER?.trim() || !process.env.DB_PASSWORD) throw new Error('DB_USER e DB_PASSWORD são obrigatórios.');
  const expectedConfirmation = mode === 'apply' ? APPLY_CONFIRMATION : PREVIEW_CONFIRMATION;
  if (process.env.DOCKER_RESTORE_038_CONFIRM !== expectedConfirmation) throw new Error('Confirmação manual inválida para o modo solicitado.');
}

function stripTransactionWrapper(sql: string): string {
  return sql.replace(/^\s*BEGIN\s*;\s*/i, '').replace(/\s*COMMIT\s*;?\s*$/i, '').trim();
}

async function assertDockerConnection(client: PoolClient): Promise<void> {
  const result = await client.query<{ current_database: string; server_port: number }>('SELECT current_database(), inet_server_port() AS server_port');
  const row = result.rows[0];
  if (row?.current_database !== EXPECTED_DATABASE || Number(row.server_port) !== EXPECTED_PORT) throw new Error('A conexão não corresponde ao PostgreSQL Docker de restauração esperado.');
}

async function assertOfficialControlTable(client: PoolClient): Promise<void> {
  const columns = (await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations' ORDER BY ordinal_position",
  )).rows.map(row => row.column_name);
  const required = ['version', 'file_name', 'checksum_sha256', 'applied_at', 'applied_by'];
  if (!required.every(column => columns.includes(column))) throw new Error('schema_migrations não possui o formato oficial esperado.');
}

async function assertPreviousMigration(client: PoolClient, name: string, checksum: string): Promise<void> {
  const result = await client.query<{ file_name: string; checksum_sha256: string }>('SELECT file_name, checksum_sha256 FROM schema_migrations WHERE version=$1', [name]);
  const row = result.rows[0];
  if (!row || row.file_name !== name || row.checksum_sha256 !== checksum) throw new Error(`A migration anterior ${name} não está registrada com o checksum atual.`);
}

async function main(): Promise<void> {
  const mode = argumentMode();
  validateEnvironment(mode);
  const sql = await readFile(migrationPath, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const pool = new Pool({ host: process.env.DB_HOST, port: EXPECTED_PORT, database: EXPECTED_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', ['osgestor:restore:migration:038']);
    locked = true;
    await assertDockerConnection(client);
    await assertOfficialControlTable(client);
    await assertPreviousMigration(client, '036_reclassificacao_produto_servico.sql', createHash('sha256').update(await readFile(path.resolve(process.cwd(), 'database/migrations/036_reclassificacao_produto_servico.sql'), 'utf8')).digest('hex'));
    await assertPreviousMigration(client, '037_integridade_reclassificacao_produto_servico.sql', createHash('sha256').update(await readFile(path.resolve(process.cwd(), 'database/migrations/037_integridade_reclassificacao_produto_servico.sql'), 'utf8')).digest('hex'));
    const current = await client.query<{ file_name: string; checksum_sha256: string }>('SELECT file_name, checksum_sha256 FROM schema_migrations WHERE version=$1', [MIGRATION_NAME]);
    const existing = current.rows[0];
    if (existing && (existing.file_name !== MIGRATION_NAME || existing.checksum_sha256 !== checksum)) throw new Error('A migration 038 está registrada com arquivo ou checksum divergente.');
    if (existing) { console.log(`${mode}: migration 038 já aplicada com checksum válido.`); return; }
    if (mode === 'preview') { console.log(`preview: migration 038 pendente; checksum=${checksum}; nenhuma alteração será realizada.`); return; }
    await client.query('BEGIN');
    try {
      await client.query(stripTransactionWrapper(sql));
      await client.query('INSERT INTO schema_migrations(version,file_name,checksum_sha256) VALUES($1,$2,$3)', [MIGRATION_NAME, MIGRATION_NAME, checksum]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log('migration 038 aplicada e registrada com sucesso.');
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', ['osgestor:restore:migration:038']).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

void main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na rotina da migration 038.'); process.exitCode = 1; });
