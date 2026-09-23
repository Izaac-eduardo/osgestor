import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';

test('relatório de entradas agrega sem duplicar NF e destinos', async () => {
  const products = (await pool.query<{ id: string; codigo: string }>(`SELECT id,codigo FROM abastecimento_produtos WHERE codigo IN ('DIESEL_S500','ARLA_32') ORDER BY codigo`)).rows;
  const points = (await pool.query<{ id: string; codigo: string }>(`SELECT id,codigo FROM abastecimento_pontos WHERE codigo IN ('CC01','CC02','POSTO') ORDER BY codigo`)).rows;
  const product = (code: string) => products.find(item => item.codigo === code)!.id;
  const point = (code: string) => points.find(item => item.codigo === code)!.id;
  const entries: string[] = [];
  const insert = async (external: string, date: string, productId: string, liters: number, value: number, nf: string) => { const row = (await pool.query<{ id: string }>(`INSERT INTO abastecimento_entradas(data_entrada,numero_nf,produto_id,litros_nf,valor_total_nf) VALUES($1,$2,$3,$4,$5) RETURNING id`, [date, nf, productId, liters, value])).rows[0]!; entries.push(row.id); return row.id; };
  const first = await insert('ENTRADA-REPORT-1', '2025-09-10', product('DIESEL_S500'), 1000, 100, 'NF-REPETIDA');
  const second = await insert('ENTRADA-REPORT-2', '2026-09-10', product('DIESEL_S500'), 2000, 200, 'NF-REPETIDA');
  await insert('ENTRADA-REPORT-3', '2026-09-11', product('ARLA_32'), 300, 30, 'NF-ARLA');
  await pool.query(`INSERT INTO abastecimento_entrada_destinos(entrada_id,ponto_id,litros) VALUES ($1,$2,400),($1,$3,300),($4,$5,500)`, [first, point('CC01'), point('CC02'), second, point('POSTO')]);
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const all = await (await fetch(`${base}/abastecimento/relatorios/entradas`)).json() as { summary: { entradas: number; litros_nf: number; valor_nf: number }; por_produto: Array<{ produto: string; quantidade: number }>; por_ponto: Array<{ codigo: string; litros: number }>; evolucao: Array<{ periodo: string }>; items: Array<{ destinos: unknown[] }>; pagination: { total: number; total_pages: number } };
    assert.deepEqual(all.summary, { entradas: 3, litros_nf: 3300, valor_nf: 330 });
    assert.deepEqual(all.por_produto.map(item => [item.produto, item.quantidade]), [['DIESEL_S500', 2], ['ARLA_32', 1]]);
    assert.deepEqual(all.por_ponto.map(item => [item.codigo, item.litros]), [['POSTO', 500], ['CC01', 400], ['CC02', 300]]);
    assert.deepEqual(all.evolucao.map(item => item.periodo), ['2025-09-10', '2026-09-10', '2026-09-11']);
    assert.equal(all.items[0]!.destinos.length, 0);
    assert.deepEqual(all.pagination, { page: 1, limit: 25, total: 3, total_pages: 1 });

    const nf = await (await fetch(`${base}/abastecimento/relatorios/entradas?numero_nf=NF-REPETIDA`)).json() as { summary: { entradas: number; litros_nf: number; valor_nf: number }; pagination: { total: number } };
    assert.deepEqual(nf.summary, { entradas: 2, litros_nf: 3000, valor_nf: 300 }); assert.equal(nf.pagination.total, 2);
    const pointFiltered = await (await fetch(`${base}/abastecimento/relatorios/entradas?ponto_id=${point('CC01')}`)).json() as { summary: { entradas: number; litros_nf: number; valor_nf: number }; items: Array<{ destinos: Array<{ ponto_codigo: string }> }> };
    assert.deepEqual(pointFiltered.summary, { entradas: 1, litros_nf: 1000, valor_nf: 100 }); assert.deepEqual(pointFiltered.items[0]!.destinos.map(item => item.ponto_codigo).sort(), ['CC01', 'CC02']);
    const monthly = await (await fetch(`${base}/abastecimento/relatorios/entradas?periodo=mes`)).json() as { evolucao: Array<{ periodo: string }> };
    assert.deepEqual(monthly.evolucao.map(item => item.periodo), ['2025-09', '2026-09']);
    const page = await (await fetch(`${base}/abastecimento/relatorios/entradas?limit=2&page=2`)).json() as { items: unknown[]; pagination: { page: number; total: number; total_pages: number }; summary: { entradas: number } };
    assert.equal(page.items.length, 1); assert.deepEqual(page.pagination, { page: 2, limit: 2, total: 3, total_pages: 2 }); assert.equal(page.summary.entradas, 3);
    const operationalList = await (await fetch(`${base}/abastecimento/entradas?numero_nf=NF-REPETIDA`)).json() as Array<{ destinos: Array<{ ponto_codigo: string }> }>;
    assert.equal(operationalList.length, 2); assert.ok(operationalList.some(item => item.destinos.length === 2));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await pool.query('DELETE FROM abastecimento_entrada_destinos WHERE entrada_id=ANY($1::uuid[])', [entries]); await pool.query('DELETE FROM abastecimento_entradas WHERE id=ANY($1::uuid[])', [entries]); }
});
