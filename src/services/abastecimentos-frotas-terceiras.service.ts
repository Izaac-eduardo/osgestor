import { pool } from '../config/database.js';
import { AbastecimentoServiceError, abastecimentoStatuses, assertUuid } from './abastecimentos-base.service.js';

export const frotaTerceiraTipos = ['PLACA', 'EQUIPAMENTO', 'OUTRO'] as const;
export type FrotaTerceiraTipo = (typeof frotaTerceiraTipos)[number];

interface FrotaTerceiraFields {
  identificacao: string;
  identificacao_normalizada: string;
  tipo: FrotaTerceiraTipo;
  terceiro_id: string | null;
  status: 'ATIVO' | 'INATIVO';
  observacoes: string | null;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string, required = false, max?: number): string | null => {
  if (value === undefined || value === null) {
    if (required) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`);
    return null;
  }
  if (typeof value !== 'string') throw new AbastecimentoServiceError(400, `${field} deve ser um texto.`);
  const result = value.trim();
  if (required && !result) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`);
  if (max !== undefined && result.length > max) throw new AbastecimentoServiceError(400, `${field} deve ter no máximo ${max} caracteres.`);
  return result || null;
};
const postgresCode = (error: unknown): string | undefined => record(error) && typeof error.code === 'string' ? error.code : undefined;
const mapDatabaseError = (error: unknown): never => {
  if (postgresCode(error) === '23505') throw new AbastecimentoServiceError(409, 'Já existe uma frota terceira com esta identificação.');
  if (postgresCode(error) === '23503') throw new AbastecimentoServiceError(409, 'Terceiro não encontrado ou não pode ser removido.');
  throw error;
};

const parseFields = async (body: unknown, requireStatus = false): Promise<FrotaTerceiraFields> => {
  if (!record(body)) throw new AbastecimentoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  const identificacao = text(body.identificacao, 'identificacao', true, 100)!.toUpperCase();
  const tipo = body.tipo;
  if (!frotaTerceiraTipos.includes(tipo as FrotaTerceiraTipo)) throw new AbastecimentoServiceError(400, 'tipo de frota terceira inválido.');
  const terceiroId = body.terceiro_id === undefined || body.terceiro_id === null || body.terceiro_id === '' ? null : assertUuid(body.terceiro_id, 'terceiro_id');
  if (terceiroId && !(await pool.query("SELECT 1 FROM abastecimento_terceiros WHERE id=$1 AND status='ATIVO'", [terceiroId])).rowCount) {
    throw new AbastecimentoServiceError(404, 'Terceiro não encontrado ou inativo.');
  }
  const rawStatus = body.status === undefined && !requireStatus ? 'ATIVO' : body.status;
  if (!abastecimentoStatuses.includes(rawStatus as 'ATIVO' | 'INATIVO')) throw new AbastecimentoServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  return {
    identificacao,
    identificacao_normalizada: identificacao,
    tipo: tipo as FrotaTerceiraTipo,
    terceiro_id: terceiroId,
    status: rawStatus as 'ATIVO' | 'INATIVO',
    observacoes: text(body.observacoes, 'observacoes'),
  };
};

const select = `SELECT f.id,f.identificacao,f.identificacao_normalizada,f.tipo,f.terceiro_id,
  f.status,f.observacoes,f.created_at,f.updated_at,t.nome AS terceiro_nome
  FROM abastecimento_frotas_terceiras f
  LEFT JOIN abastecimento_terceiros t ON t.id=f.terceiro_id`;

export interface FrotaTerceiraFilters { busca?: string; tipo?: string; status?: string; terceiro_id?: string; sem_terceiro?: boolean; }
export async function listFrotasTerceiras(filters: FrotaTerceiraFilters = {}) {
  if (filters.tipo !== undefined && !frotaTerceiraTipos.includes(filters.tipo as FrotaTerceiraTipo)) throw new AbastecimentoServiceError(400, 'tipo de frota terceira inválido.');
  if (filters.status !== undefined && !abastecimentoStatuses.includes(filters.status as 'ATIVO' | 'INATIVO')) throw new AbastecimentoServiceError(400, 'status inválido.');
  const values: string[] = []; const conditions: string[] = [];
  const bind = (value: string) => { values.push(value); return `$${values.length}`; };
  if (filters.busca?.trim()) { const value = bind(`%${filters.busca.trim()}%`); conditions.push(`f.identificacao ILIKE ${value}`); }
  if (filters.tipo) conditions.push(`f.tipo=${bind(filters.tipo)}`);
  if (filters.status) conditions.push(`f.status=${bind(filters.status)}`);
  if (filters.terceiro_id) conditions.push(`f.terceiro_id=${bind(assertUuid(filters.terceiro_id, 'terceiro_id'))}`);
  if (filters.sem_terceiro) conditions.push('f.terceiro_id IS NULL');
  return (await pool.query(`${select} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY f.identificacao_normalizada`, values)).rows;
}

export async function getFrotaTerceira(id: string) {
  const result = await pool.query(`${select} WHERE f.id=$1`, [assertUuid(id)]);
  if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Frota terceira não encontrada.');
  return result.rows[0];
}

export async function createFrotaTerceira(body: unknown) {
  const fields = await parseFields(body);
  try {
    const result = await pool.query<{ id: string }>(`INSERT INTO abastecimento_frotas_terceiras(identificacao,identificacao_normalizada,tipo,terceiro_id,status,observacoes)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, Object.values(fields));
    return getFrotaTerceira(result.rows[0]!.id);
  } catch (error) { return mapDatabaseError(error); }
}

export async function updateFrotaTerceira(id: string, body: unknown) {
  const frotaId = assertUuid(id);
  const fields = await parseFields(body, true);
  try {
    const result = await pool.query(`UPDATE abastecimento_frotas_terceiras SET identificacao=$1,identificacao_normalizada=$2,tipo=$3,terceiro_id=$4,status=$5,observacoes=$6 WHERE id=$7 RETURNING id`, [...Object.values(fields), frotaId]);
    if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Frota terceira não encontrada.');
    return getFrotaTerceira(frotaId);
  } catch (error) { if (error instanceof AbastecimentoServiceError) throw error; return mapDatabaseError(error); }
}

export async function updateFrotaTerceiraStatus(id: string, body: unknown) {
  if (!record(body)) throw new AbastecimentoServiceError(400, 'Informe o status.');
  const status = body.status;
  if (!abastecimentoStatuses.includes(status as 'ATIVO' | 'INATIVO')) throw new AbastecimentoServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  const frotaId = assertUuid(id);
  const result = await pool.query('UPDATE abastecimento_frotas_terceiras SET status=$1 WHERE id=$2 RETURNING id', [status, frotaId]);
  if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Frota terceira não encontrada.');
  return getFrotaTerceira(frotaId);
}
