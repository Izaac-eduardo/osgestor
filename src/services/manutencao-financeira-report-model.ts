import type { ManutencaoFilters } from './manutencao-financeira.service.js';

export type MaintenanceReportRow = Record<string, unknown>;
export type MaintenanceReportData = { summary: MaintenanceReportRow[]; details: MaintenanceReportRow[]; shared: MaintenanceReportRow[]; sharedTotals: { approved: number; pending: number; disregarded: number; approvedValue: number }; filters: ManutencaoFilters };

export function buildMaintenanceReportData(summary: MaintenanceReportRow[], details: MaintenanceReportRow[], sharedResult: MaintenanceReportRow & { itens?: MaintenanceReportRow[] }, filters: MaintenanceReportData['filters']): MaintenanceReportData {
  const shared = Array.isArray(sharedResult.itens) ? sharedResult.itens : [];
  const allocated = (row: MaintenanceReportRow): boolean => Boolean(row.frota_id) || (typeof row.frota === 'string' && row.frota !== '' && row.frota !== 'Despesas compartilhadas' && row.frota !== 'Shared expenses');
  const approved = shared.filter(row => row.despesa_compartilhada_status === 'APROVADA' && !allocated(row));
  return { summary, details, shared, sharedTotals: { approved: approved.length, pending: shared.filter(row => row.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length, disregarded: shared.filter(row => row.despesa_compartilhada_status === 'DESCONSIDERADA').length, approvedValue: approved.reduce((total, row) => total + Number(row.valor_total ?? 0), 0) }, filters };
}
