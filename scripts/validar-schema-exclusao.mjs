import { Client } from 'pg';

const expectedDatabase = 'oficina';
const requiredColumns = ['excluido_at', 'excluido_por', 'motivo_exclusao'];
const requiredIndexes = ['idx_abastecimentos_ativos_data', 'idx_abastecimentos_excluidos_data', 'uq_abastecimentos_entrada_destino'];
const requiredConstraint = 'abastecimentos_motivo_exclusao_ck';

const client = new Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
});

try {
  await client.connect();
  const identity = await client.query('SELECT current_database() AS database, current_user AS user');
  if (identity.rows[0]?.database !== expectedDatabase) throw new Error(`Banco inesperado: ${identity.rows[0]?.database ?? '<desconhecido>'}.`);

  const columns = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='abastecimentos' AND column_name = ANY($1::text[])
    ORDER BY column_name
  `, [requiredColumns]);
  const foundColumns = columns.rows.map(row => row.column_name);
  if (foundColumns.length !== requiredColumns.length || requiredColumns.some(column => !foundColumns.includes(column))) {
    throw new Error(`Colunas de exclusão ausentes. Encontradas: ${foundColumns.join(',') || '<nenhuma>'}.`);
  }

  const constraint = await client.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid='public.abastecimentos'::regclass AND conname=$1
  `, [requiredConstraint]);
  if (!constraint.rows[0]?.definition?.includes('excluido_at') || !constraint.rows[0]?.definition?.includes('motivo_exclusao')) {
    throw new Error(`Constraint ${requiredConstraint} ausente ou incompatível.`);
  }

  const indexes = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='abastecimentos' AND indexname = ANY($1::text[])
    ORDER BY indexname
  `, [requiredIndexes]);
  const foundIndexes = indexes.rows.map(row => row.indexname);
  if (requiredIndexes.some(index => !foundIndexes.includes(index))) throw new Error(`Índices de exclusão ausentes. Encontrados: ${foundIndexes.join(',')}.`);

  console.log(JSON.stringify({ ok: true, database: identity.rows[0].database, user: identity.rows[0].user, columns: foundColumns, constraint: requiredConstraint, indexes: foundIndexes }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
