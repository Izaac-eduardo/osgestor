import * as XLSX from 'xlsx';
import { normalizeFleetCode, normalizePlate } from '../utils/frotas.js';
import { normalizeSearchText } from '../utils/text.js';

export const POLIFROTA_ORIGIN = 'POLIFROTA' as const;

export type PoliFrotaProduto = 'DIESEL_S500' | 'DIESEL_S10' | 'FORA_ESCOPO' | 'DESCONHECIDO';
export type PoliFrotaCampoNumericoStatus = 'AUSENTE' | 'ZERO_INFORMADO' | 'VALIDO' | 'INVALIDO';

export interface PoliFrotaCampoNumerico {
  status: PoliFrotaCampoNumericoStatus;
  valor: number | null;
  original: string | null;
}

export interface PoliFrotaDiagnostico {
  nivel: 'AVISO' | 'ERRO';
  codigo: string;
  mensagem: string;
  campo?: string;
  linha?: number;
  valorOriginal?: string | null;
}

export interface PoliFrotaAbastecimentoNormalizado {
  origemSistema: typeof POLIFROTA_ORIGIN;
  identificadorExterno: string;
  dataHora: string | null;
  dataHoraOriginal: string | null;
  placaOriginal: string | null;
  placaNormalizada: string | null;
  frotaOriginal: string | null;
  frotaNormalizada: string | null;
  litros: number | null;
  litrosOriginal: string | null;
  valorTotal: number | null;
  valorTotalOriginal: string | null;
  kmHr: number | null;
  kmHrOriginal: string | null;
  kmHrStatus: PoliFrotaCampoNumericoStatus;
  horimetro: number | null;
  horimetroOriginal: string | null;
  horimetroStatus: PoliFrotaCampoNumericoStatus;
  bicoCodigoOriginal: string | null;
  bicoDescricaoOriginal: string | null;
  produtoDetectado: PoliFrotaProduto;
  frentistaOriginal: string | null;
  linhaOriginal: number;
  planilhaOriginal: string;
  payloadOriginal: Record<string, unknown>;
  diagnosticos: PoliFrotaDiagnostico[];
}

export interface PoliFrotaArquivoEntrada {
  nome: string;
  buffer: Buffer;
}

export interface PoliFrotaArquivoDiagnostico {
  arquivo: string;
  registros: number;
  primeiroIdentificador: string | null;
  ultimoIdentificador: string | null;
  litrosTotais: number;
  valorTotal: number;
  semPlaca: number;
  semFrota: number;
  semKmHr: number;
  semHorimetro: number;
  valoresInvalidos: number;
  bicos: Array<{ codigo: string | null; descricao: string | null; produto: PoliFrotaProduto; registros: number; litros: number }>;
  produtos: Record<PoliFrotaProduto, number>;
  duplicados: string[];
}

export interface PoliFrotaDiagnosticoMultiarquivo {
  arquivos: PoliFrotaArquivoDiagnostico[];
  totalRegistros: number;
  identificadoresDuplicados: Array<{ identificador: string; arquivos: string[]; linhas: number[] }>;
}

const requiredHeaders = ['NRO ABAST', 'DATA', 'ABASTECIDA', 'BICO'];
const headerAliases: Record<string, string[]> = {
  exportar: ['EXPORTAR'],
  identificador: ['NRO ABAST', 'NUMERO ABAST', 'N ABAST'],
  data: ['DATA'],
  placa: ['PLACA'],
  frota: ['FROTA'],
  litros: ['ABASTECIDA', 'LITROS'],
  valor: ['VALOR TOTAL', 'VALOR'],
  kmHr: ['KM HR', 'KMHR'],
  horimetro: ['HORIMETRO'],
  bico: ['BICO'],
  frentista: ['FRENTISTA'],
};

const clean = (value: unknown): string => String(value ?? '').trim();
const normalizedHeader = (value: unknown): string => normalizeSearchText(value).replace(/[^A-Z0-9]+/g, ' ').trim();
const normalizedValue = (value: unknown): string | null => {
  const result = clean(value);
  return result === '' ? null : result;
};

function headerIndex(row: unknown[]): Record<string, number> | null {
  const normalized = row.map(normalizedHeader);
  const index: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const found = normalized.findIndex((value) => aliases.includes(value));
    if (found >= 0) index[field] = found;
  }
  if (!requiredHeaders.every((header) => normalized.includes(header))) return null;
  return index;
}

function findHeader(rows: unknown[][]): { row: number; columns: Record<string, number> } {
  for (let row = 0; row < rows.length; row += 1) {
    const columns = headerIndex(rows[row] ?? []);
    if (columns) return { row, columns };
  }
  throw new Error('Relatório incompatível: cabeçalho PoliFrota não encontrado.');
}

function parseNumber(value: unknown): PoliFrotaCampoNumerico {
  const original = normalizedValue(value);
  if (original === null) return { status: 'AUSENTE', valor: null, original: null };
  const compact = original.replace(/\s/g, '').replace(/^R\$/i, '');
  if (compact === '0' || /^0+(?:[.,]0+)?$/.test(compact)) return { status: 'ZERO_INFORMADO', valor: 0, original };
  let candidate = compact;
  if (candidate.includes(',') && candidate.includes('.')) {
    const lastComma = candidate.lastIndexOf(',');
    const lastDot = candidate.lastIndexOf('.');
    candidate = lastComma < lastDot ? candidate.replace(/,/g, '') : candidate.replace(/\./g, '').replace(',', '.');
  } else if (candidate.includes(',')) {
    candidate = candidate.replace(',', '.');
  }
  const valor = Number(candidate);
  return Number.isFinite(valor) ? { status: 'VALIDO', valor, original } : { status: 'INVALIDO', valor: null, original };
}

function parseLocalDateTime(value: unknown): { valor: string | null; original: string | null; diagnostico?: PoliFrotaDiagnostico } {
  const original = normalizedValue(value);
  if (original === null) return { valor: null, original: null, diagnostico: { nivel: 'ERRO', codigo: 'DATA_AUSENTE', mensagem: 'Data/hora ausente.', campo: 'Data' } };
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(original);
  if (!match) return { valor: null, original, diagnostico: { nivel: 'ERRO', codigo: 'DATA_INVALIDA', mensagem: 'Data/hora fora do formato DD/MM/YYYY HH:MM.', campo: 'Data', valorOriginal: original } };
  const [, day, month, year, hour, minute, second = '00'] = match;
  const candidate = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const date = new Date(`${candidate}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 19) !== candidate) {
    return { valor: null, original, diagnostico: { nivel: 'ERRO', codigo: 'DATA_INVALIDA', mensagem: 'Data/hora inválida.', campo: 'Data', valorOriginal: original } };
  }
  return { valor: candidate, original };
}

function detectProduct(description: string | null): PoliFrotaProduto {
  const value = normalizeSearchText(description);
  if (/S\s*-?\s*500/.test(value)) return 'DIESEL_S500';
  if (/S\s*-?\s*10\b/.test(value)) return 'DIESEL_S10';
  if (/GASOLINA|ARLA|ETANOL|ADITIVO/.test(value)) return 'FORA_ESCOPO';
  return 'DESCONHECIDO';
}

function parseBico(value: unknown): { codigo: string | null; descricao: string | null; produto: PoliFrotaProduto } {
  const original = normalizedValue(value);
  if (original === null) return { codigo: null, descricao: null, produto: 'DESCONHECIDO' };
  const match = /^(.*?)\s*-\s*(.+)$/.exec(original);
  const codigo = match ? normalizedValue(match[1]) : null;
  const descricao = match ? normalizedValue(match[2]) : original;
  return { codigo, descricao, produto: detectProduct(descricao) };
}

function rawPayload(row: unknown[], columns: Record<string, number>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [field, index] of Object.entries(columns)) payload[field] = row[index] ?? null;
  return payload;
}

function makeDiagnostic(field: string, parsed: PoliFrotaCampoNumerico, line: number): PoliFrotaDiagnostico | undefined {
  if (parsed.status !== 'INVALIDO') return undefined;
  return { nivel: 'ERRO', codigo: `${field.toUpperCase()}_INVALIDO`, mensagem: `Valor inválido no campo ${field}.`, campo: field, linha: line, valorOriginal: parsed.original };
}

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): PoliFrotaAbastecimentoNormalizado[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
  const header = findHeader(rows);
  const output: PoliFrotaAbastecimentoNormalizado[] = [];
  for (let index = header.row + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const identifier = normalizedValue(row[header.columns.identificador ?? -1]);
    if (identifier === null || !/^\d+$/.test(identifier)) continue;
    const data = parseLocalDateTime(row[header.columns.data ?? -1]);
    const litros = parseNumber(row[header.columns.litros ?? -1]);
    const valor = parseNumber(row[header.columns.valor ?? -1]);
    const kmHr = parseNumber(row[header.columns.kmHr ?? -1]);
    const horimetro = parseNumber(row[header.columns.horimetro ?? -1]);
    const bico = parseBico(row[header.columns.bico ?? -1]);
    const diagnosticos: PoliFrotaDiagnostico[] = [];
    if (data.diagnostico) diagnosticos.push({ ...data.diagnostico, linha: index + 1 });
    for (const [field, parsed] of [['litros', litros], ['valorTotal', valor], ['kmHr', kmHr], ['horimetro', horimetro]] as const) {
      const diagnostic = makeDiagnostic(field, parsed, index + 1);
      if (diagnostic) diagnosticos.push(diagnostic);
    }
    if (litros.status === 'AUSENTE') diagnosticos.push({ nivel: 'ERRO', codigo: 'LITROS_AUSENTE', mensagem: 'Litros ausentes.', campo: 'Abastecida', linha: index + 1 });
    if (valor.status === 'AUSENTE') diagnosticos.push({ nivel: 'ERRO', codigo: 'VALOR_AUSENTE', mensagem: 'Valor total ausente.', campo: 'Valor Total($)', linha: index + 1 });
    if (bico.produto === 'DESCONHECIDO') diagnosticos.push({ nivel: 'AVISO', codigo: 'PRODUTO_DESCONHECIDO', mensagem: 'Produto não identificado a partir do bico.', campo: 'Bico', linha: index + 1, valorOriginal: bico.descricao });
    const placaOriginal = normalizedValue(row[header.columns.placa ?? -1]);
    const frotaOriginal = normalizedValue(row[header.columns.frota ?? -1]);
    output.push({
      origemSistema: POLIFROTA_ORIGIN,
      identificadorExterno: identifier,
      dataHora: data.valor,
      dataHoraOriginal: data.original,
      placaOriginal,
      placaNormalizada: placaOriginal ? normalizePlate(placaOriginal) : null,
      frotaOriginal,
      frotaNormalizada: frotaOriginal ? normalizeFleetCode(frotaOriginal) : null,
      litros: litros.valor,
      litrosOriginal: litros.original,
      valorTotal: valor.valor,
      valorTotalOriginal: valor.original,
      kmHr: kmHr.valor,
      kmHrOriginal: kmHr.original,
      kmHrStatus: kmHr.status,
      horimetro: horimetro.valor,
      horimetroOriginal: horimetro.original,
      horimetroStatus: horimetro.status,
      bicoCodigoOriginal: bico.codigo,
      bicoDescricaoOriginal: bico.descricao,
      produtoDetectado: bico.produto,
      frentistaOriginal: normalizedValue(row[header.columns.frentista ?? -1]),
      linhaOriginal: index + 1,
      planilhaOriginal: sheetName,
      payloadOriginal: rawPayload(row, header.columns),
      diagnosticos,
    });
  }
  return output;
}

export function parsePoliFrotaAbastecimentos(buffer: Buffer, filename = 'arquivo.xls'): PoliFrotaAbastecimentoNormalizado[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const sheets = workbook.SheetNames.filter((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return false;
    try { findHeader(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false })); return true; } catch { return false; }
  });
  if (sheets.length === 0) throw new Error(`Arquivo incompatível: nenhum relatório PoliFrota foi encontrado em ${filename}.`);
  return sheets.flatMap((name) => parseSheet(workbook.Sheets[name]!, name));
}

export function diagnosePoliFrotaFiles(files: PoliFrotaArquivoEntrada[]): PoliFrotaDiagnosticoMultiarquivo {
  const parsed = files.map((file) => ({ file, rows: parsePoliFrotaAbastecimentos(file.buffer, file.nome) }));
  const occurrences = new Map<string, Array<{ arquivo: string; linha: number }>>();
  for (const { file, rows } of parsed) for (const row of rows) {
    const values = occurrences.get(row.identificadorExterno) ?? [];
    values.push({ arquivo: file.nome, linha: row.linhaOriginal });
    occurrences.set(row.identificadorExterno, values);
  }
  const duplicated = [...occurrences.entries()].filter(([, values]) => values.length > 1).map(([identificador, values]) => ({ identificador, arquivos: values.map((value) => value.arquivo), linhas: values.map((value) => value.linha) }));
  const arquivos = parsed.map(({ file, rows }) => {
    const bicos = new Map<string, { codigo: string | null; descricao: string | null; produto: PoliFrotaProduto; registros: number; litros: number }>();
    for (const row of rows) {
      const key = `${row.bicoCodigoOriginal ?? ''}|${row.bicoDescricaoOriginal ?? ''}|${row.produtoDetectado}`;
      const current = bicos.get(key) ?? { codigo: row.bicoCodigoOriginal, descricao: row.bicoDescricaoOriginal, produto: row.produtoDetectado, registros: 0, litros: 0 };
      current.registros += 1; current.litros += row.litros ?? 0; bicos.set(key, current);
    }
    const produtos: Record<PoliFrotaProduto, number> = { DIESEL_S500: 0, DIESEL_S10: 0, FORA_ESCOPO: 0, DESCONHECIDO: 0 };
    for (const row of rows) produtos[row.produtoDetectado] += 1;
    const localIds = rows.map((row) => row.identificadorExterno);
    return {
      arquivo: file.nome,
      registros: rows.length,
      primeiroIdentificador: rows[0]?.identificadorExterno ?? null,
      ultimoIdentificador: rows.at(-1)?.identificadorExterno ?? null,
      litrosTotais: rows.reduce((sum, row) => sum + (row.litros ?? 0), 0),
      valorTotal: rows.reduce((sum, row) => sum + (row.valorTotal ?? 0), 0),
      semPlaca: rows.filter((row) => row.placaOriginal === null).length,
      semFrota: rows.filter((row) => row.frotaOriginal === null).length,
      semKmHr: rows.filter((row) => row.kmHrStatus === 'AUSENTE').length,
      semHorimetro: rows.filter((row) => row.horimetroStatus === 'AUSENTE').length,
      valoresInvalidos: rows.filter((row) => row.diagnosticos.some((diagnostic) => diagnostic.nivel === 'ERRO')).length,
      bicos: [...bicos.values()],
      produtos,
      duplicados: [...new Set(localIds.filter((id, index) => localIds.indexOf(id) !== index))],
    };
  });
  return { arquivos, totalRegistros: parsed.reduce((sum, current) => sum + current.rows.length, 0), identificadoresDuplicados: duplicated };
}
