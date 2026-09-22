import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog } from './support/fixtures.js';

test('histórico consulta fixtures confirmadas com summary, paginação e filtros', async () => {
  const c = await testCatalog(); const ids: string[] = [];
  for (let i = 0; i < 26; i++) {
    const type = i === 25 ? 'ESPECIAL' : 'FROTA';
    const result = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,destinacao_especial_id,identificacao_original,placa_original,frota_original,litros,valor_total,km_hr,horimetro,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'historico-fixture.xlsx','{}') RETURNING id`, [`HIST-${i}`, `2026-09-${String((i % 9) + 1).padStart(2, '0')} 07:00`, c.product.id, c.obra.id, type, type === 'FROTA' ? c.fleet.id : null, type === 'ESPECIAL' ? c.special.id : null, type === 'FROTA' ? c.fleet.codigo : c.special.codigo, type === 'FROTA' ? c.fleet.placa : null, type === 'FROTA' ? c.fleet.codigo : null, 10 + i, 100 + i, i, i]);
    ids.push(result.rows[0]!.id);
  }
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/abastecimento/historico?limit=25`); assert.equal(response.status, 200); const all = await response.json() as { items: Array<{ data_hora: string; horimetro: number | null }>; summary: { quantidade: number; total_litros: number; total_valor: number }; pagination: { total: number; total_pages: number; limit: number } };
    assert.equal(all.items.length, 25); assert.deepEqual(all.summary, { quantidade: 26, total_litros: 585, total_valor: 2925 }); assert.deepEqual(all.pagination, { page: 1, limit: 25, total: 26, total_pages: 2 }); assert.ok(all.items.every((item, index) => index === 0 || new Date(all.items[index - 1]!.data_hora).getTime() >= new Date(item.data_hora).getTime())); assert.ok(all.items.every(item => Object.hasOwn(item, 'horimetro')));
    const obraResponse = await fetch(`${base}/abastecimento/historico?obra_id=${c.obra.id}`); const obraBody = await obraResponse.json() as { items: unknown[]; summary: { quantidade: number } }; assert.equal(obraResponse.status, 200); assert.equal(obraBody.items.length, 26); assert.equal(obraBody.summary.quantidade, 26);
    const fleet = await (await fetch(`${base}/abastecimento/historico?busca=TST01`)).json() as { items: Array<{ destinatario: string; placa: string }> }; assert.ok(fleet.items.some(item => item.destinatario === 'TST01' && item.placa === 'TST0101'));
    const special = await (await fetch(`${base}/abastecimento/historico?busca=PIRULITO&tipo_destinatario=ESPECIAL`)).json() as { items: Array<{ destinatario: string; tipo_destinatario: string }> }; assert.ok(special.items.some(item => item.destinatario === 'PIRULITO' && item.tipo_destinatario === 'ESPECIAL'));
    const injection = await fetch(`${base}/abastecimento/historico?busca=%25%27%20OR%201%3D1%20--`); assert.equal((await injection.json()).summary.quantidade, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])', [ids]); }
});
