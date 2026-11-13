import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { CONTABILIDADE_INICIO_OPERACAO, classifyContabilSpecialStatus, parseContabilidade } from '../src/imports/contabilidade.js';
import { usesAccountingForThirdParty } from '../src/services/relatorios.service.js';
import { usesAccountingForThirdParty as dashboardUsesAccountingForThirdParty } from '../src/services/dashboard.service.js';

function workbook(rows: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Relatorio');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('parser preserva competência sem deslocamento de timezone e interpreta valores brasileiros', () => {
  const rows = parseContabilidade(workbook([
    ['Data Conta', 'Total', 'SubCentro', 'Tipo de Movimentacao', 'Plano de Contas'],
    ['01/11/2026 23:59', '1.234,56', 'CP01', 'Saida', 'CUSTO PECAS / OFICINA'],
  ]), 'memoria.xlsx');
  assert.equal(CONTABILIDADE_INICIO_OPERACAO, '2026-11-01');
  assert.equal(rows[0]?.dataConta, '2026-11-01');
  assert.equal(rows[0]?.valorTotal, 1234.56);
  assert.equal(rows[0]?.classificacao, 'PECAS_EXTERNAS');
  assert.equal(rows[0]?.valorTotalInvalido, false);
});

test('parser não converte valor inválido em zero e mantém plano desconhecido pendente', () => {
  const rows = parseContabilidade(workbook([
    ['Data Conta', 'Total', 'SubCentro', 'Tipo de Movimentacao', 'Plano de Contas'],
    ['2026-11-02T23:00:00-03:00', 'não informado', 'CP01', 'Estorno', 'CUSTO SERVICOS'],
    ['2026-11-03', '-10,50', 'CP02', 'Outro', 'PLANO DESCONHECIDO'],
  ]), 'memoria.xlsx');
  assert.equal(rows[0]?.dataConta, '2026-11-02');
  assert.equal(rows[0]?.valorTotal, null);
  assert.equal(rows[0]?.valorTotalInvalido, true);
  assert.equal(rows[0]?.classificacao, 'SERVICOS_TERCEIRIZADOS');
  assert.equal(rows[1]?.valorTotal, -10.5);
  assert.equal(rows[1]?.classificacao, 'PENDENTE');
});

test('serviço terceiro manual é preservado antes de novembro e substituído pela contabilidade a partir da transição', () => {
  assert.equal(usesAccountingForThirdParty('2026-10-31'), false);
  assert.equal(usesAccountingForThirdParty('2026-11-01'), true);
  assert.equal(usesAccountingForThirdParty('2026-12-15'), true);
  assert.equal(dashboardUsesAccountingForThirdParty('2026-10-31'), false);
  assert.equal(dashboardUsesAccountingForThirdParty('2026-11-01'), true);
});
