import { pool } from '../config/database.js';

const ordemServicoNaturezas = ['INTERNA', 'TERCEIRO', 'MATERIAL'] as const;
const ordemServicoStatuses = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_PECA', 'FINALIZADA', 'CANCELADA'] as const;

export const ordemServicoOverrideFields = ['natureza_os', 'obra_id', 'status'] as const;
export type OrdemServicoOverrideField = typeof ordemServicoOverrideFields[number];
export type OrdemServicoOverrideValue = string | null;

export interface OrdemServicoOverride {
  id: string;
  ordem_servico_id: string;
  campo: OrdemServicoOverrideField;
  valor_origem: OrdemServicoOverrideValue;
  valor_override: OrdemServicoOverrideValue;
  created_at: Date;
  updated_at: Date;
}

type OverrideDb = { query: typeof pool.query };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isField = (value: unknown): value is OrdemServicoOverrideField =>
  typeof value === 'string' && (ordemServicoOverrideFields as readonly string[]).includes(value);

const isValue = (value: unknown): value is OrdemServicoOverrideValue =>
  value === null || typeof value === 'string';

function validateValue(campo: OrdemServicoOverrideField, value: unknown, label: string): asserts value is OrdemServicoOverrideValue {
  if (!isValue(value)) throw new Error(`${label} deve ser texto ou null.`);
  if (campo === 'natureza_os' && (value === null || !ordemServicoNaturezas.includes(value as never))) {
    throw new Error(`${label} deve ser INTERNA, TERCEIRO ou MATERIAL.`);
  }
  if (campo === 'status' && (value === null || !ordemServicoStatuses.includes(value as never))) {
    throw new Error(`${label} deve ser um status de O.S. válido.`);
  }
  if (campo === 'obra_id' && (value === null || !uuidPattern.test(value))) {
    throw new Error(`${label} deve ser um UUID de obra válido.`);
  }
}

async function validateTarget(db: OverrideDb, campo: OrdemServicoOverrideField, value: OrdemServicoOverrideValue): Promise<void> {
  if (campo !== 'obra_id') return;
  const result = await db.query('SELECT 1 FROM obras WHERE id=$1', [value]);
  if (!result.rowCount) throw new Error('A obra do override não existe.');
}

function decode(value: unknown): OrdemServicoOverrideValue {
  if (value === null) return null;
  if (typeof value !== 'string') return value as OrdemServicoOverrideValue;
  try { return JSON.parse(value) as OrdemServicoOverrideValue; }
  catch { return value; }
}

function rowOf(row: Record<string, unknown>): OrdemServicoOverride {
  return {
    id: row.id as string,
    ordem_servico_id: row.ordem_servico_id as string,
    campo: row.campo as OrdemServicoOverrideField,
    valor_origem: decode(row.valor_origem),
    valor_override: decode(row.valor_override),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export async function getOverride(ordemServicoId: string, campo: OrdemServicoOverrideField, db: OverrideDb = pool): Promise<OrdemServicoOverride | undefined> {
  if (!isField(campo)) throw new Error('Campo de override inválido.');
  const result = await db.query<Record<string, unknown>>(
    'SELECT * FROM ordens_servico_overrides WHERE ordem_servico_id=$1 AND campo=$2',
    [ordemServicoId, campo],
  );
  return result.rows[0] ? rowOf(result.rows[0]) : undefined;
}

export async function listOverrides(ordemServicoId: string, db: OverrideDb = pool): Promise<OrdemServicoOverride[]> {
  const result = await db.query<Record<string, unknown>>(
    'SELECT * FROM ordens_servico_overrides WHERE ordem_servico_id=$1 ORDER BY campo',
    [ordemServicoId],
  );
  return result.rows.map(rowOf);
}

export async function hasOverride(ordemServicoId: string, campo: OrdemServicoOverrideField, db: OverrideDb = pool): Promise<boolean> {
  return Boolean(await getOverride(ordemServicoId, campo, db));
}

export async function upsertOverride(
  ordemServicoId: string,
  campo: OrdemServicoOverrideField,
  valorOrigem: OrdemServicoOverrideValue,
  valorOverride: OrdemServicoOverrideValue,
  db: OverrideDb = pool,
): Promise<OrdemServicoOverride> {
  if (!isField(campo)) throw new Error('Campo de override inválido.');
  validateValue(campo, valorOrigem, 'valor_origem');
  validateValue(campo, valorOverride, 'valor_override');
  await validateTarget(db, campo, valorOverride);
  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO ordens_servico_overrides(ordem_servico_id,campo,valor_origem,valor_override)
     VALUES($1,$2,$3::jsonb,$4::jsonb)
     ON CONFLICT (ordem_servico_id,campo) DO UPDATE SET valor_override=EXCLUDED.valor_override,updated_at=now()
     RETURNING *`,
    [ordemServicoId, campo, JSON.stringify(valorOrigem), JSON.stringify(valorOverride)],
  );
  return rowOf(result.rows[0]!);
}

export async function removeOverride(ordemServicoId: string, campo: OrdemServicoOverrideField, db: OverrideDb = pool): Promise<boolean> {
  if (!isField(campo)) throw new Error('Campo de override inválido.');
  const result = await db.query(
    'DELETE FROM ordens_servico_overrides WHERE ordem_servico_id=$1 AND campo=$2',
    [ordemServicoId, campo],
  );
  return Boolean(result.rowCount);
}
