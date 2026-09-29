import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid } from './abastecimentos-base.service.js';
import { createManualAbastecimentoWithClient } from './abastecimentos-manual.service.js';

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string, required = false): string | null => { if (value === undefined || value === null) { if (required) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); return null; } if (typeof value !== 'string' || (required && !value.trim())) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); return value.trim() || null; };
const decimal = (value: unknown, field: string, positive = false): string => { const raw = String(value ?? '').trim(); if (!/^\d+(?:\.\d{1,3})?$/.test(raw) || (positive && Number(raw) <= 0) || (!positive && Number(raw) < 0)) throw new AbastecimentoServiceError(400, `${field} inválido.`); return raw; };

const destination = async (client: PoolClient, id: string) => {
  const result = await client.query(`SELECT d.id,d.tipo_destino,d.frota_id,d.litros,e.id AS entrada_id,e.data_entrada,e.produto_id,e.litros_nf,e.valor_total_nf,e.numero_nf,a.id AS abastecimento_id FROM abastecimento_entrada_destinos d JOIN abastecimento_entradas e ON e.id=d.entrada_id LEFT JOIN abastecimentos a ON a.entrada_destino_id=d.id WHERE d.id=$1 FOR UPDATE OF d,e`, [id]);
  const row = result.rows[0];
  if (!row) throw new AbastecimentoServiceError(404, 'Destino da entrada não encontrado.');
  if (row.tipo_destino !== 'FROTA_DIRETA') throw new AbastecimentoServiceError(400, 'O destino informado não é FROTA_DIRETA.');
  if (row.abastecimento_id) throw new AbastecimentoServiceError(409, 'Este destino já possui um abastecimento registrado.');
  return row;
};

export async function registerFrotaDiretaAbastecimento(destinationId: string, body: unknown) {
  const id = assertUuid(destinationId, 'destinoId');
  if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await destination(client, id);
    const data = text(body.data, 'data', true)!;
    const hora = text(body.hora, 'hora', true)!;
    const obraId = assertUuid(body.obra_id, 'obra_id');
    const valor = decimal(body.valor_total, 'valor_total');
    const result = await createManualAbastecimentoWithClient(client, {
      ...body, data, hora, obra_id: obraId, produto_id: row.produto_id, frota_id: row.frota_id,
      tipo_destinatario: 'FROTA', litros: String(row.litros), valor_total: valor,
    }, id, { contexto: 'FROTA_DIRETA', entrada_destino_id: id });
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function listFrotaDiretaAbastecimentoCandidates(destinationId: string) {
  const id = assertUuid(destinationId, 'destinoId');
  const result = await pool.query(`SELECT a.id,a.data_hora,a.produto_id,p.codigo AS produto_codigo,a.litros,a.valor_total,a.obra_id,o.nome AS obra_nome,a.identificador_externo FROM abastecimentos a JOIN abastecimento_produtos p ON p.id=a.produto_id JOIN obras o ON o.id=a.obra_id JOIN abastecimento_entrada_destinos d ON d.frota_id=a.frota_id WHERE d.id=$1 AND a.origem_sistema='MANUAL' AND a.entrada_destino_id IS NULL AND a.tipo_destinatario='FROTA' AND a.frota_id=d.frota_id ORDER BY a.data_hora DESC`, [id]);
  return result.rows;
}

export async function linkExistingFrotaDiretaAbastecimento(destinationId: string, abastecimentoId: string) {
  const destinationIdValue = assertUuid(destinationId, 'destinoId'); const abastecimentoIdValue = assertUuid(abastecimentoId, 'abastecimentoId'); const client = await pool.connect();
  try {
    await client.query('BEGIN'); const row = await destination(client, destinationIdValue);
    const candidate = (await client.query(`SELECT id,origem_sistema,entrada_destino_id,tipo_destinatario,frota_id,produto_id,litros FROM abastecimentos WHERE id=$1 FOR UPDATE`, [abastecimentoIdValue])).rows[0];
    if (!candidate) throw new AbastecimentoServiceError(404, 'Abastecimento não encontrado.');
    if (candidate.origem_sistema !== 'MANUAL' || candidate.entrada_destino_id) throw new AbastecimentoServiceError(409, 'O abastecimento não está disponível para vínculo.');
    if (candidate.tipo_destinatario !== 'FROTA' || candidate.frota_id !== row.frota_id) throw new AbastecimentoServiceError(400, 'O abastecimento pertence a outra frota.');
    if (candidate.produto_id !== row.produto_id) throw new AbastecimentoServiceError(400, 'O produto do abastecimento é incompatível.');
    if (String(candidate.litros) !== String(row.litros)) throw new AbastecimentoServiceError(400, 'Os litros do abastecimento são incompatíveis.');
    try { await client.query('UPDATE abastecimentos SET entrada_destino_id=$1,payload_original=payload_original || $2::jsonb WHERE id=$3', [destinationIdValue, JSON.stringify({ contexto: 'FROTA_DIRETA', entrada_destino_id: destinationIdValue }), abastecimentoIdValue]); }
    catch (error) { if ((error as { code?: string }).code === '23505') throw new AbastecimentoServiceError(409, 'Este destino já possui um abastecimento registrado.'); throw error; }
    await client.query('COMMIT'); return { id: abastecimentoIdValue, entrada_destino_id: destinationIdValue };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
