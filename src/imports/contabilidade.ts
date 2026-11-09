import * as XLSX from 'xlsx';
import { createHash } from 'node:crypto';
import { normalizeSearchText } from '../utils/text.js';
import { normalizeExternalFleetIdentifier } from '../services/frota-identificadores.service.js';

export const CONTABILIDADE_ORIGIN = 'CONTABILIDADE';
export type ContabilClassification = 'PECAS_EXTERNAS' | 'SERVICOS_TERCEIRIZADOS' | 'PENDENTE';
export type ContabilFleetMatch = 'EXATA' | 'ALIAS' | 'PENDENTE' | 'MANUAL';

export interface ContabilLancamento {
  planilhaOriginal: string;
  linhaOriginal: number;
  dadosOriginais: Record<string, unknown>;
  controleOriginal: string | null;
  dataLancamentoOriginal: string | null;
  dataContaOriginal: string | null;
  dataLancamento: string | null;
  dataConta: string | null;
  notaOriginal: string | null;
  codigoProdutoOriginal: string | null;
  produtoOriginal: string | null;
  tipoMovimentacaoOriginal: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  subcentroCodigoOriginal: string | null;
  subcentroOriginal: string | null;
  planoContasCodigoOriginal: string | null;
  planoContasOriginal: string | null;
  categoriaContabil: string;
  classificacao: ContabilClassification;
  fingerprint: string;
}

const aliases: Record<string, string[]> = {
  controle: ['CONTROLE'], dataLancamento: ['DATA LANCAMENTO', 'DATA LANÇAMENTO'], dataConta: ['DATA CONTA'], nota: ['NRO NOTA', 'NOTA', 'NUMERO NOTA', 'Nº NOTA'],
  codigoProduto: ['COD PRODUTO', 'CODIGO PRODUTO', 'CÓD PRODUTO'], produto: ['PRODUTO'], tipoMovimentacao: ['TIPO DE MOVIMENTACAO', 'TIPO DE MOVIMENTAÇÃO', 'TIPO MOVIMENTACAO'], quantidade: ['QUANTIDADE'], valorUnitario: ['VALOR UNITARIO', 'VALOR UNITÁRIO'], valorTotal: ['TOTAL', 'VALOR TOTAL'],
  subcentroCodigo: ['COD SUBCENTRO', 'CODIGO SUBCENTRO', 'CÓD SUBCENTRO'], subcentro: ['SUBCENTRO'], planoCodigo: ['COD PLANO DE CONTAS', 'CODIGO PLANO DE CONTAS', 'CÓD PLANO DE CONTAS'], plano: ['PLANO DE CONTAS'],
};
const required = ['subcentro', 'tipoMovimentacao', 'valorTotal'];
const text = (value: unknown): string | null => { const v = String(value ?? '').trim(); return v || null; };
const header = (value: unknown): string => normalizeSearchText(value).replace(/[^A-Z0-9]+/g, ' ').trim();
const number = (value: unknown): number | null => {
  const raw = text(value); if (!raw) return null; let v = raw.replace(/\s/g, '').replace(/^R\$/i, '');
  if (v.includes(',') && v.includes('.')) v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  else v = v.replace(',', '.');
  const result = Number(v); return Number.isFinite(result) ? result : null;
};
const date = (value: unknown): { original: string | null; iso: string | null } => {
  const raw = text(value); if (!raw) return { original: null, iso: null };
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw); if (br) return { original: raw, iso: `${br[3]}-${br[2]}-${br[1]}` };
  const d = new Date(raw); return Number.isNaN(d.getTime()) ? { original: raw, iso: null } : { original: raw, iso: d.toISOString().slice(0, 10) };
};
const classify = (value: string | null): ContabilClassification => {
  const v = normalizeSearchText(value ?? '');
  if (v === 'CUSTO PECAS / OFICINA') return 'PECAS_EXTERNAS';
  if (v === 'CUSTO SERVICOS') return 'SERVICOS_TERCEIRIZADOS';
  return 'PENDENTE';
};
const fingerprint = (row: Record<string, unknown>): string => createHash('sha256').update(JSON.stringify(row, Object.keys(row).sort())).digest('hex');

export function parseContabilidade(buffer: Buffer, filename = 'arquivo.xlsx'): ContabilLancamento[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const output: ContabilLancamento[] = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, defval: null, raw: false });
    const headerRow = rows.findIndex(row => required.every(field => {
      const names = aliases[field]!.map(header); return row.some(value => names.includes(header(value)));
    }));
    if (headerRow < 0) continue;
    const columns: Record<string, number> = {};
    for (const [field, names] of Object.entries(aliases)) columns[field] = (rows[headerRow] ?? []).findIndex(value => names.map(header).includes(header(value)));
    const cell = (row: unknown[], field: string): unknown => row[columns[field] ?? -1];
    for (let i = headerRow + 1; i < rows.length; i += 1) {
      const row = rows[i] ?? []; const original: Record<string, unknown> = {};
      for (let j = 0; j < (rows[headerRow] ?? []).length; j += 1) original[String(rows[headerRow]?.[j] ?? `COLUNA_${j + 1}`)] = row[j] ?? null;
      if (Object.values(original).every(value => text(value) === null)) continue;
      const lancamento = date(cell(row, 'dataLancamento')); const conta = date(cell(row, 'dataConta'));
      const data = {
        planilhaOriginal: sheetName, linhaOriginal: i + 1, dadosOriginais: original,
        controleOriginal: text(cell(row, 'controle')), dataLancamentoOriginal: lancamento.original, dataContaOriginal: conta.original, dataLancamento: lancamento.iso, dataConta: conta.iso,
        notaOriginal: text(cell(row, 'nota')), codigoProdutoOriginal: text(cell(row, 'codigoProduto')), produtoOriginal: text(cell(row, 'produto')), tipoMovimentacaoOriginal: text(cell(row, 'tipoMovimentacao')),
        quantidade: number(cell(row, 'quantidade')), valorUnitario: number(cell(row, 'valorUnitario')), valorTotal: number(cell(row, 'valorTotal')), subcentroCodigoOriginal: text(cell(row, 'subcentroCodigo')), subcentroOriginal: text(cell(row, 'subcentro')), planoContasCodigoOriginal: text(cell(row, 'planoCodigo')), planoContasOriginal: text(cell(row, 'plano')), categoriaContabil: text(cell(row, 'plano')) ?? 'NAO_INFORMADO',
      };
      output.push({ ...data, classificacao: classify(data.planoContasOriginal), fingerprint: fingerprint(original) });
    }
  }
  if (!output.length) throw new Error(`Arquivo incompatível: nenhum relatório contábil foi encontrado em ${filename}.`);
  return output;
}

export function normalizeSubcentro(value: string | null): string { return normalizeExternalFleetIdentifier(value ?? ''); }
