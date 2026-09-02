const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})

export const formatCurrency = (value: number): string => currencyFormatter.format(value)

export const formatShortDate = (value: string): string => {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export const formatCompactDate = (value: string): string => {
  const [, month, day] = value.split('-')
  return `${day}/${month}`
}