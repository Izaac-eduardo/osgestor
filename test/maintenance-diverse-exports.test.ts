import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import test from 'node:test';
import { exportMaintenanceExcelFromData, exportMaintenancePdfFromData } from '../src/services/manutencao-financeira-report.service.js';
import { buildMaintenanceReportData } from '../src/services/manutencao-financeira-report-model.js';

test('exports isoladas incluem Frotas Diversas nos custos e identificam pedágios fora da manutenção', async () => {
  const filters = { data_inicio: '2026-11-01', data_fim: '2026-11-05' };
  const sharedItems = [
    { id: '1', data_conta: '2026-11-03', produto_original: 'Serviço de torno', valor_total: '3750.00', classificacao: 'SERVICOS_TERCEIRIZADOS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null },
    { id: '2', data_conta: '2026-11-03', produto_original: 'Serviço de borracharia', valor_total: '2320.00', classificacao: 'SERVICOS_TERCEIRIZADOS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null },
    { id: '3', data_conta: '2026-11-04', produto_original: 'Palheta 1', valor_total: '140.00', classificacao: 'PECAS_EXTERNAS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null },
    { id: '4', data_conta: '2026-11-04', produto_original: 'Palheta 2', valor_total: '140.00', classificacao: 'PECAS_EXTERNAS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null },
    { id: '5', data_conta: '2026-11-04', produto_original: 'Para-brisa 1', valor_total: '1000.00', classificacao: 'PECAS_EXTERNAS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null },
    { id: '6', data_conta: '2026-11-04', produto_original: 'Para-brisa 2', valor_total: '1000.00', classificacao: 'PECAS_EXTERNAS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null },
    { id: '7', data_conta: '2026-11-03', produto_original: 'PASSAGEM PEDÁGIO', valor_total: '80807.56', classificacao: 'SERVICOS_TERCEIRIZADOS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null, fora_custo_manutencao: true },
    { id: '8', data_conta: '2026-11-03', produto_original: 'MENSALIDADE PEDAGIO', valor_total: '20000.00', classificacao: 'SERVICOS_TERCEIRIZADOS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null, fora_custo_manutencao: true },
    { id: '9', data_conta: '2026-11-03', produto_original: 'FRETE DE PEÇAS', valor_total: '500.00', classificacao: 'SERVICOS_TERCEIRIZADOS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null, fora_custo_manutencao: true, motivo_fora_custo_manutencao: 'FRETE' },
    { id: '10', data_conta: '2026-11-03', produto_original: 'Rastreamento de frota - mensalidade', valor_total: '200.00', classificacao: 'SERVICOS_TERCEIRIZADOS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null, fora_custo_manutencao: true, motivo_fora_custo_manutencao: 'RASTREAMENTO' },
    { id: '11', data_conta: '2026-11-03', produto_original: 'ARLA-32', valor_total: '100.00', classificacao: 'SERVICOS_TERCEIRIZADOS', subcentro_original: 'FROTAS DIVERSAS', despesa_compartilhada_status: 'APROVADA', frota_id: null, fora_custo_manutencao: true, motivo_fora_custo_manutencao: 'ARLA_32' },
  ];
  const details = [...sharedItems.slice(0, 6).map(item => ({ data: item.data_conta, referencia: item.id, categoria: item.classificacao, descricao: item.produto_original, quantidade: 1, unidade: 'UN', valor: item.valor_total, origem: 'CONTABILIDADE', prestador: null, funcionario: null, frota_id: null, frota: 'Frotas Diversas', placa: null })), { data: '2026-11-04', referencia: 'OS-80001', categoria: 'MATERIAIS_ALMOXARIFADO', descricao: 'ARLA 32', quantidade: 1, unidade: 'UN', valor: '350.50', origem: 'OS', prestador: null, funcionario: null, frota_id: 'fleet-1', frota: 'CT01', placa: 'ABC1234' }];
  const summary = [
    { frota_id: null, prefixo: 'Frotas Diversas', placa: null, lancamentos: 6, pecas_externas: '2280.00', servicos_terceirizados: '6070.00', materiais_almoxarifado: '0.00', mao_obra_interna: '0.00', total_efetivo: '8350.00', total_gerencial: '8350.00' },
    { frota_id: 'fleet-1', prefixo: 'CT01', placa: 'ABC1234', lancamentos: 1, pecas_externas: '0.00', servicos_terceirizados: '0.00', materiais_almoxarifado: '350.50', mao_obra_interna: '0.00', total_efetivo: '350.50', total_gerencial: '350.50' },
  ];
  const data = buildMaintenanceReportData(summary, details, { itens: sharedItems }, filters);

  const excelBuffer = await exportMaintenanceExcelFromData(data);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelBuffer);
  const overview = workbook.getWorksheet('Resumo por Frota')!;
  const syntheticRow = overview.getRows(1, overview.rowCount)?.find(row => row.getCell(1).value === 'Frotas Diversas');
  assert.ok(syntheticRow);
  assert.equal(Number(syntheticRow.getCell(4).value), 2280);
  assert.equal(Number(syntheticRow.getCell(5).value), 6070);
  assert.equal(Number(syntheticRow.getCell(8).value), 8350);
  const sharedSheet = workbook.getWorksheet('Despesas Compartilhadas')!;
  assert.equal(sharedSheet.getRows(1, sharedSheet.rowCount)?.some(row => row.getCell(7).value === 'Frete contábil fora dos custos de manutenção'), true);
  assert.equal(sharedSheet.getRows(1, sharedSheet.rowCount)?.some(row => row.getCell(7).value === 'Rastreamento fora dos custos de manutenção'), true);
  assert.equal(sharedSheet.getRows(1, sharedSheet.rowCount)?.some(row => row.getCell(7).value === 'ARLA 32 contábil fora dos custos de manutenção'), true);
  const detailsSheet = workbook.getWorksheet('Lançamentos Detalhados')!;
  assert.equal(detailsSheet.getRows(1, detailsSheet.rowCount)?.some(row => row.getCell(5).value === 'ARLA 32' && row.getCell(7).value === 'OS'), true);
  assert.equal(data.sharedTotals.approvedValue, 8350);

  const pdf = await exportMaintenancePdfFromData(data);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
