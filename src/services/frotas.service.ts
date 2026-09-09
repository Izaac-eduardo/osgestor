import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { normalizePlate, normalizeModel, normalizeFleetCode, splitFleetCode } from '../utils/frotas.js';

export class FrotaServiceError extends Error {
  constructor(public readonly statusCode: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'FrotaServiceError';
  }
}
export interface Frota {
  id: string; prefixo_frota_id: string; numero: string; codigo: string;
  descricao: string | null; placa: string | null; modelo: string | null; ano: number | null;
  status: 'ATIVO' | 'INATIVO'; created_at: Date; updated_at: Date;
}
export interface FrotaFields {
  codigo: string; prefixo: string; numero: string; descricao: string | null;
  placa: string | null; modelo: string | null; ano: number | null; status: 'ATIVO' | 'INATIVO';
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new FrotaServiceError(400, field + ' deve ser texto.');
  return value.trim() || null;
}
function parseStatus(value: unknown): 'ATIVO' | 'INATIVO' {
  if (value !== 'ATIVO' && value !== 'INATIVO') throw new FrotaServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  return value;
}
export function parseFrotaFields(body: unknown, requireStatus = false): FrotaFields {
  if (!record(body)) throw new FrotaServiceError(400, 'O corpo deve ser um objeto.');
  if (typeof body.codigo !== 'string') throw new FrotaServiceError(400, 'codigo é obrigatório.');
  let code: ReturnType<typeof splitFleetCode>;
  try { code = splitFleetCode(body.codigo); }
  catch (error) { throw new FrotaServiceError(400, (error as Error).message); }
  const rawPlate = optionalText(body.placa, 'placa');
  const placa = rawPlate ? normalizePlate(rawPlate) : null;
  if (placa !== null && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) {
    throw new FrotaServiceError(400, 'Placa inválida. Use ABC1234 ou ABC1D23; equipamentos sem placa devem deixar o campo vazio.');
  }
  const ano = body.ano === undefined || body.ano === null ? null : body.ano;
  if (ano !== null && (typeof ano !== 'number' || !Number.isInteger(ano) || ano < 1900 || ano > 9999)) {
    throw new FrotaServiceError(400, 'ano deve ser um inteiro entre 1900 e 9999 ou null.');
  }
  return { ...code, descricao: optionalText(body.descricao, 'descricao'), placa,
    modelo: optionalText(body.modelo, 'modelo'), ano: ano as number | null,
    status: parseStatus(body.status === undefined && !requireStatus ? 'ATIVO' : body.status) };
}
export function handleFrotaDatabaseError(error: unknown): never {
  if (record(error)) {
    if (error.code === '23505') throw new FrotaServiceError(409, 'Já existe uma frota com este código ou placa.');
    if (error.code === '23503' || error.code === '23001') throw new FrotaServiceError(409, 'Cadastro em uso. Prefira desativar a frota.');
    if (error.code === '23514' || error.code === '22001') throw new FrotaServiceError(400, 'Dados de frota inválidos.');
  }
  throw error;
}
export async function ensureFrotaPrefix(client: PoolClient, codigo: string): Promise<{ id: string; created: boolean }> {
  const inserted = await client.query<{ id: string }>(
    'INSERT INTO prefixos_frota (codigo) VALUES ($1) ON CONFLICT (codigo) DO NOTHING RETURNING id', [codigo]);
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };
  const existing = await client.query<{ id: string }>('SELECT id FROM prefixos_frota WHERE codigo = $1 FOR SHARE', [codigo]);
  if (!existing.rows[0]) throw new FrotaServiceError(409, 'O prefixo foi alterado durante o cadastro. Tente novamente.');
  return { id: existing.rows[0].id, created: false };
}
export async function listFrotas(filters: { busca?: string; status?: string; placa?: string; modelo?: string }): Promise<Frota[]> {
  const clauses: string[] = [], values: string[] = [];
  const bind = (v: string) => { values.push(v); return '$' + values.length; };
  if (filters.status !== undefined) clauses.push('status = ' + bind(parseStatus(filters.status)));
  if (filters.busca?.trim()) {
    const q = filters.busca.trim();
    const literal = (v: string) => v.replace(/[\\%_]/g, '\\$&');
    const raw = bind('%' + literal(q) + '%');
    const code = bind('%' + literal(normalizeFleetCode(q)) + '%');
    const plate = bind('%' + literal(normalizePlate(q)) + '%');
    clauses.push('(codigo ILIKE ' + code + ' OR descricao ILIKE ' + raw + ' OR placa ILIKE ' + plate + ' OR modelo ILIKE ' + raw + ')');
  }
  if (filters.placa !== undefined) clauses.push('placa = ' + bind(normalizePlate(filters.placa)));
  if (filters.modelo !== undefined) clauses.push('upper(btrim(modelo)) = ' + bind(normalizeModel(filters.modelo)));
  return (await pool.query<Frota>('SELECT * FROM frotas' + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') + ' ORDER BY codigo', values)).rows;
}
export async function getFrota(id: string): Promise<Frota> {
  const result = await pool.query<Frota>('SELECT * FROM frotas WHERE id = $1', [id]);
  if (!result.rows[0]) throw new FrotaServiceError(404, 'Frota não encontrada.');
  return result.rows[0];
}
export async function saveFrota(body: unknown, id?: string): Promise<Frota> {
  const fields = parseFrotaFields(body, id !== undefined);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prefix = await ensureFrotaPrefix(client, fields.prefixo);
    const values = [prefix.id, fields.numero, fields.descricao, fields.placa, fields.modelo, fields.ano, fields.status];
    const result = id
      ? await client.query<Frota>('UPDATE frotas SET prefixo_frota_id=$1, numero=$2, descricao=$3, placa=$4, modelo=$5, ano=$6, status=$7 WHERE id=$8 RETURNING *', [...values, id])
      : await client.query<Frota>('INSERT INTO frotas (prefixo_frota_id,numero,descricao,placa,modelo,ano,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', values);
    if (!result.rows[0]) throw new FrotaServiceError(404, 'Frota não encontrada.');
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    return handleFrotaDatabaseError(error);
  } finally { client.release(); }
}
export async function updateFrotaStatus(id: string, body: unknown): Promise<Frota> {
  if (!record(body)) throw new FrotaServiceError(400, 'Informe o status.');
  const result = await pool.query<Frota>('UPDATE frotas SET status=$1 WHERE id=$2 RETURNING *', [parseStatus(body.status), id]);
  if (!result.rows[0]) throw new FrotaServiceError(404, 'Frota não encontrada.');
  return result.rows[0];
}
export async function deleteFrota(id: string): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM frotas WHERE id=$1', [id]);
    if (!result.rowCount) throw new FrotaServiceError(404, 'Frota não encontrada.');
  } catch (error) { handleFrotaDatabaseError(error); }
}