const digits = (value: string): string => value.replace(/[^0-9,.-]/g, '')

const formatDecimalInput = (value: string, scale: number, prefix = ''): string => {
  const raw = digits(value).replace(/-/g, '')
  if (!raw) return ''
  const [integerPart = '', decimalPart] = raw.split(',')
  const integer = (integerPart.replace(/\./g, '').replace(/^0+(?=\d)/, '') || '0')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimal = decimalPart === undefined ? '' : `,${decimalPart.replace(/\./g, '').slice(0, scale)}`
  return `${prefix}${grouped}${decimal}`
}

export const formatLitersInput = (value: string): string => formatDecimalInput(value, 3)
export const formatAbastecimentoValueInputText = (value: string): string => formatDecimalInput(value, 4)
export const formatLitersNumberInput = (value: number): string => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value)
export const formatLitersNumber = (value: number): string => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)
export const formatCurrencyInput = (value: string, complete = false): string => {
  const formatted = formatDecimalInput(value.replace(/^R\$\s*/, ''), 2, 'R$ ')
  if (!formatted || !complete) return formatted
  const [integer, decimal = ''] = formatted.slice(3).split(',')
  return `R$ ${integer},${decimal.slice(0, 2).padEnd(2, '0')}`
}
export const formatCurrencyNumber = (value: number): string => `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
export const formatAbastecimentoValueInput = (value: number): string => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value)
export const formatCurrencyCentsInput = (value: string): string => {
  const raw = digits(value).replace(/\D/g, '')
  if (!raw) return ''
  const cents = raw.padStart(3, '0').slice(-2); const integer = raw.slice(0, -2).replace(/^0+(?=\d)/g, '') || '0'
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`
}

export const parsePtBrNumber = (value: string): number | null => {
  const normalized = value.replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.').trim()
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const result = Number(normalized)
  return Number.isFinite(result) ? result : null
}
export const parseLitersInput = (value: string): number | null => parsePtBrNumber(value)
export const parseCurrencyInput = (value: string): number | null => parsePtBrNumber(value)
