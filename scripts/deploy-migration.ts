import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

const allowedVersions = new Map([
  ['036', '036_reclassificacao_produto_servico.sql'],
  ['037', '037_integridade_reclassificacao_produto_servico.sql'],
  ['038', '038_edicao_manual_servicos_categorias.sql'],
]);
const allowedDatabases = new Set(['oficina', 'oficina_teste_fase051']);

const argument = (name: string): string | undefined => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const preview = process.argv.includes('--preview');
const apply = process.argv.includes('--apply');
const database = argument('database');
const version = argument('version');
const confirmedTarget = argument('confirm-target');
if (!preview && !apply) throw new Error('Use exatamente um modo: --preview ou --apply.');
if (preview === apply) throw new Error('Use exatamente um modo: --preview ou --apply.');
if (!database) throw new Error('Informe explicitamente --database=NOME.');
if (!allowedDatabases.has(database)) throw new Error(`Banco alvo não autorizado: ${database}.`);
if (!version || !allowedVersions.has(version)) throw new Error('Informe --version=036, --version=037 ou --version=038.');
if (apply && confirmedTarget !== database) throw new Error('O modo --apply exige --confirm-target com o mesmo nome do banco alvo.');
if (process.env.DB_NAME && process.env.DB_NAME !== database) throw new Error(`DB_NAME (${process.env.DB_NAME}) diverge de --database (${database}).`);

const fileName = allowedVersions.get(version)!;
const filePath = path.resolve(process.cwd(), 'database', 'migrations', fileName);
const sql = readFileSync(filePath, 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
const pool = new Pool({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), database, user: process.env.DB_USER ?? 'postgres', password: process.env.DB_PASSWORD ?? '' });

const stripTransactionWrapper = (value: string): string => value.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const ensureControlTable = async (client: PoolClient) => client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by VARCHAR(150) NOT NULL DEFAULT current_user,
  CONSTRAINT schema_migrations_checksum_chk CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
)`);

async function main(): Promise<void> {
try {
  const client = await pool.connect();
  const advisoryLock = `SELECT pg_advisory_lock(hashtextextended('osgestor:migrations', 0))`;
  const advisoryUnlock = `SELECT pg_advisory_unlock(hashtextextended('osgestor:migrations', 0))`;
  try {
    if (apply) await client.query(advisoryLock);
    const current = await client.query<{ current_database: string }>('SELECT current_database()');
    if (current.rows[0]?.current_database !== database) throw new Error('O banco conectado não corresponde ao alvo solicitado.');
    const controlExists = (await client.query<{ name: string | null }>("SELECT to_regclass('public.schema_migrations') AS name")).rows[0]?.name !== null;
    const controlColumns = controlExists
      ? (await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations' ORDER BY ordinal_position")).rows.map(row => row.column_name)
      : [];
    const compatibleControl = !controlExists || ['version', 'file_name', 'checksum_sha256', 'applied_at', 'applied_by'].every(column => controlColumns.includes(column));
    if (!compatibleControl) {
      const message = `schema_migrations existente não possui o formato controlado exigido (colunas: ${controlColumns.join(', ')}). Não será alterada automaticamente.`;
      if (apply) throw new Error(message);
      console.log(JSON.stringify({ mode: 'preview', database, version: fileName, status: 'blocked_control_schema', checksum, control_columns: controlColumns, message }, null, 2));
      return;
    }
    if (version === '037') {
      if (!controlExists) throw new Error('A migration 037 exige que a migration 036 esteja registrada em schema_migrations.');
      const previous = await client.query<{ checksum_sha256: string }>(
        `SELECT checksum_sha256 FROM schema_migrations WHERE version=$1`,
        ['036_reclassificacao_produto_servico.sql'],
      );
      const previousChecksum = createHash('sha256').update(readFileSync(path.resolve(process.cwd(), 'database', 'migrations', '036_reclassificacao_produto_servico.sql'), 'utf8')).digest('hex');
      if (previous.rows[0]?.checksum_sha256 !== previousChecksum) {
        throw new Error('A migration 037 exige a migration 036 registrada com o checksum atual.');
      }
    }
    const control = controlExists
      ? await client.query<{ version: string; file_name: string; checksum_sha256: string }>(`SELECT version,file_name,checksum_sha256 FROM schema_migrations WHERE version=$1`, [fileName])
      : { rows: [] as { version: string; file_name: string; checksum_sha256: string }[] };
    const existing = control.rows[0];
    if (existing && existing.file_name !== fileName) throw new Error(`Registro de ${fileName} aponta para arquivo diferente: ${existing.file_name}.`);
    if (existing && existing.checksum_sha256 !== checksum) throw new Error(`Checksum incompatível para ${fileName}: aplicado=${existing.checksum_sha256}, arquivo=${checksum}.`);
    if (existing) {
      console.log(JSON.stringify({ mode: preview ? 'preview' : 'apply', database, version: fileName, status: 'already_applied', checksum }, null, 2));
    } else if (preview) {
      console.log(JSON.stringify({ mode: 'preview', database, version: fileName, status: 'pending', checksum, writes: ['migration SQL', 'schema_migrations'], control_table_exists: controlExists }, null, 2));
    } else {
      await client.query('BEGIN');
      try {
        await ensureControlTable(client);
        await client.query(stripTransactionWrapper(sql));
        await client.query('INSERT INTO schema_migrations(version,file_name,checksum_sha256) VALUES($1,$2,$3)', [fileName, fileName, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.log(JSON.stringify({ mode: 'apply', database, version: fileName, status: 'applied', checksum }, null, 2));
    }
  } finally {
    if (apply) await client.query(advisoryUnlock).catch(() => undefined);
    client.release();
  }
} finally { await pool.end(); }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
