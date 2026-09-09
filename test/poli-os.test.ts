import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parsePoliOs, classifyNatureza, mapStatus, productUnit } from '../src/imports/poli-os.js';

test('parser reproduz o bloco exportado pelo Poli OS', () => {
  const rows: unknown[][] = Array.from({ length: 10 }, () => Array(40).fill(null));
  rows[0]![0] = 'O. S.'; rows[0]![6] = 'Data O.S'; rows[0]![12] = 'Cliente'; rows[0]![30] = 'Placa';
  rows[1]![0] = 10; rows[1]![6] = '03/09/2026'; rows[1]![16] = 'OBRA'; rows[1]![30] = 'BER7C25'; rows[1]![34] = 'LUIS';
  rows[2]![8] = 'Aberta'; rows[5]![3] = 1; rows[5]![5] = 'MAO DE OBRA MECANICO'; rows[5]![24] = 1; rows[5]![26] = 'JOAO'; rows[5]![32] = 80; rows[5]![38] = 80; rows[5]![19] = 'Inicio em 03/09/2026 07:30 Termino em 03/09/2026 09:00';
  rows[6]![0] = 'PROBLEMA: TROCA'; rows[7]![0] = 'PARECER...: OBRA';
  const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'OS');
  const parsed = parsePoliOs(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), 'teste.xlsx');
  assert.equal(parsed.length, 1); assert.equal(parsed[0]?.itens.length, 1); assert.equal(parsed[0]?.execucoes.length, 1); assert.equal(parsed[0]?.natureza, 'INTERNA');
  assert.equal(productUnit('ÓLEO LUBRIFICANTE'), 'L'); assert.equal(productUnit('FILTRO DE OLEO'), 'UN');
  assert.equal(classifyNatureza('RETIRAR MATERIAL: ESTOPA', 'JOAO', ''), 'MATERIAL'); assert.equal(classifyNatureza('Troca', 'IZAAC EDUARDO', ''), 'TERCEIRO'); assert.equal(classifyNatureza('Troca', 'Izaac', ''), 'INTERNA');
  assert.equal(mapStatus('ENCERRADA POR VENDA'), 'FINALIZADA'); assert.equal(mapStatus('STATUS NOVO'), undefined);
});
