import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pool } from '../../src/config/database.js';
import { app } from '../../src/app.js';

test('HTTP: CRUD de frotas terceiras, filtros e validações em schema isolado', async () => {
  const schema = 'test_frotas_terceiras_' + randomUUID().replace(/-/g, '');
  let server: Server | undefined;
  let schemaCreated = false;
  const previousOptions = pool.options.options;
  pool.options.options = ((previousOptions ?? '') + ' -c search_path=' + schema + ',public').trim();
  try {
    const setup = await pool.connect();
    try {
      await setup.query('BEGIN');
      await setup.query('CREATE SCHEMA ' + schema);
      for (const name of ['001_create_oficina_schema.sql', '002_create_servicos_os_execucoes.sql', '003_create_frotas.sql', '004_validate_frotas_prefixos.sql', '005_frotas_codigo_livre.sql', '010_create_abastecimentos_schema.sql', '013_create_abastecimento_frotas_terceiras.sql']) {
        const sql = await readFile(__dirname + '/../migrations/' + name, 'utf8');
        await setup.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, ''));
      }
      await setup.query('COMMIT'); schemaCreated = true;
    } catch (error) { await setup.query('ROLLBACK'); throw error; } finally { setup.release(); }

    const terceiro = (await pool.query("INSERT INTO abastecimento_terceiros(nome,status) VALUES ('PLANURB','ATIVO') RETURNING id")).rows[0]!.id;
    const outroTerceiro = (await pool.query("INSERT INTO abastecimento_terceiros(nome,status) VALUES ('2T','ATIVO') RETURNING id")).rows[0]!.id;
    const inactive = (await pool.query("INSERT INTO abastecimento_terceiros(nome,status) VALUES ('INATIVO','INATIVO') RETURNING id")).rows[0]!.id;
    server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const request = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };

    const withoutThird = await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: ' abc1d23 ', tipo: 'PLACA', terceiro_id: null });
    assert.equal(withoutThird.status, 201); assert.equal(withoutThird.body.identificacao, 'ABC1D23'); assert.equal(withoutThird.body.identificacao_normalizada, 'ABC1D23'); assert.equal(withoutThird.body.terceiro_id, null); assert.equal(withoutThird.body.terceiro_nome, null);
    const firstId = withoutThird.body.id; const firstCreatedAt = withoutThird.body.created_at;
    const withThird = await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: 'AZT5H05', tipo: 'PLACA', terceiro_id: terceiro, status: 'ATIVO' });
    assert.equal(withThird.status, 201); assert.equal(withThird.body.terceiro_id, terceiro); assert.equal(withThird.body.terceiro_nome, 'PLANURB');
    const equipment = await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: ' EHC01 ', tipo: 'EQUIPAMENTO' });
    assert.equal(equipment.status, 201); assert.equal(equipment.body.identificacao, 'EHC01');
    const other = await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: 'CAMINHAO01', tipo: 'OUTRO', terceiro_id: outroTerceiro });
    assert.equal(other.status, 201);

    assert.equal((await request('/abastecimento/frotas-terceiras')).body.length, 4);
    assert.equal((await request('/abastecimento/frotas-terceiras?busca=abc1d23')).body.length, 1);
    assert.equal((await request('/abastecimento/frotas-terceiras?tipo=EQUIPAMENTO')).body.length, 1);
    assert.equal((await request('/abastecimento/frotas-terceiras?terceiro_id=' + terceiro)).body.length, 1);
    assert.equal((await request('/abastecimento/frotas-terceiras?sem_terceiro=true')).body.length, 2);
    assert.equal((await request('/abastecimento/frotas-terceiras?sem_terceiro=false')).body.length, 4);
    assert.equal((await request('/abastecimento/frotas-terceiras?sem_terceiro=sim')).status, 400);

    const fetched = await request('/abastecimento/frotas-terceiras/' + firstId);
    assert.equal(fetched.status, 200); assert.equal(fetched.body.id, firstId);
    const edited = await request('/abastecimento/frotas-terceiras/' + firstId, 'PUT', { identificacao: 'ABC1D23', tipo: 'PLACA', terceiro_id: terceiro, status: 'ATIVO' });
    assert.equal(edited.status, 200); assert.equal(edited.body.id, firstId); assert.equal(edited.body.created_at, firstCreatedAt); assert.equal(edited.body.terceiro_nome, 'PLANURB');
    const swapped = await request('/abastecimento/frotas-terceiras/' + firstId, 'PUT', { identificacao: 'ABC1D23', tipo: 'PLACA', terceiro_id: outroTerceiro, status: 'ATIVO' });
    assert.equal(swapped.status, 200); assert.equal(swapped.body.terceiro_id, outroTerceiro);
    const unlinked = await request('/abastecimento/frotas-terceiras/' + firstId, 'PUT', { identificacao: 'ABC1D23', tipo: 'PLACA', terceiro_id: null, status: 'ATIVO' });
    assert.equal(unlinked.status, 200); assert.equal(unlinked.body.terceiro_id, null);
    assert.equal((await request('/abastecimento/frotas-terceiras/' + firstId + '/status', 'PATCH', { status: 'INATIVO' })).body.status, 'INATIVO');

    assert.equal((await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: 'abc1d23', tipo: 'PLACA' })).status, 409);
    assert.equal((await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: 'NEW01', tipo: 'PLACA', terceiro_id: randomUUID() })).status, 404);
    assert.equal((await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: 'NEW02', tipo: 'PLACA', terceiro_id: 'id-invalido' })).status, 400);
    assert.equal((await request('/abastecimento/frotas-terceiras', 'POST', { identificacao: 'NEW03', tipo: 'PLACA', terceiro_id: inactive })).status, 404);
    assert.equal((await request('/abastecimento/frotas-terceiras/not-uuid')).status, 400);
    assert.equal((await request('/abastecimento/frotas-terceiras/' + randomUUID())).status, 404);
    assert.equal((await request('/abastecimento/frotas-terceiras/' + firstId, 'PUT', { identificacao: ' ', tipo: 'PLACA' })).status, 400);
    assert.equal((await request('/abastecimento/frotas-terceiras/' + firstId + '/status', 'PATCH', { status: 'INVALIDO' })).status, 400);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    pool.options.options = previousOptions;
    if (schemaCreated) { await pool.query('SET search_path TO public'); await pool.query('DROP SCHEMA ' + schema + ' CASCADE'); }
    await pool.end();
  }
});
