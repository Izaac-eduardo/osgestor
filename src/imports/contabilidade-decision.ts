export type ManualDecisionBlockFlags = {
  combustivel_status: string | null
  duplicado_no_arquivo: boolean
  duplicado_em_importacao_anterior: boolean
  fora_periodo_autorizado: boolean
  valor_total_invalido: boolean
}

export function manualDecisionBlockReasons(item: ManualDecisionBlockFlags): string[] {
  return [
    item.combustivel_status === 'AMBIGUO' ? 'Combust\u00edvel com classifica\u00e7\u00e3o amb\u00edgua.' : null,
    item.duplicado_no_arquivo ? 'Poss\u00edvel duplicidade dentro do arquivo.' : null,
    item.duplicado_em_importacao_anterior ? 'Lan\u00e7amento j\u00e1 encontrado em importa\u00e7\u00e3o anterior.' : null,
    item.fora_periodo_autorizado ? 'Data ausente ou anterior ao in\u00edcio da compet\u00eancia autorizada (01/11/2026).' : null,
    item.valor_total_invalido ? 'Valor total ausente ou inv\u00e1lido.' : null,
  ].filter((reason): reason is string => reason !== null);
}
