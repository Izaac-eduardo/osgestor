import { api } from './api'
import type { DestinatarioTipo, ImportacaoEmAndamento, ImportacaoPreview, PoliFrotaPreviewItem, SubstituicaoAlvo } from '../types/abastecimentos'

export const analyzePoliFrota = async (file: File, novaAnalise = false) => { const data = new FormData(); data.append('arquivo', file); return (await api.post<ImportacaoPreview>(`/abastecimento/importacoes/polifrota/analisar${novaAnalise ? '?nova_analise=true' : ''}`, data)).data }
export const getImportacoesEmAndamento = async () => (await api.get<ImportacaoEmAndamento[]>('/abastecimento/importacoes/polifrota/em-andamento')).data
export const cancelImportacao = async (id: string) => (await api.patch<{ id: string; arquivo_nome: string; status: string; finalizada_at: string }>(`/abastecimento/importacoes/${id}/cancelar`)).data
export const getImportacaoPreview = async (id: string) => (await api.get<ImportacaoPreview>(`/abastecimento/importacoes/${id}`)).data
export const resolvePreviewItem = async (importId: string, itemId: string, resolution: Record<string, string | null>) => (await api.patch<PoliFrotaPreviewItem>(`/abastecimento/importacoes/${importId}/itens/${itemId}`, resolution)).data
export const resolvePreviewBatch = async (importId: string, item_ids: string[], resolution: Record<string, string | null>) => (await api.post<PoliFrotaPreviewItem[]>(`/abastecimento/importacoes/${importId}/resolver-lote`, { item_ids, ...resolution })).data
export const confirmPreview = async (importId: string, item_ids?: string[]) => (await api.post<{ importadas: number; ja_importados: number; substituicoes: number; pendentes: number; falhas: Array<{ identificador_externo: string; motivo: string }>; status: string }>(`/abastecimento/importacoes/${importId}/confirmar`, { item_ids })).data
export const searchSubstitutionTargets = async (params: { busca?: string; data_inicio?: string; data_fim?: string }) => (await api.get<SubstituicaoAlvo[]>('/abastecimento/importacoes/polifrota/substituicoes/alvos', { params })).data
export const markSubstitution = async (importId: string, itemId: string, abastecimento_id: string) => (await api.post<PoliFrotaPreviewItem>(`/abastecimento/importacoes/${importId}/itens/${itemId}/substituicao`, { abastecimento_id })).data
export const removeSubstitution = async (importId: string, itemId: string) => (await api.delete<PoliFrotaPreviewItem>(`/abastecimento/importacoes/${importId}/itens/${itemId}/substituicao`)).data
export type PreviewResolution = { obra_id: string | null; tipo_destinatario: DestinatarioTipo | null; frota_id: string | null; terceiro_id: string | null; destinacao_especial_id: string | null }
