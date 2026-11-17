export type DuplicateIdentity = {
  dataConta: string | null
  notaOriginal: string | null
  codigoProdutoOriginal: string | null
  produtoOriginal: string | null
  quantidade: number | null
  valorUnitario: number | null
  valorTotal: number | null
  subcentroOriginal: string | null
  planoContasOriginal: string | null
  linhaOriginal: number
}

export function duplicateOccurrenceLines(rows: DuplicateIdentity[]): Map<number, number[]> {
  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const key = JSON.stringify([row.dataConta, row.notaOriginal, row.codigoProdutoOriginal, row.produtoOriginal, row.quantidade, row.valorUnitario, row.valorTotal, row.subcentroOriginal, row.planoContasOriginal])
    groups.set(key, [...(groups.get(key) ?? []), row.linhaOriginal])
  }
  const repeated = new Map<number, number[]>()
  for (const lines of groups.values()) if (lines.length > 1) for (const line of lines.slice(1)) repeated.set(line, lines)
  return repeated
}

export function duplicateReviewInputError(role: string | null | undefined, line: number, relatedLines: number[], justification: unknown): string | null {
  if (role !== 'ADMIN') return 'DUPLICATE_REVIEW_FORBIDDEN'
  if (!Number.isInteger(line) || relatedLines.length < 2 || !relatedLines.includes(line)) return 'DUPLICATE_REVIEW_NOT_CANDIDATE'
  const reason = typeof justification === 'string' ? justification.trim() : ''
  if (reason.length < 20 || reason.length > 1000) return 'INVALID_DUPLICATE_REVIEW_JUSTIFICATION'
  return null
}
