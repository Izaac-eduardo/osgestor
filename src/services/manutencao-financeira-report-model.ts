import type { ManutencaoFilters } from './manutencao-financeira.service.js';
import { matchesDiverseMaintenanceFilters, sumCurrencyValues } from './maintenance-accounting-eligibility.js';

export type MaintenanceReportRow = Record<string, unknown>;
export type MaintenanceReportData = { summary: MaintenanceReportRow[]; details: MaintenanceReportRow[]; shared: MaintenanceReportRow[]; sharedTotals: { approved: number; pending: number; disregarded: number; approvedValue: number }; filters: ManutencaoFilters };

export function buildMaintenanceReportData(summary: MaintenanceReportRow[], details: MaintenanceReportRow[], sharedResult: MaintenanceReportRow & { itens?: MaintenanceReportRow[] }, filters: MaintenanceReportData['filters']): MaintenanceReportData {
  const shared = Array.isArray(sharedResult.itens) ? sharedResult.itens : [];
  const allocated = (row: MaintenanceReportRow): boolean => Boolean(row.frota_id) || (typeof row.frota === 'string' && row.frota !== '' && row.frota !== 'Despesas compartilhadas' && row.frota !== 'Shared expenses');
  const approved = shared.filter(row => row.despesa_compartilhada_status === 'APROVADA' && !allocated(row));
  const approvedMaintenance = approved.filter(row => matchesDiverseMaintenanceFilters(row, filters));
  return { summary, details, shared, sharedTotals: { approved: approvedMaintenance.length, pending: shared.filter(row => row.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length, disregarded: shared.filter(row => row.despesa_compartilhada_status === 'DESCONSIDERADA').length, approvedValue: Number(sumCurrencyValues(approvedMaintenance.map(row => row.valor_total))) }, filters };
}
