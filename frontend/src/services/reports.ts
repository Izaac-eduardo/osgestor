import type { AxiosRequestConfig } from 'axios'
import { api } from './api'
import type { DashboardSummary, ExpensesByProject, OrdersByWeek } from '../types/reports'

const requestConfig = (signal?: AbortSignal): AxiosRequestConfig => ({ signal })

export async function getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/relatorios/resumo', requestConfig(signal))
  return data
}

export async function getExpensesByProject(signal?: AbortSignal): Promise<ExpensesByProject[]> {
  const { data } = await api.get<ExpensesByProject[]>('/relatorios/gastos-por-obra', requestConfig(signal))
  return data
}

export async function getOrdersByWeek(signal?: AbortSignal): Promise<OrdersByWeek[]> {
  const { data } = await api.get<OrdersByWeek[]>('/relatorios/os-por-semana', requestConfig(signal))
  return data
}