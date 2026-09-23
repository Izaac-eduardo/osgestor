import 'dotenv/config';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { test } from 'node:test';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { testCatalog } from './support/fixtures.js';

test('exportação de consumo usa dataset completo, filtros e valores numéricos auditáveis', async () => {
  const catalog = await testCatalog();
  const s10 = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S10'")).rows[0]!;
  const s500 = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S500'")).rows[0]!;
  const ids: string[] = [];
  const fleetIds: string[] = [];
  async function createFleet(code: string) {
    const row = await pool.query<{ id: string }>('INSERT INTO frotas (codigo,descricao,status) VALUES ($1,$2,\'ATIVO\') RETURNING id', [code, `Export ${code}`]);
    fleetIds.push(row.rows[0]!.id);
    return row.rows[0]!.id;
  }
  async function insert(external: string, date: string, product: string, fleet: string, liters: number, km: number | null, hour: number | null) {
    const row = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,km_hr,horimetro,arquivo_nome_original,payload_original) VALUES ('TEST',$1,$2,$3,$4,'FROTA',$5,$6,$7,100,$8,$9,'consumo-export-fixture.xlsx','{}') RETURNING id`, [external, date, product, catalog.obra.id, fleet, external, liters, km, hour]);
    ids.push(row.rows[0]!.id);
  }
  const firstFleet = await createFleet('CONS-EXPORT-01');
  await insert('CONSUMO-EXPORT-VALIDO-BASE', '2028-01-01 08:00', s500.id, firstFleet, 37, 10000, 0);
  await insert('CONSUMO-EXPORT-VALIDO-FINAL', '2028-01-02 08:00', s500.id, firstFleet, 37, 10100, 0);
  for (let index = 2; index <= 26; index += 1) {
    const fleet = await createFleet(`CONS-EXPORT-${String(index).padStart(2, '0')}`);
    await insert(`CONSUMO-EXPORT-INSUF-${index}`, '2028-01-02 08:00', s500.id, fleet, 10, 20000 + index, 0);
  }
  const regressionFleet = await createFleet('CONS-EXPORT-REG');
  await insert('CONSUMO-EXPORT-REG-BASE', '2028-01-01 08:00', s500.id, regressionFleet, 20, 30000, 0);
  await insert('CONSUMO-EXPORT-REG-FINAL', '2028-01-02 08:00', s500.id, regressionFleet, 20, 29900, 0);
  const hourFleet = await createFleet('CONS-EXPORT-HR');
  await insert('CONSUMO-EXPORT-HR-BASE', '2028-01-01 08:00', s10.id, hourFleet, 10, 0, 10);
  await insert('CONSUMO-EXPORT-HR-FINAL', '2028-01-02 08:00', s10.id, hourFleet, 30, 0, 15);

  let server: ReturnType<typeof app.listen> | null = null;
  try {
    server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const request = async (path: string) => fetch(`${base}${path}`);
    const xlsx = await request('/abastecimento/relatorios/consumo-frota/excel?produto=DIESEL_S500&page=2&limit=25');
    assert.equal(xlsx.status, 200);
    assert.match(xlsx.headers.get('content-type') ?? '', /spreadsheetml/);
    assert.match(xlsx.headers.get('content-disposition') ?? '', /relatorio-consumo-frota/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await xlsx.arrayBuffer());
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumo', 'Consumo por Frota', 'Intervalos', 'Abastecimentos dos Intervalos']);
    const consumption = workbook.getWorksheet('Consumo por Frota')!;
    const header = consumption.getRow(10);
    assert.equal(header.getCell(1).value, 'Frota');
    const exportedRows: ExcelJS.Row[] = [];
    consumption.eachRow((row, rowNumber) => { if (rowNumber > 10 && row.getCell(1).value) exportedRows.push(row); });
    const paged = await (await request('/abastecimento/relatorios/consumo-frota?produto=DIESEL_S500')).json() as { pagination: { total: number } };
    assert.ok(paged.pagination.total >= 27);
    assert.equal(exportedRows.length, paged.pagination.total);
    const validRow = exportedRows.find(row => row.getCell(1).value === 'CONS-EXPORT-01')!;
    assert.equal(typeof validRow.getCell(8).value, 'number');
    assert.equal(validRow.getCell(8).value, Number((100 / 37).toFixed(9)));
    assert.equal(validRow.getCell(9).value, 'km/L');
    assert.equal(validRow.getCell(4).value, 'Calculável');
    const insufficientRow = exportedRows.find(row => row.getCell(1).value === 'CONS-EXPORT-02')!;
    assert.equal(insufficientRow.getCell(8).value, null);
    assert.equal(insufficientRow.getCell(4).value, 'Dados insuficientes');
    const regressionRow = exportedRows.find(row => row.getCell(1).value === 'CONS-EXPORT-REG')!;
    assert.equal(regressionRow.getCell(4).value, 'Problemática');
    assert.equal(regressionRow.getCell(8).value, null);
    const intervals = workbook.getWorksheet('Intervalos')!;
    let hasRegression = false;
    assert.equal(intervals.getRow(10).getCell(3).value, 'Intervalo');
    intervals.eachRow(row => { if (row.getCell(4).value === 'Leitura regressiva') hasRegression = true; });
    assert.ok(hasRegression);
    const summaryValues = new Map<string, unknown>();
    workbook.getWorksheet('Resumo')!.eachRow(row => { if (typeof row.getCell(1).value === 'string') summaryValues.set(String(row.getCell(1).value), row.getCell(2).value); });
    assert.equal(summaryValues.get('Frotas analisadas'), paged.pagination.total);
    assert.equal(typeof summaryValues.get('L/h calculáveis'), 'number');
    assert.equal(summaryValues.get('L/h calculáveis'), 0);
    assert.ok(Number(summaryValues.get('Problemáticas')) >= 1);

    const pdf = await request('/abastecimento/relatorios/consumo-frota/pdf?produto=DIESEL_S500&data_inicio=2028-01-01&data_fim=2028-01-02&situacao=TODAS');
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type') ?? '', /application\/pdf/);
    assert.match(pdf.headers.get('content-disposition') ?? '', /relatorio-consumo-frota/);
    assert.ok((await pdf.arrayBuffer()).byteLength > 1000);

    const calculated = await request(`/abastecimento/relatorios/consumo-frota/excel?produto=DIESEL_S500&frota_id=${firstFleet}&situacao=CALCULAVEL`);
    const calculatedBook = new ExcelJS.Workbook(); await calculatedBook.xlsx.load(await calculated.arrayBuffer());
    const calculatedRows = calculatedBook.getWorksheet('Consumo por Frota')!.getRows(11, 1);
    assert.equal(calculatedRows[0]!.getCell(1).value, 'CONS-EXPORT-01');
    const hours = await request('/abastecimento/relatorios/consumo-frota/excel?produto=DIESEL_S10&tipo_calculo=L_H');
    const hoursBook = new ExcelJS.Workbook(); await hoursBook.xlsx.load(await hours.arrayBuffer());
    const hourRow = hoursBook.getWorksheet('Consumo por Frota')!.getRows(11, hoursBook.getWorksheet('Consumo por Frota')!.rowCount).find(row => row.getCell(1).value === 'CONS-EXPORT-HR')!;
    assert.equal(hourRow.getCell(8).value, 6);
    assert.equal(hourRow.getCell(9).value, 'L/h');
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query('DELETE FROM abastecimentos WHERE id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM frotas WHERE id=ANY($1::uuid[])', [fleetIds]);
  }
});
