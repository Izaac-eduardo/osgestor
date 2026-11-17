export type AccountingPeriod = { inicio: string; fim: string }

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function parseAccountingPeriod(start: unknown, end: unknown, minimum = '2026-11-01'): AccountingPeriod {
  if (typeof start !== 'string' || typeof end !== 'string' || !validIsoDate(start) || !validIsoDate(end)) {
    throw new Error('Informe datas válidas de início e fim no formato AAAA-MM-DD.')
  }
  if (start < minimum) throw new Error(`O início do período não pode ser anterior a ${minimum}.`)
  if (start > end) throw new Error('A data inicial do período deve ser anterior ou igual à data final.')
  return { inicio: start, fim: end }
}

export function accountingDateOutsidePeriod(date: string | null, period: AccountingPeriod): boolean {
  return date === null || date < period.inicio || date > period.fim
}

export function accountingPeriodsOverlap(left: AccountingPeriod, right: AccountingPeriod): boolean {
  return left.inicio <= right.fim && right.inicio <= left.fim
}
