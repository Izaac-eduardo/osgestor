export const MANUAL_DECISION_BLOCK_CODES = [
  'AMBIGUOUS_FUEL_CLASSIFICATION',
  'DUPLICATE_IN_FILE',
  'DUPLICATE_IN_PREVIOUS_IMPORT',
  'INVALID_ACCOUNTING_PERIOD',
  'INVALID_TOTAL_VALUE',
] as const

export type ManualDecisionBlockCode = typeof MANUAL_DECISION_BLOCK_CODES[number]
export type ManualDecisionBlock = { codigo: ManualDecisionBlockCode; mensagem: string }
