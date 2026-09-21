import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';

type Json = Record<string, any> | any[];

const request = async (base: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) as Json : null;
  return { response, body };
};

test('Fase 4: CRUD operacional, compatibilidade e entradas de abastecimento', async () => {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const pointCode = `T4_${suffix}`;
  const thirdCode = `T4T_${suffix}`;
  const specialCode = `T4S_${suffix}`;
  let pointId: string | undefined;
  let thirdId: string | undefined;
  let specialId: string | undefined;
  const entryIds: string[] = [];

  try {
    const productsResult = await request(base, '/abastecimento/produtos');
    assert.equal(productsResult.response.status, 200);
    assert.ok(Array.isArray(productsResult.body));
    const products = productsResult.body as any[];
    const s500 = products.find(product => product.codigo === 'DIESEL_S500');
    const s10 = products.find(product => product.codigo === 'DIESEL_S10');
    const arla = products.find(product => product.codigo === 'ARLA_32');
    assert.ok(s500 && s10 && arla);

    const pointResult = await request(base, '/abastecimento/pontos', {
      method: 'POST',
      body: JSON.stringify({ codigo: pointCode.toLowerCase(), nome: 'Ponto de teste Fase 4', tipo: 'POSTO' }),
    });
    assert.equal(pointResult.response.status, 201);
    pointId = pointResult.body.id;
    assert.equal(pointResult.body.codigo, pointCode);

    const duplicatePoint = await request(base, '/abastecimento/pontos', {
      method: 'POST',
      body: JSON.stringify({ codigo: pointCode, nome: 'Duplicado', tipo: 'POSTO' }),
    });
    assert.equal(duplicatePoint.response.status, 409);

    const invalidFleetPoint = await request(base, '/abastecimento/pontos', {
      method: 'POST',
      body: JSON.stringify({ codigo: `T4F_${suffix}`, nome: 'Frota inválida', tipo: 'COMBOIO', frota_id: '00000000-0000-4000-8000-000000000000' }),
    });
    assert.equal(invalidFleetPoint.response.status, 404);

    const compatibility = await request(base, `/abastecimento/pontos/${pointId}/produtos`, {
      method: 'PUT',
      body: JSON.stringify({ produto_ids: [s500.id] }),
    });
    assert.equal(compatibility.response.status, 200);
    assert.equal(compatibility.body.length, 1);
    assert.equal(compatibility.body[0].codigo, 'DIESEL_S500');

    const thirdResult = await request(base, '/abastecimento/terceiros', {
      method: 'POST',
      body: JSON.stringify({ codigo: thirdCode.toLowerCase(), nome: 'Terceiro de teste' }),
    });
    assert.equal(thirdResult.response.status, 201);
    thirdId = thirdResult.body.id;
    assert.equal(thirdResult.body.codigo, thirdCode);
    const thirdUpdate = await request(base, `/abastecimento/terceiros/${thirdId}`, {
      method: 'PUT',
      body: JSON.stringify({ codigo: thirdCode, nome: 'Terceiro editado', documento: '123', status: 'ATIVO' }),
    });
    assert.equal(thirdUpdate.response.status, 200);
    assert.equal(thirdUpdate.body.nome, 'Terceiro editado');

    const specialResult = await request(base, '/abastecimento/destinacoes-especiais', {
      method: 'POST',
      body: JSON.stringify({ codigo: specialCode.toLowerCase(), nome: 'Especial de teste' }),
    });
    assert.equal(specialResult.response.status, 201);
    specialId = specialResult.body.id;
    assert.equal(specialResult.body.codigo, specialCode);

    const baseEntry = { data_entrada: '2026-09-20', produto_id: s500.id, valor_total_nf: '100.00', observacoes: 'teste' };
    const noDestination = await request(base, '/abastecimento/entradas', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-A`, litros_nf: '10.125', destinos: [] }),
    });
    assert.equal(noDestination.response.status, 201);
    entryIds.push(noDestination.body.id);
    assert.equal(noDestination.body.litros_nf, 10.125);
    assert.equal(noDestination.body.total_distribuido, 0);
    assert.equal('diferenca' in noDestination.body, false);

    const withDestination = await request(base, '/abastecimento/entradas', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-B`, litros_nf: '10.125', destinos: [{ ponto_id: pointId, litros: '4.500' }] }),
    });
    assert.equal(withDestination.response.status, 201);
    entryIds.push(withDestination.body.id);
    assert.equal(withDestination.body.total_distribuido, 4.5);
    assert.equal(withDestination.body.destinos.length, 1);

    const overDistributed = await request(base, '/abastecimento/entradas', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-C`, litros_nf: '1.000', destinos: [{ ponto_id: pointId, litros: '2.000' }] }),
    });
    assert.equal(overDistributed.response.status, 201);
    entryIds.push(overDistributed.body.id);
    assert.equal(overDistributed.body.total_distribuido, 2);

    const s10Entry = await request(base, '/abastecimento/entradas', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-S10`, produto_id: s10.id, litros_nf: '3.000', destinos: [] }),
    });
    assert.equal(s10Entry.response.status, 201);
    entryIds.push(s10Entry.body.id);
    assert.equal(s10Entry.body.numero_nf, `NF-${suffix}-S10`);

    const arlaDestination = await request(base, '/abastecimento/entradas', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-D`, produto_id: arla.id, litros_nf: '2.000', destinos: [{ ponto_id: pointId, litros: '1.000' }] }),
    });
    assert.equal(arlaDestination.response.status, 400);

    const incompatible = await request(base, '/abastecimento/entradas', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-E`, produto_id: s10.id, litros_nf: '2.000', destinos: [{ ponto_id: pointId, litros: '1.000' }] }),
    });
    assert.equal(incompatible.response.status, 400);

    const filtered = await request(base, `/abastecimento/entradas?ponto_id=${pointId}`);
    assert.equal(filtered.response.status, 200);
    assert.equal(filtered.body.length, 2);

    const updated = await request(base, `/abastecimento/entradas/${entryIds[0]}`, {
      method: 'PUT',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-A2`, litros_nf: '11.000', destinos: [{ ponto_id: pointId, litros: '3.000' }] }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.total_distribuido, 3);

    const deleted = await request(base, `/abastecimento/entradas/${entryIds[1]}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 204);
    const deletedDetail = await request(base, `/abastecimento/entradas/${entryIds[1]}`);
    assert.equal(deletedDetail.response.status, 404);

    const badDecimal = await request(base, '/abastecimento/entradas', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, numero_nf: `NF-${suffix}-F`, litros_nf: '1.1234', destinos: [] }),
    });
    assert.equal(badDecimal.response.status, 400);
  } finally {
    for (const entryId of entryIds) {
      await request(base, `/abastecimento/entradas/${entryId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (pointId) {
      await request(base, `/abastecimento/pontos/${pointId}/produtos`, { method: 'PUT', body: JSON.stringify({ produto_ids: [] }) }).catch(() => undefined);
      await request(base, `/abastecimento/pontos/${pointId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (thirdId) await request(base, `/abastecimento/terceiros/${thirdId}`, { method: 'DELETE' }).catch(() => undefined);
    if (specialId) await request(base, `/abastecimento/destinacoes-especiais/${specialId}`, { method: 'DELETE' }).catch(() => undefined);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
