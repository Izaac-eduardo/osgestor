import { findExactThirdParty, normalizeTerceiroIdentificacao, TerceiroIdentificacaoLinha } from '../imports/terceiros.js';

export type TerceiroMatchingResult =
  | { tipo: 'TERCEIRO'; nome: string; nomeNormalizado: string; linhas: number[] }
  | { tipo: 'PENDENTE'; motivo: 'SEM_CORRESPONDENCIA' | 'AMBIGUO' | 'IDENTIFICACAO_AUSENTE' }
  | { tipo: 'ESPECIAL'; codigo: 'PIRULITO' }
  | { tipo: 'FROTA_PROPRIA'; codigo: string };

/** Resolução futura, pura e não conectada ao fluxo real de importação nesta fase. */
export function resolveThirdPartyExact(rows: TerceiroIdentificacaoLinha[], placa: string | null, frota: string | null, ownFleetCodes: Set<string>): TerceiroMatchingResult {
  const values = [placa, frota].map((value) => normalizeTerceiroIdentificacao(value)).filter((value): value is string => Boolean(value));
  if (values.includes('PIRULITO')) return { tipo: 'ESPECIAL', codigo: 'PIRULITO' };
  const own = values.find((value) => ownFleetCodes.has(value));
  if (own) return { tipo: 'FROTA_PROPRIA', codigo: own };
  const matches = [...new Map(values.flatMap((value) => findExactThirdParty(rows, value).map((match) => [match.nomeNormalizado, match]))).values()];
  if (!matches.length) return { tipo: values.length ? 'PENDENTE' : 'PENDENTE', motivo: values.length ? 'SEM_CORRESPONDENCIA' : 'IDENTIFICACAO_AUSENTE' };
  if (matches.length > 1) return { tipo: 'PENDENTE', motivo: 'AMBIGUO' };
  return { tipo: 'TERCEIRO', nome: matches[0]!.nomeOriginal, nomeNormalizado: matches[0]!.nomeNormalizado, linhas: matches[0]!.linhas };
}
