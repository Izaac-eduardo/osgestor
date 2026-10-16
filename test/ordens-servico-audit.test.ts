import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';
import { addFuncionarioOs, createProdutoOs, createServicoOs, deleteProdutoOs, deleteServicoOs, removeFuncionarioOs, updateProdutoOs, updateServicoOs } from '../src/services/ordens-servico-itens.service.js';
import { createExecucao, deleteExecucao, updateExecucao } from '../src/services/servicos-os-execucoes.service.js';
import { createOrdemServico, deleteOrdemServico, updateOrdemServico, updateOrdemServicoStatus } from '../src/services/ordens-servico.service.js';
import { removeOverride, upsertOverride } from '../src/services/ordens-servico-overrides.service.js';
import type { AuthenticatedRequestUser } from '../src/types/auth.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');
const prefix = `m5711b_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const orderIds: string[] = [];
let actor: AuthenticatedRequestUser;
let fixtureEmployeeId: string;

const refs = async () => ({
  obra: (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001'`)).rows[0]!.id,
  frota: (await pool.query<{ id: string }>('SELECT id FROM frotas ORDER BY codigo LIMIT 1')).rows[0]!.id,
  funcionario: (await pool.query<{ id: string }>('SELECT id FROM funcionarios ORDER BY nome LIMIT 1')).rows[0]?.id,
});

const newOrder = async (numero: number) => {
  const r = await refs();
  const order = await createOrdemServico({ numero_os: numero, obra_id: r.obra, frota_id: r.frota, natureza_os: 'INTERNA', data_abertura: '2026-10-07', status: 'ABERTA', observacoes: `${prefix} order` }, actor);
  orderIds.push(order.id);
  return { order, ...r };
};

before(async () => {
  const db = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(db.rows[0]?.current_database, 'oficina_test');
  const passwordHash = await hashPassword('Senha de auditoria 2026!');
  const user = (await pool.query<{ id: string; username: string; role: 'ADMIN'; status: 'ATIVO'; must_change_password: boolean }>(`INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,'ADMIN','ATIVO',false) RETURNING id,username,role,status,must_change_password`, [`${prefix}admin`, `${prefix}@example.invalid`, passwordHash])).rows[0]!;
  actor = { ...user, sessionId: randomUUID(), tokenHash: 'test-only-token-hash' };
  fixtureEmployeeId = (await pool.query<{ id: string }>(`INSERT INTO funcionarios(nome,matricula,cargo,status) VALUES($1,$2,$3,'ATIVO') RETURNING id`, [`${prefix} employee`, `${prefix}-mat`, 'Teste'])).rows[0]!.id;
});

test('audita CRUD de O.S., itens, execuções, overrides, identidade e snapshots', async () => {
  const { order, obra, frota, funcionario } = await newOrder(997000000 + Math.floor(Math.random() * 999999));
  const createdAudit = (await pool.query<any>('SELECT * FROM auditoria WHERE entidade=$1 AND entidade_id=$2 AND acao=$3 ORDER BY created_at DESC LIMIT 1', ['ordens_servico', order.id, 'CRIAR'])).rows[0];
  assert.equal(createdAudit.username, actor.username); assert.equal(createdAudit.role, actor.role); assert.equal(createdAudit.dados_posteriores.observacoes, `${prefix} order`);

  const beforeEditCount = (await pool.query<{ count: string }>('SELECT count(*)::text count FROM auditoria WHERE entidade=$1 AND entidade_id=$2 AND acao=$3', ['ordens_servico', order.id, 'EDITAR'])).rows[0]!.count;
  await updateOrdemServico(order.id, { numero_os: Number(order.numero_os), obra_id: obra, frota_id: frota, natureza_os: 'INTERNA', data_abertura: '2026-10-07', status: 'ABERTA', observacoes: `${prefix} order` }, actor);
  const afterNoopCount = (await pool.query<{ count: string }>('SELECT count(*)::text count FROM auditoria WHERE entidade=$1 AND entidade_id=$2 AND acao=$3', ['ordens_servico', order.id, 'EDITAR'])).rows[0]!.count;
  assert.equal(afterNoopCount, beforeEditCount);
  await updateOrdemServico(order.id, { numero_os: Number(order.numero_os), obra_id: obra, frota_id: frota, natureza_os: 'INTERNA', data_abertura: '2026-10-07', status: 'ABERTA', observacoes: `${prefix} changed` }, actor);
  const edited = (await pool.query<any>('SELECT * FROM auditoria WHERE entidade=$1 AND entidade_id=$2 AND acao=$3 ORDER BY created_at DESC LIMIT 1', ['ordens_servico', order.id, 'EDITAR'])).rows[0];
  assert.equal(edited.dados_anteriores.observacoes, `${prefix} order`); assert.equal(edited.dados_posteriores.observacoes, `${prefix} changed`);
  await updateOrdemServicoStatus(order.id, { status: 'FINALIZADA' }, actor);
  assert.equal((await pool.query('SELECT 1 FROM auditoria WHERE entidade_id=$1 AND acao=$2', [order.id, 'FINALIZAR'])).rowCount, 1);
  const cancelled = await newOrder(997000000 + Math.floor(Math.random() * 999999));
  await updateOrdemServicoStatus(cancelled.order.id, { status: 'CANCELADA' }, actor);
  assert.equal((await pool.query('SELECT 1 FROM auditoria WHERE entidade_id=$1 AND acao=$2', [cancelled.order.id, 'CANCELAR'])).rowCount, 1);

  const employeeId = funcionario ?? fixtureEmployeeId;
  const employee = await addFuncionarioOs(order.id, { funcionario_id: employeeId }, actor);
  assert.equal((await pool.query('SELECT 1 FROM auditoria WHERE entidade=$1 AND entidade_id=$2 AND acao=$3', ['ordens_servico_funcionarios', `${order.id}:${employeeId}`, 'CRIAR'])).rowCount, 1);
  const service = await createServicoOs(order.id, { descricao: `${prefix} service`, valor: 10.5, classificacao_servico: 'INTERNO' }, actor);
  const product = await createProdutoOs(order.id, { descricao: `${prefix} product`, quantidade: 2, unidade: 'UN', valor_unitario: 4.25 }, actor);
  await updateServicoOs(order.id, service.id, { descricao: `${prefix} service changed`, valor: 11, classificacao_servico: 'INTERNO' }, actor);
  await updateProdutoOs(order.id, product.id, { descricao: `${prefix} product changed`, quantidade: 3, unidade: 'UN', valor_unitario: 4.25 }, actor);
  const execution = await createExecucao(order.id, service.id, { funcionario_id: employeeId, inicio: '2026-10-07T08:00', fim: '2026-10-07T09:00' }, actor);
  await updateExecucao(order.id, service.id, execution.id, { funcionario_id: employeeId, inicio: '2026-10-07T08:15', fim: '2026-10-07T09:15' }, actor);
  await deleteExecucao(order.id, service.id, execution.id, actor);
  await deleteServicoOs(order.id, service.id, actor); await deleteProdutoOs(order.id, product.id, actor); await removeFuncionarioOs(order.id, employee.id, actor);
  await upsertOverride(order.id, 'obra_id', obra, obra);
  await removeOverride(order.id, 'obra_id', actor);
  const auditRows = (await pool.query<{ entidade: string }>(`SELECT entidade FROM auditoria WHERE entidade_id=$1 OR dados_posteriores->>'ordem_servico_id'=$1 OR dados_anteriores->>'ordem_servico_id'=$1`, [order.id])).rows;
  assert.ok(auditRows.some((row) => row.entidade === 'servicos_os')); assert.ok(auditRows.some((row) => row.entidade === 'produtos_os')); assert.ok(auditRows.some((row) => row.entidade === 'servicos_os_execucoes'));
});

test('falha da auditoria faz rollback da criação da O.S.', async () => {
  const r = await refs(); const number = 998000000 + Math.floor(Math.random() * 999999);
  const invalidActor = { ...actor, role: 'INVALIDO' } as unknown as AuthenticatedRequestUser;
  await assert.rejects(() => createOrdemServico({ numero_os: number, obra_id: r.obra, frota_id: r.frota, natureza_os: 'INTERNA', data_abertura: '2026-10-07', status: 'ABERTA', observacoes: `${prefix} rollback` }, invalidActor));
  assert.equal((await pool.query('SELECT 1 FROM ordens_servico WHERE numero_os=$1', [number])).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM auditoria WHERE dados_posteriores->>\'observacoes\'=$1', [`${prefix} rollback`])).rowCount, 0);
});

test('falha operacional não gera auditoria e concorrência preserva snapshots confirmados', async () => {
  const { order, obra, frota } = await newOrder(998000000 + Math.floor(Math.random() * 999999));
  await assert.rejects(() => updateServicoOs(order.id, randomUUID(), { descricao: `${prefix} missing`, valor: 1 }, actor), /Serviço não encontrado/);
  assert.equal((await pool.query('SELECT 1 FROM auditoria WHERE entidade=$1 AND entidade_id=$2', ['servicos_os', order.id])).rowCount, 0);
  await Promise.all([
    updateOrdemServico(order.id, { numero_os: Number(order.numero_os), obra_id: obra, frota_id: frota, natureza_os: 'INTERNA', data_abertura: '2026-10-07', status: 'ABERTA', observacoes: `${prefix} concurrent-a` }, actor),
    updateOrdemServico(order.id, { numero_os: Number(order.numero_os), obra_id: obra, frota_id: frota, natureza_os: 'INTERNA', data_abertura: '2026-10-07', status: 'ABERTA', observacoes: `${prefix} concurrent-b` }, actor),
  ]);
  const events = (await pool.query<any>('SELECT dados_anteriores,dados_posteriores FROM auditoria WHERE entidade=$1 AND entidade_id=$2 AND acao=$3 ORDER BY created_at,id', ['ordens_servico', order.id, 'EDITAR'])).rows;
  assert.equal(events.length, 2); assert.ok(events.every((event) => event.dados_posteriores.observacoes.startsWith(`${prefix} concurrent-`)));
  const stored = (await pool.query<{ observacoes: string }>('SELECT observacoes FROM ordens_servico WHERE id=$1', [order.id])).rows[0]!;
  assert.equal(events.some((event) => event.dados_posteriores.observacoes === stored.observacoes), true);
  const statusOrder = await newOrder(998000000 + Math.floor(Math.random() * 999999));
  await Promise.all([updateOrdemServicoStatus(statusOrder.order.id, { status: 'FINALIZADA' }, actor), updateOrdemServicoStatus(statusOrder.order.id, { status: 'CANCELADA' }, actor)]);
  const statusEvents = (await pool.query<{ acao: string }>('SELECT acao FROM auditoria WHERE entidade_id=$1 AND acao IN ($2,$3,$4)', [statusOrder.order.id, 'FINALIZAR', 'CANCELAR', 'ALTERAR_STATUS'])).rows;
  assert.equal(statusEvents.length, 2);
});

after(async () => {
  if (orderIds.length) await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orderIds]);
  if (fixtureEmployeeId) await pool.query('DELETE FROM funcionarios WHERE id=$1', [fixtureEmployeeId]);
  if (actor) { await pool.query('DELETE FROM auditoria WHERE usuario_id=$1', [actor.id]); await pool.query('DELETE FROM usuarios WHERE id=$1', [actor.id]); }
  await pool.end();
});
