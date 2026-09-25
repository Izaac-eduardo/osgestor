import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/config/database.js';
import { listAbastecimentosHistorico } from '../../src/services/abastecimentos-historico.service.js';

test('Histórico pesquisa por identificador externo exato e preserva filtros e paginação', async () => {
  const schema = 'test_abastecimentos_historico_' + randomUUID().replace(/-/g, '');
  let schemaCreated = false;
  const previousOptions = pool.options.options;
  pool.options.options = ((previousOptions ?? '') + ' -c search_path=' + schema + ',public').trim();
  try {
    const setup = await pool.connect();
    try {
      await setup.query('BEGIN');
      await setup.query('CREATE SCHEMA ' + schema);
      for (const name of ['001_create_oficina_schema.sql', '003_create_frotas.sql', '004_validate_frotas_prefixos.sql', '005_frotas_codigo_livre.sql', '010_create_abastecimentos_schema.sql', '012_create_abastecimento_substituicoes.sql']) {
        const sql = await readFile(__dirname + '/../migrations/' + name, 'utf8');
        await setup.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, ''));
      }
      await setup.query('COMMIT');
      schemaCreated = true;
    } catch (error) { await setup.query('ROLLBACK'); throw error; } finally { setup.release(); }

    const obra = (await pool.query("INSERT INTO obras(codigo,nome) VALUES ('HIST','Histórico teste') RETURNING id")).rows[0]!.id;
    const produto = (await pool.query("INSERT INTO abastecimento_produtos(codigo,nome,tipo,permite_abastecimento) VALUES ('DIESEL','Diesel','DIESEL',true) RETURNING id")).rows[0]!.id;
    const insert = async (identificador: string, tipo = 'EXTERNA') => (await pool.query(`INSERT INTO abastecimentos(origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('POLIFROTA',$1,'2026-09-25 10:00',$2,$3,$4,'POSTO',10,100,'teste.xlsx','{}') RETURNING id`, [identificador, produto, obra, tipo])).rows[0]!.id;
    const principal = await insert('132982');
    await insert('200000');
    await pool.query("INSERT INTO abastecimento_substituicoes(abastecimento_id,origem_sistema,identificador_externo,identificador_principal) VALUES ($1,'POLIFROTA','134159','132982')", [principal]);

    const exact = await listAbastecimentosHistorico({ busca: ' 132982 ', page: '1', limit: '25' });
    assert.deepEqual(exact.items.map(item => item.identificador_externo), ['132982']);
    assert.equal(exact.pagination.total, 1);

    const missing = await listAbastecimentosHistorico({ busca: '999999', page: '1', limit: '25' });
    assert.equal(missing.items.length, 0);
    assert.equal(missing.pagination.total, 0);

    const filtered = await listAbastecimentosHistorico({ busca: '132982', tipo_destinatario: 'FROTA', page: '1', limit: '25' });
    assert.equal(filtered.items.length, 0);

    const paginated = await listAbastecimentosHistorico({ page: '2', limit: '25' });
    assert.equal(paginated.pagination.page, 2);
    assert.equal(paginated.items.length, 0);

    const alias = await listAbastecimentosHistorico({ busca: '134159', page: '1', limit: '25' });
    assert.equal(alias.items.length, 0);

    const injection = await listAbastecimentosHistorico({ busca: "132982' OR 1=1 --", page: '1', limit: '25' });
    assert.equal(injection.items.length, 0);
    await assert.rejects(() => listAbastecimentosHistorico({ page: 'invalida', limit: '25' }), /page deve ser um inteiro positivo/);
  } finally {
    pool.options.options = previousOptions;
    if (schemaCreated) { await pool.query('SET search_path TO public'); await pool.query('DROP SCHEMA ' + schema + ' CASCADE'); }
    await pool.end();
  }
});
