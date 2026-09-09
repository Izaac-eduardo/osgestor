import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { analyzeItaipuWorkbook } from '../imports/itaipu-workbook.js';
import { assertImportable } from '../imports/frotas-workbook.js';

function workbook(rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('FROTA PEDREIRA').addRows(rows);
  return book;
}
test('Itaipu: categoria, células mescladas e exceções de placa/modelo preservam a semântica', () => {
  const book = workbook([
    ['RELAÇÃO DE FROTAS'],
    ['N°', 'AUTOMÓVEIS', 'DESCRIÇÃO', 'LUGARES', 'ANO', 'PLACA'],
    [1, 'A-09', 'AUTOMOVEL - VOLKSWAGEN / GOL', 5, 2021, 'BER7C25'],
    ['N°', 'VAN', 'DESCRIÇÃO', 'LUGARES', 'ANO', 'MODELO'],
    [1, 'VAN-01', 'VOLKSWAGEN / KOMBI', 9, 2008, 'APD1F21'],
    ['N°', 'ROMPEDOR HIDRAULICO', 'DESCRIÇÃO', '', 'ANO', 'PLACA'],
    [1, 'RH-01', 'ROMPEDOR HIDRAULICO - EDT2000', '', '-', 'EDT2000'],
    ['N°', 'GRADE ARADORA', 'DESCRIÇÃO', '', 'ANO', 'PLACA'],
    [1, 'GA-01', 'GRADE ARADORA - GACR', '', '', 'GA-01'],
    ['N°', 'RETRO ESCAVADEIRA', 'DESCRIÇÃO', '', 'ANO', 'MODELO'],
    [1, 'RE-06', 'RETROESCAVADEIRA', '', 2023, 416],
    [2, 'RE-08', 'RETROESCAVADEIRA', '', 2024, 416],
    ['TOTAL 6 EQUIPAMENTOS'],
  ]);
  book.worksheets[0]!.mergeCells('C6:D6');
  book.worksheets[0]!.mergeCells('C7:D7');
  const report = analyzeItaipuWorkbook(book, 'fabricacao');
  assertImportable(report);
  assert.equal(report.rows.length, 6);
  assert.equal(report.rows[0]?.numero, '09');
  assert.equal(report.rows[1]?.placa, 'APD1F21');
  assert.equal(report.rows[1]?.modelo, null);
  assert.equal(report.rows[2]?.placa, null); // EDT2000 also matches a plate regex; the section decides.
  assert.equal(report.rows[2]?.modelo, 'EDT2000');
  assert.equal(report.rows[3]?.placa, null);
  assert.equal(report.rows[3]?.modelo, null); // Repeated fleet code must not become a fabricated model.
  assert.equal(report.rows[4]?.modelo, '416');
  assert.deepEqual(report.duplicateModels, [{ value: '416', codes: ['RE06', 'RE08'] }]);
  assert.equal(report.adjustments.length, 3);
  assert.equal(report.ignored.length + report.rows.length, book.worksheets[0]!.rowCount);
});
test('Itaipu: anos compostos são auditáveis e ano de modelo inconsistente não é presumido', () => {
  const book = workbook([
    ['N°', 'CAMINHÃO TRAÇADO', 'CAMINHÃO TRAÇADO 6X4', '', 'ANO', 'PLACA'],
    [1, 'CT-04', 'CAMINHÃO', '', '2019/20', 'ABC1234'],
    [2, 'CT-31', 'CAMINHÃO', '', '2025/56', 'ABC1D23'],
  ]);
  const fabrication = analyzeItaipuWorkbook(book, 'fabricacao');
  assertImportable(fabrication);
  assert.equal(fabrication.rows[0]?.ano, 2019);
  assert.equal(fabrication.rows[0]?.original.ano, '2019/20');
  assert.equal(fabrication.rows[1]?.ano, 2025);
  assert.match(fabrication.adjustments[1]!.reason, /inconsistente/);
  const model = analyzeItaipuWorkbook(book, 'modelo');
  assert.equal(model.rows[0]?.ano, 2020);
  assert.equal(model.errors.length, 1);
  assert.throws(() => assertImportable(model));
});
test('Itaipu: seção desconhecida, prefixo incompatível, identificação de grade e total divergente bloqueiam a carga', () => {
  for (const rows of [
    [['N°', 'SEÇÃO NOVA', 'DESCRIÇÃO', '', 'ANO', 'PLACA'], [1, 'A09', 'Veículo', '', 2021, 'ABC1234']],
    [['N°', 'AUTOMÓVEIS', 'DESCRIÇÃO', '', 'ANO', 'PLACA'], [1, 'CT04', 'Veículo', '', 2021, 'ABC1234']],
    [['N°', 'GRADE ARADORA', 'DESCRIÇÃO', '', 'ANO', 'PLACA'], [1, 'GA01', 'Grade', '', 2021, 'DADO DESCONHECIDO']],
    [['N°', 'AUTOMÓVEIS', 'DESCRIÇÃO', '', 'ANO', 'PLACA'], [1, 'A09', 'Veículo', '', 2021, 'ABC1234'], ['TOTAL 2 EQUIPAMENTOS']],
  ]) assert.throws(() => assertImportable(analyzeItaipuWorkbook(workbook(rows), 'fabricacao')));
});