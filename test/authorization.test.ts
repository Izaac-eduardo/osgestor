import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

let server: Server;
let base = '';
const users: string[] = [];
const origins = { allowed: 'http://localhost:5173', denied: 'https://evil.example' };

async function createUser(role: 'ADMIN' | 'OPERADOR' | 'GESTOR', mustChange = false): Promise<{ id: string; username: string; password: string }> {
  const username = `authorization_${role.toLowerCase()}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const password = 'Senha de autorização 2026!';
  const hash = await hashPassword(password);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO usuarios(username, email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [username, `${username}@example.invalid`, hash, role, mustChange],
  );
  users.push(username);
  return { id: result.rows[0]!.id, username, password };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, init);
}

async function login(user: { username: string; password: string }): Promise<string> {
  const response = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: origins.allowed },
    body: JSON.stringify(user),
  });
  assert.equal(response.status, 200);
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!;
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste não iniciou.');
  base = `http://127.0.0.1:${address.port}`;
});

test('autoriza rotas reais por role e bloqueia sessão sem troca obrigatória', async () => {
  const admin = await createUser('ADMIN');
  const operator = await createUser('OPERADOR');
  const manager = await createUser('GESTOR');
  const pending = await createUser('GESTOR', true);
  const adminCookie = await login(admin);
  const operatorCookie = await login(operator);
  const managerCookie = await login(manager);
  const pendingCookie = await login(pending);

  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/obras')).status, 401);
  assert.equal((await request('/obras', { headers: { cookie: 'osgestor_session=invalid' } })).status, 401);
  assert.equal((await request('/health/database')).status, 401);

  assert.equal((await request('/obras', { headers: { cookie: managerCookie } })).status, 200);
  assert.equal((await request('/relatorios/gastos-por-obra/pdf', { headers: { cookie: managerCookie } })).status, 200);
  assert.equal((await request('/obras', {
    method: 'POST',
    headers: { cookie: managerCookie, 'content-type': 'application/json', origin: origins.allowed },
    body: JSON.stringify({ codigo: 'AUTHZ-MANAGER', nome: 'Não deve criar' }),
  })).status, 403);

  const created = await request('/obras', {
    method: 'POST',
    headers: { cookie: operatorCookie, 'content-type': 'application/json', origin: origins.allowed },
    body: JSON.stringify({ codigo: `AUTHZ-${randomUUID().slice(0, 8)}`, nome: 'Obra de autorização' }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { id: string };
  assert.equal((await request(`/obras/${createdBody.id}`, { method: 'DELETE', headers: { cookie: operatorCookie, origin: origins.allowed } })).status, 403);
  assert.equal((await request(`/obras/${createdBody.id}`, { method: 'DELETE', headers: { cookie: adminCookie, origin: origins.allowed } })).status, 204);

  assert.equal((await request('/importacoes-os/analisar', { method: 'POST', headers: { cookie: managerCookie, origin: origins.allowed } })).status, 403);
  assert.equal((await request('/importacoes-os/analisar', { method: 'POST', headers: { cookie: operatorCookie, origin: origins.allowed } })).status, 400);
  assert.equal((await request('/auth/register', { method: 'POST' })).status, 404);

  const deniedOrigin = await request('/obras', {
    method: 'POST',
    headers: { cookie: operatorCookie, 'content-type': 'application/json', origin: origins.denied },
    body: JSON.stringify({ codigo: 'AUTHZ-EVIL', nome: 'Origem inválida' }),
  });
  assert.equal(deniedOrigin.status, 403);

  assert.equal((await request('/obras', { headers: { cookie: pendingCookie } })).status, 403);
  const pendingMe = await request('/auth/me', { headers: { cookie: pendingCookie } });
  assert.equal(pendingMe.status, 200);
  assert.equal((await pendingMe.json() as { user: { must_change_password: boolean } }).user.must_change_password, true);
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (users.length) {
    await pool.query('DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE username = ANY($1::text[]))', [users]);
    await pool.query('DELETE FROM usuarios WHERE username = ANY($1::text[])', [users]);
  }
  await pool.end();
});
