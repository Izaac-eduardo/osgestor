import type { ManutencaoFilters } from './manutencao-financeira.service.js';
import { buildMaintenanceReportData, type MaintenanceReportData, type MaintenanceReportRow } from './manutencao-financeira-report-model.js';
import { renderMaintenanceExcel } from './manutencao-financeira-excel.service.js';
import { renderMaintenancePdf } from './manutencao-financeira-pdf.service.js';

async function reportData(filters: ManutencaoFilters): Promise<MaintenanceReportData> {
  const { getDespesasCompartilhadas, getManutencaoDetalhes, getManutencaoPorFrota } = await import('./manutencao-financeira.service.js');
  const [summary, details, shared] = await Promise.all([getManutencaoPorFrota(filters), getManutencaoDetalhes(filters), getDespesasCompartilhadas(filters)]);
  const orderedSummary = (summary as MaintenanceReportRow[]).slice().sort((a, b) => Number(b.total_efetivo ?? 0) - Number(a.total_efetivo ?? 0) || String(a.prefixo ?? '').localeCompare(String(b.prefixo ?? '')));
  return buildMaintenanceReportData(orderedSummary, details as MaintenanceReportRow[], shared as MaintenanceReportRow & { itens?: MaintenanceReportRow[] }, filters);
}

export function exportMaintenanceExcelFromData(data: MaintenanceReportData): Promise<Buffer> { return renderMaintenanceExcel(data); }
export async function exportMaintenanceExcel(filters: ManutencaoFilters): Promise<Buffer> { return exportMaintenanceExcelFromData(await reportData(filters)); }
export function exportMaintenancePdfFromData(data: MaintenanceReportData): Promise<Buffer> { return renderMaintenancePdf(data); }
export async function exportMaintenancePdf(filters: ManutencaoFilters): Promise<Buffer> { return exportMaintenancePdfFromData(await reportData(filters)); }
