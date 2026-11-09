import assert from 'node:assert/strict';
import test from 'node:test';
import { reportFilters as excelFilters } from '../src/controllers/relatorios-excel.controller.js';
import { reportFilters as pdfFilters } from '../src/controllers/relatorios-pdf.controller.js';

const request = (query: Record<string, string>) => ({ query }) as never;

test('exportações Excel e PDF preservam frota_codigo e demais filtros', () => {
  const query = { frota_codigo: 'CT03', data_inicio: '2026-09-01', data_fim: '2026-09-30', status: 'FINALIZADA', natureza_os: 'INTERNA', categoria: 'MECANICA' };
  for (const filters of [excelFilters(request(query)), pdfFilters(request(query))]) {
    assert.equal(filters.frota_codigo, 'CT03');
    assert.equal(filters.data_inicio, '2026-09-01');
    assert.equal(filters.data_fim, '2026-09-30');
    assert.equal(filters.status, 'FINALIZADA');
    assert.equal(filters.natureza_os, 'INTERNA');
    assert.equal(filters.categoria, 'MECANICA');
  }
});
