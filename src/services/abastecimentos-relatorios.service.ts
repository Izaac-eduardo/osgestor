import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid } from './abastecimentos-base.service.js';

export interface RelatorioAbastecimentosFilters { data_inicio?: string; data_fim?: string; obra_id?: string; busca?: string; produto?: string; tipo_destinatario?: string; periodo?: string }
const types = ['FROTA', 'TERCEIRO', 'ESPECIAL', 'EXTERNA'] as const;
const periods = ['dia', 'mes'] as const;
const date = (value: string | undefined, field: string): string | undefined => {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AbastecimentoServiceError(400, `${field} deve estar no formato YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AbastecimentoServiceError(400, `${field} é inválida.`);
  return value;
};
const bind = (values: string[], value: string): string => { values.push(value); return `$${values.length}`; };
const from = `FROM abastecimentos a JOIN abastecimento_produtos p ON p.id=a.produto_id JOIN obras o ON o.id=a.obra_id LEFT JOIN frotas f ON f.id=a.frota_id LEFT JOIN abastecimento_terceiros t ON t.id=a.terceiro_id LEFT JOIN abastecimento_destinacoes_especiais d ON d.id=a.destinacao_especial_id`;

function where(filters: RelatorioAbastecimentosFilters, values: string[]): string {
  const conditions: string[] = [];
  const start = date(filters.data_inicio, 'data_inicio'); const end = date(filters.data_fim, 'data_fim');
  if (start) conditions.push(`a.data_hora >= ${bind(values, `${start}T00:00:00`)}`);
  if (end) conditions.push(`a.data_hora < (${bind(values, `${end}T00:00:00`)}::timestamp + interval '1 day')`);
  if (filters.obra_id) conditions.push(`a.obra_id=${bind(values, assertUuid(filters.obra_id, 'obra_id'))}`);
  if (filters.produto) conditions.push(`p.codigo=${bind(values, filters.produto.trim().toUpperCase())}`);
  if (filters.tipo_destinatario) {
    if (!types.includes(filters.tipo_destinatario as typeof types[number])) throw new AbastecimentoServiceError(400, 'tipo_destinatario inválido.');
    conditions.push(`a.tipo_destinatario=${bind(values, filters.tipo_destinatario)}`);
  }
  if (filters.busca?.trim()) {
    const search = bind(values, `%${filters.busca.trim()}%`);
    conditions.push(`(a.identificacao_original ILIKE ${search} OR a.placa_original ILIKE ${search} OR a.frota_original ILIKE ${search} OR f.codigo ILIKE ${search} OR f.placa ILIKE ${search} OR t.nome ILIKE ${search} OR d.codigo ILIKE ${search} OR d.nome ILIKE ${search} OR EXISTS (SELECT 1 FROM abastecimento_terceiro_identificacoes ti WHERE ti.terceiro_id=a.terceiro_id AND ti.status='ATIVO' AND ti.identificacao ILIKE ${search}))`);
  }
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}
const numbers = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => ['quantidade', 'litros', 'valor', 'percentual_litros', 'destinatarios'].includes(key) && value !== null ? [key, Number(value)] : [key, value]));

export async function getRelatorioAbastecimentos(filters: RelatorioAbastecimentosFilters = {}) {
  if (filters.periodo && !periods.includes(filters.periodo as typeof periods[number])) throw new AbastecimentoServiceError(400, 'periodo deve ser dia ou mes.');
  const values: string[] = []; const clause = where(filters, values); const query = (sql: string) => pool.query(sql, values); const withCondition = (condition: string) => clause ? `${clause} AND ${condition}` : `WHERE ${condition}`;
  const evolutionPeriod = filters.periodo === 'mes' ? "to_char(date_trunc('month',a.data_hora),'YYYY-MM')" : "to_char(date_trunc('day',a.data_hora),'YYYY-MM-DD')";
  const [summary, products, works, fleets, thirds, specials, evolution] = await Promise.all([
    query(`SELECT COUNT(*)::text quantidade,COALESCE(SUM(a.litros),0)::text litros,COALESCE(SUM(a.valor_total),0)::text valor,COUNT(DISTINCT CASE WHEN a.tipo_destinatario='FROTA' THEN a.frota_id::text WHEN a.tipo_destinatario='TERCEIRO' THEN a.terceiro_id::text WHEN a.tipo_destinatario='ESPECIAL' THEN a.destinacao_especial_id::text ELSE COALESCE(a.identificacao_original,a.id::text) END)::text destinatarios ${from} ${clause}`),
    query(`SELECT p.codigo produto,COUNT(*)::text quantidade,COALESCE(SUM(a.litros),0)::text litros,COALESCE(SUM(a.valor_total),0)::text valor ${from} ${clause} GROUP BY p.codigo ORDER BY SUM(a.litros) DESC,p.codigo`),
    query(`SELECT o.nome obra,COUNT(*)::text quantidade,COALESCE(SUM(a.litros),0)::text litros,COALESCE(SUM(a.valor_total),0)::text valor,CASE WHEN SUM(SUM(a.litros)) OVER()=0 THEN 0 ELSE SUM(a.litros)/SUM(SUM(a.litros)) OVER()*100 END::numeric percentual_litros ${from} ${clause} GROUP BY o.id,o.nome ORDER BY SUM(a.litros) DESC,o.nome`),
    query(`SELECT f.codigo frota,COALESCE(f.placa,f.codigo) placa,COUNT(*)::text quantidade,COALESCE(SUM(a.litros),0)::text litros,COALESCE(SUM(a.valor_total),0)::text valor ${from} ${withCondition("a.tipo_destinatario='FROTA'")} GROUP BY f.id,f.codigo,f.placa ORDER BY SUM(a.litros) DESC,f.codigo`),
    query(`SELECT t.nome terceiro,COUNT(*)::text quantidade,COALESCE(SUM(a.litros),0)::text litros,COALESCE(SUM(a.valor_total),0)::text valor ${from} ${withCondition("a.tipo_destinatario='TERCEIRO'")} GROUP BY t.id,t.nome ORDER BY SUM(a.litros) DESC,t.nome`),
    query(`SELECT COALESCE(d.codigo,d.nome) destinacao,COUNT(*)::text quantidade,COALESCE(SUM(a.litros),0)::text litros,COALESCE(SUM(a.valor_total),0)::text valor ${from} ${withCondition("a.tipo_destinatario='ESPECIAL'")} GROUP BY d.id,d.codigo,d.nome ORDER BY SUM(a.litros) DESC,d.codigo`),
    query(`SELECT ${evolutionPeriod} periodo,COUNT(*)::text quantidade,COALESCE(SUM(a.litros),0)::text litros,COALESCE(SUM(a.valor_total),0)::text valor ${from} ${clause} GROUP BY date_trunc('${filters.periodo === 'mes' ? 'month' : 'day'}',a.data_hora) ORDER BY date_trunc('${filters.periodo === 'mes' ? 'month' : 'day'}',a.data_hora)`),
  ]);
  return { summary: numbers(summary.rows[0] || { quantidade: '0', litros: '0', valor: '0', destinatarios: '0' }), por_produto: products.rows.map(numbers), por_obra: works.rows.map(numbers), por_frota: fleets.rows.map(numbers), por_terceiro: thirds.rows.map(numbers), especiais: specials.rows.map(numbers), evolucao: evolution.rows.map(row => { const { periodo, ...rest } = numbers(row); return { ...rest, data: periodo }; }) };
}
