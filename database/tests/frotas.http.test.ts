import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pool } from '../../src/config/database.js';
import { app } from '../../src/app.js';

test('HTTP: CRUD, erros, filtros normalizados e modelos ambíguos em schema exclusivo', async () => {
  const schema = 'test_frotas_http_' + randomUUID().replace(/-/g, '');
  let server: Server | undefined;
  let schemaCreated = false;
  // Startup options isolate every connection without queuing concurrent queries.
  const previousOptions = pool.options.options;
  pool.options.options = ((previousOptions ?? '') + ' -c search_path=' + schema + ',public').trim();
  try {
    const setup = await pool.connect();
    try {
      await setup.query('BEGIN');
      await setup.query('CREATE SCHEMA ' + schema);
      for (const name of ['001_create_oficina_schema.sql', '002_create_servicos_os_execucoes.sql', '003_create_frotas.sql', '004_validate_frotas_prefixos.sql']) {
        const sql = await readFile(__dirname + '/../migrations/' + name, 'utf8');
        await setup.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, ''));
      }
      await setup.query('COMMIT');
      schemaCreated = true;
    } catch (error) { await setup.query('ROLLBACK'); throw error; }
    finally { setup.release(); }
    server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const request = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };
    assert.equal((await request('/frotas', 'POST', { codigo: 'INVALIDO' })).status, 400);
    assert.equal((await request('/frotas/id-invalido')).status, 400);
    const created = await request('/frotas', 'POST', { codigo: 'a-09', placa: 'abc-1234', descricao: 'Automóvel', ano: 2021 });
    assert.equal(created.status, 201); assert.equal(created.body.codigo, 'A09'); assert.equal(created.body.numero, '09'); assert.equal(created.body.placa, 'ABC1234');
    const id = created.body.id;
    assert.equal((await request('/prefixos-frota/' + created.body.prefixo_frota_id, 'PUT', { codigo: 'A1', descricao: null, status: 'ATIVO' })).status, 400);
    assert.equal((await request('/frotas/' + id)).body.codigo, 'A09');
    assert.equal((await request('/frotas', 'POST', { codigo: 'A09' })).status, 409);
    assert.equal((await request('/frotas', 'POST', { codigo: 'CT04', placa: 'ABC1234' })).status, 409);
    assert.equal((await request('/frotas?placa=abc-1234')).body.length, 1);
    assert.equal((await request('/frotas?busca=a-09')).body.length, 1);
    assert.equal((await request('/frotas?busca=abc-1234')).body.length, 1);
    assert.equal((await request('/frotas?busca=%25')).body.length, 0);
    assert.equal((await request('/frotas?status=INVALIDO')).status, 400);
    assert.equal((await request('/frotas/' + id, 'PUT', { codigo: 'A09' })).status, 400);
    const updated = await request('/frotas/' + id, 'PUT', { codigo: 'A-09', descricao: 'Atualizado', placa: 'ABC1234', modelo: 'Gol', ano: 2022, status: 'ATIVO' });
    assert.equal(updated.status, 200); assert.equal(updated.body.numero, '09'); assert.equal(updated.body.ano, 2022);
    assert.equal((await request('/frotas/' + id + '/status', 'PATCH', { status: 'INATIVO' })).body.status, 'INATIVO');
    assert.equal((await request('/frotas?status=ATIVO')).body.length, 0);
    for (const codigo of ['EH03', 'GE01']) assert.equal((await request('/frotas', 'POST', { codigo, modelo: '416 4' })).status, 201);
    assert.equal((await request('/frotas?modelo=416%204')).body.length, 2);
    assert.equal((await request('/frotas?busca=416%204')).body.length, 2);
    assert.equal((await request('/prefixos-frota/' + created.body.prefixo_frota_id, 'DELETE')).status, 409);
    assert.equal((await request('/frotas/' + id, 'DELETE')).status, 204);
    assert.equal((await request('/frotas/' + id)).status, 404);
    assert.equal((await request('/frotas/' + id, 'DELETE')).status, 404);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    pool.options.options = previousOptions;
    if (schemaCreated) {
      assert.match(schema, /^test_frotas_http_[0-9a-f]{32}$/);
      await pool.query('SET search_path TO public');
      await pool.query('DROP SCHEMA ' + schema + ' CASCADE');
    }
    await pool.end();
  }
});