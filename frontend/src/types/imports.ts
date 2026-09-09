export type ImportStatus='PRONTA'|'REQUER_REVISAO'|'JA_CADASTRADA'|'ERRO'
export type ImportNatureza='INTERNA'|'MATERIAL'|'TERCEIRO'
export interface ImportItem{codigo?:string;descricao:string;quantidade:number;valorUnitario:number;desconto?:number;total:number;unidade:string;tipo:'SERVICO'|'PRODUTO';tecnicoOriginal?:string;funcionarioId?:string}
export interface ImportExecucao{funcionarioOriginal:string;inicio:string;fim:string;funcionarioId?:string}
export interface ImportOrder{numeroOs:number;data:string;cliente:string|null;frotaOriginal:string|null;frotaId?:string;parecerOriginal:string|null;obraId?:string;funcionarioAbertura:string|null;problema:string|null;natureza?:ImportNatureza;categoriaServico?:string;status?:string;prestadorTerceiro?:string;itens:ImportItem[];execucoes:ImportExecucao[];totalOrigem?:number;statusPreview:ImportStatus;pendencias:string[];origem:string}
export interface ImportAnalysis{token:string;filename:string;total:number;counts:{prontas:number;revisao:number;jaCadastradas:number;erros?:number};items:ImportOrder[]}
export interface ImportResult{importadas:number;jaCadastradas:number;pendentes:number;falhas:Array<{numeroOs:number;motivo:string}>}
