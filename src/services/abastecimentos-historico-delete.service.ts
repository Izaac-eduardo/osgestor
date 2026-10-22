import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid } from './abastecimentos-base.service.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { recordAudit } from './audit.service.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function reason(body: unknown): string {
  if (!isRecord(body) || typeof body.motivo !== 'string' || !body.motivo.trim()) {
    throw new AbastecimentoServiceError(400, 'O motivo da exclusão é obrigatório.');
  }
  const value = body.motivo.trim();
  if (value.length > 500) throw new AbastecimentoServiceError(400, 'O motivo deve ser um texto de até 500 caracteres.');
  return value;
}

const get = async (client: PoolClient, id: string) => (await client.query('SELECT * FROM abastecimentos WHERE id=$1 FOR UPDATE', [id])).rows[0];

export async function deleteAbastecimentoHistorico(id: string, body: unknown, actor?: AuthenticatedRequestUser | null) {
  if (!actor || actor.role !== 'ADMIN') throw new AbastecimentoServiceError(403, 'Somente ADMIN pode excluir abastecimentos.');
  const abastecimentoId = assertUuid(id);
  const motivo = reason(body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await get(client, abastecimentoId);
    if (!current) throw new AbastecimentoServiceError(404, 'Abastecimento não encontrado.');
    if (current.excluido_at) throw new AbastecimentoServiceError(409, 'O abastecimento já foi excluído.');
    const result = await client.query<{ excluido_at: Date }>(
      'UPDATE abastecimentos SET excluido_at=NOW(),excluido_por=$1,motivo_exclusao=$2 WHERE id=$3 AND excluido_at IS NULL RETURNING excluido_at',
      [actor.id, motivo, abastecimentoId],
    );
    if (!result.rows[0]) throw new AbastecimentoServiceError(409, 'O abastecimento já foi excluído.');
    await recordAudit({
      actor,
      acao: 'EXCLUIR',
      modulo: 'ABASTECIMENTO',
      entidade: 'abastecimentos',
      entidadeId: abastecimentoId,
      dadosAnteriores: current,
      dadosPosteriores: { ...current, excluido_at: result.rows[0].excluido_at, excluido_por: actor.id, motivo_exclusao: motivo },
      metadata: { exclusao_logica: true, motivo },
    }, client);
    await client.query('COMMIT');
    return { id: abastecimentoId, excluido_at: result.rows[0].excluido_at };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
