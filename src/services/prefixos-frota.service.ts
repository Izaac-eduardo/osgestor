import { pool } from '../config/database.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { recordAudit } from './audit.service.js';

export const prefixoFrotaStatuses = ['ATIVO', 'INATIVO'] as const;
type PrefixoFrotaStatus = (typeof prefixoFrotaStatuses)[number];

export interface PrefixoFrota {
  id: string;
  codigo: string;
  descricao: string | null;
  status: PrefixoFrotaStatus;
  created_at: Date;
  updated_at: Date;
}
const auditPrefixo = (row: Partial<PrefixoFrota> | undefined): Record<string, unknown> | undefined => row ? Object.fromEntries(['id', 'codigo', 'descricao', 'status'].filter((key) => key in row).map((key) => [key, row[key as keyof PrefixoFrota]])) : undefined;

interface PrefixoFrotaFields {
  codigo: string;
  descricao: string | null;
  status: PrefixoFrotaStatus;
}

export interface PrefixoFrotaFilters {
  status?: string;
  codigo?: string;
  descricao?: string;
}

export class PrefixoFrotaServiceError extends Error {
  constructor(public readonly statusCode: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'PrefixoFrotaServiceError';
  }
}

interface PostgresError {
  code?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPostgresError = (error: unknown): error is PostgresError => isRecord(error);

const parseCodigo = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PrefixoFrotaServiceError(400, 'codigo é obrigatório.');
  }
  const codigo = value.trim().toUpperCase();
  if (/\s/.test(codigo)) {
    throw new PrefixoFrotaServiceError(400, 'codigo não pode conter espaços.');
  }
  if (codigo.length > 10) {
    throw new PrefixoFrotaServiceError(
      400,
      'O código do prefixo deve possuir no máximo 10 caracteres.',
    );
  }
  return codigo;
};

const parseDescricao = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new PrefixoFrotaServiceError(400, 'descricao deve ser um texto ou null.');
  }
  const descricao = value.trim();
  return descricao === '' ? null : descricao;
};

const parseFields = (body: unknown, requireStatus: boolean): PrefixoFrotaFields => {
  if (!isRecord(body)) {
    throw new PrefixoFrotaServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }
  if (requireStatus && body.status === undefined) {
    throw new PrefixoFrotaServiceError(400, 'status é obrigatório.');
  }
  const status = body.status === undefined ? 'ATIVO' : body.status;
  if (status !== 'ATIVO' && status !== 'INATIVO') {
    throw new PrefixoFrotaServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  }
  return {
    codigo: parseCodigo(body.codigo),
    descricao: parseDescricao(body.descricao),
    status,
  };
};

const handleDatabaseError = (error: unknown): never => {
  if (isPostgresError(error) && error.code === '23514') {
    throw new PrefixoFrotaServiceError(
      400,
      'O código do prefixo deve ser compatível com as frotas vinculadas (somente letras).',
    );
  }
  if (isPostgresError(error) && error.code === '23505') {
    throw new PrefixoFrotaServiceError(409, 'Já existe um prefixo de frota com este código.');
  }
  if (isPostgresError(error) && (error.code === '23503' || error.code === '23001')) {
    throw new PrefixoFrotaServiceError(
      409,
      'Não é possível excluir este prefixo porque ele está sendo utilizado.',
    );
  }
  throw error;
};

export async function listPrefixosFrota(filters: PrefixoFrotaFilters): Promise<PrefixoFrota[]> {
  if (filters.status !== undefined && filters.status !== 'ATIVO' && filters.status !== 'INATIVO') {
    throw new PrefixoFrotaServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  }
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.status !== undefined) {
    conditions.push(`status = $${values.length + 1}`);
    values.push(filters.status);
  }
  if (filters.codigo !== undefined) {
    conditions.push(`codigo ILIKE $${values.length + 1}`);
    values.push(`%${filters.codigo.trim()}%`);
  }
  if (filters.descricao !== undefined) {
    conditions.push(`descricao ILIKE $${values.length + 1}`);
    values.push(`%${filters.descricao.trim()}%`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query<PrefixoFrota>(
    `SELECT * FROM prefixos_frota ${where} ORDER BY codigo ASC`,
    values,
  );
  return result.rows;
}

export async function getPrefixoFrota(id: string): Promise<PrefixoFrota> {
  const result = await pool.query<PrefixoFrota>('SELECT * FROM prefixos_frota WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new PrefixoFrotaServiceError(404, 'Prefixo de frota não encontrado.');
  }
  return result.rows[0]!;
}

export async function createPrefixoFrota(body: unknown, actor?: AuthenticatedRequestUser): Promise<PrefixoFrota> {
  const fields = parseFields(body, false);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<PrefixoFrota>(
      `INSERT INTO prefixos_frota (codigo, descricao, status)
       VALUES ($1, $2, $3) RETURNING *`,
      [fields.codigo, fields.descricao, fields.status],
    );
    if (actor) await recordAudit({ actor, acao: 'CRIAR', modulo: 'PREFIXOS_FROTA', entidade: 'prefixos_frota', entidadeId: result.rows[0]!.id, dadosPosteriores: auditPrefixo(result.rows[0]) }, client);
    await client.query('COMMIT'); return result.rows[0]!;
  } catch (error) { await client.query('ROLLBACK'); return handleDatabaseError(error); } finally { client.release(); }
}

export async function updatePrefixoFrota(id: string, body: unknown, actor?: AuthenticatedRequestUser): Promise<PrefixoFrota> {
  const fields = parseFields(body, true);
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); const before = await client.query<PrefixoFrota>('SELECT * FROM prefixos_frota WHERE id=$1 FOR UPDATE', [id]);
    const result = await client.query<PrefixoFrota>(
      `UPDATE prefixos_frota SET codigo = $1, descricao = $2, status = $3
       WHERE id = $4 RETURNING *`,
      [fields.codigo, fields.descricao, fields.status, id],
    );
    if (result.rows.length === 0) {
      throw new PrefixoFrotaServiceError(404, 'Prefixo de frota não encontrado.');
    }
    if (actor && JSON.stringify(auditPrefixo(before.rows[0])) !== JSON.stringify(auditPrefixo(result.rows[0]!))) await recordAudit({ actor, acao: 'EDITAR', modulo: 'PREFIXOS_FROTA', entidade: 'prefixos_frota', entidadeId: id, dadosAnteriores: auditPrefixo(before.rows[0]), dadosPosteriores: auditPrefixo(result.rows[0]!) }, client);
    await client.query('COMMIT'); return result.rows[0]!;
  } catch (error) { await client.query('ROLLBACK'); return handleDatabaseError(error); } finally { client.release(); }
}

export async function updatePrefixoFrotaStatus(id: string, body: unknown, actor?: AuthenticatedRequestUser): Promise<PrefixoFrota> {
  if (!isRecord(body) || (body.status !== 'ATIVO' && body.status !== 'INATIVO')) {
    throw new PrefixoFrotaServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  }
  const client = await pool.connect(); try { await client.query('BEGIN'); const before = await client.query<PrefixoFrota>('SELECT * FROM prefixos_frota WHERE id=$1 FOR UPDATE', [id]);
  const result = await client.query<PrefixoFrota>(
    'UPDATE prefixos_frota SET status = $1 WHERE id = $2 RETURNING *',
    [body.status, id],
  );
  if (result.rows.length === 0) {
    throw new PrefixoFrotaServiceError(404, 'Prefixo de frota não encontrado.');
  }
  if (actor && before.rows[0]?.status !== result.rows[0]!.status) await recordAudit({ actor, acao: result.rows[0]!.status === 'ATIVO' ? 'ATIVAR' : 'DESATIVAR', modulo: 'PREFIXOS_FROTA', entidade: 'prefixos_frota', entidadeId: id, dadosAnteriores: { status: before.rows[0]?.status }, dadosPosteriores: { status: result.rows[0]!.status } }, client);
  await client.query('COMMIT'); return result.rows[0]!;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function deletePrefixoFrota(id: string, actor?: AuthenticatedRequestUser): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); const before = await client.query<PrefixoFrota>('SELECT * FROM prefixos_frota WHERE id=$1 FOR UPDATE', [id]);
    const result = await client.query('DELETE FROM prefixos_frota WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new PrefixoFrotaServiceError(404, 'Prefixo de frota não encontrado.');
    }
    if (actor) await recordAudit({ actor, acao: 'EXCLUIR', modulo: 'PREFIXOS_FROTA', entidade: 'prefixos_frota', entidadeId: id, dadosAnteriores: auditPrefixo(before.rows[0]) }, client);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); return handleDatabaseError(error); } finally { client.release(); }
}
