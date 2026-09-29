import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid, abastecimentoStatuses, type AbastecimentoStatus } from './abastecimentos-base.service.js';

type BicoFields = { codigo: string; descricao: string | null; produto_id: string; status: AbastecimentoStatus };
type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string, required: boolean, max: number): string | null => {
  if (value === undefined || value === null) { if (required) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); return null; }
  if (typeof value !== 'string') throw new AbastecimentoServiceError(400, `${field} deve ser um texto.`);
  const result = value.trim();
  if (required && !result) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`);
  if (result.length > max) throw new AbastecimentoServiceError(400, `${field} deve ter no máximo ${max} caracteres.`);
  return result || null;
};
const parseStatus = (value: unknown, required = false): AbastecimentoStatus => {
  if (value === undefined && !required) return 'ATIVO';
  if (!abastecimentoStatuses.includes(value as AbastecimentoStatus)) throw new AbastecimentoServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  return value as AbastecimentoStatus;
};
const parseFields = (body: unknown, requireStatus: boolean): BicoFields => {
  if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  return {
    codigo: text(body.codigo, 'codigo', true, 30)!,
    descricao: text(body.descricao, 'descricao', false, 255),
    produto_id: assertUuid(body.produto_id, 'produto_id'),
    status: parseStatus(body.status, requireStatus),
  };
};
const ensurePoint = async (pontoId: string) => {
  if (!(await pool.query('SELECT 1 FROM abastecimento_pontos WHERE id=$1', [pontoId])).rowCount) throw new AbastecimentoServiceError(404, 'Ponto operacional não encontrado.');
};
const ensureProduct = async (productId: string) => {
  if (!(await pool.query("SELECT 1 FROM abastecimento_produtos WHERE id=$1 AND status='ATIVO'", [productId])).rowCount) throw new AbastecimentoServiceError(404, 'Produto ativo não encontrado.');
};
const mapError = (error: unknown): never => {
  const code = isRecord(error) && error.code;
  if (code === '23505') throw new AbastecimentoServiceError(409, 'Já existe um bico com este código.');
  throw error;
};

export async function listAbastecimentoBicos(pontoId: string, filters: { status?: string; busca?: string } = {}) {
  const id = assertUuid(pontoId, 'ponto_id'); await ensurePoint(id);
  if (filters.status !== undefined && !abastecimentoStatuses.includes(filters.status as AbastecimentoStatus)) throw new AbastecimentoServiceError(400, 'status inválido.');
  const values: string[] = [id]; const conditions = ['b.ponto_id=$1'];
  if (filters.status) { values.push(filters.status); conditions.push(`b.status=$${values.length}`); }
  if (filters.busca?.trim()) { values.push(`%${filters.busca.trim()}%`); conditions.push(`(b.codigo ILIKE $${values.length} OR COALESCE(b.descricao,'') ILIKE $${values.length})`); }
  return (await pool.query(`SELECT b.* FROM abastecimento_bicos b WHERE ${conditions.join(' AND ')} ORDER BY b.codigo`, values)).rows;
}

export async function createAbastecimentoBico(pontoId: string, body: unknown) {
  const id = assertUuid(pontoId, 'ponto_id'); await ensurePoint(id); const fields = parseFields(body, false); await ensureProduct(fields.produto_id);
  try { return (await pool.query('INSERT INTO abastecimento_bicos(codigo,descricao,produto_id,ponto_id,status) VALUES($1,$2,$3,$4,$5) RETURNING *', [fields.codigo, fields.descricao, fields.produto_id, id, fields.status])).rows[0]; } catch (error) { return mapError(error); }
}
export async function updateAbastecimentoBico(pontoId: string, bicoId: string, body: unknown) {
  const pointId = assertUuid(pontoId, 'ponto_id'); const id = assertUuid(bicoId); await ensurePoint(pointId); const fields = parseFields(body, true); await ensureProduct(fields.produto_id);
  try { const result = await pool.query('UPDATE abastecimento_bicos SET codigo=$1,descricao=$2,produto_id=$3,status=$4 WHERE id=$5 AND ponto_id=$6 RETURNING *', [fields.codigo, fields.descricao, fields.produto_id, fields.status, id, pointId]); if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Bico não encontrado neste ponto.'); return result.rows[0]; } catch (error) { return mapError(error); }
}
export async function updateAbastecimentoBicoStatus(pontoId: string, bicoId: string, body: unknown) {
  const pointId = assertUuid(pontoId, 'ponto_id'); const id = assertUuid(bicoId); await ensurePoint(pointId); if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'Informe o status.');
  const result = await pool.query('UPDATE abastecimento_bicos SET status=$1 WHERE id=$2 AND ponto_id=$3 RETURNING *', [parseStatus(body.status, true), id, pointId]); if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Bico não encontrado neste ponto.'); return result.rows[0];
}
