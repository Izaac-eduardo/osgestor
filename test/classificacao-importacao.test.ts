import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { after, test } from 'node:test';
import { pool } from '../src/config/database.js';
import { classifyImportedService } from '../src/imports/poli-os.js';
import { createImportedServicoOs } from '../src/services/ordens-servico-itens.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

const cases: Array<[string, boolean, 'INTERNO' | 'TERCEIRO' | 'INDETERMINADO']> = [
  ['MAO DE OBRA MECANICO', true, 'INTERNO'],
  ['MAO DE OBRA LUBRIFICADOR', true, 'INTERNO'],
  ['MAO DE OBRA SOLDADOR', true, 'INTERNO'],
  ['MAO DE OBRA LAVADOR', true, 'INTERNO'],
  ['MAO DE OBRA MECANICO', false, 'INDETERMINADO'],
  ['MAO DE OBRA ELETRICISTA - TERC', false, 'TERCEIRO'],
  ['MAO DE OBRA MECANICO TERCEIROS', false, 'TERCEIRO'],
  ['SERVICO DE TORNO TERCEIROS', false, 'TERCEIRO'],
  ['SERVICO BORRACHARIA - TERCEIRO', false, 'TERCEIRO'],
  ['MENSALIDADE PEDAGIO', false, 'TERCEIRO'],
  ['MENSALIDADE', false, 'INDETERMINADO'],
  ['MENSALIDADE SISTEMA', false, 'INDETERMINADO'],
  ['PEDAGIO', false, 'INDETERMINADO'],
  ['TAXA DE PEDAGIO', false, 'INDETERMINADO'],
  ['FRETE', false, 'INDETERMINADO'],
  ['SERVICO MOLEJO BALANCA DE CAMI', false, 'INDETERMINADO'],
];

test('classifica serviços Vega por regras explícitas e whitelist auditada', () => {
  for (const [description, hasExecution, expected] of cases) {
    const result = classifyImportedService(description, hasExecution);
    assert.equal(result.classificacao_servico, expected, description);
    assert.equal(result.classificacao_origem, 'IMPORTACAO');
  }
});

test('marcador terceiro vence a whitelist quando há conflito', () => {
  const result = classifyImportedService('MAO DE OBRA MECANICO TERCEIROS', true);
  assert.deepEqual(result, { classificacao_servico: 'TERCEIRO', classificacao_origem: 'IMPORTACAO' });
});

test('caso real 47464 separa eletricista terceiro de mecânico interno', () => {
  assert.equal(classifyImportedService('MAO DE OBRA ELETRICISTA - TERC').classificacao_servico, 'TERCEIRO');
  assert.equal(classifyImportedService('MAO DE OBRA MECANICO', true).classificacao_servico, 'INTERNO');
});

test('persistência de importação grava classificação mista e origem IMPORTACAO', async () => {
  const client = await pool.connect();
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  try {
    await client.query('BEGIN');
    const obra = await client.query<{ id: string }>(
      'INSERT INTO obras(codigo,nome) VALUES ($1,$2) RETURNING id',
      [`TEST-IMPORT-CLASS-${suffix}`, 'Fixture importação classificação'],
    );
    const fleet = await client.query<{ id: string }>(
      'INSERT INTO frotas(codigo,descricao) VALUES ($1,$2) RETURNING id',
      [`TIC${suffix.slice(-6)}`, 'Fixture importação classificação'],
    );
    const order = await client.query<{ id: string }>(
      `INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status)
       VALUES ($1,$2,$3,'INTERNA',CURRENT_DATE,'ABERTA') RETURNING id`,
      [991000000 + Number(suffix.slice(-6)), obra.rows[0]!.id, fleet.rows[0]!.id],
    );
    const values = [
      ['MAO DE OBRA MECANICO', 100, 'INTERNO' as const],
      ['MENSALIDADE PEDAGIO', 200, 'TERCEIRO' as const],
      ['FRETE', 50, 'INDETERMINADO' as const],
    ];
    for (const [descricao, valor, classificacao] of values) {
      await createImportedServicoOs(client, order.rows[0]!.id, {
        descricao: descricao as string,
        valor: valor as number,
        classificacao_servico: classificacao,
      });
    }
    const services = await client.query<{ classificacao_servico: string; classificacao_origem: string }>(
      `SELECT classificacao_servico,classificacao_origem FROM servicos_os
       WHERE ordem_servico_id=$1 ORDER BY created_at`,
      [order.rows[0]!.id],
    );
    assert.deepEqual(services.rows, [
      { classificacao_servico: 'INTERNO', classificacao_origem: 'IMPORTACAO' },
      { classificacao_servico: 'TERCEIRO', classificacao_origem: 'IMPORTACAO' },
      { classificacao_servico: 'INDETERMINADO', classificacao_origem: 'IMPORTACAO' },
    ]);
    const nature = await client.query<{ natureza_os: string }>('SELECT natureza_os FROM ordens_servico WHERE id=$1', [order.rows[0]!.id]);
    assert.equal(nature.rows[0]!.natureza_os, 'INTERNA');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

after(async () => { await pool.end(); });
