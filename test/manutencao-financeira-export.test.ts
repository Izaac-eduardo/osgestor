import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../src/config/database.js';
import { exportManutencaoExcel, exportManutencaoPdf } from '../src/services/manutencao-financeira-export.service.js';

test('exportações de manutenção geram PDF e Excel sem recalcular no frontend', async () => {
  const filters = { data_inicio: '2026-10-01', data_fim: '2026-10-31' };
  const pdf = await exportManutencaoPdf(filters); const excel = await exportManutencaoExcel(filters);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); assert.equal(excel.subarray(0, 2).toString(), 'PK');
  await pool.end();
});
