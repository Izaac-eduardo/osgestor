import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid } from './abastecimentos-base.service.js';

type Body = Record<string, unknown>;
const isRecord = (value: unknown): value is Body => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string, required = false, max = 255): string | null => { if (value === undefined || value === null) { if (required) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); return null; } if (typeof value !== 'string') throw new AbastecimentoServiceError(400, `${field} deve ser texto.`); const result = value.trim(); if (required && !result) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); if (result.length > max) throw new AbastecimentoServiceError(400, `${field} excede o limite permitido.`); return result || null; };
const decimal = (value: unknown, field: string, scale: number, positive: boolean): number => { if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); const raw = String(value).trim(); if (!/^\d+(?:\.\d+)?$/.test(raw) || (raw.split('.')[1]?.length ?? 0) > scale) throw new AbastecimentoServiceError(400, `${field} possui precisão inválida.`); const result = Number(raw); if (!Number.isFinite(result) || (positive ? result <= 0 : result < 0)) throw new AbastecimentoServiceError(400, `${field} possui valor inválido.`); return result; };
const optionalDecimal = (value: unknown, field: string): number | null => value === undefined || value === null || value === '' ? null : decimal(value, field, 3, false);
const recipientTypes = ['FROTA', 'TERCEIRO', 'ESPECIAL', 'EXTERNA'] as const;
const dateTime = (value: unknown): string => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) || Number.isNaN(new Date(value).getTime())) throw new AbastecimentoServiceError(400, 'data_hora inválida.'); return value; };
const get = async (client: PoolClient, sql: string, params: unknown[]) => (await client.query(sql, params)).rows[0];

export async function updateAbastecimentoHistorico(id: string, body: unknown) {
  const abastecimentoId = assertUuid(id); if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'O corpo deve ser um objeto.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await get(client, 'SELECT * FROM abastecimentos WHERE id=$1 FOR UPDATE', [abastecimentoId]); if (!current) throw new AbastecimentoServiceError(404, 'Abastecimento não encontrado.');
    const tipo = body.tipo_destinatario; if (!recipientTypes.includes(tipo as typeof recipientTypes[number])) throw new AbastecimentoServiceError(400, 'tipo_destinatario inválido.');
    const produtoId = assertUuid(body.produto_id, 'produto_id'); const obraId = assertUuid(body.obra_id, 'obra_id');
    if (!await get(client, 'SELECT id FROM abastecimento_produtos WHERE id=$1', [produtoId])) throw new AbastecimentoServiceError(404, 'Produto não encontrado.');
    if (!await get(client, 'SELECT id FROM obras WHERE id=$1', [obraId])) throw new AbastecimentoServiceError(404, 'Obra não encontrada.');
    const litros = decimal(body.litros, 'litros', 3, true); const valor = decimal(body.valor_total, 'valor_total', 2, false);
    let frotaId: string | null = null; let terceiroId: string | null = null; let especialId: string | null = null;
    let identificacao = text(body.identificacao_original, 'identificacao_original', false, 255) ?? current.identificacao_original;
    let placa: string | null = text(body.placa_original, 'placa_original', false, 255); let frotaOriginal: string | null = text(body.frota_original, 'frota_original', false, 255);
    if (tipo === 'FROTA') { frotaId = assertUuid(body.frota_id, 'frota_id'); const fleet = await get(client, 'SELECT id,codigo,placa FROM frotas WHERE id=$1', [frotaId]); if (!fleet) throw new AbastecimentoServiceError(404, 'Frota não encontrada.'); identificacao = fleet.codigo; placa = fleet.placa || fleet.codigo; frotaOriginal = fleet.codigo; }
    if (tipo === 'TERCEIRO') { terceiroId = assertUuid(body.terceiro_id, 'terceiro_id'); if (!await get(client, 'SELECT id FROM abastecimento_terceiros WHERE id=$1', [terceiroId])) throw new AbastecimentoServiceError(404, 'Terceiro não encontrado.'); }
    if (tipo === 'ESPECIAL') { especialId = assertUuid(body.destinacao_especial_id, 'destinacao_especial_id'); const special = await get(client, 'SELECT id,codigo,nome FROM abastecimento_destinacoes_especiais WHERE id=$1', [especialId]); if (!special) throw new AbastecimentoServiceError(404, 'Destinação especial não encontrada.'); identificacao = special.codigo || special.nome; placa = null; frotaOriginal = null; }
    if (tipo === 'EXTERNA') { frotaId = null; terceiroId = null; especialId = null; }
    await client.query(`UPDATE abastecimentos SET data_hora=$1,produto_id=$2,obra_id=$3,tipo_destinatario=$4,frota_id=$5,terceiro_id=$6,destinacao_especial_id=$7,identificacao_original=$8,placa_original=$9,frota_original=$10,litros=$11,valor_total=$12,km_hr=$13,horimetro=$14,bico_codigo_original=$15,bico_descricao_original=$16,frentista_original=$17 WHERE id=$18`, [dateTime(body.data_hora), produtoId, obraId, tipo, frotaId, terceiroId, especialId, identificacao, placa, frotaOriginal, litros, valor, optionalDecimal(body.km_hr, 'km_hr'), optionalDecimal(body.horimetro, 'horimetro'), text(body.bico_codigo_original, 'bico_codigo_original', false, 30), text(body.bico_descricao_original, 'bico_descricao_original'), text(body.frentista_original, 'frentista_original'), abastecimentoId]);
    await client.query('COMMIT'); return { id: abastecimentoId, origem_sistema: current.origem_sistema, identificador_externo: current.identificador_externo };
  } catch (error) { await client.query('ROLLBACK'); if (error instanceof AbastecimentoServiceError) throw error; throw error; } finally { client.release(); }
}
