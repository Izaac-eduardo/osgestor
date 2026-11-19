import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { pool } from '../src/config/database.js';
import { exportDesempenhoOficinaExcel, exportDesempenhoOficinaPdf } from '../src/services/manutencao-financeira-export.service.js';
import { getDesempenhoOficina } from '../src/services/manutencao-financeira.service.js';

const filters = { data_inicio: '2026-09-01', data_fim: '2026-09-30' };

test('exportação do desempenho reconcilia Excel, PDF e serviço compartilhado', async () => {
  assert.equal((await pool.query('SELECT current_database()')).rows[0].current_database, 'oficina_teste_fase051');
  const performance = await getDesempenhoOficina(filters) as { valor_servicos_internos: string; detalhes: Array<{ valor: string }>; linhas_abertas: number; linhas_finalizadas: number };
  const excel = await exportDesempenhoOficinaExcel(filters);
  const pdf = await exportDesempenhoOficinaPdf(filters);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(excel);
  const detail = workbook.getWorksheet('Detalhamento'); assert.ok(detail);
  const totalRow = detail!.getRow(detail!.rowCount);
  const exportedTotal = Number(totalRow.getCell(6).value);
  const sourceTotal = performance.detalhes.reduce((sum, row) => sum + Number(row.valor), 0);
  assert.equal(exportedTotal, sourceTotal);
  assert.equal(Number(sourceTotal.toFixed(2)), Number(performance.valor_servicos_internos));
  assert.equal(performance.linhas_abertas + performance.linhas_finalizadas, performance.detalhes.length);
  if (performance.detalhes.length > 0) {
    const firstDetailRow = detail!.getRows(1, detail!.rowCount).find(row => row.getCell(3).value instanceof Date);
    assert.ok(firstDetailRow);
  }
  assert.equal(detail!.getColumn(3).numFmt, 'dd/mm/yyyy');
  assert.ok(detail!.autoFilter);
  assert.equal(detail!.views[0].state, 'frozen');
  assert.equal(detail!.pageSetup.paperSize, 9);
});

test('filtro de frota por código restringe o desempenho exportado', async () => {
  const fleet = (await pool.query<{ codigo: string }>(`SELECT codigo FROM frotas WHERE codigo IS NOT NULL ORDER BY codigo LIMIT 1`)).rows[0];
  assert.ok(fleet);
  const result = await getDesempenhoOficina({ ...filters, frota_codigo: fleet.codigo });
  const data = result as { detalhes: Array<{ frota: string }> };
  assert.ok(data.detalhes.every(row => row.frota === fleet.codigo));
});

test.after(async () => { await pool.end(); });
