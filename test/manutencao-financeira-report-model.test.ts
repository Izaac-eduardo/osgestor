import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaintenanceReportData } from '../src/services/manutencao-financeira-report-model.js';

const filters = { data_inicio: '2026-11-01', data_fim: '2026-11-30' };

test('consolida custo efetivo e referência de mão de obra sem dupla contagem', () => {
  const report = buildMaintenanceReportData([
    { prefixo: 'CT01', lancamentos: 4, pecas_externas: '10.00', servicos_terceirizados: '20.00', materiais_almoxarifado: '30.00', mao_obra_interna: '40.00', total_efetivo: '60.00', total_gerencial: '100.00' },
  ], [], { itens: [] }, filters);
  assert.equal(Number(report.summary[0].total_efetivo), 60);
  assert.equal(Number(report.summary[0].total_gerencial), 100);
  assert.equal(report.sharedTotals.approvedValue, 0);
});

test('mantém despesas compartilhadas aprovadas, pendentes e desconsideradas separadas', () => {
  const report = buildMaintenanceReportData([], [], { itens: [
    { despesa_compartilhada_status: 'APROVADA', valor_total: '12.34', classificacao: 'PECAS_EXTERNAS', subcentro_original: 'FROTAS DIVERSAS', data_conta: '2026-11-03', frota_id: null },
    { despesa_compartilhada_status: 'AGUARDANDO_DECISAO', valor_total: '50.00' },
    { despesa_compartilhada_status: 'DESCONSIDERADA', valor_total: '8.00' },
  ] }, filters);
  assert.deepEqual(report.sharedTotals, { approved: 1, pending: 1, disregarded: 1, approvedValue: 12.34 });
});

test('não soma despesa aprovada alocada como compartilhada', () => {
  const report = buildMaintenanceReportData([], [], { itens: [{ despesa_compartilhada_status: 'APROVADA', valor_total: '12.34', frota_id: 'fleet-ct03', frota: 'CT03' }] }, filters);
  assert.equal(report.sharedTotals.approvedValue, 0);
  assert.equal(report.sharedTotals.approved, 0);
});

test('apresenta valor aprovado de Frotas Diversas sem somar pedágios ao resumo de custos', () => {
  const report = buildMaintenanceReportData([], [], { itens: [
    { despesa_compartilhada_status: 'APROVADA', classificacao: 'SERVICOS_TERCEIRIZADOS', valor_total: '3750.00', subcentro_original: 'FROTAS DIVERSAS', data_conta: '2026-11-03', frota_id: null, produto_original: 'Serviço de torno' },
    { despesa_compartilhada_status: 'APROVADA', classificacao: 'SERVICOS_TERCEIRIZADOS', valor_total: '80807.56', subcentro_original: 'FROTAS DIVERSAS', data_conta: '2026-11-03', frota_id: null, produto_original: 'PASSAGEM PEDÁGIO' },
    { despesa_compartilhada_status: 'APROVADA', classificacao: 'PECAS_EXTERNAS', valor_total: '500.00', subcentro_original: 'FROTAS DIVERSAS', data_conta: '2026-12-01', frota_id: null, produto_original: 'Peça futura' },
  ] }, filters);
  assert.equal(report.sharedTotals.approved, 1);
  assert.equal(report.sharedTotals.approvedValue, 3750);
});

test('preserva a mesma placa no resumo e no detalhamento', () => {
  const report = buildMaintenanceReportData([{ prefixo: 'CT01', placa: 'ABC000' }], [{ frota: 'CT01', placa: 'ABC000', valor: '10.00' }], { itens: [] }, filters);
  assert.equal(report.summary[0].placa, report.details[0].placa);
});
