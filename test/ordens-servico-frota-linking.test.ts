import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import { createOrdemServico, deleteOrdemServico, updateOrdemServico } from '../src/services/ordens-servico.service.js';
import { assertAuthorizedTestDatabase } from './helpers/test-database.js';

const prefixCode = `LNK${randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()}`.slice(0, 10);
const orderIds: string[] = [];
let prefixId: string;
let uniqueFleetId: string;
let ambiguousFleetId: string;
let ambiguousFleetId2: string;
let obraId: string;

before(async () => {
  await assertAuthorizedTestDatabase(pool);
  obraId = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE status='ATIVA' ORDER BY id LIMIT 1")).rows[0]!.id;
  prefixId = (await pool.query<{ id: string }>('INSERT INTO prefixos_frota(codigo,status) VALUES($1,\'ATIVO\') RETURNING id', [prefixCode])).rows[0]!.id;
  uniqueFleetId = (await pool.query<{ id: string }>('INSERT INTO frotas(prefixo_frota_id,numero,codigo,status) VALUES($1,\'8\',$2,\'ATIVO\') RETURNING id', [prefixId, `${prefixCode}8`])).rows[0]!.id;
  ambiguousFleetId2 = (await pool.query<{ id: string }>('INSERT INTO frotas(prefixo_frota_id,numero,codigo,status) VALUES($1,\'7\',$2,\'ATIVO\') RETURNING id', [prefixId, `${prefixCode}7`])).rows[0]!.id;
  ambiguousFleetId = (await pool.query<{ id: string }>('INSERT INTO frotas(prefixo_frota_id,numero,codigo,status) VALUES($1,\'07\',$2,\'ATIVO\') RETURNING id', [prefixId, `${prefixCode}07`])).rows[0]!.id;
});

test('criação e edição resolvem vínculo único e preservam os campos legados', async () => {
  const created = await createOrdemServico({ numero_os: 998100000 + Math.floor(Math.random() * 9999), obra_id: obraId, prefixo_frota_id: prefixId, frota_numero: 8, natureza_os: 'MATERIAL', data_abertura: '2026-11-01', status: 'ABERTA' });
  orderIds.push(created.id);
  assert.equal(created.frota_id, uniqueFleetId);
  assert.equal(created.prefixo_frota_id, prefixId);
  assert.equal(created.frota_numero, 8);

  const updated = await updateOrdemServico(created.id, { numero_os: Number(created.numero_os), obra_id: obraId, prefixo_frota_id: prefixId, frota_numero: 8, natureza_os: 'MATERIAL', data_abertura: '2026-11-01', status: 'ABERTA' });
  assert.equal(updated.frota_id, uniqueFleetId);
  assert.equal(updated.prefixo_frota_id, prefixId);
  assert.equal(updated.frota_numero, 8);
});

test('ausência ou ambiguidade não escolhe frota automaticamente', async () => {
  const missing = await createOrdemServico({ numero_os: 998200000 + Math.floor(Math.random() * 9999), obra_id: obraId, prefixo_frota_id: prefixId, frota_numero: 999, natureza_os: 'MATERIAL', data_abertura: '2026-11-01', status: 'ABERTA' });
  orderIds.push(missing.id);
  assert.equal(missing.frota_id, null);
  assert.equal(missing.prefixo_frota_id, prefixId);
  assert.equal(missing.frota_numero, 999);

  const ambiguous = await createOrdemServico({ numero_os: 998300000 + Math.floor(Math.random() * 9999), obra_id: obraId, prefixo_frota_id: prefixId, frota_numero: 7, natureza_os: 'MATERIAL', data_abertura: '2026-11-01', status: 'ABERTA' });
  orderIds.push(ambiguous.id);
  assert.equal(ambiguous.frota_id, null);
  assert.equal(ambiguous.prefixo_frota_id, prefixId);
  assert.equal(ambiguous.frota_numero, 7);
  assert.ok(ambiguousFleetId);
});

after(async () => {
  if (orderIds.length) await Promise.all(orderIds.map(id => deleteOrdemServico(id)));
  if (uniqueFleetId || ambiguousFleetId || ambiguousFleetId2) await pool.query('DELETE FROM frotas WHERE id=ANY($1::uuid[])', [[uniqueFleetId, ambiguousFleetId, ambiguousFleetId2].filter(Boolean)]);
  if (prefixId) await pool.query('DELETE FROM prefixos_frota WHERE id=$1', [prefixId]);
  await pool.end();
});
