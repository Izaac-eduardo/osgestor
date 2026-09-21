export const abastecimentoProdutoTipos = ['DIESEL', 'ARLA'] as const;
export type AbastecimentoProdutoTipo = (typeof abastecimentoProdutoTipos)[number];

export const abastecimentoProdutoCodigos = ['DIESEL_S500', 'DIESEL_S10', 'ARLA_32'] as const;
export type AbastecimentoProdutoCodigo = (typeof abastecimentoProdutoCodigos)[number];

export const abastecimentoPontoTipos = ['COMBOIO', 'POSTO', 'CAMINHAO_TANQUE', 'OUTRO'] as const;
export type AbastecimentoPontoTipo = (typeof abastecimentoPontoTipos)[number];

export const abastecimentoDestinatarioTipos = ['FROTA', 'TERCEIRO', 'EXTERNA', 'ESPECIAL'] as const;
export type AbastecimentoDestinatarioTipo = (typeof abastecimentoDestinatarioTipos)[number];

export const abastecimentoPreviewStatuses = ['PRONTO', 'PENDENTE_OBRA', 'PENDENTE_DESTINATARIO', 'FORA_ESCOPO', 'JA_IMPORTADO', 'ERRO', 'IMPORTADO'] as const;
export type AbastecimentoPreviewStatus = (typeof abastecimentoPreviewStatuses)[number];

export interface AbastecimentoProduto {
  id: string;
  codigo: AbastecimentoProdutoCodigo;
  nome: string;
  tipo: AbastecimentoProdutoTipo;
  permite_entrada: boolean;
  permite_distribuicao: boolean;
  permite_abastecimento: boolean;
  status: 'ATIVO' | 'INATIVO';
}

export interface AbastecimentoPonto {
  id: string;
  codigo: string;
  nome: string;
  tipo: AbastecimentoPontoTipo;
  frota_id: string | null;
  status: 'ATIVO' | 'INATIVO';
}

export interface AbastecimentoEntrada {
  id: string;
  data_entrada: string;
  numero_nf: string;
  produto_id: string;
  litros_nf: string;
  valor_total_nf: string;
}

export interface Abastecimento {
  id: string;
  origem_sistema: string;
  identificador_externo: string;
  data_hora: string;
  produto_id: string;
  obra_id: string;
  tipo_destinatario: AbastecimentoDestinatarioTipo;
  frota_id: string | null;
  terceiro_id: string | null;
  destinacao_especial_id: string | null;
  identificacao_original: string;
  litros: string;
  valor_total: string;
  km_hr: string | null;
  horimetro: string | null;
}
