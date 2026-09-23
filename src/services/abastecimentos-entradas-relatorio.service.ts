import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid } from './abastecimentos-base.service.js';

export interface EntradasRelatorioFilters {
  data_inicio?: string;
  data_fim?: string;
  produto_id?: string;
  produto_codigo?: string;
  numero_nf?: string;
  ponto_id?: string;
  periodo?: 'dia' | 'mes';
  page?: number;
  limit?: number;
}

interface EntradaRelatorioItem { id: string; data_entrada: string; numero_nf: string; produto_id: string; produto_codigo: string; produto_nome: string; litros_nf: number; valor_total_nf: number; total_distribuido: number; destinos: Array<{ ponto_id: string; ponto_codigo: string; ponto_nome: string; litros: number }> }

const date = (value: string | undefined, field: string): string | undefined => {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AbastecimentoServiceError(400, `${field} deve estar no formato YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AbastecimentoServiceError(400, `${field} é inválida.`);
  return value;
};

const numberValue = (value: unknown): number => { const result = Number(value); if (!Number.isFinite(result)) throw new AbastecimentoServiceError(500, 'Valor numérico inválido no relatório de entradas.'); return result; };

function where(filters: EntradasRelatorioFilters, values: string[]): string {
  const conditions: string[] = [];
  const bind = (value: string) => { values.push(value); return `$${values.length}`; };
  const start = date(filters.data_inicio, 'data_inicio'); const end = date(filters.data_fim, 'data_fim');
  if (start) conditions.push(`e.data_entrada >= ${bind(start)}`);
  if (end) conditions.push(`e.data_entrada <= ${bind(end)}`);
  if (filters.produto_id) conditions.push(`e.produto_id = ${bind(assertUuid(filters.produto_id, 'produto_id'))}`);
  if (filters.produto_codigo?.trim()) conditions.push(`p.codigo = ${bind(filters.produto_codigo.trim().toUpperCase())}`);
  if (filters.numero_nf?.trim()) conditions.push(`e.numero_nf ILIKE ${bind(`%${filters.numero_nf.trim()}%`)}`);
  if (filters.ponto_id) conditions.push(`EXISTS (SELECT 1 FROM abastecimento_entrada_destinos fp WHERE fp.entrada_id=e.id AND fp.ponto_id=${bind(assertUuid(filters.ponto_id, 'ponto_id'))})`);
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

const base = `FROM abastecimento_entradas e JOIN abastecimento_produtos p ON p.id=e.produto_id`;

async function destinations(ids: string[]): Promise<Map<string, EntradaRelatorioItem['destinos']>> {
  const result = new Map<string, EntradaRelatorioItem['destinos']>();
  if (!ids.length) return result;
  const rows = (await pool.query<{ entrada_id: string; ponto_id: string; ponto_codigo: string; ponto_nome: string; litros: string }>(`SELECT d.entrada_id,d.ponto_id,p.codigo ponto_codigo,p.nome ponto_nome,d.litros FROM abastecimento_entrada_destinos d JOIN abastecimento_pontos p ON p.id=d.ponto_id WHERE d.entrada_id=ANY($1::uuid[]) ORDER BY d.created_at,d.id`, [ids])).rows;
  for (const row of rows) { const list = result.get(row.entrada_id) ?? []; list.push({ ponto_id: row.ponto_id, ponto_codigo: row.ponto_codigo, ponto_nome: row.ponto_nome, litros: numberValue(row.litros) }); result.set(row.entrada_id, list); }
  return result;
}

export async function getRelatorioEntradas(filters: EntradasRelatorioFilters = {}) {
  const periodo = filters.periodo ?? 'dia';
  if (periodo !== 'dia' && periodo !== 'mes') throw new AbastecimentoServiceError(400, 'periodo deve ser dia ou mes.');
  const page = Math.max(1, Number(filters.page ?? 1) || 1); const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 25) || 25));
  const values: string[] = []; const clause = where(filters, values); const query = (sql: string, params = values) => pool.query(sql, params);
  const pointClause = clause.replaceAll('p.codigo', 'ep.codigo');
  const [summary, products, points, evolution, count] = await Promise.all([
    query(`SELECT COUNT(*)::text entradas,COALESCE(SUM(e.litros_nf),0)::text litros_nf,COALESCE(SUM(e.valor_total_nf),0)::text valor_nf ${base} ${clause}`),
    query(`SELECT p.id produto_id,p.codigo produto,p.nome,COUNT(*)::text quantidade,COALESCE(SUM(e.litros_nf),0)::text litros_nf,COALESCE(SUM(e.valor_total_nf),0)::text valor_nf,CASE WHEN SUM(SUM(e.litros_nf)) OVER()=0 THEN 0 ELSE SUM(e.litros_nf)/SUM(SUM(e.litros_nf)) OVER()*100 END::text percentual_litros,CASE WHEN SUM(SUM(e.valor_total_nf)) OVER()=0 THEN 0 ELSE SUM(e.valor_total_nf)/SUM(SUM(e.valor_total_nf)) OVER()*100 END::text percentual_valor ${base} ${clause} GROUP BY p.id,p.codigo,p.nome ORDER BY SUM(e.litros_nf) DESC,p.codigo`),
    query(`SELECT p.id ponto_id,p.codigo,p.nome,COUNT(DISTINCT e.id)::text entradas,COALESCE(SUM(d.litros),0)::text litros FROM abastecimento_entrada_destinos d JOIN abastecimento_entradas e ON e.id=d.entrada_id JOIN abastecimento_produtos ep ON ep.id=e.produto_id JOIN abastecimento_pontos p ON p.id=d.ponto_id ${pointClause ? `${pointClause} AND` : 'WHERE'} d.id IS NOT NULL GROUP BY p.id,p.codigo,p.nome ORDER BY SUM(d.litros) DESC,p.codigo`, values),
    query(`SELECT to_char(date_trunc('${periodo === 'mes' ? 'month' : 'day'}',e.data_entrada),'${periodo === 'mes' ? 'YYYY-MM' : 'YYYY-MM-DD'}') periodo,COUNT(*)::text entradas,COALESCE(SUM(e.litros_nf),0)::text litros_nf,COALESCE(SUM(e.valor_total_nf),0)::text valor_nf ${base} ${clause} GROUP BY date_trunc('${periodo === 'mes' ? 'month' : 'day'}',e.data_entrada) ORDER BY date_trunc('${periodo === 'mes' ? 'month' : 'day'}',e.data_entrada)`),
    query(`SELECT COUNT(*)::text total ${base} ${clause}`),
  ]);
  const offset = (page - 1) * limit; const pageValues = [...values, String(limit), String(offset)]; const rows = (await pool.query(`SELECT e.id,e.data_entrada,e.numero_nf,e.produto_id,p.codigo produto_codigo,p.nome produto_nome,e.litros_nf,e.valor_total_nf ${base} ${clause} ORDER BY e.data_entrada DESC,e.created_at DESC,e.id DESC LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`, pageValues)).rows as Array<Record<string, unknown>>;
  const destinationMap = await destinations(rows.map(row => String(row.id)));
  const items = rows.map(row => { const itemDestinations = destinationMap.get(String(row.id)) ?? []; return { id: String(row.id), data_entrada: String(row.data_entrada), numero_nf: String(row.numero_nf), produto_id: String(row.produto_id), produto_codigo: String(row.produto_codigo), produto_nome: String(row.produto_nome), litros_nf: numberValue(row.litros_nf), valor_total_nf: numberValue(row.valor_total_nf), total_distribuido: itemDestinations.reduce((sum, item) => sum + item.litros, 0), destinos: itemDestinations }; });
  const total = Number(count.rows[0]?.total ?? 0);
  return { summary: { entradas: Number(summary.rows[0]?.entradas ?? 0), litros_nf: numberValue(summary.rows[0]?.litros_nf ?? 0), valor_nf: numberValue(summary.rows[0]?.valor_nf ?? 0) }, por_produto: products.rows.map(row => ({ ...row, quantidade: Number(row.quantidade), litros_nf: numberValue(row.litros_nf), valor_nf: numberValue(row.valor_nf), percentual_litros: numberValue(row.percentual_litros), percentual_valor: numberValue(row.percentual_valor) })), por_ponto: points.rows.map(row => ({ ...row, entradas: Number(row.entradas), litros: numberValue(row.litros) })), evolucao: evolution.rows.map(row => ({ periodo: row.periodo, entradas: Number(row.entradas), litros_nf: numberValue(row.litros_nf), valor_nf: numberValue(row.valor_nf) })), items, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}
