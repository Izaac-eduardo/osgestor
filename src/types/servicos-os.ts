export const classificacoesServico = ['INTERNO', 'TERCEIRO', 'INDETERMINADO'] as const;
export type ClassificacaoServico = typeof classificacoesServico[number];

export const classificacoesOrigem = ['LEGADO', 'IMPORTACAO', 'MANUAL', 'REVISAO'] as const;
export type ClassificacaoOrigem = typeof classificacoesOrigem[number];

export const isClassificacaoServico = (value: unknown): value is ClassificacaoServico =>
  typeof value === 'string'
  && (classificacoesServico as readonly string[]).includes(value);
