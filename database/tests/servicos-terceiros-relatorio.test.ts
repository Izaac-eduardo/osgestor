import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/config/database.js';
import { getOrdensServicoRelatorio } from '../../src/services/relatorios.service.js';
import { exportOrdensServicoPdf } from '../../src/services/ordens-servico-pdf.service.js';

test('relatório de terceiros separa serviço, produto e total sem duplicar valores', async () => {
  const schema = 'test_servicos_terceiros_' + randomUUID().replace(/-/g, '');
  let schemaCreated = false;
  const previousOptions = pool.options.options;
  pool.options.options = ((previousOptions ?? '') + ' -c search_path=' + schema + ',public').trim();
  try {
    const setup = await pool.connect();
    try {
      await setup.query('BEGIN');
      await setup.query('CREATE SCHEMA ' + schema);
      for (const name of ['001_create_oficina_schema.sql', '002_create_servicos_os_execucoes.sql', '003_create_frotas.sql', '004_validate_frotas_prefixos.sql', '005_frotas_codigo_livre.sql', '007_execucoes_gerais_os.sql']) {
        const sql = await readFile(__dirname + '/../migrations/' + name, 'utf8');
        await setup.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, ''));
      }
      await setup.query('COMMIT');
      schemaCreated = true;
    } catch (error) { await setup.query('ROLLBACK'); throw error; } finally { setup.release(); }

    const obra = (await pool.query("INSERT INTO obras(codigo,nome) VALUES ('OBRTEST','Obra teste') RETURNING id")).rows[0]!.id;
    const prefixo = (await pool.query("INSERT INTO prefixos_frota(codigo,descricao) VALUES ('TST','Teste') RETURNING id")).rows[0]!.id;
    const insertOrder = async (numero: number) => (await pool.query("INSERT INTO ordens_servico(numero_os,obra_id,prefixo_frota_id,frota_numero,natureza_os,categoria_servico,data_abertura,status) VALUES ($1,$2,$3,1,'TERCEIRO','OUTROS','2026-09-24','FINALIZADA') RETURNING id", [numero, obra, prefixo])).rows[0]!.id;
    const serviceOnly = await insertOrder(90001);
    const productOnly = await insertOrder(90002);
    const mixed = await insertOrder(90003);
    await pool.query("INSERT INTO servicos_os(ordem_servico_id,descricao,valor) VALUES ($1,'FRETE',500),($2,'ALINHAMENTO',300)", [serviceOnly, mixed]);
    await pool.query("INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario) VALUES ($1,'KIT DE JUNTAS',1,'UN',200),($2,'PNEU',2,'UN',50)", [productOnly, mixed]);

    const report = await getOrdensServicoRelatorio({ natureza_os: 'TERCEIRO' });
    const byNumber = new Map(report.map(order => [Number(order.numero_os), order]));
    assert.deepEqual(byNumber.get(90001)?.servicos.map(item => item.descricao), ['FRETE']);
    assert.equal(byNumber.get(90001)?.produtos.length, 0);
    assert.equal(byNumber.get(90001)?.total_servicos_terceiros, 500);
    assert.equal(byNumber.get(90001)?.total_produtos, 0);
    assert.equal(byNumber.get(90001)?.total_os, 500);
    assert.deepEqual(byNumber.get(90002)?.produtos.map(item => item.descricao), ['KIT DE JUNTAS']);
    assert.equal(byNumber.get(90002)?.total_servicos_terceiros, 0);
    assert.equal(byNumber.get(90002)?.total_produtos, 200);
    assert.equal(byNumber.get(90002)?.total_os, 200);
    assert.deepEqual(byNumber.get(90003)?.servicos.map(item => item.descricao), ['ALINHAMENTO']);
    assert.deepEqual(byNumber.get(90003)?.produtos.map(item => item.descricao), ['PNEU']);
    assert.equal(byNumber.get(90003)?.total_servicos_terceiros, 300);
    assert.equal(byNumber.get(90003)?.total_produtos, 100);
    assert.equal(byNumber.get(90003)?.total_os, 400);

    const pdf = await exportOrdensServicoPdf({ natureza_os: 'TERCEIRO' });
    assert.ok(pdf.length > 0);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  } finally {
    pool.options.options = previousOptions;
    if (schemaCreated) { await pool.query('SET search_path TO public'); await pool.query('DROP SCHEMA ' + schema + ' CASCADE'); }
    await pool.end();
  }
});
