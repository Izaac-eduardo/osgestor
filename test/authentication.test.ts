import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { hashPassword, verifyPassword } from '../src/services/password.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

let server: Server;
let base = '';
const usernames: string[] = [];

async function createUser(suffix: string, status = 'ATIVO'): Promise<{ id: string; username: string; password: string }> {
  const username = `auth_${suffix}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const password = 'Senha segura de teste 2026!';
  const hash = await hashPassword(password);
  const row = (await pool.query<{ id: string }>(
    `INSERT INTO usuarios(username, email, password_hash, role, status)
     VALUES ($1, $2, $3, 'GESTOR', $4) RETURNING id`,
    [username, `${username}@example.invalid`, hash, status],
  )).rows[0]!;
  usernames.push(username);
  return { id: row.id, username, password };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, init);
}

function cookieFrom(response: Response): string {
  const value = response.headers.get('set-cookie') ?? '';
  return value.split(';', 1)[0]!;
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste não iniciou.');
  base = `http://127.0.0.1:${address.port}`;
});

test('autenticação, sessões, troca de senha, rate limit e origem são protegidos', async () => {
  const user = await createUser('main');
  const hash = await hashPassword(user.password);
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, user.password), true);
  assert.equal(await verifyPassword(hash, 'senha incorreta'), false);

  const invalid = await request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user.username, password: 'incorreta' }) });
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), { message: 'Usuário ou senha inválidos.' });

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user.username.toUpperCase(), password: user.password }),
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json() as { user: Record<string, unknown>; token?: string; password_hash?: string };
  assert.equal(loginBody.user.username, user.username);
  assert.equal(loginBody.user.must_change_password, true);
  assert.equal(loginBody.token, undefined);
  assert.equal(loginBody.password_hash, undefined);
  const cookie = cookieFrom(login);
  assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);
  assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Lax/);
  assert.match(login.headers.get('set-cookie') ?? '', /Path=\//);
  assert.match(login.headers.get('set-cookie') ?? '', /Max-Age=86400/);
  assert.ok(cookie && !cookie.includes(user.password));

  const me = await request('/auth/me', { headers: { cookie } });
  assert.equal(me.status, 200);
  const meBody = await me.json() as { user: Record<string, unknown> };
  assert.equal(meBody.user.username, user.username);
  assert.equal(meBody.user.role, 'GESTOR');
  assert.equal(meBody.user.status, 'ATIVO');
  assert.equal(meBody.user.password_hash, undefined);

  const unauthenticated = await request('/auth/me');
  assert.equal(unauthenticated.status, 401);

  const evilOrigin = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  assert.equal(evilOrigin.status, 403);

  const secondLogin = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  assert.equal(secondLogin.status, 200);
  const secondCookie = cookieFrom(secondLogin);

  const changed = await request('/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ currentPassword: user.password, newPassword: 'Nova senha segura 2026!', confirmPassword: 'Nova senha segura 2026!' }),
  });
  assert.equal(changed.status, 204);
  const changedRow = await pool.query<{ must_change_password: boolean; password_hash: string }>('SELECT must_change_password, password_hash FROM usuarios WHERE id = $1', [user.id]);
  assert.equal(changedRow.rows[0]?.must_change_password, false);
  assert.match(changedRow.rows[0]?.password_hash ?? '', /^\$argon2id\$/);

  const otherSession = await request('/auth/me', { headers: { cookie: secondCookie } });
  assert.equal(otherSession.status, 401);
  const newLogin = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'Nova senha segura 2026!' }),
  });
  assert.equal(newLogin.status, 200);
  const oldPassword = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  assert.equal(oldPassword.status, 401);

  const logout = await request('/auth/logout', { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie') ?? '', /Max-Age=0/);
  assert.equal((await request('/auth/me', { headers: { cookie } })).status, 401);

  const revokedLogin = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'Nova senha segura 2026!' }),
  });
  const revokedCookie = cookieFrom(revokedLogin);
  await pool.query('UPDATE sessoes SET revoked_at = NOW() WHERE usuario_id = $1 AND revoked_at IS NULL', [user.id]);
  assert.equal((await request('/auth/me', { headers: { cookie: revokedCookie } })).status, 401);

  const expiredLogin = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'Nova senha segura 2026!' }),
  });
  const expiredCookie = cookieFrom(expiredLogin);
  await pool.query("UPDATE sessoes SET created_at = NOW() - INTERVAL '25 hours', expires_at = NOW() - INTERVAL '1 minute' WHERE usuario_id = $1 AND revoked_at IS NULL", [user.id]);
  assert.equal((await request('/auth/me', { headers: { cookie: expiredCookie } })).status, 401);

  const inactive = await createUser('inactive', 'INATIVO');
  const inactiveUserLogin = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: inactive.username, password: inactive.password }),
  });
  assert.equal(inactiveUserLogin.status, 401);

  const rateLimited = await createUser('limited');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: rateLimited.username, password: 'senha errada' }),
    });
    assert.equal(response.status, 401);
  }
  const tooMany = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: rateLimited.username, password: 'senha errada' }),
  });
  assert.equal(tooMany.status, 429);

  assert.equal((await request('/auth/register', { method: 'POST' })).status, 404);
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (usernames.length) {
    await pool.query('DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE username = ANY($1::text[]))', [usernames]);
    await pool.query('DELETE FROM usuarios WHERE username = ANY($1::text[])', [usernames]);
  }
  await pool.end();
});
