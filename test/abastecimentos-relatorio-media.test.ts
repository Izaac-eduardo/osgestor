import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { pool } from '../src/config/database.js';
import { exportAbastecimentosPdf } from '../src/services/abastecimentos-export.service.js';
import { getRelatorioAbastecimentos } from '../src/services/abastecimentos-relatorios.service.js';
import { testCatalog } from './support/fixtures.js';

function pdfStreams(buffer: Buffer): string {
  const source = buffer.toString('latin1');
  const decoded: Buffer[] = [];
  for (const match of source.matchAll(/stream\r?\n/g)) {
    const start = match.index! + match[0].length;
    const end = source.indexOf('endstream', start);
    if (end < 0) continue;
    const stream = Buffer.from(source.slice(start, end), 'latin1');
    for (const inflate of [inflateSync, inflateRawSync]) {
      try { decoded.push(inflate(stream)); break; } catch { /* non-Flate stream */ }
    }
  }
  return Buffer.concat(decoded).toString('latin1');
}

test('relatório de abastecimentos reutiliza média de consumo por frota sem misturar produtos', async () => {
  const catalog = await testCatalog();
  assert.equal((await pool.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database, 'oficina_test');
  const s10 = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S10'")).rows[0]!;
  const fleets: string[] = [];
  const abastecimentos: string[] = [];
  const suffix = Date.now();
  async function createFleet(label: string) {
    const row = await pool.query<{ id: string }>('INSERT INTO frotas (codigo,descricao,status) VALUES ($1,$2,\'ATIVO\') RETURNING id', [`RM-${label}-${suffix}`, `Fixture REPORT-MEDIA-${label}`]);
    fleets.push(row.rows[0]!.id);
    return row.rows[0]!.id;
  }
  async function insert(external: string, date: string, product: string, fleet: string, liters: number, km: number) {
    const row = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,km_hr,horimetro,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,'FROTA',$5,$6,$7,100,$8,0,'report-media-fixture.xlsx','{}') RETURNING id`, [external, date, product, catalog.obra.id, fleet, `REPORT-MEDIA-${external}`, liters, km]);
    abastecimentos.push(row.rows[0]!.id);
  }

  const before = await getRelatorioAbastecimentos({ obra_id: catalog.obra.id, produto: 'DIESEL_S500' });
  try {
    const calculable = await createFleet('CALC');
    await insert(`REPORT-MEDIA-CALC-BASE-${suffix}`, '2030-01-01 08:00', catalog.product.id, calculable, 10, 1000);
    await insert(`REPORT-MEDIA-CALC-FINAL-${suffix}`, '2030-01-02 08:00', catalog.product.id, calculable, 50, 1200);
    await insert(`REPORT-MEDIA-CALC-S10-BASE-${suffix}`, '2030-01-03 08:00', s10.id, calculable, 10, 2000);
    await insert(`REPORT-MEDIA-CALC-S10-FINAL-${suffix}`, '2030-01-04 08:00', s10.id, calculable, 20, 2100);

    const insufficient = await createFleet('INSUF');
    await insert(`REPORT-MEDIA-INSUF-${suffix}`, '2030-01-01 08:00', catalog.product.id, insufficient, 20, 1000);
    const problematic = await createFleet('REG');
    await insert(`REPORT-MEDIA-REG-BASE-${suffix}`, '2030-01-01 08:00', catalog.product.id, problematic, 10, 1000);
    await insert(`REPORT-MEDIA-REG-FINAL-${suffix}`, '2030-01-02 08:00', catalog.product.id, problematic, 50, 900);

    const report = await getRelatorioAbastecimentos({ obra_id: catalog.obra.id, produto: 'DIESEL_S500', data_inicio: '2030-01-01', data_fim: '2030-01-02' });
    const calc = report.por_frota.find(item => item.frota === `RM-CALC-${suffix}`)!;
    const noData = report.por_frota.find(item => item.frota === `RM-INSUF-${suffix}`)!;
    const regression = report.por_frota.find(item => item.frota === `RM-REG-${suffix}`)!;
    assert.equal(calc.media, 4);
    assert.equal(calc.media_unidade, 'km/L');
    assert.equal(noData.media, null);
    assert.equal(noData.media_unidade, null);
    assert.equal(regression.media, null);
    assert.equal(regression.media_unidade, null);
    assert.equal(report.summary.quantidade - before.summary.quantidade, 5);
    assert.equal(report.summary.litros - before.summary.litros, 140);
    assert.equal(report.summary.valor - before.summary.valor, 500);

    const s10Report = await getRelatorioAbastecimentos({ obra_id: catalog.obra.id, produto: 'DIESEL_S10', data_inicio: '2030-01-03', data_fim: '2030-01-04' });
    const s10Fleet = s10Report.por_frota.find(item => item.frota === `RM-CALC-${suffix}`)!;
    assert.equal(s10Fleet.media, 5);
    assert.equal(s10Fleet.media_unidade, 'km/L');

    const mixed = await getRelatorioAbastecimentos({ obra_id: catalog.obra.id, data_inicio: '2030-01-01', data_fim: '2030-01-04' });
    assert.equal(mixed.por_frota.find(item => item.frota === `RM-CALC-${suffix}`)!.media, null);
    const pdf = await exportAbastecimentosPdf({ obra_id: catalog.obra.id, produto: 'DIESEL_S500', data_inicio: '2030-01-01', data_fim: '2030-01-02' });
    assert.equal(pdf.toString('latin1', 0, 4), '%PDF');
    assert.ok(pdfStreams(pdf).includes('4de9646961'));
  } finally {
    await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])', [abastecimentos]);
    await pool.query('DELETE FROM frotas WHERE id = ANY($1::uuid[])', [fleets]);
  }
});
