import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { pool } from '../src/config/database.js';
import {
  createProdutoOs,
  createServicoOs,
  getOrdemServicoDetalhes,
  updateServicoOs,
} from '../src/services/ordens-servico-itens.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

let orderId = '';
let employeeId = '';
let obraId = '';
let fleetId = '';
let serviceInternalId = '';

before(async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const obra = await pool.query<{ id: string }>(
    'INSERT INTO obras(codigo,nome) VALUES ($1,$2) RETURNING id',
    [`TEST-CLASS-${suffix}`, 'Fixture classificação serviços'],
  );
  obraId = obra.rows[0]!.id;
  const fleet = await pool.query<{ id: string }>(
    'INSERT INTO frotas(codigo,descricao) VALUES ($1,$2) RETURNING id',
    [`TCLS${suffix.slice(-6)}`, 'Fixture classificação serviços'],
  );
  fleetId = fleet.rows[0]!.id;
  const order = await pool.query<{ id: string }>(
    `INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status)
     VALUES ($1,$2,$3,'INTERNA',CURRENT_DATE,'ABERTA') RETURNING id`,
    [990000000 + Number(suffix.slice(-6)), obraId, fleetId],
  );
  orderId = order.rows[0]!.id;
  const employee = await pool.query<{ id: string }>(
    `INSERT INTO funcionarios(nome,matricula,cargo,status)
     VALUES ($1,$2,'TESTE','ATIVO') RETURNING id`,
    [`Funcionário classificação ${suffix}`, `TEST-CLASS-${suffix}`],
  );
  employeeId = employee.rows[0]!.id;
});

after(async () => {
  if (orderId) await pool.query('DELETE FROM ordens_servico WHERE id=$1', [orderId]);
  if (employeeId) await pool.query('DELETE FROM funcionarios WHERE id=$1', [employeeId]);
  if (fleetId) await pool.query('DELETE FROM frotas WHERE id=$1', [fleetId]);
  if (obraId) await pool.query('DELETE FROM obras WHERE id=$1', [obraId]);
  await pool.end();
});

const classificationError = async (value: unknown) => {
  await assert.rejects(
    createServicoOs(orderId, { descricao: 'Serviço inválido', valor: 10, classificacao_servico: value }),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 400,
  );
};

test('criação antiga usa INDETERMINADO/LEGADO e origem enviada é ignorada', async () => {
  const legacy = await createServicoOs(orderId, { descricao: 'Serviço legado', valor: 10, classificacao_origem: 'IMPORTACAO' });
  assert.deepEqual(
    { classification: legacy.classificacao_servico, origin: legacy.classificacao_origem },
    { classification: 'INDETERMINADO', origin: 'LEGADO' },
  );
});

test('criação manual aceita as três classificações e força MANUAL', async () => {
  for (const classification of ['INTERNO', 'TERCEIRO', 'INDETERMINADO'] as const) {
    const service = await createServicoOs(orderId, {
      descricao: `Serviço ${classification}`,
      valor: 20,
      classificacao_servico: classification,
      classificacao_origem: 'REVISAO',
    });
    assert.equal(service.classificacao_servico, classification);
    assert.equal(service.classificacao_origem, 'MANUAL');
  }
  for (const origin of ['LEGADO', 'IMPORTACAO', 'REVISAO'] as const) {
    const service = await createServicoOs(orderId, {
      descricao: `Origem forjada ${origin}`,
      valor: 21,
      classificacao_servico: 'INTERNO',
      classificacao_origem: origin,
    });
    assert.equal(service.classificacao_origem, 'MANUAL');
  }
});

test('classificação inválida é rejeitada sem coerção', async () => {
  await classificationError('EXTERNO');
  await classificationError('');
  await classificationError(null);
  await classificationError(123);
  await classificationError(true);
  await assert.rejects(
    createServicoOs(orderId, { descricao: 'Serviço inválido', valor: 10, classificacao_servico: 'interno' }),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 400,
  );
});

test('edição explícita muda classificação e origem para REVISAO', async () => {
  const service = await createServicoOs(orderId, { descricao: 'Serviço revisável', valor: 30 });
  const internal = await updateServicoOs(orderId, service.id, { descricao: service.descricao, valor: 30, classificacao_servico: 'INTERNO' });
  assert.deepEqual(
    { classification: internal.classificacao_servico, origin: internal.classificacao_origem },
    { classification: 'INTERNO', origin: 'REVISAO' },
  );
  const same = await updateServicoOs(orderId, service.id, { descricao: service.descricao, valor: 30, classificacao_servico: 'INTERNO' });
  assert.equal(same.classificacao_origem, 'REVISAO');
  const third = await updateServicoOs(orderId, service.id, { descricao: service.descricao, valor: 30, classificacao_servico: 'TERCEIRO' });
  assert.deepEqual(
    { classification: third.classificacao_servico, origin: third.classificacao_origem },
    { classification: 'TERCEIRO', origin: 'REVISAO' },
  );
});

test('edição somente de descrição ou valor preserva classificação e origem', async () => {
  const service = await createServicoOs(orderId, { descricao: 'Serviço preservado', valor: 40, classificacao_servico: 'TERCEIRO' });
  const description = await updateServicoOs(orderId, service.id, { descricao: 'Serviço preservado alterado', valor: 40 });
  assert.equal(description.classificacao_servico, 'TERCEIRO');
  assert.equal(description.classificacao_origem, 'MANUAL');
  const value = await updateServicoOs(orderId, service.id, { descricao: description.descricao, valor: 41 });
  assert.equal(value.classificacao_servico, 'TERCEIRO');
  assert.equal(value.classificacao_origem, 'MANUAL');
});

test('leitura aceita O.S. mista, mantém natureza, produto e execução independentes', async () => {
  const internal = await createServicoOs(orderId, { descricao: 'MAO DE OBRA MECANICO', valor: 100, classificacao_servico: 'INTERNO' });
  serviceInternalId = internal.id;
  const third = await createServicoOs(orderId, { descricao: 'SERVICO ELETRICO TERCEIRO', valor: 250, classificacao_servico: 'TERCEIRO' });
  await createProdutoOs(orderId, { descricao: 'Produto fixture', quantidade: 1, unidade: 'UN', valor_unitario: 15 });
  await pool.query(
    `INSERT INTO servicos_os_execucoes(ordem_servico_id,servico_os_id,funcionario_id,inicio,fim)
     VALUES ($1,$2,$3,'2026-09-29 08:00','2026-09-29 09:00')`,
    [orderId, internal.id, employeeId],
  );
  const details = await getOrdemServicoDetalhes(orderId);
  assert.equal(details.natureza_os, 'INTERNA');
  assert.equal(details.servicos.find(item => item.id === internal.id)?.classificacao_servico, 'INTERNO');
  assert.equal(details.servicos.find(item => item.id === third.id)?.classificacao_servico, 'TERCEIRO');
  assert.equal(details.produtos.length, 1);
  assert.equal('classificacao_servico' in details.produtos[0]!, false);
  assert.equal(details.servicos.find(item => item.id === internal.id)?.execucoes.length, 1);
  assert.equal(details.servicos.find(item => item.id === internal.id)?.valor, 100);
  assert.equal(details.servicos.find(item => item.id === third.id)?.valor, 250);
});

test('execução permanece vinculada ao serviço após revisão da classificação', async () => {
  assert.ok(serviceInternalId);
  const revised = await updateServicoOs(orderId, serviceInternalId, { descricao: 'MAO DE OBRA MECANICO', valor: 100, classificacao_servico: 'TERCEIRO' });
  assert.equal(revised.classificacao_origem, 'REVISAO');
  const details = await getOrdemServicoDetalhes(orderId);
  assert.equal(details.servicos.find(item => item.id === serviceInternalId)?.execucoes.length, 1);
});
