import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { normalizeFleetCode, normalizePlate, normalizeModel, splitFleetCode } from '../../src/utils/frotas.js';
import { parseFrotaFields } from '../../src/services/frotas.service.js';
import { analyzeWorkbook, assertImportable } from '../imports/frotas-workbook.js';

test('códigos preservam zeros e separam prefixo/número', () => {
  for (const value of ['A-09', 'A09', 'a-09', ' a 09 ']) {
    assert.deepEqual(splitFleetCode(value), { codigo: 'A09', prefixo: 'A', numero: '09' });
    assert.notEqual(normalizeFleetCode(value), 'A9');
  }
  assert.deepEqual(splitFleetCode('CT-04'), { codigo: 'CT04', prefixo: 'CT', numero: '04' });
  assert.equal(splitFleetCode('EH-03').numero, '03');
  assert.throws(() => splitFleetCode('09'));
});
test('placas equivalentes e modelo com espaço interno', () => {
  assert.equal(normalizePlate('ABC-1234'), normalizePlate(' abc1234 '));
  assert.equal(normalizePlate('ABC1D23'), normalizePlate('abc1d23'));
  assert.equal(normalizeModel(' 416 4 '), '416 4');
  assert.equal(normalizeModel('320gc'), '320GC');
  assert.throws(() => parseFrotaFields({ codigo: 'A09', placa: '416 4' }));
  assert.throws(() => parseFrotaFields({ codigo: 'A09', ano: '2021' }));
  assert.throws(() => parseFrotaFields({ codigo: 'A09', status: 'OUTRO' }));
  assert.throws(() => parseFrotaFields({ codigo: 'A09' }, true));
});
test('seções com placa e modelo usam cabeçalhos, nunca posição', () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Frota');
  sheet.addRows([
    ['Relação oficial'], ['Frota', 'Descrição', 'Placa', 'Ano'],
    ['A-09', 'Automóvel', 'abc-1234', 2021],
    ['CT-04', 'Caminhão', 'ABC1D23', 2020],
    ['Frota', 'Descrição', 'Modelo', 'Ano'],
    ['EH-03', 'Máquina', '416 4', 2022], ['GE-01', 'Equipamento', '416 4', 2023],
  ]);
  const result = analyzeWorkbook(book);
  assertImportable(result);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0]?.numero, '09');
  assert.equal(result.rows[0]?.placa, 'ABC1234');
  assert.equal(result.rows[2]?.placa, null);
  assert.equal(result.rows[2]?.modelo, '416 4');
  assert.deepEqual(result.duplicateModels, [{ value: '416 4', codes: ['EH03', 'GE01'] }]);
});
test('duplicidades normalizadas e linhas ambíguas bloqueiam gravação', () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Frota');
  sheet.addRows([['Frota', 'Descrição', 'Placa', 'Ano'],
    ['A-09', 'Automóvel', 'abc-1234', 2021], ['a09', 'Duplicado', 'ABC1234', 2021],
    ['CT04', 'Ano ambíguo', '', '2020/2021'], ['', 'Sem código', '', 2022]]);
  const report = analyzeWorkbook(book);
  assert.equal(report.duplicateCodes.length, 1);
  assert.equal(report.duplicatePlates.length, 1);
  assert.equal(report.errors.length, 2);
  assert.throws(() => assertImportable(report));
});
test('dados sem cabeçalho e planilha vazia não passam silenciosamente', () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Sem cabeçalho').addRow(['A09', 'Automóvel']);
  assert.throws(() => assertImportable(analyzeWorkbook(book)));
  assert.throws(() => assertImportable(analyzeWorkbook(new ExcelJS.Workbook())));
});