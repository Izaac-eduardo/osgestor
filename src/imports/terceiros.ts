import * as XLSX from 'xlsx';
import { normalizeSearchText } from '../utils/text.js';

export interface TerceiroIdentificacaoLinha {
  linhaOriginal: number;
  nomeOriginal: string | null;
  nomeNormalizado: string | null;
  placaOriginal: string | null;
  placaNormalizada: string | null;
  frotaOriginal: string | null;
  frotaNormalizada: string | null;
  identificacoes: Array<{
    valorOriginal: string;
    valorNormalizado: string;
    tipo: 'PLACA' | 'FROTA_EXTERNA';
  }>;
  completa: boolean;
}

export interface DiagnosticoTerceiros {
  arquivo: string;
  aba: string;
  linhasDados: number;
  linhasCompletas: number;
  linhasIncompletas: number;
  nomesDistintos: number;
  identificacoesDistintas: number;
  duplicidades: Array<{ chave: string; ocorrencias: number; linhas: number[] }>;
  repeticoesNoMesmoTerceiro: Array<{ identificacao: string; terceiro: string; ocorrencias: number; linhas: number[] }>;
  conflitosEntreTerceiros: Array<{ identificacao: string; terceiros: string[]; linhas: number[] }>;
  inconsistencias: Array<{ linha: number; motivo: string }>;
}

const text = (value: unknown): string | null => {
  const result = String(value ?? '').trim();
  return result === '' ? null : result;
};

export function normalizeTerceiroNome(value: unknown): string | null {
  const result = text(value);
  return result ? normalizeSearchText(result) : null;
}

/** Normalização conservadora: remove apenas espaços e pontuação, nunca troca caracteres. */
export function normalizeTerceiroIdentificacao(value: unknown): string | null {
  const result = text(value);
  if (!result) return null;
  const normalized = normalizeSearchText(result).replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

function findColumns(rows: unknown[][]): { headerRow: number; nome: number; placa: number; frota: number } {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const values = row.map((value) => normalizeSearchText(value));
    const nome = values.findIndex((value) => value === 'TERCEIROS' || value === 'TERCEIRO');
    const placa = values.findIndex((value) => value === 'PLACAS' || value === 'PLACA');
    const frota = values.findIndex((value) => value === 'FROTA' || value === 'IDENTIFICACAO');
    if (nome >= 0 && placa >= 0 && frota >= 0) return { headerRow: index, nome, placa, frota };
  }
  throw new Error('Planilha de terceiros incompatível: cabeçalho TERCEIROS/PLACAS/FROTA não encontrado.');
}

export function parseTerceiros(buffer: Buffer, filename = 'TERCEIROS.xlsx'): TerceiroIdentificacaoLinha[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`Planilha de terceiros vazia: ${filename}.`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, defval: null, raw: false });
  const columns = findColumns(rows);
  return rows.slice(columns.headerRow + 1).map((row, offset) => {
    const linhaOriginal = columns.headerRow + offset + 2;
    const nomeOriginal = text(row[columns.nome]);
    const placaOriginal = text(row[columns.placa]);
    const frotaOriginal = text(row[columns.frota]);
    const values = [
      { valorOriginal: placaOriginal, valorNormalizado: normalizeTerceiroIdentificacao(placaOriginal), tipo: 'PLACA' as const },
      { valorOriginal: frotaOriginal, valorNormalizado: normalizeTerceiroIdentificacao(frotaOriginal), tipo: 'FROTA_EXTERNA' as const },
    ].filter((item): item is { valorOriginal: string; valorNormalizado: string; tipo: 'PLACA' | 'FROTA_EXTERNA' } => Boolean(item.valorOriginal && item.valorNormalizado));
    return {
      linhaOriginal,
      nomeOriginal,
      nomeNormalizado: normalizeTerceiroNome(nomeOriginal),
      placaOriginal,
      placaNormalizada: normalizeTerceiroIdentificacao(placaOriginal),
      frotaOriginal,
      frotaNormalizada: normalizeTerceiroIdentificacao(frotaOriginal),
      identificacoes: values,
      completa: Boolean(nomeOriginal && values.length),
    };
  });
}

export function diagnosticarTerceiros(rows: TerceiroIdentificacaoLinha[], arquivo: string, aba: string): DiagnosticoTerceiros {
  const names = new Set(rows.flatMap((row) => row.nomeNormalizado ? [row.nomeNormalizado] : []));
  const occurrences = new Map<string, Array<{ row: TerceiroIdentificacaoLinha; type: string }>>();
  const duplicateRows = new Map<string, number[]>();
  for (const row of rows) {
    for (const item of row.identificacoes) {
      const entries = occurrences.get(item.valorNormalizado) ?? [];
      entries.push({ row, type: item.tipo });
      occurrences.set(item.valorNormalizado, entries);
      const key = `${row.nomeNormalizado ?? ''}|${item.valorNormalizado}|${item.tipo}`;
      duplicateRows.set(key, [...(duplicateRows.get(key) ?? []), row.linhaOriginal]);
    }
  }
  const duplicidades = [...duplicateRows.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([chave, lines]) => ({ chave, ocorrencias: lines.length, linhas: lines }));
  const repeticoesNoMesmoTerceiro = [...duplicateRows.entries()]
    .filter(([key, lines]) => lines.length > 1 && key.split('|')[0] !== '')
    .map(([key, lines]) => {
      const parts = key.split('|');
      const terceiro = parts[0] ?? '';
      const identificacao = parts[1] ?? '';
      return { identificacao, terceiro, ocorrencias: lines.length, linhas: lines };
    });
  const conflitosEntreTerceiros = [...occurrences.entries()]
    .map(([identificacao, entries]) => {
      const thirdParties = [...new Set(entries.map((entry) => entry.row.nomeNormalizado).filter((value): value is string => Boolean(value)))];
      return { identificacao, terceiros: thirdParties, linhas: entries.map((entry) => entry.row.linhaOriginal) };
    })
    .filter((item) => item.terceiros.length > 1);
  const inconsistencias = rows.flatMap((row) => {
    const result: Array<{ linha: number; motivo: string }> = [];
    if (!row.nomeOriginal && row.identificacoes.length) result.push({ linha: row.linhaOriginal, motivo: 'IDENTIFICACAO_SEM_TERCEIRO' });
    if (row.nomeOriginal && !row.identificacoes.length) result.push({ linha: row.linhaOriginal, motivo: 'TERCEIRO_SEM_IDENTIFICACAO' });
    if (row.placaNormalizada && row.frotaNormalizada && row.placaNormalizada !== row.frotaNormalizada) result.push({ linha: row.linhaOriginal, motivo: 'PLACA_E_FROTA_DIVERGENTES' });
    return result;
  });
  return {
    arquivo,
    aba,
    linhasDados: rows.length,
    linhasCompletas: rows.filter((row) => row.completa).length,
    linhasIncompletas: rows.filter((row) => !row.completa).length,
    nomesDistintos: names.size,
    identificacoesDistintas: occurrences.size,
    duplicidades,
    repeticoesNoMesmoTerceiro,
    conflitosEntreTerceiros,
    inconsistencias,
  };
}

export function findExactThirdParty(rows: TerceiroIdentificacaoLinha[], identification: string): Array<{ nomeOriginal: string; nomeNormalizado: string; linhas: number[] }> {
  const normalized = normalizeTerceiroIdentificacao(identification);
  if (!normalized) return [];
  const found = new Map<string, { nomeOriginal: string; nomeNormalizado: string; linhas: number[] }>();
  for (const row of rows) {
    if (!row.nomeOriginal || !row.nomeNormalizado) continue;
    if (!row.identificacoes.some((item) => item.valorNormalizado === normalized)) continue;
    const current = found.get(row.nomeNormalizado) ?? { nomeOriginal: row.nomeOriginal, nomeNormalizado: row.nomeNormalizado, linhas: [] };
    current.linhas.push(row.linhaOriginal);
    found.set(row.nomeNormalizado, current);
  }
  return [...found.values()];
}
