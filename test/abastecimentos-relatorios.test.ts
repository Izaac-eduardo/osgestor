import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog } from './support/fixtures.js';

test('relatórios gerenciais agregam fixtures confirmadas e respeitam filtros', async () => {
  const c = await testCatalog(); const ids: string[] = [];
  const rows = [['REP-1','FROTA',c.fleet.id,null,null,c.fleet.codigo,10,100,c.obra.id],['REP-2','FROTA',c.secondFleet.id,null,null,c.secondFleet.codigo,20,200,c.obra.id],['REP-3','TERCEIRO',null,c.third.id,null,'TST-TERC-01',30,300,c.nextObra.id],['REP-4','ESPECIAL',null,null,c.special.id,c.special.codigo,40,400,c.nextObra.id]] as const;
  for (const [external,type,fleet,third,special,identification,liters,value,obra] of rows) { const result = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,terceiro_id,destinacao_especial_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('TEST',$1,'2026-09-20 07:00',$2,$3,$4,$5,$6,$7,$8,$9,$10,'reports-fixture.xlsx','{}') RETURNING id`, [external,c.product.id,obra,type,fleet,third,special,identification,liters,value]); ids.push(result.rows[0]!.id); }
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/abastecimento/relatorios`); assert.equal(response.status, 200); const report = await response.json() as { summary: { quantidade: number; litros: number; valor: number; destinatarios: number }; por_produto: Array<{ produto: string; quantidade: number; litros: number; valor: number }>; por_obra: Array<{ quantidade: number }>; por_frota: Array<{ quantidade: number }>; por_terceiro: Array<{ quantidade: number }>; especiais: Array<{ quantidade: number; destinacao: string }>; evolucao: Array<{ quantidade: number }> };
    assert.deepEqual(report.summary,{quantidade:4,litros:100,valor:1000,destinatarios:4}); assert.deepEqual(report.por_produto,[{produto:'DIESEL_S500',quantidade:4,litros:100,valor:1000}]); assert.equal(report.por_obra.reduce((sum,item)=>sum+item.quantidade,0),4); assert.equal(report.por_frota.reduce((sum,item)=>sum+item.quantidade,0),2); assert.equal(report.por_terceiro.reduce((sum,item)=>sum+item.quantidade,0),1); assert.deepEqual(report.especiais.map(item=>[item.destinacao,item.quantidade]),[['PIRULITO',1]]); assert.equal(report.evolucao.reduce((sum,item)=>sum+item.quantidade,0),4);
    const filtered = await (await fetch(`${base}/abastecimento/relatorios?obra_id=${c.nextObra.id}`)).json() as { summary: { quantidade: number; litros: number; valor: number; destinatarios: number } }; assert.deepEqual(filtered.summary,{quantidade:2,litros:70,valor:700,destinatarios:2});
    const special = await (await fetch(`${base}/abastecimento/relatorios?busca=PIRULITO&tipo_destinatario=ESPECIAL`)).json() as { summary: { quantidade: number } }; assert.equal(special.summary.quantidade,1);
    const empty = await (await fetch(`${base}/abastecimento/relatorios?data_inicio=2000-01-01&data_fim=2000-01-31`)).json() as { summary: { quantidade: number; litros: number; valor: number; destinatarios: number } }; assert.deepEqual(empty.summary,{quantidade:0,litros:0,valor:0,destinatarios:0});
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])',[ids]); }
});
