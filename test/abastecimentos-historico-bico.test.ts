import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog, cleanupTestRows } from './support/fixtures.js';

test('histórico filtra por bico, combina filtros, preserva nulos e pagina antes de retornar', async () => {
  const c = await testCatalog();
  const ids: string[] = [];
  assert.equal((await pool.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database, 'oficina_test');
  for (let i = 0; i < 26; i += 1) {
    const result = await pool.query<{ id: string }>(`
      INSERT INTO abastecimentos
        (origem_sistema, identificador_externo, data_hora, produto_id, obra_id, tipo_destinatario,
         frota_id, identificacao_original, placa_original, frota_original, litros, valor_total,
         arquivo_nome_original, payload_original, bico_codigo_original)
      VALUES ('TEST', $1, $2, $3, $4, 'FROTA', $5, $6, $7, $8, 10, 100,
        'historico-bico-fixture.xlsx', '{}', $9)
      RETURNING id
    `, [`BICO-HIST-${i}`, `2026-09-01 07:${String(i).padStart(2, '0')}`, c.product.id, c.obra.id,
      c.fleet.id, c.fleet.codigo, c.fleet.placa, c.fleet.codigo, i === 25 ? null : '21']);
    ids.push(result.rows[0]!.id);
  }
  const other = await pool.query<{ id: string }>(`
    INSERT INTO abastecimentos
      (origem_sistema, identificador_externo, data_hora, produto_id, obra_id, tipo_destinatario,
       frota_id, identificacao_original, placa_original, frota_original, litros, valor_total,
       arquivo_nome_original, payload_original, bico_codigo_original)
    VALUES ('TEST', 'BICO-HIST-OTHER', '2026-09-02 07:00', $1, $2, 'FROTA', $3, $4, $5, $6, 10, 100,
      'historico-bico-fixture.xlsx', '{}', '22')
    RETURNING id
  `, [c.product.id, c.obra.id, c.fleet.id, c.fleet.codigo, c.fleet.placa, c.fleet.codigo]);
  ids.push(other.rows[0]!.id);

  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const bicos = await (await fetch(`${base}/abastecimento/historico/bicos`)).json() as string[];
    assert.ok(bicos.includes('21') && bicos.includes('22'));

    const filtered = await (await fetch(`${base}/abastecimento/historico?bico=21&limit=25`)).json() as { items: Array<{ bico_codigo_original: string | null }>; summary: { quantidade: number }; pagination: { total: number; total_pages: number } };
    assert.equal(filtered.summary.quantidade, 25);
    assert.equal(filtered.pagination.total, 25);
    assert.equal(filtered.pagination.total_pages, 1);
    assert.ok(filtered.items.every(item => item.bico_codigo_original === '21'));

    const combined = await (await fetch(`${base}/abastecimento/historico?bico=21&obra_id=${c.obra.id}&tipo_destinatario=FROTA&limit=25`)).json() as { summary: { quantidade: number } };
    assert.equal(combined.summary.quantidade, 25);

    const nullBico = await (await fetch(`${base}/abastecimento/historico?obra_id=${c.obra.id}&limit=25`)).json() as { summary: { quantidade: number } };
    assert.equal(nullBico.summary.quantidade, 27);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await cleanupTestRows(ids);
  }
});
