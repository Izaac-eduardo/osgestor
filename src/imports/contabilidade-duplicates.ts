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
  const groups = new Map<string, { lines: number[]; manualDecision: boolean }>()
  for (const row of rows) {
    const key = JSON.stringify([row.dataConta, row.notaOriginal, row.codigoProdutoOriginal, row.produtoOriginal, row.quantidade, row.valorUnitario, row.valorTotal, row.subcentroOriginal, row.planoContasOriginal])
    const group = groups.get(key) ?? { lines: [], manualDecision: row.subcentroOriginal?.trim().toUpperCase() === 'FROTAS DIVERSAS' }
    group.lines.push(row.linhaOriginal)
    groups.set(key, group)
  }
  const repeated = new Map<number, number[]>()
  for (const group of groups.values()) if (group.lines.length > 1) {
    const candidates = group.manualDecision ? group.lines : group.lines.slice(1)
    for (const line of candidates) repeated.set(line, group.lines)
  }
  return repeated
}

export function duplicateReviewInputError(role: string | null | undefined, line: number, relatedLines: number[], decision: unknown): string | null {
  if (role !== 'ADMIN') return 'DUPLICATE_REVIEW_FORBIDDEN'
  if (!Number.isInteger(line) || relatedLines.length < 2 || !relatedLines.includes(line)) return 'DUPLICATE_REVIEW_NOT_CANDIDATE'
  if (decision !== 'APROVAR' && decision !== 'DESCONSIDERAR') return 'INVALID_DUPLICATE_REVIEW_DECISION'
  return null
}
