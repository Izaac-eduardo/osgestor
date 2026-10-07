import { pool } from '../config/database.js';
import { normalizeFleetCode } from '../utils/frotas.js';
import { ordemServicoCategorias, ordemServicoNaturezas, ordemServicoStatuses } from './ordens-servico.service.js';

export interface DashboardFilters {
  data_inicio: string; data_fim: string; obra_id?: string; natureza_os?: string; status?: string;
  frota_codigo?: string; categoria_servico?: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
const numberValue = (value: string | number | null | undefined): number => Number(value ?? 0);

const validate = (filters: DashboardFilters) => {
  if (!validDate(filters.data_inicio) || !validDate(filters.data_fim) || filters.data_inicio > filters.data_fim) throw new Error('Período inválido. Use datas no formato YYYY-MM-DD.');
  if (filters.obra_id && !uuid.test(filters.obra_id)) throw new Error('obra_id inválido.');
  if (filters.natureza_os && !ordemServicoNaturezas.includes(filters.natureza_os as never)) throw new Error('natureza_os inválida.');
  if (filters.status && !ordemServicoStatuses.includes(filters.status as never)) throw new Error('status inválido.');
  if (filters.categoria_servico && !ordemServicoCategorias.includes(filters.categoria_servico as never)) throw new Error('categoria_servico inválida.');
  if (filters.frota_codigo && !normalizeFleetCode(filters.frota_codigo)) throw new Error('frota_codigo deve ser informado.');
};

const filterSql = (filters: DashboardFilters) => {
  const values: string[] = [filters.data_inicio, filters.data_fim];
  const conditions = ['v.data_abertura >= $1::date', 'v.data_abertura <= $2::date'];
  const add = (column: string, value: string) => { values.push(value); conditions.push(`${column} = $${values.length}`); };
  if (filters.obra_id) add('v.obra_id', filters.obra_id);
  if (filters.natureza_os) add('v.natureza_os', filters.natureza_os);
  if (filters.status) add('v.status', filters.status);
  if (filters.frota_codigo) add('v.frota_codigo', normalizeFleetCode(filters.frota_codigo));
  if (filters.categoria_servico) add('v.categoria_servico', filters.categoria_servico);
  return { values, where: conditions.join(' AND ') };
};

export async function getDashboard(filters: DashboardFilters) {
  validate(filters);
  const { values, where } = filterSql(filters);
  const base = `WITH filtered AS (
    SELECT v.id, v.status, v.natureza_os, v.categoria_servico, v.data_abertura,
      v.obra_id, v.obra_codigo, v.obra_nome, v.frota_codigo,
      v.total_mao_obra_interna, v.total_servicos_terceiros, v.total_produtos, v.total_os
    FROM vw_ordens_servico_resumo v WHERE ${where}
  ), orders AS (SELECT * FROM filtered)`;
  const hourStart = values.length + 1; const hourEnd = values.length + 2;
  const hourValues = [...values, filters.data_inicio, filters.data_fim];
  const [summary, status, naturezas, composition, daily, works, fleets, categories, classifications, hours] = await Promise.all([
    pool.query(`${base} SELECT COUNT(*)::text total_os,
      COALESCE(SUM(total_produtos) FILTER (WHERE status <> 'CANCELADA'),0)::text produtos,
      COALESCE(SUM(total_mao_obra_interna) FILTER (WHERE status <> 'CANCELADA'),0)::text interna,
      COALESCE(SUM(total_servicos_terceiros) FILTER (WHERE status <> 'CANCELADA'),0)::text terceiros,
      COALESCE(SUM(total_os) FILTER (WHERE status <> 'CANCELADA'),0)::text gasto_total,
      COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND total_produtos > 0)::text produtos_os,
      COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND natureza_os = 'INTERNA')::text interna_os,
      COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND natureza_os = 'TERCEIRO')::text terceiros_os,
      COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND total_os > 0)::text os_com_custo,
      COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND total_os = 0)::text os_sem_custo FROM orders`, values),
    pool.query(`${base} SELECT status, COUNT(*)::text quantidade FROM orders GROUP BY status ORDER BY status`, values),
    pool.query(`${base} SELECT natureza_os natureza, COUNT(*)::text quantidade, COALESCE(SUM(total_os) FILTER (WHERE status <> 'CANCELADA'),0)::text gasto FROM orders GROUP BY natureza_os ORDER BY natureza_os`, values),
    pool.query(`${base} SELECT COALESCE(SUM(total_produtos) FILTER (WHERE status <> 'CANCELADA'),0)::text produtos, COALESCE(SUM(total_mao_obra_interna + total_servicos_terceiros) FILTER (WHERE status <> 'CANCELADA'),0)::text servicos FROM orders`, values),
    pool.query(`${base} SELECT d::date::text data, COUNT(o.id)::text quantidade FROM generate_series($1::date,$2::date,interval '1 day') d LEFT JOIN orders o ON o.data_abertura=d::date GROUP BY d ORDER BY d`, values),
    pool.query(`${base} SELECT obra_id, COALESCE(obra_codigo,'SEM OBRA VINCULADA') codigo, COALESCE(obra_nome,'Sem obra vinculada') nome, COUNT(*) FILTER (WHERE status <> 'CANCELADA')::text quantidade_os, COALESCE(SUM(total_os) FILTER (WHERE status <> 'CANCELADA'),0)::text gasto FROM orders GROUP BY obra_id,obra_codigo,obra_nome ORDER BY COALESCE(SUM(total_os) FILTER (WHERE status <> 'CANCELADA'),0) DESC,codigo ASC LIMIT 5`, values),
    pool.query(`${base} SELECT COALESCE(frota_codigo,'SEM FROTA VINCULADA') frota, COUNT(*) FILTER (WHERE status <> 'CANCELADA')::text quantidade_os, COALESCE(SUM(total_os) FILTER (WHERE status <> 'CANCELADA'),0)::text gasto FROM orders GROUP BY frota_codigo ORDER BY COALESCE(SUM(total_os) FILTER (WHERE status <> 'CANCELADA'),0) DESC,frota ASC LIMIT 5`, values),
    pool.query(`${base} SELECT COALESCE(categoria_servico,'SEM CATEGORIA') categoria, COUNT(*)::text quantidade FROM orders WHERE natureza_os = 'INTERNA' GROUP BY COALESCE(categoria_servico,'SEM CATEGORIA') ORDER BY COUNT(*) DESC,categoria ASC LIMIT 5`, values),
    pool.query(`${base} SELECT COALESCE(s.classificacao_servico,'INDETERMINADO') classificacao, COUNT(*)::text quantidade, COALESCE(SUM(s.valor),0)::text valor FROM orders o JOIN servicos_os s ON s.ordem_servico_id=o.id WHERE o.status <> 'CANCELADA' GROUP BY COALESCE(s.classificacao_servico,'INDETERMINADO') ORDER BY valor DESC`, values),
    pool.query(`${base} SELECT f.nome funcionario, COALESCE(SUM(floor(extract(epoch FROM (e.fim-e.inicio))/60)),0)::text minutos FROM orders o JOIN servicos_os_execucoes e ON e.ordem_servico_id=o.id JOIN funcionarios f ON f.id=e.funcionario_id WHERE o.status <> 'CANCELADA' AND e.inicio >= $${hourStart}::date AND e.inicio < ($${hourEnd}::date + interval '1 day') AND e.fim > e.inicio GROUP BY f.id,f.nome ORDER BY SUM(floor(extract(epoch FROM (e.fim-e.inicio))/60)) DESC,funcionario ASC`, hourValues),
  ]);
  const s = summary.rows[0]!;
  return {
    periodo: { data_inicio: filters.data_inicio, data_fim: filters.data_fim },
    resumo: { total_os: numberValue(s.total_os), gasto_total: numberValue(s.gasto_total), produtos: numberValue(s.produtos), servicos: numberValue(s.interna) + numberValue(s.terceiros), interna: numberValue(s.interna), terceiros: numberValue(s.terceiros), produtos_os: numberValue(s.produtos_os), interna_os: numberValue(s.interna_os), terceiros_os: numberValue(s.terceiros_os), ticket_medio: numberValue(s.os_com_custo) ? numberValue(s.gasto_total) / numberValue(s.os_com_custo) : 0, os_com_custo: numberValue(s.os_com_custo), os_sem_custo: numberValue(s.os_sem_custo) },
    status: Object.fromEntries(status.rows.map(r => [r.status, numberValue(r.quantidade)])),
    naturezas: naturezas.rows.map(r => ({ natureza: r.natureza, quantidade: numberValue(r.quantidade), gasto: numberValue(r.gasto) })),
    composicao: { produtos: numberValue(composition.rows[0]?.produtos), servicos: numberValue(composition.rows[0]?.servicos) },
    os_por_dia: daily.rows.map(r => ({ data: r.data, quantidade: numberValue(r.quantidade) })),
    top_obras: works.rows.map(r => ({ codigo: r.codigo, nome: r.nome, quantidade_os: numberValue(r.quantidade_os), gasto: numberValue(r.gasto) })),
    top_frotas: fleets.rows.map(r => ({ frota: r.frota, quantidade_os: numberValue(r.quantidade_os), gasto: numberValue(r.gasto) })),
    categorias: categories.rows.map(r => ({ categoria: r.categoria, quantidade: numberValue(r.quantidade) })),
    classificacao_servicos: classifications.rows.map(r => ({ classificacao: r.classificacao, quantidade: numberValue(r.quantidade), valor: numberValue(r.valor) })),
    servicos_sem_classificacao: numberValue(classifications.rows.find(r => r.classificacao === 'INDETERMINADO')?.quantidade),
    horas_funcionarios: hours.rows.map(r => ({ funcionario: r.funcionario, minutos: numberValue(r.minutos) })),
  };
}
