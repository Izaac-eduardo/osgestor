export type ManualDecisionBlockCode =
  | 'AMBIGUOUS_FUEL_CLASSIFICATION'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_IN_PREVIOUS_IMPORT'
  | 'INVALID_ACCOUNTING_PERIOD'
  | 'INVALID_TOTAL_VALUE'

export type ManualDecisionBlock = { codigo: ManualDecisionBlockCode; mensagem: string }

export type ManualDecisionBlockFlags = {
  combustivel_status: string | null
  duplicado_no_arquivo: boolean
  duplicado_em_importacao_anterior: boolean
  fora_periodo_autorizado: boolean
  valor_total_invalido: boolean
}

export function manualDecisionBlocks(item: ManualDecisionBlockFlags): ManualDecisionBlock[] {
  return [
    item.combustivel_status === 'AMBIGUO' ? { codigo: 'AMBIGUOUS_FUEL_CLASSIFICATION', mensagem: 'Combust\u00edvel com classifica\u00e7\u00e3o amb\u00edgua.' } : null,
    item.duplicado_no_arquivo ? { codigo: 'DUPLICATE_IN_FILE', mensagem: 'Poss\u00edvel duplicidade dentro do arquivo.' } : null,
    item.duplicado_em_importacao_anterior ? { codigo: 'DUPLICATE_IN_PREVIOUS_IMPORT', mensagem: 'Lan\u00e7amento j\u00e1 encontrado em importa\u00e7\u00e3o anterior.' } : null,
    item.fora_periodo_autorizado ? { codigo: 'INVALID_ACCOUNTING_PERIOD', mensagem: 'Data ausente ou anterior ao in\u00edcio da compet\u00eancia autorizada (01/11/2026).' } : null,
    item.valor_total_invalido ? { codigo: 'INVALID_TOTAL_VALUE', mensagem: 'Valor total ausente ou inv\u00e1lido.' } : null,
  ].filter((block): block is ManualDecisionBlock => block !== null)
}
