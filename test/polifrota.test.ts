import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { diagnosePoliFrotaFiles, parsePoliFrotaAbastecimentos, type PoliFrotaAbastecimentoNormalizado } from '../src/imports/polifrota.js';

const candidates = (name: string): string[] => [
  `C:\\Users\\User\\Downloads\\${name}`,
  `\\\\192.168.50.164\\Oficina\\IZAAC\\${name}`,
];
async function realFile(name: string): Promise<Buffer> {
  const path = candidates(name).find(existsSync);
  if (!path) throw new Error(`Arquivo real não encontrado: ${name}`);
  return readFile(path);
}
async function realRows(): Promise<PoliFrotaAbastecimentoNormalizado[]> {
  const files = await Promise.all(['ABAST0103.XLS', 'abast0104.xlsx', 'ABAST0312.xlsx'].map(async (nome) => ({ nome, buffer: await realFile(nome) })));
  return files.flatMap(({ nome, buffer }) => parsePoliFrotaAbastecimentos(buffer, nome));
}

test('analisa os três arquivos reais e totaliza 95 registros', async () => {
  const files = await Promise.all(['ABAST0103.XLS', 'abast0104.xlsx', 'ABAST0312.xlsx'].map(async (nome) => ({ nome, buffer: await realFile(nome) })));
  const report = diagnosePoliFrotaFiles(files);
  assert.deepEqual(report.arquivos.map((file) => file.registros), [42, 28, 25]);
  assert.equal(report.totalRegistros, 95);
  assert.deepEqual(report.identificadoresDuplicados, []);
  assert.ok(report.arquivos.every((file) => file.valoresInvalidos === 0));
});

test('o contrato preserva identidade, data local, bico e valor com quatro casas', async () => {
  const rows = await realRows();
  const row = rows.find((item) => item.identificadorExterno === '132774');
  assert.ok(row);
  assert.equal(row.origemSistema, 'POLIFROTA');
  assert.equal(row.dataHora, '2026-09-01T06:10:00');
  assert.equal(row.bicoCodigoOriginal, '19');
  assert.equal(row.bicoDescricaoOriginal, 'OLEO DIESEL S500 - COMUM');
  assert.equal(row.produtoDetectado, 'DIESEL_S500');
  assert.equal(row.valorTotal, 3194.7761);
  assert.equal(row.placaOriginal, 'RHB4G36');
  assert.equal(row.frotaOriginal, 'UA02');
});

test('preserva casos especiais de placa e frota sem classificá-los', async () => {
  const rows = await realRows();
  assert.ok(rows.some((row) => row.placaOriginal === 'PIRULITO' && row.frotaOriginal === 'PIRULITO'));
  assert.ok(rows.some((row) => row.placaOriginal === 'ROBCAL' && row.frotaOriginal === 'ROBERTO'));
  assert.ok(rows.some((row) => row.placaOriginal === '320 3' && row.frotaOriginal === 'EH16'));
});

test('detecta zero informado, ausência e valor inválido separadamente', () => {
  const rows: unknown[][] = [
    ['cabeçalho deslocado'],
    ['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Horímetro', 'Bico', 'Frentista'],
    ['1', '01/09/2026 06:10', 'A', 'F', '10.5', '1.2345', '0.00', '', '9 - OLEO DIESEL S500 - COMUM', 'X'],
    ['2', '01/09/2026 06:11', 'B', 'G', '10.5', '1.2345', '', 'abc', '9 - OLEO DIESEL S500 - COMUM', 'X'],
  ];
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Relatorio');
  const parsed = parsePoliFrotaAbastecimentos(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), 'sintetico.xlsx');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.kmHrStatus, 'ZERO_INFORMADO');
  assert.equal(parsed[0]?.horimetroStatus, 'AUSENTE');
  assert.equal(parsed[1]?.kmHrStatus, 'AUSENTE');
  assert.equal(parsed[1]?.horimetroStatus, 'INVALIDO');
  assert.ok(parsed[1]?.diagnosticos.some((item) => item.codigo === 'HORIMETRO_INVALIDO'));
});

test('ignora linha vazia e linha de total, mas não descarta identificador duplicado', () => {
  const rows: unknown[][] = [
    ['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Horímetro', 'Bico', 'Frentista'],
    ['10', '01/09/2026 06:10', 'A', 'F', '1', '2', '', '', '9 - OLEO DIESEL S500 - COMUM', 'X'],
    [null, null, null, null, null, null, null, null, null, null],
    ['TOTAL', null, null, null, '1', '2', null, null, null, null],
    ['10', '01/09/2026 06:11', 'B', 'G', '2', '3', '', '', '9 - OLEO DIESEL S500 - COMUM', 'X'],
  ];
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Relatorio');
  const parsed = parsePoliFrotaAbastecimentos(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), 'duplicado.xlsx');
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((row) => row.identificadorExterno), ['10', '10']);
  const report = diagnosePoliFrotaFiles([{ nome: 'duplicado.xlsx', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) }]);
  assert.deepEqual(report.identificadoresDuplicados, [{ identificador: '10', arquivos: ['duplicado.xlsx', 'duplicado.xlsx'], linhas: [2, 5] }]);
});

test('rejeita arquivo sem cabeçalho PoliFrota com mensagem compreensível', () => {
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['outra coisa']]), 'Planilha');
  assert.throws(() => parsePoliFrotaAbastecimentos(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), 'invalido.xlsx'), /Arquivo incompatível/);
});
