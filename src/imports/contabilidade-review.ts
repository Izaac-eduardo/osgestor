import { getAccountingMaintenanceExclusionReason } from '../services/maintenance-accounting-eligibility.js'
import { normalizeSearchText } from '../utils/text.js'

export const contabilReviewNatures = ['PECAS_MATERIAIS_MANUTENCAO', 'SERVICOS_TERCEIRIZADOS', 'PNEUS', 'OLEOS_LUBRIFICANTES', 'MATERIAIS_ELETRICOS', 'FERRAGENS_PARAFUSOS', 'USO_E_CONSUMO', 'ESTOQUE_ALMOXARIFADO', 'FORA_ESCOPO', 'PENDENTE'] as const
export type ContabilReviewNature = typeof contabilReviewNatures[number]
export const contabilReviewDestinations = ['APLICACAO_DIRETA_FROTA', 'ESTOQUE_ALMOXARIFADO', 'FORA_DO_ESCOPO', 'PENDENTE', 'NAO_APLICAVEL'] as const
export type ContabilReviewDestination = typeof contabilReviewDestinations[number]
export const contabilReviewStatuses = ['PENDENTE', 'RESOLVIDA'] as const
export type ContabilReviewStatus = typeof contabilReviewStatuses[number]
export type ContabilReviewConfidence = 'ALTA' | 'MEDIA' | 'BAIXA'
export type ContabilReviewClassification = 'PECAS_EXTERNAS' | 'SERVICOS_TERCEIRIZADOS' | 'PENDENTE'
export type ContabilReviewSuggestion = { natureza: ContabilReviewNature; destinacao: ContabilReviewDestination; classificacao: ContabilReviewClassification; confianca: ContabilReviewConfidence; motivo: string }

const normalize = (value: string | null | undefined): string => normalizeSearchText(value ?? '').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const hasFleet = (subcentro: string | null | undefined): boolean => { const value = normalize(subcentro); return Boolean(value) && value !== 'FROTAS DIVERSAS' && !stockWords.test(value) }
const stockWords = /(?:ALMOXARIFADO|ESTOQUE|DEPOSITO|ARMAZEM)/
const directMaterial = (natureza: ContabilReviewNature, subcentro: string | null, motivo: string, confianca: ContabilReviewConfidence = 'ALTA', fleetResolved?: boolean): ContabilReviewSuggestion => { const identified = fleetResolved ?? hasFleet(subcentro); return { natureza, destinacao: identified ? 'APLICACAO_DIRETA_FROTA' : 'PENDENTE', classificacao: 'PECAS_EXTERNAS', confianca, motivo: identified ? `${motivo} Frota identificada; aplicação direta sugerida.` : `${motivo} Frota não identificada; revisão necessária.` } }

export function suggestContabilReview(product: string | null, plan: string | null, subcentro: string | null, fleetResolved?: boolean): ContabilReviewSuggestion {
  const p = normalize(product); const c = normalize(plan); const exclusion = getAccountingMaintenanceExclusionReason(product)
  if (exclusion || /^(?:OLEO DIESEL|GASOLINA|ETANOL)(?:\s|$)/.test(p)) return { natureza: 'FORA_ESCOPO', destinacao: 'FORA_DO_ESCOPO', classificacao: 'PENDENTE', confianca: 'ALTA', motivo: exclusion ? `Exclusão contábil: ${exclusion}.` : 'Combustível fora do custo de manutenção.' }
  if (stockWords.test(`${p} ${normalize(subcentro)}`)) return { natureza: 'ESTOQUE_ALMOXARIFADO', destinacao: 'ESTOQUE_ALMOXARIFADO', classificacao: 'PENDENTE', confianca: 'ALTA', motivo: 'Descrição ou destinação indica estoque/almoxarifado.' }
  if (c === 'CUSTO SERVICOS') return { natureza: 'SERVICOS_TERCEIRIZADOS', destinacao: 'NAO_APLICAVEL', classificacao: 'SERVICOS_TERCEIRIZADOS', confianca: 'ALTA', motivo: 'Plano de contas reconhecido como serviço terceirizado.' }
  if (c === 'CUSTO PNEUS' || /\bPNEU(?:S)?\b/.test(p)) return directMaterial('PNEUS', subcentro, 'Produto/plano indica pneu.', 'ALTA', fleetResolved)
  if (/\b(?:FILTRO|BOMBA|SENSOR|REPARO|REPARACAO|MANUTENCAO|CONSERTO|KIT REPARO|PECA)\b/.test(p)) return directMaterial('PECAS_MATERIAIS_MANUTENCAO', subcentro, 'Produto indica componente ou reparo de manutenção.', 'ALTA', fleetResolved)
  if (/\b(?:OLEO|LUBRIFICANTE|GRAXA)\b/.test(p) || (c === 'CUSTO COMBUSTIVEIS LUBRIFICANTES' && /\b(?:MOTOR|HIDRAULICO|TRANSMISSAO|DIFERENCIAL|85W140|GRAXA)\b/.test(p))) return directMaterial('OLEOS_LUBRIFICANTES', subcentro, 'Produto indica óleo ou lubrificante.', 'ALTA', fleetResolved)
  if (c === 'CUSTO COMBUSTIVEIS LUBRIFICANTES' && /\bARLA\b/.test(p)) return { natureza: 'FORA_ESCOPO', destinacao: 'FORA_DO_ESCOPO', classificacao: 'PENDENTE', confianca: 'ALTA', motivo: 'ARLA 32 consumível fica fora do custo contábil; componentes e reparos são tratados como manutenção.' }
  if (c === 'CUSTO MATERIAIS ELETRICOS' || /\b(?:ELETRIC|LAMPADA|CABO|FUSIVEL|CHICOTE)\b/.test(p)) return directMaterial('MATERIAIS_ELETRICOS', subcentro, 'Produto/plano indica material elétrico.', 'MEDIA', fleetResolved)
  if (c === 'CUSTO FERRAGEM' || c === 'CUSTO PARAFUSOS PORCAS ARRUELAS' || /\b(?:PARAFUSO|PORCA|ARRUELA|FERRAGEM)\b/.test(p)) return directMaterial('FERRAGENS_PARAFUSOS', subcentro, 'Produto/plano indica ferragem ou fixador.', 'MEDIA', fleetResolved)
  if (c === 'CUSTO USO E CONSUMO') return directMaterial('USO_E_CONSUMO', subcentro, 'Plano indica uso e consumo; frota identificada permite sugerir aplicação direta.', 'MEDIA', fleetResolved)
  if (c === 'CUSTO PECAS OFICINA') return directMaterial('PECAS_MATERIAIS_MANUTENCAO', subcentro, 'Plano indica peça de manutenção.', 'ALTA', fleetResolved)
  return { natureza: 'PENDENTE', destinacao: 'PENDENTE', classificacao: 'PENDENTE', confianca: 'BAIXA', motivo: 'Não há evidência suficiente para classificar com segurança.' }
}

export function isReviewResolved(status: ContabilReviewStatus | undefined): boolean { return status === 'RESOLVIDA' }
