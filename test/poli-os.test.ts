import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { addPending, findFleetId, parsePoliOs, classifyNatureza, mapStatus, productUnit, matchObraId } from '../src/imports/poli-os.js';
import { normalizeSearchText } from '../src/utils/text.js';
import { nextObraCodigo } from '../src/services/obras.service.js';
import { consolidateExecutions, decideExecution, type ReconcileOrderContext } from '../src/services/reconciliacao-execucoes.service.js';

const aTilde = String.fromCharCode(227);
const oAcute = String.fromCharCode(211);
const eCirc = String.fromCharCode(234);

test('normaliza texto de busca sem criar equivalências indevidas', () => {
  assert.equal(normalizeSearchText('IPORA'), normalizeSearchText(`IPOR${aTilde}`));
  assert.equal(normalizeSearchText('PALMITOPOLIS'), normalizeSearchText(`PALMIT${oAcute}POLIS`));
  assert.equal(normalizeSearchText('MAMBORE'), normalizeSearchText(`MAMBO R${eCirc}`.replace(' ', '')));
  assert.equal(normalizeSearchText('COAMO'), normalizeSearchText('coamo'));
  assert.notEqual(normalizeSearchText('IPORA'), normalizeSearchText('ARARUNA'));
});

test('matching de obra usa igualdade normalizada e mantém ambiguidade segura', () => {
  const obras = [{ id: '1', codigo: `IPOR${aTilde}`, nome: 'Obra Iporã' }, { id: '2', codigo: 'ARARUNA', nome: 'Araruna' }];
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
  rows[5]![19] = 'Início em 03/09/2026 07:30 Término em 03/09/2026 09:00';
  rows[6]![0] = 'PROBLEMA: TROCA'; rows[7]![0] = 'PARECER...: OBRA'; rows[8]![0] = 'PROBLEMA: 03/09/2026 07:30 03/09/2026 09:00';
  const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'OS');
  const parsed = parsePoliOs(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), 'teste.xlsx');
  assert.equal(parsed.length, 1); assert.equal(parsed[0]?.itens.length, 1); assert.equal(parsed[0]?.execucoes.length, 1); assert.equal(parsed[0]?.problema, 'TROCA'); assert.equal(parsed[0]?.natureza, 'INTERNA');
  assert.equal(productUnit(`${String.fromCharCode(211)}LEO LUBRIFICANTE`), 'L'); assert.equal(productUnit('FILTRO DE OLEO'), 'UN');
  assert.equal(classifyNatureza('RETIRAR MATERIAL: ESTOPA', 'JOAO', '', false, true), 'MATERIAL'); assert.equal(classifyNatureza('Troca', null, '', true, false, undefined, false, ['IZAAC EDUARDO']), 'TERCEIRO'); assert.equal(classifyNatureza('Troca', 'Izaac', '', true, false, undefined, false, ['JOAO CARLOS']), 'INTERNA');
  assert.equal(mapStatus('ENCERRADA POR VENDA'), 'FINALIZADA'); assert.equal(mapStatus('STATUS NOVO'), undefined);
});

test('reconhece cancelada e consolida pendências repetidas', () => {
  assert.equal(mapStatus('CANCELADA'), 'CANCELADA');
  const pending: string[] = []; addPending(pending, 'FUNCIONARIO_PENDENTE'); addPending(pending, 'FUNCIONARIO_PENDENTE'); addPending(pending, 'FUNCIONARIO_PENDENTE');
  assert.deepEqual(pending, [`FUNCIONARIO_PENDENTE (3 ocorr${eCirc}ncias)`]);
});

test('faz matching de frota por código ou placa sem escolher duplicatas', () => {
  const fleets = [{ id: '1', codigo: 'ON14', placa: 'ABC1D23' }, { id: '2', codigo: 'ON15', placa: 'ABC1D24' }];
  assert.equal(findFleetId('ON14', fleets), '1'); assert.equal(findFleetId('ABC1D23', fleets), '1'); assert.equal(findFleetId('ON', fleets), undefined);
});

test('classifica retiradas com produtos como MATERIAL, mas preserva interna com serviço', () => {
  assert.equal(classifyNatureza('RETIRAR MATERIAL ALMOXARIFADO', 'JOAO', '', false, true), 'MATERIAL');
  assert.equal(classifyNatureza('RETIRAR LONAS DE FREIO', 'JOAO', '', false, true), 'MATERIAL');
  assert.equal(classifyNatureza('RETIRAR FILTROS DE COMBUSTIVEL', 'JOAO', '', false, true), 'MATERIAL');
  assert.equal(classifyNatureza('TROCAR FILTROS DE COMBUSTIVEL', 'JOAO', '', true, true), 'INTERNA');
  assert.equal(classifyNatureza('COMPLETAR OLEO MOTOR', 'JOAO', '', true, true), 'INTERNA');
});

test('classifica ARLA finalizada sem serviço como MATERIAL, mas não presume isso em aberta', () => {
  assert.equal(classifyNatureza('ARLA 32', 'JOAO', '', false, true, 'FINALIZADA', false), 'MATERIAL');
  assert.equal(classifyNatureza('ARLA 32', 'JOAO', '', true, true, 'FINALIZADA', false), 'INTERNA');
  assert.equal(classifyNatureza('ARLA 32', 'JOAO', '', false, true, 'ABERTA', false), 'INTERNA');
});

test('classifica item de servico com IZAAC EDUARDO como TERCEIRO', () => {
  assert.equal(classifyNatureza('NF 25', null, 'SERVICO TAPECARIA', true, false, 'FINALIZADA', false, ['IZAAC EDUARDO']), 'TERCEIRO');
});

test('classifica multiplos servicos quando apenas um tem IZAAC EDUARDO como TERCEIRO', () => {
  assert.equal(classifyNatureza('MANUTENCAO', null, 'SERVICO A SERVICO B', true, false, 'FINALIZADA', false, ['JOAO CARLOS', 'Izaac Eduardo']), 'TERCEIRO');
});

test('nao usa o usuario IZAAC como evidencia de TERCEIRO', () => {
  assert.equal(classifyNatureza('MANUTENCAO', 'IZAAC', 'SERVICO COMUM', true, false, 'FINALIZADA', false, ['JOAO CARLOS']), 'INTERNA');
});

test('prioriza tecnico IZAAC EDUARDO sobre Parecer INTERNA', () => {
  assert.equal(classifyNatureza('INTERNA', null, 'SERVICO COMUM', true, false, 'FINALIZADA', false, ['IZAAC EDUARDO']), 'TERCEIRO');
});

test('classifica servico comum sem texto TERCEIRO pelo tecnico IZAAC EDUARDO', () => {
  assert.equal(classifyNatureza('NF 176', null, 'SERVICO DE GUINCHO', true, false, undefined, false, ['  Izaac   Eduardo  ']), 'TERCEIRO');
});

test('nao cria execucao interna para IZAAC EDUARDO', () => {
  const rows: unknown[][] = Array.from({ length: 8 }, () => Array(40).fill(null));
  rows[0]![0] = 'O. S.'; rows[0]![6] = 'Data O.S'; rows[1]![0] = 11; rows[1]![6] = '03/09/2026';
  rows[3]![3] = 1; rows[3]![5] = 'SERVICO DE GUINCHO'; rows[3]![24] = 1; rows[3]![26] = 'IZAAC EDUARDO'; rows[3]![32] = 1200; rows[3]![38] = 1200;
  rows[3]![19] = 'Inicio em 03/09/2026 08:00 Termino em 03/09/2026 09:00';
  const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'OS');
  const parsed = parsePoliOs(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), 'izaac.xlsx');
  assert.equal(parsed[0]?.natureza, 'TERCEIRO'); assert.equal(parsed[0]?.execucoes.length, 0);
});

test('TERCEIRO sem prestador nÃ£o gera pendÃªncia de fornecedor', () => {
  const pending: string[] = [];
  addPending(pending, 'FORNECEDOR_PENDENTE');
  assert.deepEqual(pending, []);
});

const execution = (overrides: Partial<{ funcionario_original: string; inicio: string; fim: string }> = {}) => ({
  numero_os: 1, funcionario_original: 'JOSE CARLOS', inicio: '2026-09-01T08:00:00', fim: '2026-09-01T09:00:00', sources: ['a.xls'], ...overrides,
});
const context = (overrides: Partial<ReconcileOrderContext> = {}) => ({
  id: 'os', numero_os: 1, services: [{ id: 'service' }], employees: [{ id: 'employee', nome: 'JOSÉ CARLOS' }], linkedEmployeeIds: ['employee'], executions: [], ...overrides,
});

test('reconciliação escolhe serviço único', () => assert.equal(decideExecution(execution(), context()).kind, 'SEGURA'));
test('reconciliação usa execução geral com múltiplos serviços', () => assert.equal(decideExecution(execution(), context({ services: [{ id: 'a' }, { id: 'b' }] })).kind, 'SEGURA'));
test('reconciliação reconhece execução existente sem exigir serviço', () => assert.equal(decideExecution(execution(), context({ services: [], executions: [{ id: 'old', funcionario_id: 'employee', inicio: '2026-09-01T08:00', fim: '2026-09-01T09:00', servico_os_id: null }] })).kind, 'EXISTENTE'));
test('reconciliação consolida a mesma execução em arquivos sobrepostos', () => assert.equal(consolidateExecutions([execution(), { ...execution(), sources: ['b.xls'] }]).length, 1));
test('reconciliação normaliza acentos no funcionário', () => assert.equal(decideExecution(execution(), context()).kind, 'SEGURA'));
test('reconciliação sinaliza funcionário ambíguo', () => assert.equal(decideExecution(execution(), context({ employees: [{ id: 'a', nome: 'JOSE CARLOS' }, { id: 'b', nome: 'JOSÉ CARLOS' }] })).kind, 'PENDENTE'));
test('reconciliação sinaliza término anterior ao início', () => assert.equal(decideExecution(execution({ fim: '2026-09-01T07:00' }), context()).kind, 'PENDENTE'));
test('reconciliação aceita execução posterior à abertura', () => assert.equal(decideExecution(execution({ inicio: '2026-09-03T08:00', fim: '2026-09-03T09:00' }), context()).kind, 'SEGURA'));
test('reconciliação sinaliza O.S. inexistente', () => assert.equal(decideExecution(execution(), undefined).kind, 'PENDENTE'));
test('reconciliação reconhece execução geral existente na segunda execução', () => assert.equal(decideExecution(execution(), context({ services: [{ id: 'a' }, { id: 'b' }], executions: [{ id: 'old', funcionario_id: 'employee', inicio: '2026-09-01T08:00', fim: '2026-09-01T09:00', servico_os_id: null }] })).kind, 'EXISTENTE'));
