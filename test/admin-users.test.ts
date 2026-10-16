import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { bootstrapAdmin } from '../src/services/admin-users.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');
const prefix = `m561_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const password = 'Senha fictícia M561 2026!';
const origins = { allowed: 'http://localhost:5173' };
let server: Server; let base = '';

async function request(path: string, init?: RequestInit): Promise<Response> { return fetch(`${base}${path}`, init); }
async function login(username: string, pass = password): Promise<string> { const response = await request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: origins.allowed }, body: JSON.stringify({ username, password: pass }) }); assert.equal(response.status, 200); return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!; }

before(async () => { const db = await pool.query<{ current_database: string }>('SELECT current_database()'); assert.equal(db.rows[0]?.current_database, 'oficina_test'); await pool.query('DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE username LIKE $1)', [`${prefix}%`]); await pool.query('DELETE FROM usuarios WHERE username LIKE $1', [`${prefix}%`]); server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.'); base = `http://127.0.0.1:${address.port}`; });

test('bootstrap concorrente cria apenas um ADMIN e endpoints administrativos protegem contas', async () => {
  const attempts = await Promise.allSettled([1, 2].map(index => bootstrapAdmin({ username: `${prefix}admin${index}`, email: `${prefix}${index}@example.invalid`, password })));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
  const admin = attempts.find(result => result.status === 'fulfilled')!.value;
  assert.equal(admin.role, 'ADMIN'); assert.equal(admin.status, 'ATIVO'); assert.equal(admin.must_change_password, true);
  const adminCookie = await login(admin.username);
  const pendingAdminRoute = await request('/admin/usuarios', { headers: { cookie: adminCookie } }); assert.equal(pendingAdminRoute.status, 403);
  const changed = await request('/auth/change-password', { method: 'POST', headers: { cookie: adminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: password, newPassword: password, confirmPassword: password }) }); assert.equal(changed.status, 204);
  const activeAdminCookie = await login(admin.username, password);
  assert.equal((await request('/admin/usuarios', { headers: { cookie: activeAdminCookie } })).status, 200);
  const operatorCreate = await request('/admin/usuarios', { method: 'POST', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ username: `${prefix}operator`, email: `${prefix}operator@example.invalid`, password, role: 'OPERADOR', status: 'ATIVO' }) }); assert.equal(operatorCreate.status, 201); const operator = await operatorCreate.json() as { id: string; password_hash?: string; must_change_password: boolean }; assert.equal(operator.must_change_password, true); assert.equal('password_hash' in operator, false);
  const confirmationRejected = await request('/admin/usuarios', { method: 'POST', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ username: `${prefix}confirmation`, email: `${prefix}confirmation@example.invalid`, password, confirmPassword: password, role: 'OPERADOR', status: 'ATIVO' }) }); assert.equal(confirmationRejected.status, 400);
  const managerCreate = await request('/admin/usuarios', { method: 'POST', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ username: `${prefix}manager`, email: `${prefix}manager@example.invalid`, password, role: 'GESTOR', status: 'ATIVO' }) }); assert.equal(managerCreate.status, 201);
  const duplicate = await request('/admin/usuarios', { method: 'POST', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ username: `${prefix}OPERATOR`, email: `${prefix}other@example.invalid`, password, role: 'GESTOR', status: 'ATIVO' }) }); assert.equal(duplicate.status, 409);
  const invalid = await request('/admin/usuarios', { method: 'POST', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ username: `${prefix}bad`, email: `${prefix}bad@example.invalid`, password, role: 'CONSULTOR', status: 'ATIVO' }) }); assert.equal(invalid.status, 400);
  const operatorCookie = await login(`${prefix}operator`); assert.equal((await request('/admin/usuarios', { headers: { cookie: operatorCookie } })).status, 403);
  const managerCookie = await login(`${prefix}manager`); const managerPasswordChange = await request('/auth/change-password', { method: 'POST', headers: { cookie: managerCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: password, newPassword: password, confirmPassword: password }) }); assert.equal(managerPasswordChange.status, 204); const auditResponse = await request('/auditoria', { headers: { cookie: managerCookie } }); assert.equal(auditResponse.status, 200); const auditBody = await auditResponse.json() as { data: Array<{ modulo: string; dados_posteriores: Record<string, unknown> | null }> }; assert.ok(auditBody.data.some(item => item.modulo === 'ADMIN_USUARIOS')); assert.equal(auditBody.data.some(item => JSON.stringify(item).includes('password_hash')), false); assert.equal((await request('/auditoria', { headers: { cookie: operatorCookie } })).status, 403);
  const lastAdminRole = await request(`/admin/usuarios/${admin.id}`, { method: 'PATCH', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'GESTOR' }) }); assert.equal(lastAdminRole.status, 409);
  const lastAdminStatus = await request(`/admin/usuarios/${admin.id}/status`, { method: 'PATCH', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'INATIVO' }) }); assert.equal(lastAdminStatus.status, 409);
  const reset = await request(`/admin/usuarios/${operator.id}/reset-password`, { method: 'POST', headers: { cookie: activeAdminCookie, origin: origins.allowed, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'Senha nova M561 2026!' }) }); assert.equal(reset.status, 204);
  const auditRows = await pool.query<{ acao: string; dados_anteriores: unknown; dados_posteriores: unknown; metadata: unknown }>('SELECT acao, dados_anteriores, dados_posteriores, metadata FROM auditoria WHERE entidade_id = $1 OR dados_posteriores->>\'username\' LIKE $2', [operator.id, `${prefix}%`]); assert.ok(auditRows.rows.length >= 3); assert.equal(JSON.stringify(auditRows.rows).includes('Senha'), false); assert.equal(JSON.stringify(auditRows.rows).includes('password_hash'), false);
  assert.equal((await request('/auth/register', { method: 'POST' })).status, 404);
});

after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.query('DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE username LIKE $1)', [`${prefix}%`]); await pool.query('DELETE FROM usuarios WHERE username LIKE $1', [`${prefix}%`]); await pool.end(); });
