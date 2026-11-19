import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { getTestDatabaseName } from '../../src/config/test-database-guard.js';

export const TEST_DATABASE_NAME = getTestDatabaseName();

export async function assertAuthorizedTestDatabase(db: Pick<Pool, 'query'>): Promise<void> {
  const result = await db.query<{ current_database: string; inet_server_addr: string | null; inet_server_port: number }>(
    'SELECT current_database(), inet_server_addr()::text, inet_server_port()',
  );
  const row = result.rows[0];
  assert.equal(row?.current_database, TEST_DATABASE_NAME, `banco de teste não autorizado: ${row?.current_database ?? 'desconhecido'}`);
  assert.ok(row?.inet_server_port, 'porta PostgreSQL não identificada');
}
