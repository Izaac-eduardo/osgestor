import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/config/database.js';
import { hashPassword } from '../../src/services/password.service.js';

const prefix = `m5714http_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const password = 'Senha HTTP PoliFrota 2026!';

export async function authenticateHttpFixture(base: string): Promise<{ cookie: string; cleanup: () => Promise<void> }> {
  const database = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(database.rows[0]?.current_database, 'oficina_test');
  const username = `${prefix}_admin`;
  const passwordHash = await hashPassword(password);
  const user = (await pool.query<{ id: string }>(
    `INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password)
     VALUES($1,$2,$3,'ADMIN','ATIVO',FALSE) RETURNING id`,
    [username, `${username}@example.invalid`, passwordHash],
  )).rows[0];
  assert.ok(user);
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';', 1)[0];
  assert.ok(cookie);
  return {
    cookie,
    cleanup: async () => {
      await pool.query('DELETE FROM sessoes WHERE usuario_id=$1', [user.id]);
      await pool.query('DELETE FROM usuarios WHERE id=$1', [user.id]);
    },
  };
}

export function httpHeaders(cookie: string, contentType?: string): Record<string, string> {
  return { origin: 'http://localhost:5173', cookie, ...(contentType ? { 'content-type': contentType } : {}) };
}
