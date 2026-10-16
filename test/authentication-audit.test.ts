import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test');
const prefix = `m5714auth_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const password = 'Senha segura B3 2026!';
const usernames: string[] = [];
const userIds: string[] = [];
let server: Server;
let base = '';

async function createUser(suffix: string, status = 'ATIVO'): Promise<{ id: string; username: string }> {
  const username = `${prefix}_${suffix}`;
  const passwordHash = await hashPassword(password);
  const row = (await pool.query<{ id: string }>(`INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,'GESTOR',$4,FALSE) RETURNING id`, [username, `${username}@example.invalid`, passwordHash, status])).rows[0]!;
  usernames.push(username); userIds.push(row.id);
  return { id: row.id, username };
}

function cookie(response: Response): string { return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!; }
function hashAttempt(username: string): string { return createHash('sha256').update(username.toLocaleLowerCase('en-US'), 'utf8').digest('hex'); }
async function request(path: string, init: RequestInit = {}): Promise<Response> { return fetch(`${base}${path}`, { ...init, headers: { origin: 'http://localhost:5173', ...(init.headers ?? {}) } }); }
async function login(username: string, pass = password): Promise<Response> { return request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: pass }) }); }

before(async () => {
  const database = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(database.rows[0]?.current_database, 'oficina_test');
  server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}`;
});

test('audita login, falhas, rate limit, logout e troca de senha sem expor segredos', async () => {
  const user = await createUser('principal');
  const validLogin = await login(user.username); assert.equal(validLogin.status, 200); const validCookie = cookie(validLogin); assert.ok(validCookie);
  const me = await request('/auth/me', { headers: { cookie: validCookie } }); const meBody = await me.json() as { user: Record<string, unknown> }; assert.equal(me.status, 200); assert.equal(meBody.user.tokenHash, undefined); assert.equal(meBody.user.sessionId, undefined);
  const successAudit = await pool.query<{ metadata: Record<string, unknown>; dados_anteriores: unknown; dados_posteriores: unknown }>(`SELECT metadata,dados_anteriores,dados_posteriores FROM auditoria WHERE usuario_id=$1 AND acao='LOGIN' AND metadata->>'resultado'='SUCESSO'`, [user.id]); assert.equal(successAudit.rows.length, 1); assert.equal(JSON.stringify(successAudit.rows[0]).includes(validCookie), false); assert.equal(JSON.stringify(successAudit.rows[0]).includes('token'), false);

  const invalid = await login(user.username, 'senha incorreta'); assert.equal(invalid.status, 401);
  const inactive = await createUser('inativo', 'INATIVO'); const inactiveResponse = await login(inactive.username); assert.equal(inactiveResponse.status, 401);
  const limited = await createUser('limitado'); for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await login(limited.username, 'senha incorreta')).status, 401); assert.equal((await login(limited.username, 'senha incorreta')).status, 429);
  const rejected = await pool.query<{ usuario_id: string | null; motivo: string }>(`SELECT usuario_id,metadata->>'motivo' motivo FROM auditoria WHERE acao='LOGIN' AND metadata->>'usuario_hash'=ANY($1::text[])`, [[hashAttempt(user.username), hashAttempt(inactive.username), hashAttempt(limited.username)]]); assert.ok(rejected.rows.length >= 7); assert.ok(rejected.rows.every(row => row.usuario_id === null)); assert.ok(rejected.rows.some(row => row.motivo === 'RATE_LIMIT'));

  const secondLogin = await login(user.username); assert.equal(secondLogin.status, 200); const secondCookie = cookie(secondLogin);
  const logout = await request('/auth/logout', { method: 'POST', headers: { cookie: validCookie } }); assert.equal(logout.status, 204); assert.equal((await request('/auth/me', { headers: { cookie: validCookie } })).status, 401);
  const logoutAudit = await pool.query(`SELECT 1 FROM auditoria WHERE usuario_id=$1 AND acao='LOGOUT' AND metadata->>'resultado'='SUCESSO'`, [user.id]); assert.equal(logoutAudit.rows.length, 1);

  const changed = await request('/auth/change-password', { method: 'POST', headers: { cookie: secondCookie, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: password, newPassword: 'Nova senha B3 2026!', confirmPassword: 'Nova senha B3 2026!' }) }); assert.equal(changed.status, 204);
  assert.equal((await request('/auth/me', { headers: { cookie: secondCookie } })).status, 200);
  const passwordAudit = await pool.query<{ metadata: Record<string, unknown> }>(`SELECT metadata FROM auditoria WHERE usuario_id=$1 AND acao='ALTERAR_SENHA'`, [user.id]); assert.equal(passwordAudit.rows.length, 1); assert.equal(passwordAudit.rows[0]!.metadata.password, undefined); assert.equal(passwordAudit.rows[0]!.metadata.password_hash, undefined); assert.equal(passwordAudit.rows[0]!.metadata.hash, undefined);
  assert.equal((await login(user.username, password)).status, 401); assert.equal((await login(user.username, 'Nova senha B3 2026!')).status, 200);
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  const attemptHashes = usernames.map(hashAttempt);
  await pool.query(`DELETE FROM auditoria WHERE usuario_id=ANY($1::uuid[]) OR metadata->>'usuario_hash'=ANY($2::text[])`, [userIds, attemptHashes]);
  await pool.query('DELETE FROM sessoes WHERE usuario_id=ANY($1::uuid[])', [userIds]);
  await pool.query('DELETE FROM usuarios WHERE id=ANY($1::uuid[])', [userIds]);
  await pool.end();
});
