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
export type FrotaTerceiraTipo = 'PLACA' | 'EQUIPAMENTO' | 'OUTRO'
export interface FrotaTerceira {
  id: string
  identificacao: string
  identificacao_normalizada: string
  tipo: FrotaTerceiraTipo
  terceiro_id: string | null
  terceiro_nome: string | null
  status: AbastecimentoStatus
  observacoes: string | null
  created_at: string
  updated_at: string
}
export interface FrotaTerceiraFilters {
  busca?: string
  tipo?: FrotaTerceiraTipo
  status?: AbastecimentoStatus
  terceiro_id?: string
  sem_terceiro?: boolean
}
export interface FrotaTerceiraPayload {
  identificacao: string
  tipo: FrotaTerceiraTipo
  terceiro_id: string | null
  status?: AbastecimentoStatus
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

export interface EntradasRelatorioFilters { data_inicio?: string; data_fim?: string; produto_id?: string; numero_nf?: string; ponto_id?: string; periodo?: 'dia' | 'mes'; page?: number; limit?: number }
export interface EntradasRelatorioResponse {
  summary: { entradas: number; litros_nf: number; valor_nf: number }
  por_produto: Array<{ produto_id: string; produto: string; nome: string; quantidade: number; litros_nf: number; valor_nf: number; percentual_litros: number; percentual_valor: number }>
  por_ponto: Array<{ ponto_id: string; codigo: string; nome: string; entradas: number; litros: number }>
  evolucao: Array<{ periodo: string; entradas: number; litros_nf: number; valor_nf: number }>
  items: Array<{ id: string; data_entrada: string; numero_nf: string; produto_id: string; produto_codigo: string; produto_nome: string; litros_nf: number; valor_total_nf: number; total_distribuido: number; destinos: Array<{ ponto_id: string; ponto_codigo: string; ponto_nome: string; litros: number }> }>
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export type ConsumoFrotaTipo = 'TODOS' | 'KM_L' | 'L_H'
export type ConsumoFrotaSituacaoFiltro = 'TODAS' | 'CALCULAVEL' | 'PROBLEMATICA' | 'INSUFICIENTE'
export interface ConsumoFrotaFilters { data_inicio?: string; data_fim?: string; obra_id?: string; frota_id?: string; produto?: string; tipo_calculo?: ConsumoFrotaTipo; situacao?: ConsumoFrotaSituacaoFiltro; page?: number; limit?: 25 | 50 | 100 }
export interface ConsumoFrotaIntervalo {
  numero_intervalo: number | null
  tipo_calculo: 'KM/L' | 'L/H'
  status: 'VALIDO' | 'LEITURA_IGUAL' | 'LEITURA_REGRESSIVA' | 'DADOS_INSUFICIENTES'
  leitura_base: { id: string; data_hora: string; valor: number } | null
  leitura_final: { id: string; data_hora: string; valor: number }
  distancia_km: number | null
  horas: number | null
  litros_intervalo: number
  media_intervalo: number | null
  produto: Pick<AbastecimentoProduto, 'id' | 'codigo' | 'nome'>
  abastecimentos: Array<{ id: string; data_hora: string; litros: number; km_hr: number | null; horimetro: number | null }>
}
export interface ConsumoFrotaItem {
  frota_id: string; frota: string; placa: string | null
  produto: Pick<AbastecimentoProduto, 'id' | 'codigo' | 'nome'>
  tipo_calculo: 'KM/L' | 'L/H' | 'AMBOS' | null
  situacao: 'CALCULAVEL_KM' | 'CALCULAVEL_HORIMETRO' | 'AMBIGUA' | 'INSUFICIENTE' | 'PROBLEMATICA'
  km_total: number; horas_total: number; litros_considerados: number
  media_km_l: number | null; media_l_h: number | null; media: number | null
  intervalos_validos: number; leituras_ignoradas: number; regressoes: number
  intervalos: ConsumoFrotaIntervalo[]
}
export interface ConsumoFrotaResponse {
  resumo: { frotas_analisadas: number; frotas_calculaveis: number; frotas_l_h_calculaveis: number; frotas_problematicas: number; frotas_insuficientes: number; litros_considerados: number }
  frotas: ConsumoFrotaItem[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export interface AbastecimentoHistoricoItem {
  id: string
  data_hora: string
  produto_id: string
  obra_id: string
  frota_id: string | null
  terceiro_id: string | null
  destinacao_especial_id: string | null
  tipo_destinatario: DestinatarioTipo
  destinatario: string | null
  placa: string | null
  produto_codigo: string
  litros: number
  valor_total: number
  km_hr: number | null
  horimetro: number | null
  bico_codigo_original: string | null
  bico_descricao_original: string | null
  frentista_original: string | null
  identificador_externo: string
  identificacao_original: string
  origem_sistema: string
  obra_nome: string
}

export interface AbastecimentoHistoricoFilters {
  data_inicio?: string
  data_fim?: string
  obra_id?: string
  frota_id?: string
  terceiro_id?: string
  busca?: string
  produto?: string
  tipo_destinatario?: DestinatarioTipo
  page?: number
  limit?: 25 | 50 | 100
  periodo?: 'dia' | 'mes'
}

export interface AbastecimentoHistoricoResponse {
  items: AbastecimentoHistoricoItem[]
  summary: { quantidade: number; total_litros: number; total_valor: number }
  pagination: { page: number; limit: number; total: number; total_pages: number }
}
export interface AbastecimentoHistoricoEditPayload {
  data_hora: string; produto_id: string; obra_id: string; tipo_destinatario: DestinatarioTipo; frota_id: string | null; terceiro_id: string | null; destinacao_especial_id: string | null; identificacao_original: string | null; placa_original: string | null; frota_original: string | null; litros: number; valor_total: number; km_hr: number | null; horimetro: number | null; bico_codigo_original: string | null; bico_descricao_original: string | null; frentista_original: string | null
}

export interface AbastecimentosRelatorioResponse {
  summary: { quantidade: number; litros: number; valor: number; destinatarios: number }
  por_produto: Array<{ produto: string; quantidade: number; litros: number; valor: number }>
  por_obra: Array<{ obra_id: string; obra: string; quantidade: number; litros: number; valor: number; percentual_litros: number }>
  por_frota: Array<{ frota_id: string; frota: string; placa: string; quantidade: number; litros: number; valor: number }>
  por_terceiro: Array<{ terceiro_id: string; terceiro: string; quantidade: number; litros: number; valor: number }>
  especiais: Array<{ destinacao: string; quantidade: number; litros: number; valor: number }>
  evolucao: Array<{ data: string; quantidade: number; litros: number; valor: number }>
}

export type PreviewStatus = 'PRONTO' | 'PENDENTE_OBRA' | 'PENDENTE_DESTINATARIO' | 'FORA_ESCOPO' | 'JA_IMPORTADO' | 'SUBSTITUICAO' | 'SUBSTITUICAO_JA_REGISTRADA' | 'ERRO' | 'IMPORTADO'
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
  substituicao_abastecimento_id: string | null
  substituicao_origem_sistema: string | null
  substituicao_identificador_principal: string | null
  pendencias: { obra: boolean; destinatario: boolean; motivos: string[] }
}
export interface ImportacaoCounts { total: number; prontos: number; pendentes: number; pendentesObra: number; pendentesDestinatario: number; foraEscopo: number; erros: number; jaImportados: number; substituicoes: number; substituicoesJaRegistradas: number; importados: number }
export interface ImportacaoPreview { id: string; arquivo_nome: string; arquivo_sha256: string; status: string; counts: ImportacaoCounts; items: PoliFrotaPreviewItem[] }
export interface ImportacaoEmAndamento { id: string; arquivo_nome: string; arquivo_sha256: string; status: string; created_at: string; counts: ImportacaoCounts }
export interface SubstituicaoAlvo { id: string; identificador_externo: string; origem_sistema: string; data_hora: string; frota: string | null; placa: string | null; produto: string; litros: number; valor_total: number; km_hr: number | null; horimetro: number | null; bico: string | null; obra: string; destinatario: string }
