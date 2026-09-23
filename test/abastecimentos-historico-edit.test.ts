import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog } from './support/fixtures.js';

test('edição controlada preserva identidade PoliFrota e altera apenas campos operacionais', async () => {
  const { obra, nextObra, product, fleet } = await testCatalog();
  const external = `TEST-EDIT-${Date.now()}`;
  const inserted = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,placa_original,frota_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('POLIFROTA',$1,'2026-09-21 07:00',$2,$3,'FROTA',$4,$5,$6,$5,10.000,100.0000,'test-edit.xlsx','{}') RETURNING id`, [external, product.id, obra.id, fleet.id, fleet.codigo, fleet.placa || fleet.codigo]);
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/abastecimento/historico/${inserted.rows[0]!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_hora: '2026-09-21T08:30', produto_id: product.id, obra_id: nextObra.id, tipo_destinatario: 'FROTA', frota_id: fleet.id, litros: 12.345, valor_total: 157.7777, km_hr: 0, horimetro: 123.456, identificacao_original: 'IGNORAR', placa_original: 'IGNORAR', frota_original: 'IGNORAR' }) });
    assert.equal(response.status, 200);
    const row = (await pool.query<{ origem_sistema: string; identificador_externo: string; obra_id: string; frota_id: string; identificacao_original: string; placa_original: string; litros: string; valor_total: string; km_hr: string; horimetro: string }>('SELECT origem_sistema,identificador_externo,obra_id,frota_id,identificacao_original,placa_original,litros,valor_total,km_hr,horimetro FROM abastecimentos WHERE id=$1', [inserted.rows[0]!.id])).rows[0]!;
    assert.equal(row.origem_sistema, 'POLIFROTA'); assert.equal(row.identificador_externo, external); assert.equal(row.obra_id, nextObra.id); assert.equal(row.frota_id, fleet.id); assert.equal(row.identificacao_original, fleet.codigo); assert.equal(row.placa_original, fleet.placa || fleet.codigo); assert.equal(Number(row.litros), 12.345); assert.equal(row.valor_total, '157.7777'); assert.equal(Number(row.km_hr), 0); assert.equal(Number(row.horimetro), 123.456);

    for (const value of [157.7, 157.77, 157.777, 157.7777]) {
      const valid = await fetch(`${base}/abastecimento/historico/${inserted.rows[0]!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_hora: '2026-09-21T08:30', produto_id: product.id, obra_id: nextObra.id, tipo_destinatario: 'FROTA', frota_id: fleet.id, litros: 12.345, valor_total: value, km_hr: 0, horimetro: 123.456 }) });
      assert.equal(valid.status, 200);
    }
    const tooPrecise = await fetch(`${base}/abastecimento/historico/${inserted.rows[0]!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_hora: '2026-09-21T08:30', produto_id: product.id, obra_id: nextObra.id, tipo_destinatario: 'FROTA', frota_id: fleet.id, litros: 12.345, valor_total: 157.77777, km_hr: 0, horimetro: 123.456 }) });
    assert.equal(tooPrecise.status, 400);
  } finally { await pool.query('DELETE FROM abastecimentos WHERE id=$1', [inserted.rows[0]!.id]); await new Promise<void>(resolve => server.close(() => resolve())); }
});
