import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import type { Server } from 'node:http';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';
import { buildOsUpdateDiff, type ExistingOsSnapshot } from '../src/services/sincronizacao-os.service.js';
import { getResumo } from '../src/services/relatorios.service.js';
import { getDashboard } from '../src/services/dashboard.service.js';

assert.equal(process.env.DB_NAME, 'oficina_teste_fase051', 'este teste exige DB_NAME=oficina_teste_fase051');

const prefix = `m5730cat_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const password = 'Senha Categorias 2026!';
const origin = 'http://localhost:5173';
let server: Server;
let base = '';
let orderId = '';
let serviceId = '';
let otherOrderId = '';
const users: Array<{ id: string; username: string; role: 'ADMIN' | 'OPERADOR' | 'GESTOR' }> = [];

async function request(path: string, init?: RequestInit): Promise<Response> { return fetch(`${base}${path}`, init); }
function headers(cookie?: string) { return { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }; }
async function login(username: string): Promise<string> {
  const response = await request('/auth/login', { method: 'POST', headers: headers(), body: JSON.stringify({ username, password }) });
  assert.equal(response.status, 200);
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!;
}

before(async () => {
  const database = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(database.rows[0]?.current_database, 'oficina_teste_fase051');
  const hash = await hashPassword(password);
  for (const role of ['ADMIN', 'OPERADOR', 'GESTOR'] as const) {
    const username = `${prefix}_${role.toLowerCase()}`;
    const row = (await pool.query<{ id: string }>(
      `INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password)
       VALUES($1,$2,$3,$4,'ATIVO',FALSE) RETURNING id`,
      [username, `${username}@example.invalid`, hash, role],
    )).rows[0]!;
    users.push({ id: row.id, username, role });
  }
  const obra = (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001' LIMIT 1`)).rows[0];
  const frota = (await pool.query<{ id: string }>(`SELECT id FROM frotas WHERE codigo='TST01' LIMIT 1`)).rows[0];
  assert.ok(obra && frota);
  orderId = (await pool.query<{ id: string }>(
    `INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,categoria_servico,data_abertura,status)
     VALUES($1,$2,$3,'TERCEIRO','BORRACHARIA','2026-10-26','FINALIZADA') RETURNING id`,
    [Number(`9${Date.now().toString().slice(-8)}`), obra.id, frota.id],
  )).rows[0]!.id;
  serviceId = (await pool.query<{ id: string }>(
    `INSERT INTO servicos_os(ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem,categoria_gerencial)
     VALUES($1,'MAO DE OBRA ELETRICISTA - TERC',120,'TERCEIRO','IMPORTACAO','ELETRICA') RETURNING id`, [orderId],
  )).rows[0]!.id;
  await pool.query(
    `INSERT INTO servicos_os(ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem,categoria_gerencial)
     VALUES($1,'SERVICO INTERNO TESTE',50,'INTERNO','MANUAL','BORRACHARIA')`, [orderId],
  );
  otherOrderId = (await pool.query<{ id: string }>(
    `INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status)
     VALUES($1,$2,$3,'TERCEIRO','2026-10-26','ABERTA') RETURNING id`,
    [Number(`8${Date.now().toString().slice(-8)}`), obra.id, frota.id],
  )).rows[0]!.id;
  await pool.query(`INSERT INTO servicos_os(ordem_servico_id,descricao,valor,classificacao_servico) VALUES($1,'OUTRO SERVICO',10,'TERCEIRO')`, [otherOrderId]);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('servidor não iniciou');
  base = `http://127.0.0.1:${address.port}`;
});

test('categorias gerenciais: leitura, permissões, validação, persistência e auditoria', async () => {
  const admin = await login(users.find((x) => x.role === 'ADMIN')!.username);
  const operator = await login(users.find((x) => x.role === 'OPERADOR')!.username);
  const gestor = await login(users.find((x) => x.role === 'GESTOR')!.username);
  const categories = await request('/ordens-servico/categorias-gerenciais', { headers: headers(gestor) });
  assert.equal(categories.status, 200);
  assert.ok((await categories.json() as Array<{ value: string }>).some((x) => x.value === 'BORRACHARIA'));
  assert.equal((await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(gestor), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'BORRACHARIA' }) })).status, 403);
  assert.equal((await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'BORRACHARIA' }) })).status, 401);
  assert.equal((await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(operator), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'BORRACHARIA', valor: 1 }) })).status, 400);
  assert.equal((await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(operator), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'NAO_EXISTE' }) })).status, 400);
  const update = await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(admin), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'BORRACHARIA' }) });
  assert.equal(update.status, 200);
  const row = (await pool.query<{ descricao: string; categoria_gerencial: string; valor: string; descricao_editada_manualmente: boolean; categoria_gerencial_editada_manualmente: boolean }>(`SELECT descricao,categoria_gerencial,valor,descricao_editada_manualmente,categoria_gerencial_editada_manualmente FROM servicos_os WHERE id=$1`, [serviceId])).rows[0]!;
  assert.deepEqual(row, { descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'BORRACHARIA', valor: '120.00', descricao_editada_manualmente: true, categoria_gerencial_editada_manualmente: true });
  const order = (await pool.query<{ categoria_servico: string; status: string }>('SELECT categoria_servico,status FROM ordens_servico WHERE id=$1', [orderId])).rows[0]!;
  assert.deepEqual(order, { categoria_servico: 'BORRACHARIA', status: 'FINALIZADA' });
  const audit = await pool.query<{ dados_anteriores: { descricao: string; categoria_gerencial: string }; dados_posteriores: { descricao: string; categoria_gerencial: string } }>(`SELECT dados_anteriores,dados_posteriores FROM auditoria WHERE entidade='servicos_os' AND entidade_id=$1 AND modulo='CATEGORIAS_GERENCIAIS' ORDER BY created_at DESC LIMIT 1`, [serviceId]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0]!.dados_anteriores.descricao, 'MAO DE OBRA ELETRICISTA - TERC');
  assert.equal(audit.rows[0]!.dados_posteriores.categoria_gerencial, 'BORRACHARIA');
  const operatorUpdate = await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(operator), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA OPERADOR', categoria_gerencial: 'BORRACHARIA' }) });
  assert.equal(operatorUpdate.status, 200);
  const operatorRow = (await pool.query<{ descricao: string }>('SELECT descricao FROM servicos_os WHERE id=$1', [serviceId])).rows[0]!;
  assert.equal(operatorRow.descricao, 'SERVICO BORRACHARIA OPERADOR');
  const restore = await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(admin), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'BORRACHARIA' }) });
  assert.equal(restore.status, 200);
  const auditCountRow = await pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM auditoria WHERE entidade='servicos_os' AND entidade_id=$1 AND modulo='CATEGORIAS_GERENCIAIS'`, [serviceId]);
  const auditCount = Number(auditCountRow.rows[0]!.count);
  const noChange = await request(`/ordens-servico/${orderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(admin), body: JSON.stringify({ descricao: 'SERVICO BORRACHARIA', categoria_gerencial: 'BORRACHARIA' }) });
  assert.equal(noChange.status, 200);
  const afterCount = await pool.query(`SELECT COUNT(*)::int AS count FROM auditoria WHERE entidade='servicos_os' AND entidade_id=$1 AND modulo='CATEGORIAS_GERENCIAIS'`, [serviceId]);
  assert.equal(Number(afterCount.rows[0].count), auditCount);
  assert.equal((await request(`/ordens-servico/${orderId}/servicos/${randomUUID()}/categoria-gerencial`, { method: 'PATCH', headers: headers(admin), body: JSON.stringify({ descricao: 'X', categoria_gerencial: null }) })).status, 404);
  assert.equal((await request(`/ordens-servico/${otherOrderId}/servicos/${serviceId}/categoria-gerencial`, { method: 'PATCH', headers: headers(admin), body: JSON.stringify({ descricao: 'X', categoria_gerencial: null }) })).status, 404);
});

test('reimportação identifica conflito com categoria gerencial corrigida manualmente', () => {
  const current: ExistingOsSnapshot = {
    id: 'os', numeroOs: 48069, obraId: 'obra', obra: 'Obra', frotaId: 'frota', frota: 'TST01', natureza: 'TERCEIRO', categoria: 'BORRACHARIA', status: 'FINALIZADA', problema: null, dataAbertura: '2026-10-26', dataFechamento: null,
    servicos: [{ id: 'service', descricao: 'SERVICO BORRACHARIA', valor: 120, categoriaGerencial: 'BORRACHARIA', categoriaGerencialManual: true, descricaoManual: true }], produtos: [], execucoes: [],
  };
  const parsed = { numeroOs: 48069, data: '2026-10-26', cliente: null, frotaOriginal: 'TST01', parecerOriginal: null, problema: null, natureza: 'TERCEIRO' as const, categoriaServico: 'BORRACHARIA', status: 'FINALIZADA', statusOriginal: 'FINALIZADA', statusOrigem: 'AUTOMATICO' as const, itens: [{ codigo: '1892', codigo_poli: '1892', descricao: 'SERVICO BORRACHARIA', quantidade: 1, valorUnitario: 120, total: 120, unidade: 'UN', tipo: 'SERVICO' as const, classificacao_servico: 'TERCEIRO' as const, categoria_gerencial: 'ELETRICA', subcategoria_gerencial: null, origem_classificacao: 'CODIGO_POLI_APROVADO' }], execucoes: [], statusPreview: 'ATUALIZACAO_DISPONIVEL' as const, pendencias: [], origem: 'teste' };
  const diff = buildOsUpdateDiff(parsed, current);
  assert.equal(diff.estado, 'REQUER_REVISAO');
  assert.ok(diff.divergencias.includes('CATEGORIA_GERENCIAL_MANUAL_CONFLITANTE'));
});

test('filtro gerencial separa serviços internos e terceiros sem alterar o total armazenado', async () => {
  const resumo = await getResumo({ data_inicio: '2026-10-26', data_fim: '2026-10-26', categoria: 'GERENCIAL:BORRACHARIA' });
  assert.equal(resumo.total_mao_obra_interna, 50);
  assert.equal(resumo.total_servicos_terceiros, 120);
  assert.equal(resumo.total_gasto, 170);
  const dashboard = await getDashboard({ data_inicio: '2026-10-26', data_fim: '2026-10-26', categoria: 'GERENCIAL:BORRACHARIA' });
  assert.equal(dashboard.resumo.interna, 50);
  assert.equal(dashboard.resumo.terceiros, 120);
  assert.equal(dashboard.resumo.gasto_total, 170);
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (orderId || otherOrderId) await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [[orderId, otherOrderId].filter(Boolean)]);
  if (users.length) {
    const ids = users.map((x) => x.id);
    await pool.query('DELETE FROM sessoes WHERE usuario_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM auditoria WHERE usuario_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM usuarios WHERE id=ANY($1::uuid[])', [ids]);
  }
  await pool.end();
});
