import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';
import { incrementalPreview } from '../src/controllers/importacoes-os.controller.js';
import { pool } from '../src/config/database.js';

test('prévia incremental mantém SEM_ALTERACOES exclusivo e expõe O.S. 46511 corretamente', async () => {
  const request = {
    file: { buffer: readFileSync('C:/Users/User/Downloads/013009OS.XLS'), originalname: '013009OS.XLS' },
    body: {},
  } as never;
  let payload: any;
  let statusCode = 200;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
  } as never;

  await incrementalPreview(request, response);

  assert.equal(statusCode, 200);
  assert.equal(payload.total, 1336);
  assert.equal(payload.counts.SEM_ALTERACOES, 1054);
  assert.equal(payload.counts.STATUS_ALTERADO, 134);
  assert.equal(payload.counts.ITENS_ADICIONADOS, 93);
  assert.equal(payload.counts.ITENS_ALTERADOS, 2);
  assert.equal(payload.counts.NATUREZA_DIVERGENTE, 65);
  assert.equal(payload.counts.REVISAO_MANUAL, 136);
  assert.equal(payload.novosItens, 236);
  assert.equal(payload.itensAmbiguos, 26);

  const order = payload.orders.find((item: any) => item.numeroOs === 46511);
  assert.equal(order.categoria, 'REVISAO_MANUAL');
  assert.equal(order.statusAtual, 'FINALIZADA');
  assert.equal(order.statusPoli, 'FINALIZADA');
  assert.equal(order.naturezaAtual, 'INTERNA');
  assert.equal(order.naturezaPoli, 'INTERNA');
  assert.ok(order.divergencias.length === 0);
  assert.ok(order.alteracoes.some((change: any) => change.tipo === 'PROBLEMA'));
});

after(async () => { await pool.end(); });
