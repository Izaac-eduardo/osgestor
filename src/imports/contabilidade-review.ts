import { getAccountingMaintenanceExclusionReason } from '../services/maintenance-accounting-eligibility.js'
import { normalizeSearchText } from '../utils/text.js'

export const contabilReviewNatures = [
  'PECAS_MATERIAIS_MANUTENCAO', 'SERVICOS_TERCEIRIZADOS', 'PNEUS', 'OLEOS_LUBRIFICANTES',
  'MATERIAIS_ELETRICOS', 'FERRAGENS_PARAFUSOS', 'USO_E_CONSUMO', 'ESTOQUE_ALMOXARIFADO', 'FORA_ESCOPO', 'PENDENTE',
] as const
export type ContabilReviewNature = typeof contabilReviewNatures[number]
export const contabilReviewDestinations = ['APLICACAO_DIRETA_FROTA', 'ESTOQUE_ALMOXARIFADO', 'FORA_DO_ESCOPO', 'PENDENTE', 'NAO_APLICAVEL'] as const
export type ContabilReviewDestination = typeof contabilReviewDestinations[number]
export const contabilReviewStatuses = ['PENDENTE', 'RESOLVIDA'] as const
export type ContabilReviewStatus = typeof contabilReviewStatuses[number]
export type ContabilReviewConfidence = 'ALTA' | 'MEDIA' | 'BAIXA'

export type ContabilReviewSuggestion = {
  natureza: ContabilReviewNature
  destinacao: ContabilReviewDestination
  confianca: ContabilReviewConfidence
  motivo: string
}

const normalize = (value: string | null | undefined): string => normalizeSearchText(value ?? '').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const hasFleet = (subcentro: string | null | undefined): boolean => /^FROTA\s+/.test(normalize(subcentro))
const stockWords = /(?:ALMOXARIFADO|ESTOQUE|DEPOSITO|DEPÓSITO|ARMAZEM|ARMAZÉM)/

export function suggestContabilReview(product: string | null, plan: string | null, subcentro: string | null): ContabilReviewSuggestion {
  const p = normalize(product)
  const c = normalize(plan)
  const s = normalize(subcentro)
  const exclusion = getAccountingMaintenanceExclusionReason(product)
  if (exclusion || /^(?:OLEO DIESEL|GASOLINA|ETANOL)(?:\s|$)/.test(p)) return { natureza: 'FORA_ESCOPO', destinacao: 'FORA_DO_ESCOPO', confianca: 'ALTA', motivo: exclusion ? `Exclusão contábil: ${exclusion}.` : 'Combustível fora do custo de manutenção.' }
  if (stockWords.test(`${p} ${s}`)) return { natureza: 'ESTOQUE_ALMOXARIFADO', destinacao: 'ESTOQUE_ALMOXARIFADO', confianca: 'ALTA', motivo: 'Descrição ou destinação indica estoque/almoxarifado.' }
  if (c === 'CUSTO SERVICOS') return { natureza: 'SERVICOS_TERCEIRIZADOS', destinacao: 'NAO_APLICAVEL', confianca: 'ALTA', motivo: 'Plano de contas reconhecido como serviço terceirizado.' }
  if (c === 'CUSTO PNEUS' || /\bPNEU(?:S)?\b/.test(p)) return { natureza: 'PNEUS', destinacao: hasFleet(subcentro) ? 'APLICACAO_DIRETA_FROTA' : 'PENDENTE', confianca: hasFleet(subcentro) ? 'MEDIA' : 'BAIXA', motivo: 'Produto/plano indica pneu; confirmar aplicação direta ou estoque.' }
  if (/\b(?:OLEO|LUBRIFICANTE|GRAXA)\b/.test(p) || c === 'CUSTO COMBUSTIVEIS LUBRIFICANTES') return { natureza: 'OLEOS_LUBRIFICANTES', destinacao: hasFleet(subcentro) ? 'APLICACAO_DIRETA_FROTA' : 'PENDENTE', confianca: hasFleet(subcentro) ? 'MEDIA' : 'BAIXA', motivo: 'Produto/plano indica óleo ou lubrificante; confirmar aplicação direta.' }
  if (c === 'CUSTO MATERIAIS ELETRICOS' || /\b(?:ELETRIC|LAMPADA|CABO|FUSIVEL|CHICOTE)\b/.test(p)) return { natureza: 'MATERIAIS_ELETRICOS', destinacao: hasFleet(subcentro) ? 'APLICACAO_DIRETA_FROTA' : 'PENDENTE', confianca: 'BAIXA', motivo: 'Material elétrico pode ser aplicado diretamente ou mantido em estoque.' }
  if (c === 'CUSTO FERRAGEM' || c === 'CUSTO PARAFUSOS PORCAS ARRUELAS' || /\b(?:PARAFUSO|PORCA|ARRUELA|FERRAGEM)\b/.test(p)) return { natureza: 'FERRAGENS_PARAFUSOS', destinacao: hasFleet(subcentro) ? 'APLICACAO_DIRETA_FROTA' : 'PENDENTE', confianca: 'BAIXA', motivo: 'Ferragem pode ser aplicada diretamente ou mantida em estoque.' }
  if (c === 'CUSTO USO E CONSUMO') return { natureza: 'USO_E_CONSUMO', destinacao: hasFleet(subcentro) ? 'APLICACAO_DIRETA_FROTA' : 'PENDENTE', confianca: 'BAIXA', motivo: 'Uso e consumo exige confirmação da aplicação direta.' }
  if (c === 'CUSTO PECAS OFICINA') return { natureza: 'PECAS_MATERIAIS_MANUTENCAO', destinacao: hasFleet(subcentro) ? 'APLICACAO_DIRETA_FROTA' : 'PENDENTE', confianca: 'MEDIA', motivo: 'Plano indica peça de manutenção; confirmar aplicação direta ou estoque.' }
  return { natureza: 'PENDENTE', destinacao: 'PENDENTE', confianca: 'BAIXA', motivo: 'Não há evidência suficiente para classificar com segurança.' }
}

export function isReviewResolved(status: ContabilReviewStatus | undefined): boolean { return status === 'RESOLVIDA' }
