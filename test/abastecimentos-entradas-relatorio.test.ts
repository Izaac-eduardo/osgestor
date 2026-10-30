import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { authenticateHttpFixture, httpHeaders } from './helpers/http-auth.js';

test('relatório de entradas agrega sem duplicar NF e destinos', async () => {
  const products = (await pool.query<{ id: string; codigo: string }>(`SELECT id,codigo FROM abastecimento_produtos WHERE codigo IN ('DIESEL_S500','ARLA_32') ORDER BY codigo`)).rows;
  const points = (await pool.query<{ id: string; codigo: string }>(`SELECT id,codigo FROM abastecimento_pontos WHERE codigo IN ('CC01','CC02','POSTO') ORDER BY codigo`)).rows;
  const product = (code: string) => products.find(item => item.codigo === code)!.id;
  const point = (code: string) => points.find(item => item.codigo === code)!.id;
  const reportNf = `NF-REPETIDA-${randomUUID().slice(0, 8)}`;
  const entries: string[] = [];
  const abastecimentoIds: string[] = [];
  const insert = async (external: string, date: string, productId: string, liters: number, value: number, nf: string) => { const row = (await pool.query<{ id: string }>(`INSERT INTO abastecimento_entradas(data_entrada,numero_nf,produto_id,litros_nf,valor_total_nf) VALUES($1,$2,$3,$4,$5) RETURNING id`, [date, nf, productId, liters, value])).rows[0]!; entries.push(row.id); return row.id; };
  const first = await insert('ENTRADA-REPORT-1', '2098-09-10', product('DIESEL_S500'), 1000, 100, reportNf);
  const second = await insert('ENTRADA-REPORT-2', '2098-09-11', product('DIESEL_S500'), 2000, 200, reportNf);
  await insert('ENTRADA-REPORT-3', '2098-09-12', product('ARLA_32'), 300, 30, `NF-ARLA-${randomUUID().slice(0, 8)}`);
  await pool.query(`INSERT INTO abastecimento_entrada_destinos(entrada_id,ponto_id,litros) VALUES ($1,$2,400),($1,$3,300),($4,$5,500)`, [first, point('CC01'), point('CC02'), second, point('POSTO')]);
  const destinations = (await pool.query<{ id: string; ponto_codigo: string }>(`SELECT d.id,p.codigo AS ponto_codigo FROM abastecimento_entrada_destinos d JOIN abastecimento_pontos p ON p.id=d.ponto_id WHERE d.entrada_id=ANY($1::uuid[]) ORDER BY d.created_at,d.id`, [[first, second]])).rows;
  const obra = (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001'`)).rows[0]!;
  const frota = (await pool.query<{ id: string }>(`SELECT id FROM frotas WHERE codigo='TST01'`)).rows[0]!;
  const insertAbastecimento = async (destinationId: string, productId: string, liters: number, external: string) => {
    const row = (await pool.query<{ id: string }>(`INSERT INTO abastecimentos(origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original,entrada_destino_id) VALUES ('TEST',$1::text,'2098-09-10 10:00',$2,$3,'FROTA',$4,$1::text,$5,0,'relatorio-entradas-teste.xlsx','{}',$6) RETURNING id`, [external, productId, obra.id, frota.id, liters, destinationId])).rows[0]!;
    abastecimentoIds.push(row.id);
    return row.id;
  };
  const insertImported = async (productId: string, bico: string, liters: number) => {
    const row = (await pool.query<{ id: string }>(`INSERT INTO abastecimentos(origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original,bico_codigo_original) VALUES ('POLIFROTA',$1::text,'2098-09-10 10:00',$2,$3,'FROTA',$4,$1::text,$5,0,'relatorio-entradas-importado-teste.xlsx','{}',$6) RETURNING id`, [`ABAST-IMPORTED-${randomUUID().slice(0, 8)}`, productId, obra.id, frota.id, liters, bico])).rows[0]!;
    abastecimentoIds.push(row.id);
  };
  await insertAbastecimento(destinations.find(row => row.ponto_codigo === 'CC01')!.id, product('DIESEL_S500'), 123, `ABAST-REPORT-${randomUUID().slice(0, 8)}`);
  await insertAbastecimento(destinations.find(row => row.ponto_codigo === 'CC02')!.id, product('ARLA_32'), 88, `ABAST-REPORT-${randomUUID().slice(0, 8)}`);
  const canceledAbastecimento = await insertAbastecimento(destinations.find(row => row.ponto_codigo === 'POSTO')!.id, product('ARLA_32'), 77, `ABAST-REPORT-${randomUUID().slice(0, 8)}`);
  await pool.query(`UPDATE abastecimentos SET excluido_at=NOW(),motivo_exclusao='Teste de cancelamento do relatório' WHERE id=$1`, [canceledAbastecimento]);
  await insertImported(product('DIESEL_S500'), '3', 50);
  await insertImported(product('DIESEL_S500'), '2', 44);
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  const auth = await authenticateHttpFixture(base);
  const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { ...httpHeaders(auth.cookie), ...(init.headers ?? {}) } });
  try {
    const all = await (await request('/abastecimento/relatorios/entradas?data_inicio=2098-09-10&data_fim=2098-09-12')).json() as { summary: { entradas: number; litros_nf: number; valor_nf: number }; por_produto: Array<{ produto: string; quantidade: number }>; por_ponto: Array<{ codigo: string; litros: number; litros_distribuidos: number }>; evolucao: Array<{ periodo: string }>; items: Array<{ destinos: unknown[] }>; pagination: { total: number; total_pages: number } };
    assert.deepEqual(all.summary, { entradas: 3, litros_nf: 3300, valor_nf: 330 });
    assert.deepEqual(all.por_produto.map(item => [item.produto, item.quantidade]), [['DIESEL_S500', 2], ['ARLA_32', 1]]);
    assert.deepEqual(all.por_ponto.map(item => [item.codigo, item.litros]), [['POSTO', 500], ['CC01', 400], ['CC02', 300]]);
    assert.deepEqual(all.por_ponto.map(item => item.litros_distribuidos), [0, 173, 0]);
    assert.deepEqual(all.evolucao.map(item => item.periodo), ['2098-09-10', '2098-09-11', '2098-09-12']);
    assert.equal(all.items[0]!.destinos.length, 0);
    assert.deepEqual(all.pagination, { page: 1, limit: 25, total: 3, total_pages: 1 });

    const nf = await (await request(`/abastecimento/relatorios/entradas?numero_nf=${reportNf}`)).json() as { summary: { entradas: number; litros_nf: number; valor_nf: number }; pagination: { total: number } };
    assert.deepEqual(nf.summary, { entradas: 2, litros_nf: 3000, valor_nf: 300 }); assert.equal(nf.pagination.total, 2);
    const pointFiltered = await (await request(`/abastecimento/relatorios/entradas?numero_nf=${reportNf}&ponto_id=${point('CC01')}`)).json() as { summary: { entradas: number; litros_nf: number; valor_nf: number }; items: Array<{ destinos: Array<{ ponto_codigo: string }> }> };
    assert.deepEqual(pointFiltered.summary, { entradas: 1, litros_nf: 1000, valor_nf: 100 }); assert.deepEqual(pointFiltered.items[0]!.destinos.map(item => item.ponto_codigo).sort(), ['CC01', 'CC02']);
    const monthly = await (await request('/abastecimento/relatorios/entradas?data_inicio=2098-09-10&data_fim=2098-09-12&periodo=mes')).json() as { evolucao: Array<{ periodo: string }> };
    assert.deepEqual(monthly.evolucao.map(item => item.periodo), ['2098-09']);
    const page = await (await request('/abastecimento/relatorios/entradas?data_inicio=2098-09-10&data_fim=2098-09-12&limit=2&page=2')).json() as { items: unknown[]; pagination: { page: number; total: number; total_pages: number }; summary: { entradas: number } };
    assert.equal(page.items.length, 1); assert.deepEqual(page.pagination, { page: 2, limit: 2, total: 3, total_pages: 2 }); assert.equal(page.summary.entradas, 3);
    const operationalList = await (await request(`/abastecimento/entradas?numero_nf=${reportNf}`)).json() as { items: Array<{ destinos: Array<{ ponto_codigo: string }> }>; pagination: { total: number; limit: number; total_pages: number } };
    assert.equal(operationalList.items.length, 2); assert.deepEqual(operationalList.pagination, { page: 1, limit: 20, total: 2, total_pages: 1 }); assert.ok(operationalList.items.some(item => item.destinos.length === 2));
  } finally { await auth.cleanup(); await new Promise<void>(resolve => server.close(() => resolve())); await pool.query('DELETE FROM abastecimentos WHERE id=ANY($1::uuid[])', [abastecimentoIds]); await pool.query('DELETE FROM abastecimento_entrada_destinos WHERE entrada_id=ANY($1::uuid[])', [entries]); await pool.query('DELETE FROM abastecimento_entradas WHERE id=ANY($1::uuid[])', [entries]); }
});
