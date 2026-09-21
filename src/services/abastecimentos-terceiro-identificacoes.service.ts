import { pool } from '../config/database.js';
import { normalizeTerceiroIdentificacao } from '../imports/terceiros.js';
import { AbastecimentoServiceError, assertUuid, abastecimentoStatuses } from './abastecimentos-base.service.js';

export const identificacaoTipos = ['PLACA', 'FROTA_EXTERNA', 'GERAL', 'CODIGO', 'OUTRO'] as const;
type IdentificacaoTipo = (typeof identificacaoTipos)[number];

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string, required: boolean, max: number): string | null => {
  if (value === undefined || value === null) { if (required) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); return null; }
  if (typeof value !== 'string') throw new AbastecimentoServiceError(400, `${field} deve ser texto.`);
  const result = value.trim(); if (required && !result) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); if (result.length > max) throw new AbastecimentoServiceError(400, `${field} deve ter no máximo ${max} caracteres.`); return result || null;
};
const parse = (body: unknown, requireStatus = false) => {
  if (!record(body)) throw new AbastecimentoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  const original = text(body.identificacao, 'identificacao', true, 100)!;
  const normalized = normalizeTerceiroIdentificacao(original);
  if (!normalized) throw new AbastecimentoServiceError(400, 'identificacao não possui caracteres válidos.');
  const tipo = body.tipo === undefined && !requireStatus ? 'OUTRO' : body.tipo;
  if (typeof tipo !== 'string' || !identificacaoTipos.includes(tipo as IdentificacaoTipo)) throw new AbastecimentoServiceError(400, 'tipo de identificação inválido.');
  const status = body.status === undefined && !requireStatus ? 'ATIVO' : body.status;
  if (typeof status !== 'string' || !abastecimentoStatuses.includes(status as 'ATIVO' | 'INATIVO')) throw new AbastecimentoServiceError(400, 'status inválido.');
  return { identificacao: original, identificacao_normalizada: normalized, tipo, status, observacoes: text(body.observacoes, 'observacoes', false, 5000) };
};

export async function listTerceiroIdentificacoes(terceiroId: string) {
  const id = assertUuid(terceiroId, 'terceiro_id');
  if (!(await pool.query('SELECT 1 FROM abastecimento_terceiros WHERE id=$1', [id])).rowCount) throw new AbastecimentoServiceError(404, 'Terceiro não encontrado.');
  return (await pool.query('SELECT * FROM abastecimento_terceiro_identificacoes WHERE terceiro_id=$1 ORDER BY status DESC,tipo,identificacao', [id])).rows;
}
export async function createTerceiroIdentificacao(terceiroId: string, body: unknown) {
  const id = assertUuid(terceiroId, 'terceiro_id'); const fields = parse(body);
  if (!(await pool.query("SELECT 1 FROM abastecimento_terceiros WHERE id=$1 AND status='ATIVO'", [id])).rowCount) throw new AbastecimentoServiceError(404, 'Terceiro não encontrado ou inativo.');
  try { return (await pool.query('INSERT INTO abastecimento_terceiro_identificacoes(terceiro_id,identificacao,identificacao_normalizada,tipo,status,observacoes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [id, fields.identificacao, fields.identificacao_normalizada, fields.tipo, fields.status, fields.observacoes])).rows[0]; }
  catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new AbastecimentoServiceError(409, 'Esta identificação já está ativa para outro terceiro ou duplicada neste cadastro.'); throw error; }
}
export async function updateTerceiroIdentificacao(terceiroId: string, identificacaoId: string, body: unknown) {
  const owner = assertUuid(terceiroId, 'terceiro_id'); const id = assertUuid(identificacaoId, 'id'); const fields = parse(body, true);
  try { const result = await pool.query('UPDATE abastecimento_terceiro_identificacoes SET identificacao=$1,identificacao_normalizada=$2,tipo=$3,status=$4,observacoes=$5 WHERE id=$6 AND terceiro_id=$7 RETURNING *', [fields.identificacao, fields.identificacao_normalizada, fields.tipo, fields.status, fields.observacoes, id, owner]); if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Identificação não encontrada.'); return result.rows[0]; }
  catch (error) { if (error instanceof AbastecimentoServiceError) throw error; if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new AbastecimentoServiceError(409, 'Esta identificação já está ativa para outro terceiro ou duplicada neste cadastro.'); throw error; }
}
export async function deleteTerceiroIdentificacao(terceiroId: string, identificacaoId: string): Promise<void> {
  const result = await pool.query('DELETE FROM abastecimento_terceiro_identificacoes WHERE id=$1 AND terceiro_id=$2', [assertUuid(identificacaoId, 'id'), assertUuid(terceiroId, 'terceiro_id')]);
  if (!result.rowCount) throw new AbastecimentoServiceError(404, 'Identificação não encontrada.');
}
