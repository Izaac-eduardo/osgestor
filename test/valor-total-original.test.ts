import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/config/database.js';
import { confirm } from '../src/controllers/importacoes-os.controller.js';
import { createProdutoOs, getOrdemServicoDetalhes, updateProdutoOs } from '../src/services/ordens-servico-itens.service.js';
import type { ParsedOs } from '../src/imports/poli-os.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

let obraId = '';
let fleetId = '';
const orderIds: string[] = [];
const tokens: string[] = [];

before(async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  obraId = (await pool.query<{ id: string }>('INSERT INTO obras(codigo,nome) VALUES($1,$2) RETURNING id', [`TEST-J1-${suffix}`, 'Fixture J.1'])).rows[0]!.id;
  fleetId = (await pool.query<{ id: string }>('SELECT id FROM frotas WHERE codigo=$1', ['TST01'])).rows[0]!.id;
});

after(async () => {
  if (orderIds.length) await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orderIds]);
  if (tokens.length) await pool.query('DELETE FROM importacoes_os WHERE id=ANY($1::uuid[])', [tokens]);
  if (obraId) await pool.query('DELETE FROM obras WHERE id=$1', [obraId]);
  await pool.end();
});

const createOrder = async (number: number) => {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status)
     VALUES($1,$2,$3,'MATERIAL',CURRENT_DATE,'ABERTA') RETURNING id`, [number, obraId, fleetId],
  );
  orderIds.push(result.rows[0]!.id);
  return result.rows[0]!.id;
};

const responseOf = () => {
  let statusCode = 200;
  let body: unknown;
  return {
    response: {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; },
    } as never,
    result: () => ({ statusCode, body }),
  };
};

const importedProduct = (number: number, total: number): ParsedOs => ({
  numeroOs: number, data: '2026-09-30', cliente: null, frotaOriginal: 'TST01', frotaId: fleetId,
  parecerOriginal: null, obraId, funcionarioAbertura: null, problema: 'Teste J.1', natureza: 'MATERIAL',
  categoriaServico: undefined, status: 'ABERTA', statusOriginal: 'ABERTA', statusOrigem: 'AUTOMATICO',
  itens: [{ descricao: 'Produto Vega', quantidade: 31.61, unidade: 'UN', valorUnitario: 2.15, total, tipo: 'PRODUTO' }],
  execucoes: [], statusPreview: 'PRONTA', pendencias: [], origem: 'j1-fixture.xls',
});

async function savePreview(token: string, item: ParsedOs): Promise<void> {
  tokens.push(token);
  await pool.query('INSERT INTO importacoes_os(id,arquivo_nome,expires_at) VALUES($1,$2,now()+interval \'1 hour\')', [token, 'j1-fixture.xls']);
  await pool.query(
    'INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES($1,$2,$3,$4,$5)',
    [token, item.numeroOs, JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias)],
  );
}

test('migration preserva coluna calculada e cria original nullable sem backfill', async () => {
  const columns = await pool.query<{ column_name: string; data_type: string; character_maximum_length: number | null; is_nullable: string; column_default: string | null; generation_expression: string | null }>(
    `SELECT column_name,data_type,character_maximum_length,is_nullable,column_default,generation_expression
       FROM information_schema.columns WHERE table_name='produtos_os'
       AND column_name IN('valor_total','valor_total_original') ORDER BY column_name`,
  );
  assert.deepEqual(columns.rows, [
    { column_name: 'valor_total', data_type: 'numeric', character_maximum_length: null, is_nullable: 'YES', column_default: null, generation_expression: 'round((quantidade * valor_unitario), 2)' },
    { column_name: 'valor_total_original', data_type: 'numeric', character_maximum_length: null, is_nullable: 'YES', column_default: null, generation_expression: null },
  ]);
});

test('produto Vega coincidente preserva o total original', async () => {
  const id = await createOrder(991000000 + Math.floor(Math.random() * 100000));
  const product = await createProdutoOs(id, { descricao: 'Coincidente', quantidade: 2, unidade: 'UN', valor_unitario: 10 });
  await pool.query('UPDATE produtos_os SET valor_total_original=$1 WHERE id=$2', [20, product.id]);
  const row = (await pool.query<{ valor_total: string; valor_total_original: string }>('SELECT valor_total,valor_total_original FROM produtos_os WHERE id=$1', [product.id])).rows[0]!;
  assert.deepEqual(row, { valor_total: '20.00', valor_total_original: '20.00' });
});

test('confirma divergência Vega 47507 e usa o original no financeiro', async () => {
  const number = 991000000 + Math.floor(Math.random() * 100000);
  const token = randomUUID();
  await savePreview(token, importedProduct(number, 67.95));
  const out = responseOf();
  await confirm({ params: { token } } as never, out.response);
  assert.equal(out.result().statusCode, 200);
  const order = (await pool.query<{ id: string }>('SELECT id FROM ordens_servico WHERE numero_os=$1', [number])).rows[0]!;
  orderIds.push(order.id);
  const row = (await pool.query<{ quantidade: string; valor_unitario: string; valor_total: string; valor_total_original: string }>('SELECT quantidade,valor_unitario,valor_total,valor_total_original FROM produtos_os WHERE ordem_servico_id=$1', [order.id])).rows[0]!;
  assert.deepEqual(row, { quantidade: '31.610', valor_unitario: '2.15', valor_total: '67.96', valor_total_original: '67.95' });
  const summary = (await pool.query<{ total_produtos: string }>('SELECT total_produtos FROM vw_ordens_servico_resumo WHERE id=$1', [order.id])).rows[0]!;
  assert.equal(summary.total_produtos, '67.95');
});

test('divergência independente do arredondamento preserva 3.05 como financeiro', async () => {
  const id = await createOrder(991000000 + Math.floor(Math.random() * 100000));
  await pool.query('INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario,valor_total_original) VALUES($1,$2,$3,$4,$5,$6)', [id, 'Produto 47409', 25, 'UN', 0.12, 3.05]);
  const row = (await pool.query<{ valor_total: string; valor_total_original: string; total_produtos: string }>('SELECT p.valor_total,p.valor_total_original,v.total_produtos FROM produtos_os p JOIN vw_ordens_servico_resumo v ON v.id=p.ordem_servico_id WHERE p.ordem_servico_id=$1', [id])).rows[0]!;
  assert.deepEqual(row, { valor_total: '3.00', valor_total_original: '3.05', total_produtos: '3.05' });
});

test('produto manual ignora total original forjado e edição preserva o original', async () => {
  const id = await createOrder(991000000 + Math.floor(Math.random() * 100000));
  const product = await createProdutoOs(id, { descricao: 'Manual', quantidade: 31.61, unidade: 'UN', valor_unitario: 2.15, valor_total_original: 1 });
  let row = (await pool.query<{ valor_total: string; valor_total_original: string | null }>('SELECT valor_total,valor_total_original FROM produtos_os WHERE id=$1', [product.id])).rows[0]!;
  assert.deepEqual(row, { valor_total: '67.96', valor_total_original: null });
  await pool.query('UPDATE produtos_os SET valor_total_original=67.95 WHERE id=$1', [product.id]);
  await updateProdutoOs(id, product.id, { descricao: 'Manual editado', quantidade: 31.61, unidade: 'UN', valor_unitario: 2.15, valor_total_original: 1 });
  row = (await pool.query<{ valor_total: string; valor_total_original: string }>('SELECT valor_total,valor_total_original FROM produtos_os WHERE id=$1', [product.id])).rows[0]!;
  assert.deepEqual(row, { valor_total: '67.96', valor_total_original: '67.95' });
});

test('views financeiras usam COALESCE para produto manual e importado', async () => {
  const id = await createOrder(991000000 + Math.floor(Math.random() * 100000));
  const baseline = Number((await pool.query<{ total_produtos: string }>('SELECT total_produtos FROM vw_gastos_obra WHERE obra_id=$1', [obraId])).rows[0]?.total_produtos ?? 0);
  await createProdutoOs(id, { descricao: 'Manual 100', quantidade: 1, unidade: 'UN', valor_unitario: 100 });
  await pool.query('INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario,valor_total_original) VALUES($1,$2,$3,$4,$5,$6)', [id, 'Importado 67.95', 31.61, 'UN', 2.15, 67.95]);
  const rows = await pool.query<{ total_produtos: string }>('SELECT total_produtos FROM vw_ordens_servico_resumo WHERE id=$1', [id]);
  const aggregate = Number((await pool.query<{ total_produtos: string }>('SELECT total_produtos FROM vw_gastos_obra WHERE obra_id=$1', [obraId])).rows[0]!.total_produtos);
  assert.equal(rows.rows[0]!.total_produtos, '167.95');
  assert.equal((aggregate - baseline).toFixed(2), '167.95');
});

test('produto legado sem original mantém o valor calculado', async () => {
  const id = await createOrder(991000000 + Math.floor(Math.random() * 100000));
  await createProdutoOs(id, { descricao: 'Legado', quantidade: 2, unidade: 'UN', valor_unitario: 10 });
  const row = (await pool.query<{ total_produtos: string }>('SELECT total_produtos FROM vw_ordens_servico_resumo WHERE id=$1', [id])).rows[0]!;
  assert.equal(row.total_produtos, '20.00');
});

test('confirmação duplicada não sobrescreve nem faz backfill do produto existente', async () => {
  const number = 991000000 + Math.floor(Math.random() * 100000);
  const id = await createOrder(number);
  await pool.query('INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario) VALUES($1,$2,$3,$4,$5)', [id, 'Produto legado', 1, 'UN', 10]);
  const token = randomUUID();
  await savePreview(token, importedProduct(number, 67.95));
  const out = responseOf();
  await confirm({ params: { token } } as never, out.response);
  assert.equal(out.result().statusCode, 200);
  const row = (await pool.query<{ quantidade: string; valor_total_original: string | null }>('SELECT quantidade,valor_total_original FROM produtos_os WHERE ordem_servico_id=$1', [id])).rows[0]!;
  assert.deepEqual(row, { quantidade: '1.000', valor_total_original: null });
});
