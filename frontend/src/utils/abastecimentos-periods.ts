export type AbastecimentoPeriodPreset = 'week' | '15days' | 'month'
export type AbastecimentoPeriod = { data_inicio: string; data_fim: string }

const isoDate = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

export const abastecimentoPeriod = (
  preset: AbastecimentoPeriodPreset,
  today = new Date(),
): AbastecimentoPeriod => {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = new Date(end)

  if (preset === 'week') start.setDate(end.getDate() - 6)
  if (preset === '15days') start.setDate(end.getDate() - 14)
  if (preset === 'month') start.setDate(1)

  return { data_inicio: isoDate(start), data_fim: isoDate(end) }
}

export const activeAbastecimentoPeriod = (
  period: Partial<AbastecimentoPeriod>,
  today = new Date(),
): AbastecimentoPeriodPreset | null => {
  return (['week', '15days', 'month'] as AbastecimentoPeriodPreset[]).find((preset) => {
    const expected = abastecimentoPeriod(preset, today)
    return period.data_inicio === expected.data_inicio && period.data_fim === expected.data_fim
  }) ?? null
}
