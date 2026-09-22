export type AbastecimentoStatus = 'ATIVO' | 'INATIVO' | (string & {})
export type PontoTipo = 'COMBOIO' | 'POSTO' | 'CAMINHAO_TANQUE' | 'OUTRO'

export interface AbastecimentoProduto {
  id: string
  codigo: string
  nome: string
  tipo: string
  permite_entrada: boolean
  permite_distribuicao: boolean
  permite_abastecimento: boolean
  status: AbastecimentoStatus
}

export interface PontoOperacional {
  id: string
  codigo: string
  nome: string
  tipo: PontoTipo
  frota_id: string | null
  status: AbastecimentoStatus
  observacoes: string | null
  compatibilidades?: AbastecimentoProduto[]
}

export interface Terceiro {
  id: string
  codigo: string | null
  nome: string
  documento: string | null
  status: AbastecimentoStatus
  observacoes: string | null
}
export type IdentificacaoTerceiroTipo = 'PLACA' | 'FROTA_EXTERNA' | 'GERAL' | 'CODIGO' | 'OUTRO'
export interface IdentificacaoTerceiro { id: string; terceiro_id: string; identificacao: string; identificacao_normalizada: string; tipo: IdentificacaoTerceiroTipo; status: AbastecimentoStatus; observacoes: string | null }

export interface DestinacaoEspecial {
  id: string
  codigo: string
  nome: string
  descricao: string | null
  status: AbastecimentoStatus
  observacoes?: string | null
}

export interface EntradaDestino {
  id?: string
  ponto_id: string
  ponto_codigo?: string
  ponto_nome?: string
  litros: number
  observacoes?: string | null
}

export interface Entrada {
  id: string
  data_entrada: string
  numero_nf: string
  produto_id: string
  produto: Pick<AbastecimentoProduto, 'id' | 'codigo' | 'nome'>
  litros_nf: number
  valor_total_nf: number
  total_distribuido: number
  observacoes: string | null
  destinos: EntradaDestino[]
  created_at: string
  updated_at: string
}

export interface EntradaPayload {
  data_entrada: string
  numero_nf: string
  produto_id: string
  litros_nf: number
  valor_total_nf: number
  observacoes: string | null
  destinos: Array<{ ponto_id: string; litros: number }>
}

export interface EntradaFilters {
  data_inicio?: string
  data_fim?: string
  produto_id?: string
  numero_nf?: string
  ponto_id?: string
}

export type PreviewStatus = 'PRONTO' | 'PENDENTE_OBRA' | 'PENDENTE_DESTINATARIO' | 'FORA_ESCOPO' | 'JA_IMPORTADO' | 'ERRO' | 'IMPORTADO'
export type DestinatarioTipo = 'FROTA' | 'TERCEIRO' | 'EXTERNA' | 'ESPECIAL'
export interface PoliFrotaPreviewItem {
  id: string
  identificador_externo: string
  data_hora: string | null
  data_hora_original: string | null
  placa_original: string | null
  frota_original: string | null
  litros: number | null
  valor_total: number | null
  km_hr: number | null
  km_hr_status: string
  horimetro: number | null
  horimetro_status: string
  bico_codigo_original: string | null
  bico_descricao_original: string | null
  frentista_original: string | null
  linha_original: number
  planilha_original: string
  produto_detectado: string
  produto_id: string | null
  identificacao_original: string
  status_preview: PreviewStatus
  obra_id: string | null
  tipo_destinatario: DestinatarioTipo | null
  frota_id: string | null
  terceiro_id: string | null
  destinacao_especial_id: string | null
  pendencias: { obra: boolean; destinatario: boolean; motivos: string[] }
}
export interface ImportacaoCounts { total: number; prontos: number; pendentes: number; pendentesObra: number; pendentesDestinatario: number; foraEscopo: number; erros: number; jaImportados: number; importados: number }
export interface ImportacaoPreview { id: string; arquivo_nome: string; arquivo_sha256: string; status: string; counts: ImportacaoCounts; items: PoliFrotaPreviewItem[] }
export interface ImportacaoEmAndamento { id: string; arquivo_nome: string; arquivo_sha256: string; status: string; created_at: string; counts: ImportacaoCounts }
