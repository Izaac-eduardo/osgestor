import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

export const allowedVersions = new Map([
  ['039', '039_os_manutencao_sem_obra.sql'],
  ['040', '040_importacoes_contabeis.sql'],
  ['041', '041_salarios_base_oficina.sql'],
  ['042', '042_contabilidade_despesas_compartilhadas.sql'],
]);
const allowedDatabases = new Set(['oficina', 'oficina_teste_fase051', 'osgestor_prod']);

export function validateArguments(args: { mode: string; database?: string; version?: string; confirmedTarget?: string; configuredDatabase?: string }) {
  if (!['preview', 'apply'].includes(args.mode)) throw new Error('Use exatamente um modo: --preview ou --apply.');
  if (!args.database) throw new Error('Informe explicitamente --database=NOME.');
  if (!allowedDatabases.has(args.database)) throw new Error(`Banco alvo não autorizado: ${args.database}.`);
  if (!args.version || !allowedVersions.has(args.version)) throw new Error('Informe --version=039, --version=040, --version=041 ou --version=042.');
  if (args.mode === 'apply' && args.confirmedTarget !== args.database) throw new Error('O modo --apply exige --confirm-target com o mesmo nome do banco alvo.');
  if (args.configuredDatabase && args.configuredDatabase !== args.database) throw new Error('DB_NAME diverge do banco alvo informado.');
  return allowedVersions.get(args.version)!;
}

export function validateControlColumns(columns: string[]): void {
  const required = ['version', 'file_name', 'checksum_sha256', 'applied_at', 'applied_by'];
  if (!required.every(column => columns.includes(column))) throw new Error(`schema_migrations incompatível; colunas encontradas: ${columns.join(', ')}`);
}

export function validateAppliedChecksum(existing: { version: string; file_name: string; checksum_sha256: string }, fileName: string, checksum: string): void {
  if (existing.version !== fileName || existing.file_name !== fileName) throw new Error(`Registro de migration incompatível para ${fileName}.`);
  if (existing.checksum_sha256.trim() !== checksum) throw new Error(`Checksum incompatível para ${fileName}: o SQL local diverge do SQL registrado.`);
}

export function migrationChecksum(sql: string): string { return createHash('sha256').update(sql).digest('hex'); }
export function stripTransactionWrapper(sql: string): string { return sql.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, ''); }

export async function applyMigration(client: Pick<PoolClient, 'query'>, fileName: string, sql: string): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(stripTransactionWrapper(sql));
    const checksum = migrationChecksum(sql);
    await client.query('INSERT INTO schema_migrations(version,file_name,checksum_sha256,applied_at,applied_by) VALUES($1,$2,$3,now(),current_user)', [fileName, fileName, checksum]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

const argument = (name: string): string | undefined => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
async function main(): Promise<void> {
  const preview = process.argv.includes('--preview');
  const apply = process.argv.includes('--apply');
  const database = argument('database');
  const version = argument('version');
  const fileName = validateArguments({ mode: preview === apply ? 'invalid' : preview ? 'preview' : 'apply', database, version, confirmedTarget: argument('confirm-target'), configuredDatabase: process.env.DB_NAME });
  const filePath = path.resolve(process.cwd(), 'database', 'migrations', fileName);
  const sql = readFileSync(filePath, 'utf8');
  const checksum = migrationChecksum(sql);
  const pool = new Pool({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), database, user: process.env.DB_USER ?? 'postgres', password: process.env.DB_PASSWORD ?? '' });
  try {
    const client = await pool.connect();
    try {
      if (apply) await client.query("SELECT pg_advisory_lock(hashtextextended('osgestor:migrations', 0))");
      const current = await client.query<{ current_database: string }>('SELECT current_database()');
      if (current.rows[0]?.current_database !== database) throw new Error('O banco conectado não corresponde ao alvo solicitado.');
      const tableExists = (await client.query<{ name: string | null }>("SELECT to_regclass('public.schema_migrations') AS name")).rows[0]?.name !== null;
      if (!tableExists) throw new Error('schema_migrations não existe; o executor não cria nem altera sua estrutura.');
      const columns = (await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations' ORDER BY ordinal_position")).rows.map(row => row.column_name);
      validateControlColumns(columns);
      const existing = await client.query<{ version: string; file_name: string; checksum_sha256: string }>('SELECT version,file_name,checksum_sha256 FROM schema_migrations WHERE version=$1', [fileName]);
      if (existing.rowCount) {
        validateAppliedChecksum(existing.rows[0]!, fileName, checksum);
        console.log(JSON.stringify({ mode: preview ? 'preview' : 'apply', database, version: fileName, status: 'already_applied', checksum }, null, 2));
      } else if (preview) {
        console.log(JSON.stringify({ mode: 'preview', database, version: fileName, status: 'pending', checksum, writes: [] }, null, 2));
      } else {
        await applyMigration(client, fileName, sql);
        console.log(JSON.stringify({ mode: 'apply', database, version: fileName, status: 'applied', checksum }, null, 2));
      }
    } finally {
      if (apply) await client.query("SELECT pg_advisory_unlock(hashtextextended('osgestor:migrations', 0))").catch(() => undefined);
      client.release();
    }
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1]).replace(/\\/g, '/')}`).href) {
  void main().catch(error => { console.error(error); process.exitCode = 1; });
}
