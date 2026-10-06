import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pool } from '../../src/config/database.js';
import { getDashboard } from '../../src/services/dashboard.service.js';

test('dashboard agrega cards, rankings, natureza, horas e filtros sem duplicar O.S.', async () => {
  const schema = `test_dashboard_${randomUUID().replace(/-/g, '')}`;
  let created = false;
  const previousOptions = pool.options.options;
  pool.options.options = `${previousOptions ?? ''} -c search_path=${schema},public`.trim();
  try {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query(`CREATE SCHEMA ${schema}`);
      for (const name of ['001_create_oficina_schema.sql', '002_create_servicos_os_execucoes.sql', '003_create_frotas.sql', '004_validate_frotas_prefixos.sql', '005_frotas_codigo_livre.sql', '007_execucoes_gerais_os.sql', '018_add_classificacao_servicos_os.sql', '021_add_valor_total_original_produtos.sql']) {
        const sql = await readFile(`database/migrations/${name}`, 'utf8');
        await connection.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, ''));
      }
      await connection.query('COMMIT'); created = true;
    } catch (error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }

    const obra = (await pool.query("INSERT INTO obras(codigo,nome) VALUES ('DASH-OBRA','Dashboard') RETURNING id")).rows[0]!.id;
    const prefixo = (await pool.query("INSERT INTO prefixos_frota(codigo,descricao) VALUES ('DB','Dashboard') RETURNING id")).rows[0]!.id;
    const employee = (await pool.query("INSERT INTO funcionarios(nome,matricula) VALUES ('Funcionário Dashboard','DB-1') RETURNING id")).rows[0]!.id;
    const insertOrder = async (numero: number, natureza: string, categoria: string | null, status: string) => (await pool.query("INSERT INTO ordens_servico(numero_os,obra_id,prefixo_frota_id,frota_numero,natureza_os,categoria_servico,data_abertura,status) VALUES ($1,$2,$3,1,$4,$5,'2026-10-06',$6) RETURNING id", [numero, obra, prefixo, natureza, categoria, status])).rows[0]!.id;
    const internal = await insertOrder(97001, 'INTERNA', 'MECANICA', 'FINALIZADA');
    const third = await insertOrder(97002, 'TERCEIRO', 'MECANICA', 'FINALIZADA');
    const material = await insertOrder(97003, 'MATERIAL', 'OUTROS', 'FINALIZADA');
    await insertOrder(97004, 'INTERNA', null, 'ABERTA');
    const cancelled = await insertOrder(97005, 'TERCEIRO', 'MECANICA', 'CANCELADA');
    const service = (await pool.query("INSERT INTO servicos_os(ordem_servico_id,descricao,valor) VALUES ($1,'INTERNO',100),($2,'TERCEIRO',200),($3,'CANCELADO',500) RETURNING id", [internal, third, cancelled])).rows;
    await pool.query("INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario,valor_total_original) VALUES ($1,'MATERIAL',2,'UN',50,80)", [material]);
    await pool.query("INSERT INTO servicos_os_execucoes(ordem_servico_id,servico_os_id,funcionario_id,inicio,fim) VALUES ($1,$2,$3,'2026-10-06 08:00','2026-10-06 09:30')", [internal, service[0]!.id, employee]);

    const dashboard = await getDashboard({ data_inicio: '2026-10-01', data_fim: '2026-10-06' });
    assert.equal(dashboard.resumo.total_os, 5);
    assert.equal(dashboard.resumo.produtos, 80);
    assert.equal(dashboard.resumo.produtos_os, 1);
    assert.equal(dashboard.resumo.interna, 100);
    assert.equal(dashboard.resumo.interna_os, 2);
    assert.equal(dashboard.resumo.terceiros, 200);
    assert.equal(dashboard.resumo.terceiros_os, 1);
    assert.equal(dashboard.categorias.find(row => row.categoria === 'MECANICA')?.quantidade, 3);
    assert.equal(dashboard.top_frotas.length, 1);
    assert.equal(dashboard.naturezas.find(row => row.natureza === 'MATERIAL')?.gasto, 80);
    assert.equal(dashboard.horas_funcionarios[0]?.minutos, 90);
    assert.equal(dashboard.os_por_dia.length, 6);

    const filtered = await getDashboard({ data_inicio: '2026-10-01', data_fim: '2026-10-06', status: 'ABERTA', categoria_servico: 'MECANICA', frota_codigo: 'DB1' });
    assert.equal(filtered.resumo.total_os, 0);
    const obraFiltered = await getDashboard({ data_inicio: '2026-10-01', data_fim: '2026-10-06', obra_id: obra, natureza_os: 'TERCEIRO' });
    assert.equal(obraFiltered.resumo.total_os, 2);
  } finally {
    pool.options.options = previousOptions;
    if (created) { await pool.query('SET search_path TO public'); await pool.query(`DROP SCHEMA ${schema} CASCADE`); }
    await pool.end();
  }
});
