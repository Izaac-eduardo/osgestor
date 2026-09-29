import type { Pool, PoolClient } from 'pg';
import { pool } from '../config/database.js';

type DatabaseClient = Pool | PoolClient;

export async function resolveLancadorFuncionarioId(
  codigo: string | null | undefined,
  db: DatabaseClient = pool,
): Promise<string | null> {
  const normalized = codigo?.trim() ?? '';
  if (!normalized) return null;
  const result = await db.query<{ id: string }>(
    'SELECT id FROM funcionarios WHERE trim(matricula) = $1 LIMIT 1',
    [normalized],
  );
  return result.rows[0]?.id ?? null;
}
