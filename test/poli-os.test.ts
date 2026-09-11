import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { addPending, findFleetId, parsePoliOs, classifyNatureza, mapStatus, productUnit, matchObraId } from '../src/imports/poli-os.js';
import { normalizeSearchText } from '../src/utils/text.js';
import { nextObraCodigo } from '../src/services/obras.service.js';

test('normaliza texto de busca sem criar equivalências indevidas', () => {
  assert.equal(normalizeSearchText('IPORA'), normalizeSearchText('IPORÃ'));
  assert.equal(normalizeSearchText('PALMITOPOLIS'), normalizeSearchText('PALMITÓPOLIS'));
  assert.equal(normalizeSearchText('MAMBORE'), normalizeSearchText('MAMBORÊ'));
  assert.equal(normalizeSearchText('COAMO'), normalizeSearchText('coamo'));
  assert.notEqual(normalizeSearchText('IPORA'), normalizeSearchText('ARARUNA'));
});

test('matching de obra usa igualdade normalizada e mantém ambiguidade segura', () => {
  const obras = [{ id: '1', codigo: 'IPORÃ', nome: 'Obra Iporã' }, { id: '2', codigo: 'ARARUNA', nome: 'Araruna' }];
  assert.equal(matchObraId('IPORA', obras), '1');
  assert.equal(matchObraId('ARARUNA', obras), '2');
  assert.equal(matchObraId('IPORA X', obras), undefined);
});

test('próximo código usa o maior OBR numérico e ignora códigos livres', () => {
  assert.equal(nextObraCodigo(['OBR001', 'OBR002', 'OBR009', 'INTERNA', 'LOGISTICA']), 'OBR010');
  assert.equal(nextObraCodigo(['OBR157', 'OBR159']), 'OBR160');
});

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

test('reconhece cancelada e consolida pendências repetidas', () => {
  assert.equal(mapStatus('CANCELADA'), 'CANCELADA');
  const pending: string[] = [];
  addPending(pending, 'FUNCIONARIO_PENDENTE');
  addPending(pending, 'FUNCIONARIO_PENDENTE');
  addPending(pending, 'FUNCIONARIO_PENDENTE');
  assert.deepEqual(pending, ['FUNCIONARIO_PENDENTE (3 ocorrências)']);
});

test('faz matching de frota por código ou placa sem escolher duplicatas', () => {
  const fleets = [{ id: '1', codigo: 'ON14', placa: 'ABC1D23' }, { id: '2', codigo: 'ON15', placa: 'ABC1D24' }];
  assert.equal(findFleetId('ON14', fleets), '1');
  assert.equal(findFleetId('ABC1D23', fleets), '1');
  assert.equal(findFleetId('ON', fleets), undefined);
});
