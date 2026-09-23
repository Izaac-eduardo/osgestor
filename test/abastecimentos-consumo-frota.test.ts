import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog } from './support/fixtures.js';

test('relatório de consumo calcula intervalos auditáveis, filtros e qualidade sem misturar produtos', async () => {
  const catalog = await testCatalog();
  const s10 = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S10'")).rows[0]!;
  const arla = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='ARLA_32'")).rows[0]!;
  const ids: string[] = [];
  async function insert(external: string, date: string, product: string, fleet: string, liters: number, km: number | null, hour: number | null, obra: string, type = 'FROTA') {
    const row = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,terceiro_id,destinacao_especial_id,identificacao_original,litros,valor_total,km_hr,horimetro,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,100,$11,$12,'consumo-fixture.xlsx','{}') RETURNING id`, [external, date, product, obra, type, type === 'FROTA' ? fleet : null, type === 'TERCEIRO' ? catalog.third.id : null, type === 'ESPECIAL' ? catalog.special.id : null, type === 'FROTA' ? fleet === catalog.fleet.id ? 'TST01' : 'TST02' : type, liters, km, hour]);
    ids.push(row.rows[0]!.id);
  }
  await insert('CONSUMO-KM-BASE', '2026-09-01 08:00', catalog.product.id, catalog.fleet.id, 20, 10000, 0, catalog.obra.id);
  await insert('CONSUMO-KM-ZERO', '2026-09-05 08:00', catalog.product.id, catalog.fleet.id, 15, 0, 0, catalog.obra.id);
  await insert('CONSUMO-KM-FINAL', '2026-09-10 08:00', catalog.product.id, catalog.fleet.id, 25, 10300, 0, catalog.nextObra.id);
  await insert('CONSUMO-KM-EQUAL', '2026-09-15 08:00', catalog.product.id, catalog.fleet.id, 10, 10300, 0, catalog.obra.id);
  await insert('CONSUMO-KM-REGRESSIVE', '2026-09-20 08:00', catalog.product.id, catalog.fleet.id, 10, 10200, 0, catalog.obra.id);
  await insert('CONSUMO-WEIGHT-1', '2026-09-01 08:00', catalog.product.id, catalog.secondFleet.id, 10, 100, 0, catalog.obra.id);
  await insert('CONSUMO-WEIGHT-2', '2026-09-02 08:00', catalog.product.id, catalog.secondFleet.id, 10, 200, 0, catalog.obra.id);
  await insert('CONSUMO-WEIGHT-NULL', '2026-09-02 12:00', catalog.product.id, catalog.secondFleet.id, 5, null, null, catalog.obra.id);
  await insert('CONSUMO-WEIGHT-3', '2026-09-03 08:00', catalog.product.id, catalog.secondFleet.id, 100, 400, 0, catalog.obra.id);
  await insert('CONSUMO-HR-BASE', '2026-09-01 08:00', s10.id, catalog.fleet.id, 20, 0, 10, catalog.obra.id);
  await insert('CONSUMO-HR-FINAL', '2026-09-02 08:00', s10.id, catalog.fleet.id, 30, 0, 15, catalog.obra.id);
  await insert('CONSUMO-AMB-BASE', '2026-09-01 08:00', s10.id, catalog.secondFleet.id, 20, 100, 10, catalog.obra.id);
  await insert('CONSUMO-AMB-FINAL', '2026-09-02 08:00', s10.id, catalog.secondFleet.id, 30, 200, 15, catalog.obra.id);
  await insert('CONSUMO-ARLA', '2026-09-02 08:00', arla.id, catalog.fleet.id, 10, 500, 0, catalog.obra.id);
  await insert('CONSUMO-THIRD', '2026-09-02 08:00', catalog.product.id, catalog.fleet.id, 10, null, null, catalog.obra.id, 'TERCEIRO');
  await insert('CONSUMO-SPECIAL', '2026-09-02 08:00', catalog.product.id, catalog.fleet.id, 10, null, null, catalog.obra.id, 'ESPECIAL');
  await insert('CONSUMO-EXTERNAL', '2026-09-02 08:00', catalog.product.id, catalog.fleet.id, 10, 600, 0, catalog.obra.id, 'EXTERNA');

  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  const get = async (query: string) => { const response = await fetch(`${base}/abastecimento/relatorios/consumo-frota?${query}`); const body = await response.json() as any; assert.equal(response.status, 200, JSON.stringify(body)); return body; };
  try {
    const period = await get(`frota_id=${catalog.fleet.id}&produto=DIESEL_S500&data_inicio=2026-09-05&data_fim=2026-09-10`);
    assert.equal(period.resumo.frotas_calculaveis, 1); assert.equal(period.frotas[0].situacao, 'CALCULAVEL_KM'); assert.equal(period.frotas[0].km_total, 300); assert.equal(period.frotas[0].litros_considerados, 40); assert.equal(period.frotas[0].media_km_l, 7.5); assert.equal(period.frotas[0].intervalos_validos, 1); assert.equal(period.frotas[0].intervalos[0].abastecimentos.length, 2); assert.equal(period.frotas[0].intervalos[0].abastecimentos[0].litros, 15);
    const obra = await get(`frota_id=${catalog.fleet.id}&produto=DIESEL_S500&obra_id=${catalog.nextObra.id}&data_inicio=2026-09-05&data_fim=2026-09-10`); assert.equal(obra.frotas[0].litros_considerados, 25); assert.equal(obra.frotas[0].media_km_l, 12);
    const weighted = await get(`frota_id=${catalog.secondFleet.id}&produto=DIESEL_S500`); assert.equal(weighted.frotas[0].km_total, 300); assert.equal(weighted.frotas[0].litros_considerados, 115); assert.ok(Math.abs(weighted.frotas[0].media_km_l - (300 / 115)) < 0.000000001); assert.equal(weighted.frotas[0].intervalos_validos, 2); assert.equal(weighted.frotas[0].intervalos.filter((item: any) => item.status === 'VALIDO')[1].abastecimentos.length, 2);
    const quality = await get(`frota_id=${catalog.fleet.id}&produto=DIESEL_S500`); assert.equal(quality.frotas[0].situacao, 'PROBLEMATICA'); assert.equal(quality.frotas[0].regressoes, 1); assert.ok(quality.frotas[0].intervalos.some((item: any) => item.status === 'LEITURA_IGUAL')); assert.ok(quality.frotas[0].intervalos.some((item: any) => item.status === 'LEITURA_REGRESSIVA'));
    const hour = await get(`frota_id=${catalog.fleet.id}&produto=DIESEL_S10&tipo_calculo=L_H`); const hourItem = hour.frotas.find((item: any) => item.produto.codigo === 'DIESEL_S10'); assert.equal(hourItem.situacao, 'CALCULAVEL_HORIMETRO'); assert.equal(hourItem.horas_total, 5); assert.equal(hourItem.litros_considerados, 30); assert.equal(hourItem.media_l_h, 6);
    const ambiguous = await get(`frota_id=${catalog.secondFleet.id}&produto=DIESEL_S10&situacao=CALCULAVEL`); assert.equal(ambiguous.frotas[0].situacao, 'AMBIGUA'); assert.equal(ambiguous.frotas[0].media, null);
    const arlaReport = await get(`frota_id=${catalog.fleet.id}&produto=ARLA_32`); assert.equal(arlaReport.frotas.length, 0);
    const filtered = await get(`frota_id=${catalog.secondFleet.id}&produto=DIESEL_S500&situacao=CALCULAVEL&tipo_calculo=KM_L`); assert.equal(filtered.frotas.length, 1); assert.equal(filtered.pagination.total, 1);
    const ignored = await get(`frota_id=${catalog.fleet.id}&produto=DIESEL_S500&data_inicio=2026-09-05&data_fim=2026-09-10`); assert.equal(ignored.frotas[0].leituras_ignoradas, 1);
    const all = await get(''); assert.ok(all.resumo.frotas_analisadas >= 2); assert.ok(all.frotas.every((item: any) => item.produto.codigo !== 'ARLA_32'));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])', [ids]);
  }
});

test('relatório de consumo preserva obra, paginação e leituras ausentes sem criar intervalos artificiais', async () => {
  const catalog = await testCatalog();
  const product = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S500'")).rows[0]!;
  const s10 = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S10'")).rows[0]!;
  const ids: string[] = [];
  const fleetIds: string[] = [];
  async function createFleet(code: string) {
    const row = await pool.query<{ id: string }>('INSERT INTO frotas (codigo,descricao,status) VALUES ($1,$2,\'ATIVO\') RETURNING id', [code, `Fixture ${code}`]);
    fleetIds.push(row.rows[0]!.id);
    return row.rows[0]!.id;
  }
  async function insert(external: string, date: string, productId: string, fleetId: string, liters: number, km: number | null, hour: number | null, obra: string) {
    const row = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,km_hr,horimetro,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,'FROTA',$5,$6,$7,100,$8,$9,'consumo-fixture.xlsx','{}') RETURNING id`, [external, date, productId, obra, fleetId, codeFor(fleetId), liters, km, hour]);
    ids.push(row.rows[0]!.id);
  }
  const codes = new Map<string, string>();
  const codeFor = (fleetId: string) => codes.get(fleetId) ?? 'FIXTURE';
  try {
    for (let index = 1; index <= 27; index += 1) {
      const code = `CONS-PAGE-${String(index).padStart(2, '0')}`;
      const fleetId = await createFleet(code); codes.set(fleetId, code);
      await insert(`CONSUMO-PAGE-${index}`, '2026-11-01 08:00', product.id, fleetId, 10, 1000 + index, 0, catalog.obra.id);
    }

    const regressionFleet = await createFleet('CONS-REGRESSION'); codes.set(regressionFleet, 'CONS-REGRESSION');
    await insert('CONSUMO-REGRESSION-BASE', '2026-11-01 08:00', product.id, regressionFleet, 10, 10000, 0, catalog.obra.id);
    await insert('CONSUMO-REGRESSION-FINAL', '2026-11-02 08:00', product.id, regressionFleet, 10, 9000, 0, catalog.obra.id);

    const nullKmFleet = await createFleet('CONS-NULL-KM'); codes.set(nullKmFleet, 'CONS-NULL-KM');
    await insert('CONSUMO-NULL-KM-BASE', '2026-11-01 08:00', product.id, nullKmFleet, 10, null, 0, catalog.obra.id);
    await insert('CONSUMO-NULL-KM-FINAL', '2026-11-02 08:00', product.id, nullKmFleet, 10, 11000, 0, catalog.obra.id);

    const nullHourFleet = await createFleet('CONS-NULL-HR'); codes.set(nullHourFleet, 'CONS-NULL-HR');
    await insert('CONSUMO-NULL-HR-BASE', '2026-11-01 08:00', s10.id, nullHourFleet, 10, 0, null, catalog.obra.id);
    await insert('CONSUMO-NULL-HR-FINAL', '2026-11-02 08:00', s10.id, nullHourFleet, 10, 0, 100, catalog.obra.id);

    const obraFleet = await createFleet('CONS-OBRA'); codes.set(obraFleet, 'CONS-OBRA');
    await insert('CONSUMO-OBRA-A-BASE', '2027-09-01 08:00', product.id, obraFleet, 20, 10000, 0, catalog.obra.id);
    await insert('CONSUMO-OBRA-B-MIDDLE', '2027-09-05 08:00', product.id, obraFleet, 30, 10100, 0, catalog.nextObra.id);
    await insert('CONSUMO-OBRA-A-FINAL', '2027-09-10 08:00', product.id, obraFleet, 25, 10200, 0, catalog.obra.id);

    const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
    const get = async (query: string) => { const response = await fetch(`${base}/abastecimento/relatorios/consumo-frota?${query}`); const body = await response.json() as any; assert.equal(response.status, 200, JSON.stringify(body)); return body; };
    const pages1 = await get('produto=DIESEL_S500&limit=25&page=1');
    const pages2 = await get('produto=DIESEL_S500&limit=25&page=2');
    const firstIds = pages1.frotas.map((item: any) => item.frota_id); const secondIds = pages2.frotas.map((item: any) => item.frota_id);
    const expectedSecondPage = Math.min(25, pages1.pagination.total - 25);
    assert.ok(pages1.pagination.total >= 30); assert.equal(pages1.frotas.length, 25); assert.equal(pages2.frotas.length, expectedSecondPage); assert.equal(pages2.pagination.total, pages1.pagination.total);
    assert.equal(new Set([...firstIds, ...secondIds]).size, firstIds.length + secondIds.length); assert.equal(firstIds.filter((id: string) => secondIds.includes(id)).length, 0); assert.deepEqual(pages1.resumo, pages2.resumo);

    const regression = await get(`frota_id=${regressionFleet}&produto=DIESEL_S500`);
    assert.equal(regression.frotas[0].situacao, 'PROBLEMATICA'); assert.equal(regression.frotas[0].intervalos_validos, 0); assert.equal(regression.frotas[0].media, null); assert.equal(regression.frotas[0].intervalos[1].status, 'LEITURA_REGRESSIVA');

    const nullKm = await get(`frota_id=${nullKmFleet}&produto=DIESEL_S500`);
    assert.equal(nullKm.frotas[0].situacao, 'INSUFICIENTE'); assert.equal(nullKm.frotas[0].intervalos_validos, 0); assert.equal(nullKm.frotas[0].media, null); assert.equal(nullKm.frotas[0].intervalos.length, 1); assert.equal(nullKm.frotas[0].intervalos[0].leitura_base, null);
    const nullHour = await get(`frota_id=${nullHourFleet}&produto=DIESEL_S10`);
    assert.equal(nullHour.frotas[0].situacao, 'INSUFICIENTE'); assert.equal(nullHour.frotas[0].intervalos_validos, 0); assert.equal(nullHour.frotas[0].intervalos[0].leitura_base, null);

    const obra = await get(`frota_id=${obraFleet}&produto=DIESEL_S500&obra_id=${catalog.obra.id}&data_inicio=2027-09-05&data_fim=2027-09-10`);
    assert.equal(obra.resumo.frotas_analisadas, 1); assert.equal(obra.frotas[0].km_total, 200); assert.equal(obra.frotas[0].litros_considerados, 25); assert.equal(obra.frotas[0].media_km_l, 8); assert.equal(obra.frotas[0].intervalos[1].leitura_base.valor, 10100); assert.deepEqual(obra.frotas[0].intervalos[1].abastecimentos.map((item: any) => item.litros), [25]);
    const otherObra = await get(`frota_id=${obraFleet}&produto=DIESEL_S500&obra_id=${catalog.nextObra.id}&data_inicio=2027-09-05&data_fim=2027-09-10`);
    assert.equal(otherObra.frotas[0].litros_considerados, 30); assert.notEqual(otherObra.frotas[0].litros_considerados, obra.frotas[0].litros_considerados);
    await new Promise<void>(resolve => server.close(() => resolve()));
  } finally {
    await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM frotas WHERE id = ANY($1::uuid[])', [fleetIds]);
  }
});
