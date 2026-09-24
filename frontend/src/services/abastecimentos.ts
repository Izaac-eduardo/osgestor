import { api } from "./api";
import type {
  AbastecimentoHistoricoEditPayload,
  AbastecimentoHistoricoFilters,
  AbastecimentoHistoricoResponse,
  AbastecimentoStatus,
  AbastecimentosRelatorioResponse,
  ConsumoFrotaFilters,
  ConsumoFrotaResponse,
  AbastecimentoProduto,
  DestinacaoEspecial,
  Entrada,
  EntradaFilters,
  EntradaPayload,
  EntradasRelatorioFilters,
  EntradasRelatorioResponse,
  IdentificacaoTerceiro,
  FrotaTerceira,
  FrotaTerceiraFilters,
  FrotaTerceiraPayload,
  PontoOperacional,
  Terceiro,
} from "../types/abastecimentos";

export const getAbastecimentoProdutos = async () =>
  (await api.get<AbastecimentoProduto[]>("/abastecimento/produtos")).data;
export const getPontos = async () =>
  (await api.get<PontoOperacional[]>("/abastecimento/pontos")).data;
export const getPontoProdutos = async (id: string) =>
  (
    await api.get<AbastecimentoProduto[]>(
      `/abastecimento/pontos/${id}/produtos`,
    )
  ).data;

export type AbastecimentosExportKind = 'abastecimentos' | 'entradas' | 'consumo-frota'
export type AbastecimentosExportFormat = 'pdf' | 'excel'
export type AbastecimentosExportParams = object

export async function downloadAbastecimentosExport(kind: AbastecimentosExportKind, format: AbastecimentosExportFormat, params: AbastecimentosExportParams) {
  const prefix = kind === 'entradas' ? '/entradas' : kind === 'consumo-frota' ? '/consumo-frota' : ''
  const response = await api.get(`/abastecimento/relatorios${prefix}/exportar/${format}`, { params, responseType: 'blob' })
  const disposition = String(response.headers['content-disposition'] || '')
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  const filename = encoded ? decodeURIComponent(encoded) : plain || `${kind}.${format === 'excel' ? 'xlsx' : 'pdf'}`
  const url = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
export const createPonto = async (payload: Partial<PontoOperacional>) =>
  (await api.post<PontoOperacional>("/abastecimento/pontos", payload)).data;
export const updatePonto = async (
  id: string,
  payload: Partial<PontoOperacional>,
) =>
  (await api.put<PontoOperacional>(`/abastecimento/pontos/${id}`, payload))
    .data;
export const replacePontoProdutos = async (id: string, produto_ids: string[]) =>
  (await api.put(`/abastecimento/pontos/${id}/produtos`, { produto_ids })).data;
export const deletePonto = async (id: string) =>
  api.delete(`/abastecimento/pontos/${id}`);

export const getTerceiros = async (params?: {
  nome?: string;
  codigo?: string;
  status?: string;
}) => (await api.get<Terceiro[]>("/abastecimento/terceiros", { params })).data;
export const createTerceiro = async (payload: Partial<Terceiro>) =>
  (await api.post<Terceiro>("/abastecimento/terceiros", payload)).data;
export const updateTerceiro = async (id: string, payload: Partial<Terceiro>) =>
  (await api.put<Terceiro>(`/abastecimento/terceiros/${id}`, payload)).data;
export const deleteTerceiro = async (id: string) =>
  api.delete(`/abastecimento/terceiros/${id}`);
export const listarFrotasTerceiras = async (params?: FrotaTerceiraFilters) =>
  (await api.get<FrotaTerceira[]>('/abastecimento/frotas-terceiras', { params })).data;
export const obterFrotaTerceira = async (id: string) =>
  (await api.get<FrotaTerceira>(`/abastecimento/frotas-terceiras/${id}`)).data;
export const criarFrotaTerceira = async (payload: FrotaTerceiraPayload) =>
  (await api.post<FrotaTerceira>('/abastecimento/frotas-terceiras', payload)).data;
export const atualizarFrotaTerceira = async (id: string, payload: FrotaTerceiraPayload) =>
  (await api.put<FrotaTerceira>(`/abastecimento/frotas-terceiras/${id}`, payload)).data;
export const alterarStatusFrotaTerceira = async (id: string, status: AbastecimentoStatus) =>
  (await api.patch<FrotaTerceira>(`/abastecimento/frotas-terceiras/${id}/status`, { status })).data;
export const getTerceiroIdentificacoes = async (id: string) =>
  (
    await api.get<IdentificacaoTerceiro[]>(
      `/abastecimento/terceiros/${id}/identificacoes`,
    )
  ).data;
export const createTerceiroIdentificacao = async (
  id: string,
  payload: Partial<IdentificacaoTerceiro>,
) =>
  (
    await api.post<IdentificacaoTerceiro>(
      `/abastecimento/terceiros/${id}/identificacoes`,
      payload,
    )
  ).data;
export const updateTerceiroIdentificacao = async (
  id: string,
  identificacaoId: string,
  payload: Partial<IdentificacaoTerceiro>,
) =>
  (
    await api.put<IdentificacaoTerceiro>(
      `/abastecimento/terceiros/${id}/identificacoes/${identificacaoId}`,
      payload,
    )
  ).data;
export const deleteTerceiroIdentificacao = async (
  id: string,
  identificacaoId: string,
) =>
  api.delete(
    `/abastecimento/terceiros/${id}/identificacoes/${identificacaoId}`,
  );

export const getDestinacoesEspeciais = async () =>
  (await api.get<DestinacaoEspecial[]>("/abastecimento/destinacoes-especiais"))
    .data;
export const createDestinacaoEspecial = async (
  payload: Partial<DestinacaoEspecial>,
) =>
  (
    await api.post<DestinacaoEspecial>(
      "/abastecimento/destinacoes-especiais",
      payload,
    )
  ).data;
export const updateDestinacaoEspecial = async (
  id: string,
  payload: Partial<DestinacaoEspecial>,
) =>
  (
    await api.put<DestinacaoEspecial>(
      `/abastecimento/destinacoes-especiais/${id}`,
      payload,
    )
  ).data;
export const deleteDestinacaoEspecial = async (id: string) =>
  api.delete(`/abastecimento/destinacoes-especiais/${id}`);

export const getEntradas = async (params: EntradaFilters) =>
  (await api.get<Entrada[]>("/abastecimento/entradas", { params })).data;
export const getEntrada = async (id: string) =>
  (await api.get<Entrada>(`/abastecimento/entradas/${id}`)).data;
export const createEntrada = async (payload: EntradaPayload) =>
  (await api.post<Entrada>("/abastecimento/entradas", payload)).data;
export const updateEntrada = async (id: string, payload: EntradaPayload) =>
  (await api.put<Entrada>(`/abastecimento/entradas/${id}`, payload)).data;
export const deleteEntrada = async (id: string) =>
  api.delete(`/abastecimento/entradas/${id}`);
export const getAbastecimentosHistorico = async (
  params: AbastecimentoHistoricoFilters,
) =>
  (
    await api.get<AbastecimentoHistoricoResponse>("/abastecimento/historico", {
      params,
    })
  ).data;
export const updateAbastecimentoHistorico = async (
  id: string,
  payload: AbastecimentoHistoricoEditPayload,
) => (await api.patch(`/abastecimento/historico/${id}`, payload)).data;
export const getRelatorioAbastecimentos = async (
  params: AbastecimentoHistoricoFilters,
) =>
  (
    await api.get<AbastecimentosRelatorioResponse>(
      "/abastecimento/relatorios",
      { params },
    )
  ).data;
export const getRelatorioEntradas = async (params: EntradasRelatorioFilters) =>
  (
    await api.get<EntradasRelatorioResponse>(
      "/abastecimento/relatorios/entradas",
      { params },
    )
  ).data;
export const getConsumoFrota = async (params: ConsumoFrotaFilters) =>
  (await api.get<ConsumoFrotaResponse>('/abastecimento/relatorios/consumo-frota', { params })).data;
