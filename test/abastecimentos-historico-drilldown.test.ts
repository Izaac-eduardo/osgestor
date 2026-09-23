import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog } from './support/fixtures.js';

test('histórico filtra drill-down por identidade, período, produto e mantém resumo global', async () => {
  const c = await testCatalog(); const ids: string[] = [];
  for (let i = 0; i < 26; i++) {
    const result = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,'FROTA',$5,$6,10,100,'historico-drilldown-fixture.xlsx','{}') RETURNING id`, [`DRILL-F-${i}`, `2026-09-${String((i % 9) + 1).padStart(2, '0')} 07:00`, c.product.id, c.obra.id, c.fleet.id, c.fleet.codigo]);
    ids.push(result.rows[0]!.id);
  }
  for (const [index, identification] of ['TST-TERC-01', 'TST-TERC-02'].entries()) {
    const result = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,terceiro_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,'TERCEIRO',$5,$6,20,200,'historico-drilldown-fixture.xlsx','{}') RETURNING id`, [`DRILL-T-${index}`, `2026-09-${String(index + 10).padStart(2, '0')} 07:00`, c.product.id, c.nextObra.id, c.third.id, identification]);
    ids.push(result.rows[0]!.id);
  }
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const fleet = await (await fetch(`${base}/abastecimento/historico?frota_id=${c.fleet.id}&limit=25`)).json() as { items: unknown[]; summary: { quantidade: number; total_litros: number; total_valor: number }; pagination: { total: number; total_pages: number } };
    assert.deepEqual(fleet.summary, { quantidade: 26, total_litros: 260, total_valor: 2600 }); assert.equal(fleet.items.length, 25); assert.equal(fleet.pagination.total_pages, 2);
    const obra = await (await fetch(`${base}/abastecimento/historico?obra_id=${c.nextObra.id}`)).json() as { summary: { quantidade: number } }; assert.equal(obra.summary.quantidade, 2);
    const third = await (await fetch(`${base}/abastecimento/historico?terceiro_id=${c.third.id}&data_inicio=2026-09-10&data_fim=2026-09-11&produto=DIESEL_S500`)).json() as { summary: { quantidade: number; total_litros: number } }; assert.deepEqual(third.summary, { quantidade: 2, total_litros: 40, total_valor: 400 });
    const empty = await (await fetch(`${base}/abastecimento/historico?frota_id=${c.secondFleet.id}`)).json() as { items: unknown[]; summary: { quantidade: number } }; assert.deepEqual(empty, { items: [], summary: { quantidade: 0, total_litros: 0, total_valor: 0 }, pagination: { page: 1, limit: 50, total: 0, total_pages: 0 } });
    assert.equal((await fetch(`${base}/abastecimento/historico?frota_id=invalid`)).status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])', [ids]); }
});
