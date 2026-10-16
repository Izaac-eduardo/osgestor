import 'dotenv/config';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../src/config/database.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'este teste exige DB_NAME=oficina_test');

const expectConstraintFailure = async (client: PoolClient, query: string, values: unknown[]) => {
  await client.query('SAVEPOINT constraint_case');
  await assert.rejects(() => client.query(query, values));
  await client.query('ROLLBACK TO SAVEPOINT constraint_case');
  await client.query('RELEASE SAVEPOINT constraint_case');
};

test('migration 027 cria usuarios e sessoes com integridade e sem contas automáticas', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('usuarios', 'sessoes')
      ORDER BY table_name
    `);
    assert.deepEqual(tables.rows.map(row => row.table_name), ['sessoes', 'usuarios']);

    const userColumns = await client.query<{ column_name: string; is_nullable: string; column_default: string | null }>(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuarios'
      ORDER BY ordinal_position
    `);
    assert.deepEqual(userColumns.rows.map(row => row.column_name), [
      'id', 'username', 'email', 'password_hash', 'role', 'status',
      'created_at', 'updated_at', 'last_login_at', 'must_change_password',
    ]);
    assert.equal(userColumns.rows.find(row => row.column_name === 'must_change_password')?.column_default, 'true');

    const sessionColumns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sessoes'
      ORDER BY ordinal_position
    `);
    assert.deepEqual(sessionColumns.rows.map(row => row.column_name), [
      'id', 'usuario_id', 'token_hash', 'created_at', 'expires_at', 'last_seen_at', 'revoked_at',
    ]);

    const indexes = await client.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN ('usuarios', 'sessoes')
      ORDER BY indexname
    `);
    assert.deepEqual(indexes.rows.map(row => row.indexname), [
      'sessoes_active_expiry_idx',
      'sessoes_active_usuario_idx',
      'sessoes_pkey',
      'sessoes_token_hash_uidx',
      'sessoes_usuario_idx',
      'usuarios_email_ci_uidx',
      'usuarios_last_login_idx',
      'usuarios_pkey',
      'usuarios_status_role_idx',
      'usuarios_username_ci_uidx',
    ]);

    const trigger = await client.query<{ trigger_name: string }>(`
      SELECT trigger_name
      FROM information_schema.triggers
      WHERE event_object_schema = 'public' AND event_object_table = 'usuarios'
    `);
    assert.deepEqual(trigger.rows.map(row => row.trigger_name), ['trg_usuarios_updated_at']);

    const existingUsers = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM usuarios');
    assert.equal(existingUsers.rows[0]?.count, '0');

    const username = `m52_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const email = `${username}@example.invalid`;
    const user = await client.query<{ id: string; status: string; must_change_password: boolean; created_at: Date; updated_at: Date }>(
      `INSERT INTO usuarios(username, email, password_hash, role)
       VALUES ($1, $2, $3, 'ADMIN')
       RETURNING id, status, must_change_password, created_at, updated_at`,
      [username, email, 'argon2id-placeholder-for-structural-test'],
    );
    assert.equal(user.rows[0]?.status, 'ATIVO');
    assert.equal(user.rows[0]?.must_change_password, true);
    assert.ok(user.rows[0]?.created_at instanceof Date);
    assert.ok(user.rows[0]?.updated_at instanceof Date);

    await expectConstraintFailure(client, 'INSERT INTO usuarios(username, email, password_hash, role) VALUES ($1, $2, $3, $4)', [username.toUpperCase(), 'other@example.invalid', 'hash', 'GESTOR']);
    await expectConstraintFailure(client, 'INSERT INTO usuarios(username, email, password_hash, role) VALUES ($1, $2, $3, $4)', ['other', email.toUpperCase(), 'hash', 'GESTOR']);
    await expectConstraintFailure(client, 'INSERT INTO usuarios(username, email, password_hash, role) VALUES ($1, $2, $3, $4)', ['   ', 'other2@example.invalid', 'hash', 'GESTOR']);
    await expectConstraintFailure(client, 'INSERT INTO usuarios(username, email, password_hash, role) VALUES ($1, $2, $3, $4)', ['other2', '   ', 'hash', 'GESTOR']);
    await expectConstraintFailure(client, 'INSERT INTO usuarios(username, email, password_hash, role) VALUES ($1, $2, $3, $4)', ['other3', 'other3@example.invalid', 'hash', 'CONSULTOR']);
    await expectConstraintFailure(client, 'INSERT INTO usuarios(username, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5)', ['other4', 'other4@example.invalid', 'hash', 'GESTOR', 'INVALID']);

    const session = await client.query<{ id: string }>(
      `INSERT INTO sessoes(usuario_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '8 hours')
       RETURNING id`,
      [user.rows[0]!.id, `token-hash-${randomUUID()}`],
    );
    assert.ok(session.rows[0]?.id);
    await expectConstraintFailure(client, 'INSERT INTO sessoes(usuario_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'8 hours\')', [randomUUID(), `invalid-user-${randomUUID()}`]);

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

after(async () => { await pool.end(); });
