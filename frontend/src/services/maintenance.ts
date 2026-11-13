import { api } from './api'
import type { MaintenanceDetail, MaintenanceFilters, MaintenanceFleetSummary, MaintenanceTotals } from '../types/maintenance'
import { responseArray, responseObject } from './response-shapes'

const params = (filters: MaintenanceFilters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
export async function getMaintenanceByFleet(filters: MaintenanceFilters, signal?: AbortSignal) { return responseArray<MaintenanceFleetSummary>((await api.get('/manutencao-financeira/por-frota', { params: params(filters), signal })).data, 'consolidação por frota') }
export async function getMaintenanceTotals(filters: MaintenanceFilters, signal?: AbortSignal) { return responseObject<MaintenanceTotals>((await api.get('/manutencao-financeira/totais', { params: params(filters), signal })).data, 'totais de manutenção') }
export async function getMaintenanceDetails(filters: MaintenanceFilters, signal?: AbortSignal) { return responseArray<MaintenanceDetail>((await api.get('/manutencao-financeira/detalhes', { params: params(filters), signal })).data, 'detalhamento de manutenção') }
export async function downloadMaintenance(format: 'pdf' | 'xlsx', filters: MaintenanceFilters) { const response = await api.get<Blob>(`/manutencao-financeira/exportar.${format}`, { params: params(filters), responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `manutencao-por-frota.${format}`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url) }
export async function getSharedExpenses(filters: MaintenanceFilters, signal?: AbortSignal) { return (await api.get('/manutencao-financeira/despesas-compartilhadas', { params: params(filters), signal })).data }
