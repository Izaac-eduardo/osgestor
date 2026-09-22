import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog } from './support/fixtures.js';

test('relatórios suportam granularidade mensal e produto adicional sem misturar anos', async () => {
  const c = await testCatalog();
  const product = await pool.query<{ id: string }>(`INSERT INTO abastecimento_produtos (codigo,nome,tipo,permite_entrada,permite_distribuicao,permite_abastecimento) VALUES ('TEST_EXTRA_REPORT','Produto sintético de relatório','DIESEL',TRUE,TRUE,TRUE) RETURNING id`);
  const ids: string[] = [];
  for (const date of ['2025-09-20 08:00', '2026-09-09 08:00']) {
    const result = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,'FROTA',$5,$6,10,100,'reports-granularity-fixture.xlsx','{}') RETURNING id`, [`REPORT-GRANULAR-${date}`, date, product.rows[0]!.id, c.obra.id, c.fleet.id, c.fleet.codigo]);
    ids.push(result.rows[0]!.id);
  }
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const daily = await (await fetch(`${base}/abastecimento/relatorios?produto=TEST_EXTRA_REPORT&periodo=dia`)).json() as { evolucao: Array<{ data: string }>; por_produto: Array<{ produto: string; quantidade: number }> };
    assert.deepEqual(daily.evolucao.map(item => item.data), ['2025-09-20', '2026-09-09']);
    assert.deepEqual(daily.por_produto, [{ produto: 'TEST_EXTRA_REPORT', quantidade: 2, litros: 20, valor: 200 }]);
    const monthly = await (await fetch(`${base}/abastecimento/relatorios?produto=TEST_EXTRA_REPORT&periodo=mes`)).json() as { evolucao: Array<{ data: string; quantidade: number; litros: number; valor: number }> };
    assert.deepEqual(monthly.evolucao, [{ data: '2025-09', quantidade: 1, litros: 10, valor: 100 }, { data: '2026-09', quantidade: 1, litros: 10, valor: 100 }]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM abastecimento_produtos WHERE id = $1', [product.rows[0]!.id]);
  }
});
