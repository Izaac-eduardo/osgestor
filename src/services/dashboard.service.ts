import { pool } from '../config/database.js';
import { ordemServicoNaturezas, ordemServicoStatuses } from './ordens-servico.service.js';

export interface DashboardFilters { data_inicio: string; data_fim: string; obra_id?: string; natureza_os?: string; status?: string }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const numberValue = (value: string | number | null | undefined): number => Number(value ?? 0);

const validate = (filters: DashboardFilters) => {
  if (!date(filters.data_inicio) || !date(filters.data_fim) || filters.data_inicio > filters.data_fim) throw new Error('Período inválido. Use datas no formato YYYY-MM-DD.');
  if (filters.obra_id && !uuid.test(filters.obra_id)) throw new Error('obra_id inválido.');
  if (filters.natureza_os && !ordemServicoNaturezas.includes(filters.natureza_os as never)) throw new Error('natureza_os inválida.');
  if (filters.status && !ordemServicoStatuses.includes(filters.status as never)) throw new Error('status inválido.');
};

const filterSql = (filters: DashboardFilters) => {
  const values: string[] = [filters.data_inicio, filters.data_fim];
  const conditions = ['os.data_abertura >= $1::date', 'os.data_abertura <= $2::date'];
  if (filters.obra_id) { values.push(filters.obra_id); conditions.push(`os.obra_id = $${values.length}::uuid`); }
  if (filters.natureza_os) { values.push(filters.natureza_os); conditions.push(`os.natureza_os = $${values.length}`); }
  if (filters.status) { values.push(filters.status); conditions.push(`os.status = $${values.length}`); }
  return { values, where: conditions.join(' AND ') };
};

export async function getDashboard(filters: DashboardFilters) {
  validate(filters);
  const { values, where } = filterSql(filters);
  const base = `WITH filtered AS (
    SELECT os.id, os.status, os.natureza_os, os.data_abertura,
      o.id AS obra_id, o.codigo AS obra_codigo, o.nome AS obra_nome,
      pf.id AS frota_id, pf.codigo AS frota_prefixo, os.frota_numero
    FROM ordens_servico os
    LEFT JOIN obras o ON o.id = os.obra_id
    LEFT JOIN prefixos_frota pf ON pf.id = os.prefixo_frota_id
    WHERE ${where}
  ), products AS (
    SELECT p.ordem_servico_id, COALESCE(SUM(COALESCE(p.valor_total_original, p.valor_total)), 0) AS total
    FROM produtos_os p GROUP BY p.ordem_servico_id
  ), services AS (
    SELECT s.ordem_servico_id, COALESCE(SUM(s.valor), 0) AS total
    FROM servicos_os s GROUP BY s.ordem_servico_id
  ), orders AS (
    SELECT f.*, COALESCE(p.total, 0) AS produtos, COALESCE(s.total, 0) AS servicos,
      COALESCE(p.total, 0) + COALESCE(s.total, 0) AS total
    FROM filtered f LEFT JOIN products p ON p.ordem_servico_id=f.id LEFT JOIN services s ON s.ordem_servico_id=f.id
  )`;
  const [summary, status, naturezas, composition, daily, works, fleets, classifications, quality] = await Promise.all([
    pool.query(`${base} SELECT COUNT(*)::text AS total_os, COALESCE(SUM(produtos) FILTER (WHERE status <> 'CANCELADA'),0)::text AS produtos, COALESCE(SUM(servicos) FILTER (WHERE status <> 'CANCELADA'),0)::text AS servicos, COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELADA'),0)::text AS gasto_total, COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND total > 0)::text AS os_com_custo, COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND total = 0)::text AS os_sem_custo FROM orders`, values),
    pool.query(`${base} SELECT status, COUNT(*)::text AS quantidade FROM orders GROUP BY status ORDER BY status`, values),
    pool.query(`${base} SELECT natureza_os AS natureza, COUNT(*)::text AS quantidade, COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELADA'),0)::text AS gasto FROM orders GROUP BY natureza_os ORDER BY natureza_os`, values),
    pool.query(`${base} SELECT COALESCE(SUM(produtos) FILTER (WHERE status <> 'CANCELADA'),0)::text AS produtos, COALESCE(SUM(servicos) FILTER (WHERE status <> 'CANCELADA'),0)::text AS servicos FROM orders`, values),
    pool.query(`${base} SELECT data_abertura::text AS data, COUNT(*)::text AS quantidade FROM orders GROUP BY data_abertura ORDER BY data_abertura`, values),
    pool.query(`${base} SELECT obra_id, COALESCE(obra_codigo,'SEM OBRA VINCULADA') AS codigo, COALESCE(obra_nome,'Sem obra vinculada') AS nome, COUNT(*) FILTER (WHERE status <> 'CANCELADA')::text AS quantidade_os, COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELADA'),0)::text AS gasto FROM orders GROUP BY obra_id,obra_codigo,obra_nome ORDER BY COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELADA'),0) DESC LIMIT 5`, values),
    pool.query(`${base} SELECT frota_id, COALESCE(frota_prefixo || frota_numero::text,'SEM FROTA VINCULADA') AS frota, COUNT(*) FILTER (WHERE status <> 'CANCELADA')::text AS quantidade_os, COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELADA'),0)::text AS gasto FROM orders GROUP BY frota_id,frota_prefixo,frota_numero ORDER BY COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELADA'),0) DESC LIMIT 5`, values),
    pool.query(`${base} SELECT COALESCE(s.classificacao_servico,'INDETERMINADO') AS classificacao, COUNT(*)::text AS quantidade, COALESCE(SUM(s.valor),0)::text AS valor FROM orders o JOIN servicos_os s ON s.ordem_servico_id=o.id WHERE o.status <> 'CANCELADA' GROUP BY COALESCE(s.classificacao_servico,'INDETERMINADO') ORDER BY valor DESC`, values),
    pool.query(`${base} SELECT COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND total > 0)::text AS divisor_ticket, COUNT(*) FILTER (WHERE status <> 'CANCELADA' AND total = 0)::text AS sem_custo FROM orders`, values),
  ]);
  const s = summary.rows[0]!;
  return {
    periodo: { data_inicio: filters.data_inicio, data_fim: filters.data_fim },
    resumo: { total_os: numberValue(s.total_os), gasto_total: numberValue(s.gasto_total), produtos: numberValue(s.produtos), servicos: numberValue(s.servicos), ticket_medio: numberValue(s.os_com_custo) ? numberValue(s.gasto_total) / numberValue(s.os_com_custo) : 0, os_com_custo: numberValue(s.os_com_custo), os_sem_custo: numberValue(s.os_sem_custo) },
    status: Object.fromEntries(status.rows.map(r => [r.status, numberValue(r.quantidade)])),
    naturezas: naturezas.rows.map(r => ({ natureza: r.natureza, quantidade: numberValue(r.quantidade), gasto: numberValue(r.gasto) })),
    composicao: { produtos: numberValue(composition.rows[0]?.produtos), servicos: numberValue(composition.rows[0]?.servicos) },
    os_por_dia: daily.rows.map(r => ({ data: r.data, quantidade: numberValue(r.quantidade) })),
    top_obras: works.rows.map(r => ({ codigo: r.codigo, nome: r.nome, quantidade_os: numberValue(r.quantidade_os), gasto: numberValue(r.gasto) })),
    top_frotas: fleets.rows.map(r => ({ frota: r.frota, quantidade_os: numberValue(r.quantidade_os), gasto: numberValue(r.gasto) })),
    classificacao_servicos: classifications.rows.map(r => ({ classificacao: r.classificacao, quantidade: numberValue(r.quantidade), valor: numberValue(r.valor) })),
    servicos_sem_classificacao: numberValue(classifications.rows.find(r => r.classificacao === 'INDETERMINADO')?.quantidade),
  };
}
