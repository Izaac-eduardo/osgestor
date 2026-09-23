import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid } from './abastecimentos-base.service.js';

export type ConsumoTipo = 'TODOS' | 'KM_L' | 'L_H';
export type ConsumoSituacaoFiltro = 'TODAS' | 'CALCULAVEL' | 'PROBLEMATICA' | 'INSUFICIENTE';
export type ConsumoSituacao = 'CALCULAVEL_KM' | 'CALCULAVEL_HORIMETRO' | 'AMBIGUA' | 'INSUFICIENTE' | 'PROBLEMATICA';
type Metric = 'KM/L' | 'L/H';

export interface ConsumoFrotaFilters {
  data_inicio?: string;
  data_fim?: string;
  obra_id?: string;
  frota_id?: string;
  produto?: string;
  tipo_calculo?: ConsumoTipo;
  situacao?: ConsumoSituacaoFiltro;
  page?: string;
  limit?: string;
}

interface SourceRow {
  id: string; frota_id: string; frota_codigo: string; placa: string | null;
  produto_id: string; produto_codigo: string; produto_nome: string;
  obra_id: string; data_hora: string; created_at: string; litros: string;
  km_hr: string | null; horimetro: string | null;
}

interface DetailReading { id: string; data_hora: string; valor: number | null; }
interface IntervalFuel { id: string; data_hora: string; litros: number; km_hr: number | null; horimetro: number | null; }
interface ConsumptionInterval {
  tipo_calculo: Metric;
  status: 'VALIDO' | 'LEITURA_IGUAL' | 'LEITURA_REGRESSIVA' | 'DADOS_INSUFICIENTES';
  leitura_base: DetailReading | null;
  leitura_final: DetailReading;
  distancia_km: number | null;
  horas: number | null;
  litros_intervalo: number;
  media_intervalo: number | null;
  produto: { id: string; codigo: string; nome: string };
  abastecimentos: IntervalFuel[];
}

interface FleetReport {
  frota_id: string; frota: string; placa: string | null;
  produto: { id: string; codigo: string; nome: string };
  tipo_calculo: 'KM/L' | 'L/H' | 'AMBOS' | null;
  situacao: ConsumoSituacao;
  km_total: number; horas_total: number; litros_considerados: number;
  media_km_l: number | null; media_l_h: number | null; media: number | null;
  intervalos_validos: number; leituras_ignoradas: number; regressoes: number;
  intervalos: ConsumptionInterval[];
}

const date = (value: string | undefined, field: string): string | undefined => {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AbastecimentoServiceError(400, `${field} deve estar no formato YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AbastecimentoServiceError(400, `${field} é inválida.`);
  return value;
};

const pageValue = (value: string | undefined): number => {
  if (!value) return 1;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1) throw new AbastecimentoServiceError(400, 'page deve ser um inteiro positivo.');
  return result;
};

const limitValue = (value: string | undefined): number => {
  if (!value) return 25;
  const result = Number(value);
  if (![25, 50, 100].includes(result)) throw new AbastecimentoServiceError(400, 'limit deve ser 25, 50 ou 100.');
  return result;
};

const number = (value: string | null): number | null => value === null ? null : Number(value);
const timestamp = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : String(value);
const round = (value: number): number => Number(value.toFixed(9));
const inRange = (row: SourceRow, start?: string, end?: string): boolean => {
  const day = row.data_hora.slice(0, 10);
  return (!start || day >= start) && (!end || day <= end);
};

function buildWhere(filters: ConsumoFrotaFilters, values: string[]): string {
  const conditions = ["a.tipo_destinatario = 'FROTA'", "p.tipo = 'DIESEL'"];
  const bind = (value: string): string => { values.push(value); return `$${values.length}`; };
  if (filters.frota_id) conditions.push(`a.frota_id = ${bind(assertUuid(filters.frota_id, 'frota_id'))}`);
  if (filters.produto) conditions.push(`p.codigo = ${bind(filters.produto.trim().toUpperCase())}`);
  return `WHERE ${conditions.join(' AND ')}`;
}

function fuelRows(rows: SourceRow[], baseIndex: number, finalIndex: number, start: string | undefined, end: string | undefined, obraId: string | undefined): IntervalFuel[] {
  return rows.slice(baseIndex + 1, finalIndex + 1)
    .filter(row => inRange(row, start, end) && (!obraId || row.obra_id === obraId))
    .map(row => ({ id: row.id, data_hora: row.data_hora, litros: Number(row.litros), km_hr: number(row.km_hr), horimetro: number(row.horimetro) }));
}

function metricIntervals(rows: SourceRow[], metric: Metric, start: string | undefined, end: string | undefined, obraId: string | undefined): ConsumptionInterval[] {
  const result: ConsumptionInterval[] = [];
  let previousIndex: number | null = null;
  const valueOf = (row: SourceRow): number | null => number(metric === 'KM/L' ? row.km_hr : row.horimetro);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const current = valueOf(row);
    if (current === null || current <= 0) continue;
    if (!inRange(row, start, end)) { previousIndex = index; continue; }
    if (previousIndex === null) {
      result.push({ tipo_calculo: metric, status: 'DADOS_INSUFICIENTES', leitura_base: null, leitura_final: { id: row.id, data_hora: row.data_hora, valor: current }, distancia_km: null, horas: null, litros_intervalo: 0, media_intervalo: null, produto: { id: row.produto_id, codigo: row.produto_codigo, nome: row.produto_nome }, abastecimentos: [] });
      previousIndex = index;
      continue;
    }
    const previous = rows[previousIndex]!;
    const previousValue = valueOf(previous)!;
    const fuel = fuelRows(rows, previousIndex, index, start, end, obraId);
    const liters = fuel.reduce((sum, item) => sum + item.litros, 0);
    const difference = current - previousValue;
    const status = difference > 0 ? 'VALIDO' : difference === 0 ? 'LEITURA_IGUAL' : 'LEITURA_REGRESSIVA';
    const distance = metric === 'KM/L' ? difference : null;
    const hours = metric === 'L/H' ? difference : null;
    const media = status === 'VALIDO' && liters > 0 ? metric === 'KM/L' ? distance! / liters : liters / hours! : null;
    result.push({ tipo_calculo: metric, status, leitura_base: { id: previous.id, data_hora: previous.data_hora, valor: previousValue }, leitura_final: { id: row.id, data_hora: row.data_hora, valor: current }, distancia_km: distance, horas: hours, litros_intervalo: liters, media_intervalo: media === null ? null : round(media), produto: { id: row.produto_id, codigo: row.produto_codigo, nome: row.produto_nome }, abastecimentos: fuel });
    previousIndex = index;
  }
  return result;
}

function classify(reports: FleetReport[]): FleetReport[] {
  return reports.map(report => {
    const kmValid = report.intervalos.some(item => item.tipo_calculo === 'KM/L' && item.status === 'VALIDO');
    const hrValid = report.intervalos.some(item => item.tipo_calculo === 'L/H' && item.status === 'VALIDO');
    const problematic = report.regressoes > 0;
    const situacao: ConsumoSituacao = problematic ? 'PROBLEMATICA' : kmValid && hrValid ? 'AMBIGUA' : kmValid ? 'CALCULAVEL_KM' : hrValid ? 'CALCULAVEL_HORIMETRO' : 'INSUFICIENTE';
    const tipo_calculo = kmValid && hrValid ? 'AMBOS' : kmValid ? 'KM/L' : hrValid ? 'L/H' : null;
    const media = tipo_calculo === 'KM/L' ? report.media_km_l : tipo_calculo === 'L/H' ? report.media_l_h : null;
    return { ...report, situacao, tipo_calculo, media };
  });
}

function matches(report: FleetReport, type: ConsumoTipo, situation: ConsumoSituacaoFiltro): boolean {
  const typeMatch = type === 'TODOS' || (type === 'KM_L' && (report.tipo_calculo === 'KM/L' || report.tipo_calculo === 'AMBOS')) || (type === 'L_H' && (report.tipo_calculo === 'L/H' || report.tipo_calculo === 'AMBOS'));
  const situationMatch = situation === 'TODAS' || (situation === 'CALCULAVEL' && ['CALCULAVEL_KM', 'CALCULAVEL_HORIMETRO', 'AMBIGUA'].includes(report.situacao)) || (situation === report.situacao);
  return typeMatch && situationMatch;
}

export async function getConsumoFrota(filters: ConsumoFrotaFilters = {}) {
  const start = date(filters.data_inicio, 'data_inicio'); const end = date(filters.data_fim, 'data_fim');
  if (start && end && start > end) throw new AbastecimentoServiceError(400, 'data_inicio não pode ser posterior a data_fim.');
  if (filters.obra_id) assertUuid(filters.obra_id, 'obra_id');
  const type = filters.tipo_calculo ?? 'TODOS'; const situation = filters.situacao ?? 'TODAS';
  if (!['TODOS', 'KM_L', 'L_H'].includes(type)) throw new AbastecimentoServiceError(400, 'tipo_calculo inválido.');
  if (!['TODAS', 'CALCULAVEL', 'PROBLEMATICA', 'INSUFICIENTE'].includes(situation)) throw new AbastecimentoServiceError(400, 'situacao inválida.');
  const values: string[] = [];
  const rawRows = (await pool.query<SourceRow>(`SELECT a.id,a.frota_id,f.codigo frota_codigo,f.placa,a.produto_id,p.codigo produto_codigo,p.nome produto_nome,a.obra_id,a.data_hora,a.created_at,a.litros,a.km_hr,a.horimetro FROM abastecimentos a JOIN frotas f ON f.id=a.frota_id JOIN abastecimento_produtos p ON p.id=a.produto_id ${buildWhere(filters, values)} ORDER BY a.frota_id,p.codigo,a.data_hora,a.created_at,a.id`, values)).rows;
  const rows = rawRows.map(row => ({ ...row, data_hora: timestamp(row.data_hora), created_at: timestamp(row.created_at) }));
  const groups = new Map<string, SourceRow[]>();
  for (const row of rows) { const key = `${row.frota_id}:${row.produto_id}`; const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
  const reports: FleetReport[] = [];
  for (const group of groups.values()) {
    const periodRows = group.filter(row => inRange(row, start, end) && (!filters.obra_id || row.obra_id === filters.obra_id));
    if (!periodRows.length) continue;
    const intervals = [...metricIntervals(group, 'KM/L', start, end, filters.obra_id), ...metricIntervals(group, 'L/H', start, end, filters.obra_id)];
    const valid = intervals.filter(item => item.status === 'VALIDO');
    const kmValid = valid.filter(item => item.tipo_calculo === 'KM/L'); const hrValid = valid.filter(item => item.tipo_calculo === 'L/H');
    const kmTotal = kmValid.reduce((sum, item) => sum + (item.distancia_km ?? 0), 0); const hoursTotal = hrValid.reduce((sum, item) => sum + (item.horas ?? 0), 0);
    const kmLiters = kmValid.reduce((sum, item) => sum + item.litros_intervalo, 0); const hrLiters = hrValid.reduce((sum, item) => sum + item.litros_intervalo, 0);
    const validFinalIds = new Set(valid.map(item => item.leitura_final.id));
    reports.push({ frota_id: group[0]!.frota_id, frota: group[0]!.frota_codigo, placa: group[0]!.placa, produto: { id: group[0]!.produto_id, codigo: group[0]!.produto_codigo, nome: group[0]!.produto_nome }, tipo_calculo: null, situacao: 'INSUFICIENTE', km_total: round(kmTotal), horas_total: round(hoursTotal), litros_considerados: round(kmValid.length ? kmLiters : hrLiters), media_km_l: kmLiters > 0 ? round(kmTotal / kmLiters) : null, media_l_h: hoursTotal > 0 ? round(hrLiters / hoursTotal) : null, media: null, intervalos_validos: valid.length, leituras_ignoradas: periodRows.filter(row => !validFinalIds.has(row.id)).length, regressoes: intervals.filter(item => item.status === 'LEITURA_REGRESSIVA').length, intervalos: intervals });
  }
  const filtered = classify(reports).filter(report => matches(report, type, situation)).sort((a, b) => a.frota.localeCompare(b.frota) || a.produto.codigo.localeCompare(b.produto.codigo));
  const page = pageValue(filters.page); const limit = limitValue(filters.limit); const total = filtered.length;
  const frotas = filtered.slice((page - 1) * limit, page * limit);
  const fleetIds = new Set(filtered.map(item => item.frota_id)); const calculableIds = new Set(filtered.filter(item => ['CALCULAVEL_KM', 'CALCULAVEL_HORIMETRO', 'AMBIGUA'].includes(item.situacao)).map(item => item.frota_id)); const problematicIds = new Set(filtered.filter(item => item.situacao === 'PROBLEMATICA').map(item => item.frota_id)); const insufficientIds = new Set(filtered.filter(item => item.situacao === 'INSUFICIENTE').map(item => item.frota_id));
  return { resumo: { frotas_analisadas: fleetIds.size, frotas_calculaveis: calculableIds.size, frotas_problematicas: problematicIds.size, frotas_insuficientes: insufficientIds.size, litros_considerados: round(filtered.reduce((sum, item) => sum + item.litros_considerados, 0)) }, frotas, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}
