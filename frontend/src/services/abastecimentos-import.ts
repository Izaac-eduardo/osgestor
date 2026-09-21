import { api } from './api'
import type { DestinatarioTipo, ImportacaoPreview, PoliFrotaPreviewItem } from '../types/abastecimentos'

export const analyzePoliFrota = async (file: File) => { const data = new FormData(); data.append('arquivo', file); return (await api.post<ImportacaoPreview>('/abastecimento/importacoes/polifrota/analisar', data)).data }
export const getImportacaoPreview = async (id: string) => (await api.get<ImportacaoPreview>(`/abastecimento/importacoes/${id}`)).data
export const resolvePreviewItem = async (importId: string, itemId: string, resolution: Record<string, string | null>) => (await api.patch<PoliFrotaPreviewItem>(`/abastecimento/importacoes/${importId}/itens/${itemId}`, resolution)).data
export const resolvePreviewBatch = async (importId: string, item_ids: string[], resolution: Record<string, string | null>) => (await api.post<PoliFrotaPreviewItem[]>(`/abastecimento/importacoes/${importId}/resolver-lote`, { item_ids, ...resolution })).data
export const confirmPreview = async (importId: string, item_ids?: string[]) => (await api.post<{ importadas: number; ja_importados: number; pendentes: number; falhas: Array<{ identificador_externo: string; motivo: string }>; status: string }>(`/abastecimento/importacoes/${importId}/confirmar`, { item_ids })).data
export type PreviewResolution = { obra_id: string | null; tipo_destinatario: DestinatarioTipo | null; frota_id: string | null; terceiro_id: string | null; destinacao_especial_id: string | null }
