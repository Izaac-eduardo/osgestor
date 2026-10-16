import { pool } from '../config/database.js';

export interface TerceirosCategoriasFilters { data_inicio: string; data_fim: string; obra_id?: string; frota_codigo?: string; status?: string; categoria_servico?: string; }
const where = (filters: TerceirosCategoriasFilters) => {
  const values: string[] = [filters.data_inicio, filters.data_fim];
  const conditions = [`os.data_abertura >= $1::date`, `os.data_abertura <= $2::date`, `os.natureza_os = 'TERCEIRO'`, `os.status <> 'CANCELADA'`];
  const add = (sql: string, value: string) => { values.push(value); conditions.push(`${sql} = $${values.length}`); };
  if (filters.obra_id) add('os.obra_id', filters.obra_id);
  if (filters.frota_codigo) add('COALESCE(pf.codigo || os.frota_numero::text, \'\')', filters.frota_codigo.replace(/[\s-]/g, '').toUpperCase());
  if (filters.status) add('os.status', filters.status);
  if (filters.categoria_servico) add('os.categoria_servico', filters.categoria_servico);
  return { values, clause: conditions.join(' AND ') };
};

export async function getTerceirosCategorias(filters: TerceirosCategoriasFilters) {
  const { values, clause } = where(filters);
  const items = `SELECT s.id, s.ordem_servico_id, s.valor, s.codigo_poli, s.descricao, s.categoria_gerencial, s.subcategoria_gerencial, s.origem_classificacao,
      os.numero_os, os.data_abertura, o.codigo obra_codigo, o.nome obra_nome, COALESCE(pf.codigo || os.frota_numero::text, 'SEM FROTA') frota
    FROM servicos_os s JOIN ordens_servico os ON os.id=s.ordem_servico_id JOIN obras o ON o.id=os.obra_id
    LEFT JOIN prefixos_frota pf ON pf.id=os.prefixo_frota_id WHERE ${clause}`;
  const [summary, categories] = await Promise.all([
    pool.query<{ total: string; classified: string; unclassified: string; without_provenance: string; total_os: string; classified_os: string }>(
      `WITH items AS (${items}) SELECT COALESCE(SUM(valor),0)::text total,
       COALESCE(SUM(valor) FILTER (WHERE categoria_gerencial IS NOT NULL),0)::text classified,
       COALESCE(SUM(valor) FILTER (WHERE categoria_gerencial IS NULL),0)::text unclassified,
       COALESCE(SUM(valor) FILTER (WHERE categoria_gerencial IS NULL AND (codigo_poli IS NULL OR origem_classificacao IN ('SEM_CODIGO','SEM_PROVENIENCIA'))),0)::text without_provenance,
       COUNT(DISTINCT ordem_servico_id)::text total_os,
       COUNT(DISTINCT ordem_servico_id) FILTER (WHERE categoria_gerencial IS NOT NULL)::text classified_os FROM items`, values),
    pool.query<{ categoria: string; quantidade_itens: string; quantidade_os: string; valor: string; percentual: string }>(
      `WITH items AS (${items}), grouped AS (SELECT COALESCE(categoria_gerencial,'NAO_CLASSIFICADOS') categoria, COUNT(*) quantidade_itens, COUNT(DISTINCT ordem_servico_id) quantidade_os, COALESCE(SUM(valor),0) valor FROM items GROUP BY 1)
       SELECT categoria, quantidade_itens::text, quantidade_os::text, valor::text, CASE WHEN SUM(valor) OVER() = 0 THEN 0 ELSE round(valor * 100 / SUM(valor) OVER(), 2) END::text percentual FROM grouped ORDER BY valor DESC, categoria`, values),
  ]);
  const total = Number(summary.rows[0]?.total ?? 0);
  return {
    total_terceiros: total,
    valor_classificado: Number(summary.rows[0]?.classified ?? 0),
    valor_nao_classificado: Number(summary.rows[0]?.unclassified ?? 0),
    valor_sem_proveniencia: Number(summary.rows[0]?.without_provenance ?? 0),
    cobertura_percentual: total ? Number((Number(summary.rows[0]?.classified ?? 0) * 100 / total).toFixed(2)) : 0,
    diferenca_reconciliacao: Number((total - Number(summary.rows[0]?.classified ?? 0) - Number(summary.rows[0]?.unclassified ?? 0)).toFixed(2)),
    quantidade_os: Number(summary.rows[0]?.total_os ?? 0),
    quantidade_os_classificadas: Number(summary.rows[0]?.classified_os ?? 0),
    categorias: categories.rows.map(row => ({ categoria: row.categoria, quantidade_itens: Number(row.quantidade_itens), quantidade_os: Number(row.quantidade_os), valor: Number(row.valor), percentual: Number(row.percentual) })),
  };
}

export async function getTerceirosCategoriaItens(filters: TerceirosCategoriasFilters, categoria: string, page = 1, pageSize = 20) {
  const { values, clause } = where(filters);
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  values.push(categoria, String((normalizedPage - 1) * normalizedSize), String(normalizedSize));
  const categoryClause = ` AND COALESCE(s.categoria_gerencial,'NAO_CLASSIFICADOS') = $${values.length - 2}`;
  const base = `FROM servicos_os s JOIN ordens_servico os ON os.id=s.ordem_servico_id JOIN obras o ON o.id=os.obra_id LEFT JOIN prefixos_frota pf ON pf.id=os.prefixo_frota_id WHERE ${clause}${categoryClause}`;
  const result = await pool.query(`SELECT s.codigo_poli, s.descricao, s.subcategoria_gerencial, s.valor, os.numero_os, os.data_abertura, o.codigo obra_codigo, o.nome obra_nome, COALESCE(pf.codigo || os.frota_numero::text, 'SEM FROTA') frota ${base} ORDER BY s.valor DESC, os.numero_os DESC OFFSET $${values.length - 1} LIMIT $${values.length}`, values);
  const count = await pool.query<{ total: string }>(`SELECT COUNT(*)::text total ${base}`, values.slice(0, -2));
  return { page: normalizedPage, page_size: normalizedSize, total: Number(count.rows[0]?.total ?? 0), items: result.rows };
}
