import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');
const prefix = `m5711c_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const password = 'Senha HTTP O.S. 2026!';
const origin = 'http://localhost:5173';
let server: Server; let base = '';
const userIds: string[] = []; const orderIds: string[] = [];

async function request(path: string, init?: RequestInit): Promise<Response> { return fetch(`${base}${path}`, init); }
async function login(username: string): Promise<string> {
  const response = await request('/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(response.status, 200);
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!;
}
function headers(cookie: string) { return { cookie, origin, 'content-type': 'application/json' }; }

before(async () => {
  const db = await pool.query<{ current_database: string }>('SELECT current_database()'); assert.equal(db.rows[0]?.current_database, 'oficina_test');
  const hash = await hashPassword(password);
  for (const role of ['ADMIN', 'OPERADOR', 'GESTOR'] as const) {
    const row = (await pool.query<{ id: string }>('INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,$4,\'ATIVO\',false) RETURNING id', [`${prefix}${role.toLowerCase()}`, `${prefix}${role.toLowerCase()}@example.invalid`, hash, role])).rows[0]!;
    userIds.push(row.id);
  }
  const pending = (await pool.query<{ id: string }>('INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,\'OPERADOR\',\'ATIVO\',true) RETURNING id', [`${prefix}pending`, `${prefix}pending@example.invalid`, hash])).rows[0]!; userIds.push(pending.id);
  server = app.listen(0); await new Promise<void>((resolve) => server.once('listening', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('servidor não iniciou'); base = `http://127.0.0.1:${address.port}`;
});

async function refs() { return { obra_id: (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001'`)).rows[0]!.id, frota_id: (await pool.query<{ id: string }>('SELECT id FROM frotas ORDER BY codigo LIMIT 1')).rows[0]!.id }; }
async function createVia(cookie: string, numero: number) { const r = await refs(); const response = await request('/ordens-servico', { method: 'POST', headers: headers(cookie), body: JSON.stringify({ numero_os: numero, ...r, natureza_os: 'INTERNA', data_abertura: '2026-10-08', status: 'ABERTA', observacoes: `${prefix} http` }) }); assert.equal(response.status, 201); const body = await response.json() as { id: string }; orderIds.push(body.id); return { ...r, id: body.id }; }

test('ADMIN e OPERADOR modificam O.S.; GESTOR, visitante e sessão pendente não', async () => {
  const admin = await login(`${prefix}admin`); const operator = await login(`${prefix}operador`); const manager = await login(`${prefix}gestor`); const pending = await login(`${prefix}pending`);
  const adminOrder = await createVia(admin, 999000001); const operatorOrder = await createVia(operator, 999000002);
  assert.equal((await request(`/ordens-servico/${adminOrder.id}`, { method: 'PUT', headers: headers(admin), body: JSON.stringify({ numero_os: 999000001, ...adminOrder, natureza_os: 'INTERNA', data_abertura: '2026-10-08', status: 'ABERTA', observacoes: `${prefix} admin edit` }) })).status, 200);
  assert.equal((await request(`/ordens-servico/${operatorOrder.id}/status`, { method: 'PATCH', headers: headers(operator), body: JSON.stringify({ status: 'FINALIZADA', role: 'ADMIN', usuario_id: userIds[0] }) })).status, 200);
  assert.equal((await request('/ordens-servico', { method: 'POST', headers: headers(manager), body: JSON.stringify({ numero_os: 999000003, ...(await refs()), natureza_os: 'INTERNA', data_abertura: '2026-10-08', status: 'ABERTA' }) })).status, 403);
  assert.equal((await request(`/ordens-servico/${adminOrder.id}/status`, { method: 'PATCH', headers: headers(manager), body: JSON.stringify({ status: 'CANCELADA' }) })).status, 403);
  assert.equal((await request(`/ordens-servico/${adminOrder.id}`, { method: 'DELETE', headers: headers(manager) })).status, 403);
  assert.equal((await request('/ordens-servico', { method: 'POST', headers: headers(pending), body: JSON.stringify({ numero_os: 999000004, ...(await refs()), natureza_os: 'INTERNA', data_abertura: '2026-10-08', status: 'ABERTA' }) })).status, 403);
  assert.equal((await request('/ordens-servico', { method: 'POST', headers: headers('osgestor_session=invalid'), body: '{}' })).status, 401);
  assert.equal((await request(`/ordens-servico/${adminOrder.id}`, { method: 'DELETE', headers: headers(operator) })).status, 204);
  assert.equal((await request(`/ordens-servico/${operatorOrder.id}`, { method: 'DELETE', headers: headers(admin) })).status, 204);
  await pool.query('UPDATE sessoes SET revoked_at=NOW() WHERE usuario_id=$1', [userIds[1]]);
  assert.equal((await request('/ordens-servico', { method: 'POST', headers: headers(operator), body: JSON.stringify({ numero_os: 999000006, ...(await refs()), natureza_os: 'INTERNA', data_abertura: '2026-10-08', status: 'ABERTA' }) })).status, 401);
  orderIds.splice(0, orderIds.length);
});

test('ADMIN remove override; OPERADOR não escala para operação administrativa', async () => {
  const admin = await login(`${prefix}admin`); const operator = await login(`${prefix}operador`); const order = await createVia(admin, 999000005); const before = await pool.query('SELECT 1 FROM ordens_servico_overrides WHERE ordem_servico_id=$1', [order.id]); assert.equal(before.rowCount, 0);
  await pool.query('INSERT INTO ordens_servico_overrides(ordem_servico_id,campo,valor_origem,valor_override) VALUES($1,\'status\',$2::jsonb,$3::jsonb)', [order.id, JSON.stringify('ABERTA'), JSON.stringify('FINALIZADA')]);
  assert.equal((await request(`/ordens-servico/${order.id}/overrides/status`, { method: 'DELETE', headers: headers(operator) })).status, 403);
  assert.equal((await request(`/ordens-servico/${order.id}/overrides/status`, { method: 'DELETE', headers: headers(admin) })).status, 204);
  assert.equal((await pool.query('SELECT 1 FROM ordens_servico_overrides WHERE ordem_servico_id=$1', [order.id])).rowCount, 0);
  assert.equal((await request(`/ordens-servico/${order.id}`, { method: 'DELETE', headers: headers(admin) })).status, 204); orderIds.splice(orderIds.indexOf(order.id), 1);
});

after(async () => { if (orderIds.length) await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orderIds]); if (userIds.length) { await pool.query('DELETE FROM sessoes WHERE usuario_id=ANY($1::uuid[])', [userIds]); await pool.query('DELETE FROM auditoria WHERE usuario_id=ANY($1::uuid[])', [userIds]); await pool.query('DELETE FROM usuarios WHERE id=ANY($1::uuid[])', [userIds]); } await new Promise<void>((resolve) => server.close(() => resolve())); await pool.end(); });
