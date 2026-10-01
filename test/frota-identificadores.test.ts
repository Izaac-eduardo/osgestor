import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { findFleetIdWithAliasPrecedence, findFleetIdWithAliases } from '../src/imports/poli-os.js';
import { normalizeExternalFleetIdentifier, POLIFROTA_ORIGIN, VEGA_ORIGIN } from '../src/services/frota-identificadores.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
});

test('normaliza identificadores externos sem colapsar caracteres alfanuméricos', () => {
  for (const value of ['416F2', 'af4000ii', '3CX', '3CX2', '950L', 'CS54B', '920']) {
    assert.equal(normalizeExternalFleetIdentifier(`  ${value.toLowerCase()}  `), value.toUpperCase());
  }
  assert.equal(normalizeExternalFleetIdentifier(' HC110 2 '), 'HC110 2');
  assert.equal(normalizeExternalFleetIdentifier('hc110-2'), 'HC110 2');
  assert.equal(normalizeExternalFleetIdentifier('HC110   2'), 'HC110 2');
  assert.notEqual(normalizeExternalFleetIdentifier('HC1102'), normalizeExternalFleetIdentifier('HC110 2'));
});

test('matching reúne código, placa e alias e falha em colisões', () => {
  const fleets = [
    { id: 'a', codigo: 'RE02', placa: null },
    { id: 'b', codigo: 'PA03', placa: 'ABC1D23' },
  ];
  const aliases = [
    { frota_id: 'a', origem: 'POLIFROTA', identificador_normalizado: '416F2' },
    { frota_id: 'a', origem: 'POLIFROTA', identificador_normalizado: 'MESMO' },
    { frota_id: 'b', origem: 'POLIFROTA', identificador_normalizado: 'OUTRO' },
  ];
  assert.equal(findFleetIdWithAliases('RE02', fleets, aliases), 'a');
  assert.equal(findFleetIdWithAliases('ABC1D23', fleets, aliases), 'b');
  assert.equal(findFleetIdWithAliases('416F2', fleets, aliases), 'a');
  assert.equal(findFleetIdWithAliases('MESMO', fleets, aliases), 'a');
  assert.equal(findFleetIdWithAliases('NAO-EXISTE', fleets, aliases), undefined);
  assert.equal(findFleetIdWithAliases('RE02', fleets, [...aliases, { frota_id: 'b', origem: 'POLIFROTA', identificador_normalizado: 'RE02' }]), undefined);
  assert.equal(findFleetIdWithAliases('OUTRO', fleets, [...aliases, { frota_id: 'a', origem: 'POLIFROTA', identificador_normalizado: 'OUTRO' }]), undefined);
  assert.equal(findFleetIdWithAliases('MESMO', fleets, [...aliases, { frota_id: 'b', origem: 'OUTRA', identificador_normalizado: 'MESMO' }]), 'a');
});

test('matching Vega usa somente aliases VEGA e mantém ausência segura', () => {
  const fleets = [{ id: 'a', codigo: 'RE09', placa: null }, { id: 'b', codigo: 'RC16', placa: null }];
  const aliases = [
    { frota_id: 'a', origem: VEGA_ORIGIN, identificador_normalizado: '416 3' },
    { frota_id: 'b', origem: POLIFROTA_ORIGIN, identificador_normalizado: 'CB7 4' },
  ];
  assert.equal(findFleetIdWithAliases('416 3', fleets, aliases, VEGA_ORIGIN), 'a');
  assert.equal(findFleetIdWithAliases('CB7 4', fleets, aliases, VEGA_ORIGIN), undefined);
  assert.equal(findFleetIdWithAliases('CW34 6', fleets, [], VEGA_ORIGIN), undefined);
});

test('matching por precedência usa VEGA, fallback POLIFROTA e bloqueia ausência', () => {
  const fleets = [{ id: 'a', codigo: 'RE09', placa: null }, { id: 'b', codigo: 'RC16', placa: null }];
  const vega = { frota_id: 'a', origem: VEGA_ORIGIN, identificador_normalizado: 'MESMO' };
  const poli = { frota_id: 'b', origem: POLIFROTA_ORIGIN, identificador_normalizado: 'OUTRO' };
  assert.equal(findFleetIdWithAliasPrecedence('MESMO', fleets, [vega, poli]), 'a');
  assert.equal(findFleetIdWithAliasPrecedence('OUTRO', fleets, [poli]), 'b');
  assert.equal(findFleetIdWithAliasPrecedence('NENHUM', fleets, [vega, poli]), undefined);
  assert.equal(findFleetIdWithAliasPrecedence('MESMO', fleets, [vega, { ...poli, identificador_normalizado: 'MESMO' }]), 'a');
  assert.equal(findFleetIdWithAliasPrecedence('MESMO', fleets, [vega, { frota_id: 'b', origem: VEGA_ORIGIN, identificador_normalizado: 'MESMO' }]), undefined);
});

test('migration 019 aplica unicidade por origem e permite a mesma chave em origens diferentes', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fleet = (await client.query<{ id: string }>('SELECT id FROM frotas ORDER BY codigo LIMIT 1')).rows[0];
    assert.ok(fleet);
    const identifier = `H3-TEST-${Date.now()}`;
    await client.query('INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado) VALUES($1,$2,$3,$4)', [fleet.id, 'POLIFROTA', identifier, identifier]);
    await client.query('SAVEPOINT duplicate_alias');
    await assert.rejects(client.query('INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado) VALUES($1,$2,$3,$4)', [fleet.id, 'POLIFROTA', identifier, identifier]));
    await client.query('ROLLBACK TO SAVEPOINT duplicate_alias');
    await client.query('INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado) VALUES($1,$2,$3,$4)', [fleet.id, 'OUTRA', identifier, identifier]);
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

after(async () => { await pool.end(); });
