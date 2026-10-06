export type DashboardPreset = 'week' | '15days' | 'month'
export type DashboardPeriod = { data_inicio: string; data_fim: string }

export const isoDate = (value: Date): string => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

export const dashboardPeriod = (preset: DashboardPreset, today = new Date()): DashboardPeriod => {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = new Date(end)
  if (preset === 'week') start.setDate(end.getDate() - ((end.getDay() + 6) % 7))
  if (preset === '15days') start.setDate(end.getDate() - 14)
  if (preset === 'month') start.setDate(1)
  return { data_inicio: isoDate(start), data_fim: isoDate(end) }
}

export const activeDashboardPreset = (period: Partial<DashboardPeriod>, today = new Date()): DashboardPreset | null => {
  return (['week', '15days', 'month'] as DashboardPreset[]).find(preset => {
    const expected = dashboardPeriod(preset, today)
    return period.data_inicio === expected.data_inicio && period.data_fim === expected.data_fim
  }) ?? null
}
