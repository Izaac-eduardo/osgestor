import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parsePoliOs } from '../src/imports/poli-os.js';

function workbookWithAnnotations(annotationRows: Array<{ column: number; value: string }>, plate: string): Buffer {
  const rows: unknown[][] = Array.from({ length: 8 }, () => Array(40).fill(null));
  rows[0]![0] = 'O. S.';
  rows[0]![6] = 'Data O.S';
  rows[0]![30] = 'Placa';
  rows[1]![0] = 990001101;
  rows[1]![6] = '01/10/2026';
  rows[1]![30] = plate;
  rows[2]![8] = 'Aberta';
  annotationRows.forEach((annotation, index) => { rows[index + 5]![annotation.column] = annotation.value; });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'OS');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('Problema é preservado com Parecer vazio e não exige Parecer', () => {
  const parsed = parsePoliOs(workbookWithAnnotations([{ column: 0, value: ' PROBLEMA: TROCA DE FILTRO ' }], 'FRT0101'), 'problema-sem-parecer.xlsx');
  assert.equal(parsed[0]?.problema, 'TROCA DE FILTRO');
  assert.equal(parsed[0]?.parecerOriginal, null);
  assert.equal(parsed[0]?.frotaOriginal, 'FRT0101');
});

test('Parecer com código de frota não substitui frota nem Problema', () => {
  const parsed = parsePoliOs(workbookWithAnnotations([
    { column: 10, value: 'PARECER TECNICO: FRT0102' },
    { column: 12, value: 'PROBLEMA: TROCA DE FILTRO' },
  ], 'FRT0102'), 'parecer-frota.xlsx');
  assert.equal(parsed[0]?.parecerOriginal, 'FRT0102');
  assert.equal(parsed[0]?.problema, 'TROCA DE FILTRO');
  assert.equal(parsed[0]?.frotaOriginal, 'FRT0102');
});

test('parser reconhece o formato real PARECER...:', () => {
  const parsed = parsePoliOs(workbookWithAnnotations([{ column: 0, value: 'PARECER...: LOGISTICA' }], 'FRT0105'), 'vega-real.xlsx');
  assert.equal(parsed[0]?.parecerOriginal, 'LOGISTICA');
  assert.equal(parsed[0]?.problema, null);
  assert.equal(parsed[0]?.frotaOriginal, 'FRT0105');
});

test('Parecer semelhante a obra não cria obra no objeto importado', () => {
  const parsed = parsePoliOs(workbookWithAnnotations([{ column: 12, value: 'PARECER: OBRA-001' }], 'FRT0103'));
  assert.equal(parsed[0]?.parecerOriginal, 'OBRA-001');
  assert.equal(parsed[0]?.obraId, undefined);
  assert.equal(parsed[0]?.pendencias.some(value => value.startsWith('OBRA_')), false);
});

test('Parecer preenchido sem Problema não substitui o Problema', () => {
  const parsed = parsePoliOs(workbookWithAnnotations([{ column: 12, value: 'PARECER TÉCNICO: FRT0104' }], 'FRT0104'));
  assert.equal(parsed[0]?.problema, null);
  assert.equal(parsed[0]?.parecerOriginal, 'FRT0104');
});
