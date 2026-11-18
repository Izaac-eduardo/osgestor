import type { ContabilClassification, ContabilDespesaCompartilhadaStatus } from './contabilidade.js'

export type PreviewSummaryItem = {
  classificacao: ContabilClassification
  valor_total: number | null
  combustivel_status: string | null
  despesa_compartilhada_status: ContabilDespesaCompartilhadaStatus
  revisao_status?: string
  destinacao_revisao?: string
}

export type ContabilPreviewValueSummary = { valorPendenteClassificacao: number; valorCompartilhadoAguardando: number; valorExcluidoEscopo: number }

export function summarizeContabilPreviewItems(items: PreviewSummaryItem[]): ContabilPreviewValueSummary {
  const value = (rows: PreviewSummaryItem[]): number => rows.reduce((total, item) => total + (item.valor_total ?? 0), 0)
  return {
    valorPendenteClassificacao: value(items.filter(item => item.classificacao === 'PENDENTE' && item.revisao_status !== 'RESOLVIDA' && item.combustivel_status !== 'FORA_ESCOPO_COMBUSTIVEL')),
    valorCompartilhadoAguardando: value(items.filter(item => item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO')),
    valorExcluidoEscopo: value(items.filter(item => item.combustivel_status === 'FORA_ESCOPO_COMBUSTIVEL' || item.destinacao_revisao === 'FORA_DO_ESCOPO')),
  }
}

export type ConfirmationBlockItem = {
  valor_total_invalido: boolean
  combustivel_status: string | null
  duplicado_em_importacao_anterior: boolean
  duplicado_no_arquivo: boolean
  duplicidade_revisada: boolean
  revisao_status?: string
}

export function contabilPreviewBlocksConfirmation(items: ConfirmationBlockItem[], foraPeriodo: number, arquivoJaImportado = false, historicoSemPeriodo = 0, periodoSobreposto = false): boolean {
  return arquivoJaImportado || foraPeriodo > 0 || historicoSemPeriodo > 0 || periodoSobreposto || items.some(item => item.valor_total_invalido || item.combustivel_status === 'AMBIGUO' || item.duplicado_em_importacao_anterior || (item.duplicado_no_arquivo && !item.duplicidade_revisada) || (item.revisao_status !== undefined && item.revisao_status !== 'RESOLVIDA'))
}
