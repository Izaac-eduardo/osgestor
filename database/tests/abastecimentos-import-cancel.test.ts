import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pool } from '../../src/config/database.js';
import { app } from '../../src/app.js';

test('HTTP: cancelamento lógico de importação PoliFrota', async () => {
  const schema = 'test_import_cancel_' + randomUUID().replace(/-/g, '');
  let server: Server | undefined;
  let schemaCreated = false;
  const previousOptions = pool.options.options;
  pool.options.options = ((previousOptions ?? '') + ' -c search_path=' + schema + ',public').trim();
  try {
    const setup = await pool.connect();
    try {
      await setup.query('BEGIN');
      await setup.query('CREATE SCHEMA ' + schema);
      for (const name of ['001_create_oficina_schema.sql', '002_create_servicos_os_execucoes.sql', '003_create_frotas.sql', '004_validate_frotas_prefixos.sql', '005_frotas_codigo_livre.sql', '010_create_abastecimentos_schema.sql', '012_create_abastecimento_substituicoes.sql']) {
        const sql = await readFile(__dirname + '/../migrations/' + name, 'utf8');
        await setup.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, ''));
      }
      await setup.query('COMMIT');
      schemaCreated = true;
    } catch (error) { await setup.query('ROLLBACK'); throw error; } finally { setup.release(); }

    const pendingId = randomUUID();
    const completedId = randomUUID();
    await pool.query("INSERT INTO abastecimento_importacoes(id,arquivo_nome,arquivo_sha256,origem_sistema,status,parser_versao) VALUES ($1,'ABAST0312.xlsx',repeat('a',64),'POLIFROTA','PREVIA','test'),($2,'confirmado.xlsx',repeat('b',64),'POLIFROTA','CONCLUIDA','test')", [pendingId, completedId]);
    const payload = { identificador_externo: 'linha-1', status_preview: 'PENDENTE_OBRA', pendencias: { obra: true, destinatario: true, motivos: ['OBRA_PENDENTE'] } };
    await pool.query("INSERT INTO abastecimento_importacao_itens(importacao_id,identificador_externo,linha_original,planilha,payload_original,payload_normalizado,status_preview,pendencias) VALUES ($1,'linha-1',1,'Plan1', $2, $2, 'PENDENTE_OBRA', $3)", [pendingId, JSON.stringify(payload), JSON.stringify(payload.pendencias)]);

    server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const request = async (path: string, method = 'GET') => {
      const response = await fetch(base + path, { method });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };

    const listed = await request('/abastecimento/importacoes/polifrota/em-andamento');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.some((item: { id: string }) => item.id === pendingId), true);

    const canceled = await request('/abastecimento/importacoes/' + pendingId + '/cancelar', 'PATCH');
    assert.equal(canceled.status, 200);
    assert.equal(canceled.body.status, 'CANCELADA');
    assert.equal((await pool.query('SELECT status FROM abastecimento_importacoes WHERE id=$1', [pendingId])).rows[0].status, 'CANCELADA');
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM abastecimento_importacao_itens WHERE importacao_id=$1', [pendingId])).rows[0].total, 1);
    assert.equal((await request('/abastecimento/importacoes/polifrota/em-andamento')).body.some((item: { id: string }) => item.id === pendingId), false);
    assert.equal((await request('/abastecimento/importacoes/' + pendingId)).status, 409);
    assert.equal((await request('/abastecimento/importacoes/' + pendingId + '/cancelar', 'PATCH')).status, 409);
    assert.equal((await request('/abastecimento/importacoes/' + completedId + '/cancelar', 'PATCH')).status, 409);
    assert.equal((await request('/abastecimento/importacoes/not-uuid/cancelar', 'PATCH')).status, 400);
    assert.equal((await request('/abastecimento/importacoes/' + randomUUID() + '/cancelar', 'PATCH')).status, 404);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    pool.options.options = previousOptions;
    if (schemaCreated) { await pool.query('SET search_path TO public'); await pool.query('DROP SCHEMA ' + schema + ' CASCADE'); }
    await pool.end();
  }
});
