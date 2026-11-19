import type { Pool, PoolClient } from 'pg';
import { normalizeFleetCode, splitFleetCode } from '../utils/frotas.js';

export type FleetResolverDb = Pool | PoolClient;

export type FleetResolution =
  | { status: 'UNIQUE'; frotaId: string }
  | { status: 'MISSING' }
  | { status: 'AMBIGUOUS'; frotaIds: string[] };

/** Compara códigos preservando o prefixo e tratando o número como inteiro. */
export function fleetCodesEquivalent(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const a = splitFleetCode(left);
  const b = splitFleetCode(right);
  if (!a.prefixo || !b.prefixo || a.prefixo !== b.prefixo || !a.numero || !b.numero) {
    return normalizeFleetCode(left) === normalizeFleetCode(right);
  }
  return Number(a.numero) === Number(b.numero);
}

export function resolveUniqueFleetId(ids: string[]): FleetResolution {
  const unique = [...new Set(ids)];
  if (unique.length === 1) return { status: 'UNIQUE', frotaId: unique[0]! };
  if (unique.length === 0) return { status: 'MISSING' };
  return { status: 'AMBIGUOUS', frotaIds: unique };
}

/** Resolve o vínculo legado sem escolher em casos ausentes ou ambíguos. */
export async function resolveFleetByPrefixAndNumber(
  db: FleetResolverDb,
  prefixoFrotaId: string,
  frotaNumero: number,
): Promise<FleetResolution> {
  const result = await db.query<{ id: string }>(
    `SELECT id
       FROM frotas
      WHERE prefixo_frota_id = $1
        AND numero ~ '^[0-9]+$'
        AND numero::numeric = $2::numeric
      ORDER BY id
      LIMIT 2`,
    [prefixoFrotaId, frotaNumero],
  );
  return resolveUniqueFleetId(result.rows.map(row => row.id));
}
