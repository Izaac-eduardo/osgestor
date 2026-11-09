import type { ClassificationOrigin, ServiceClassification } from "./orders";
export type ImportStatus =
  | "PRONTA"
  | "REQUER_REVISAO"
  | "JA_CADASTRADA"
  | "ATUALIZACAO_DISPONIVEL"
  | "SEM_ALTERACOES"
  | "NOVA"
  | "ERRO";
export interface ImportDiff {
  numeroOs: number;
  estado:
    "NOVA" | "ATUALIZACAO_DISPONIVEL" | "SEM_ALTERACOES" | "REQUER_REVISAO";
  status?: { atual: string; novo: string };
  categoria?: { atual: string | null; novo: string | null };
  natureza?: { atual: string; novo: string };
  problema?: { atual: string | null; novo: string | null };
  novosServicos: ImportItem[];
  servicosAlterados: Array<{ atual: unknown; novo: ImportItem }>;
  novosProdutos: ImportItem[];
  produtosAlterados: Array<{ atual: unknown; novo: ImportItem }>;
  novasExecucoes: ImportExecucao[];
  divergencias: string[];
  avisos?: string[];
  podeAtualizarAutomaticamente: boolean;
}
export type ImportNatureza = "INTERNA" | "MATERIAL" | "TERCEIRO";
export type ImportStatusOrigem = "AUTOMATICO" | "MANUAL";
export interface ImportItem {
  codigo?: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  desconto?: number;
  total: number;
  unidade: string;
  tipo: "SERVICO" | "PRODUTO";
  tecnicoOriginal?: string;
  funcionarioId?: string;
  classificacao_servico?: ServiceClassification;
  classificacao_servico_original?: ServiceClassification;
  classificacao_origem?: ClassificationOrigin;
}
export interface ImportServiceClassificationPayload {
  servicoIndex: number;
  classificacao_servico: ServiceClassification;
}
export interface ImportExecucao {
  funcionarioOriginal: string;
  inicio: string;
  fim: string;
  funcionarioId?: string;
}
export interface NaturezaConfirmacao {
  id: string;
  estado: "ATIVA" | "INVALIDADA" | "REVOGADA";
  confirmadoEm: string;
  reutilizada?: boolean;
}
export interface ImportOrder {
  numeroOs: number;
  data: string;
  cliente: string | null;
  frotaOriginal: string | null;
  frotaId?: string;
  parecerOriginal: string | null;
  obraId?: string | null;
  funcionarioAbertura: string | null;
  funcionarioAberturaCodigo?: string | null;
  funcionarioAberturaNome?: string | null;
  problema: string | null;
  natureza?: ImportNatureza;
  categoriaServico?: string;
  status?: string;
  statusOriginal: string | null;
  statusOrigem: ImportStatusOrigem | null;
  prestadorTerceiro?: string;
  itens: ImportItem[];
  execucoes: ImportExecucao[];
  totalOrigem?: number;
  statusPreview: ImportStatus;
  pendencias: string[];
  origem: string;
  diff?: ImportDiff;
  confirmacaoNatureza?: NaturezaConfirmacao;
}
export interface ImportAnalysis {
  token: string;
  filename: string;
  total: number;
  counts: {
    prontas: number;
    revisao: number;
    jaCadastradas: number;
    erros?: number;
  };
  items: ImportOrder[];
}
export interface ImportResult {
  importadas: number;
  jaCadastradas: number;
  pendentes: number;
  falhas: Array<{ numeroOs: number; motivo: string }>;
}
export type IncrementalPreviewCategory = "NOVA" | "SEM_ALTERACOES" | "STATUS_ALTERADO" | "ITENS_ADICIONADOS" | "ITENS_ALTERADOS" | "NATUREZA_DIVERGENTE" | "REVISAO_MANUAL";
export interface IncrementalPreviewOrder {
  numeroOs: number; ordemServicoId: string | null; categoria: IncrementalPreviewCategory; categorias: IncrementalPreviewCategory[]; statusPreview: ImportStatus;
  statusAtual: string | null; statusPoli: string | null; naturezaAtual: string | null; naturezaPoli: string | null; dataFechamento: string | null; dataFechamentoDesconhecida: boolean;
  itensNovos: Array<{ tipo: "PRODUTO" | "SERVICO"; codigoPoli: string | null; descricao: string; quantidade: number; unidade: string; valorUnitario: number; valorTotal: number; evidencia: string; confianca: string }>;
  itensAmbiguos: Array<{ tipo: "PRODUTO" | "SERVICO"; descricao: string }>;
  itensAusentes: Array<{ tipo: "PRODUTO" | "SERVICO"; id: string; descricao: string; quantidade: number; unidade: string; valorUnitario: number; motivo: string }>;
  alteracoes: Array<{ chave: string; tipo: string; atual: string | null; proposto: string; confianca: string; selecionavel: boolean }>;
  divergencias: string[]; confianca: string; revisaoManual: boolean; evidencia: { origem: string; linhas: number[]; statusOriginal: string | null; quantidadeItensFonte: number };
}
export interface IncrementalPreview { somenteLeitura: true; filename: string; total: number; counts: Record<IncrementalPreviewCategory, number>; novosItens: number; itensAmbiguos: number; conflitosStatus: number; orders: IncrementalPreviewOrder[]; }
