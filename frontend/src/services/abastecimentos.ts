import { api } from './api'
import type { AbastecimentoHistoricoEditPayload, AbastecimentoHistoricoFilters, AbastecimentoHistoricoResponse, AbastecimentosRelatorioResponse, AbastecimentoProduto, DestinacaoEspecial, Entrada, EntradaFilters, EntradaPayload, IdentificacaoTerceiro, PontoOperacional, Terceiro } from '../types/abastecimentos'

export const getAbastecimentoProdutos = async () => (await api.get<AbastecimentoProduto[]>('/abastecimento/produtos')).data
export const getPontos = async () => (await api.get<PontoOperacional[]>('/abastecimento/pontos')).data
export const getPontoProdutos = async (id: string) => (await api.get<AbastecimentoProduto[]>(`/abastecimento/pontos/${id}/produtos`)).data
export const createPonto = async (payload: Partial<PontoOperacional>) => (await api.post<PontoOperacional>('/abastecimento/pontos', payload)).data
export const updatePonto = async (id: string, payload: Partial<PontoOperacional>) => (await api.put<PontoOperacional>(`/abastecimento/pontos/${id}`, payload)).data
export const replacePontoProdutos = async (id: string, produto_ids: string[]) => (await api.put(`/abastecimento/pontos/${id}/produtos`, { produto_ids })).data
export const deletePonto = async (id: string) => api.delete(`/abastecimento/pontos/${id}`)

export const getTerceiros = async (params?: { nome?: string; codigo?: string; status?: string }) => (await api.get<Terceiro[]>('/abastecimento/terceiros', { params })).data
export const createTerceiro = async (payload: Partial<Terceiro>) => (await api.post<Terceiro>('/abastecimento/terceiros', payload)).data
export const updateTerceiro = async (id: string, payload: Partial<Terceiro>) => (await api.put<Terceiro>(`/abastecimento/terceiros/${id}`, payload)).data
export const deleteTerceiro = async (id: string) => api.delete(`/abastecimento/terceiros/${id}`)
export const getTerceiroIdentificacoes = async (id: string) => (await api.get<IdentificacaoTerceiro[]>(`/abastecimento/terceiros/${id}/identificacoes`)).data
export const createTerceiroIdentificacao = async (id: string, payload: Partial<IdentificacaoTerceiro>) => (await api.post<IdentificacaoTerceiro>(`/abastecimento/terceiros/${id}/identificacoes`, payload)).data
export const updateTerceiroIdentificacao = async (id: string, identificacaoId: string, payload: Partial<IdentificacaoTerceiro>) => (await api.put<IdentificacaoTerceiro>(`/abastecimento/terceiros/${id}/identificacoes/${identificacaoId}`, payload)).data
export const deleteTerceiroIdentificacao = async (id: string, identificacaoId: string) => api.delete(`/abastecimento/terceiros/${id}/identificacoes/${identificacaoId}`)

export const getDestinacoesEspeciais = async () => (await api.get<DestinacaoEspecial[]>('/abastecimento/destinacoes-especiais')).data
export const createDestinacaoEspecial = async (payload: Partial<DestinacaoEspecial>) => (await api.post<DestinacaoEspecial>('/abastecimento/destinacoes-especiais', payload)).data
export const updateDestinacaoEspecial = async (id: string, payload: Partial<DestinacaoEspecial>) => (await api.put<DestinacaoEspecial>(`/abastecimento/destinacoes-especiais/${id}`, payload)).data
export const deleteDestinacaoEspecial = async (id: string) => api.delete(`/abastecimento/destinacoes-especiais/${id}`)

export const getEntradas = async (params: EntradaFilters) => (await api.get<Entrada[]>('/abastecimento/entradas', { params })).data
export const getEntrada = async (id: string) => (await api.get<Entrada>(`/abastecimento/entradas/${id}`)).data
export const createEntrada = async (payload: EntradaPayload) => (await api.post<Entrada>('/abastecimento/entradas', payload)).data
export const updateEntrada = async (id: string, payload: EntradaPayload) => (await api.put<Entrada>(`/abastecimento/entradas/${id}`, payload)).data
export const deleteEntrada = async (id: string) => api.delete(`/abastecimento/entradas/${id}`)
export const getAbastecimentosHistorico = async (params: AbastecimentoHistoricoFilters) => (await api.get<AbastecimentoHistoricoResponse>('/abastecimento/historico', { params })).data
export const updateAbastecimentoHistorico = async (id: string, payload: AbastecimentoHistoricoEditPayload) => (await api.patch(`/abastecimento/historico/${id}`, payload)).data
export const getRelatorioAbastecimentos = async (params: AbastecimentoHistoricoFilters) => (await api.get<AbastecimentosRelatorioResponse>('/abastecimento/relatorios', { params })).data
