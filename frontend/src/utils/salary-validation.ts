export function validateSalaryValue(input: string): string | null {
  const value = input.replace(',', '.').trim()
  return /^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0
    ? null
    : 'Informe um valor mensal válido, sem valor negativo.'
}
