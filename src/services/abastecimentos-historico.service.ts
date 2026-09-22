import { pool } from '../config/database.js';
import { AbastecimentoServiceError } from './abastecimentos-base.service.js';

export interface HistoricoFilters {
  data_inicio?: string;
  data_fim?: string;
  obra_id?: string;
  busca?: string;
  produto?: string;
  tipo_destinatario?: string;
  page?: string;
  limit?: string;
}

const date = (value: string | undefined, field: string): string | undefined => {
  if (value === undefined || value === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AbastecimentoServiceError(400, `${field} deve estar no formato YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AbastecimentoServiceError(400, `${field} é inválida.`);
  return value;
};

const pageValue = (value: string | undefined): number => {
  if (value === undefined || value === '') return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new AbastecimentoServiceError(400, 'page deve ser um inteiro positivo.');
  return parsed;
};

const limitValue = (value: string | undefined): number => {
  if (value === undefined || value === '') return 50;
  const parsed = Number(value);
  if (![25, 50, 100].includes(parsed)) throw new AbastecimentoServiceError(400, 'limit deve ser 25, 50 ou 100.');
  return parsed;
};

const bindValue = (values: string[], value: string): string => { values.push(value); return `$${values.length}`; };

function buildWhere(filters: HistoricoFilters, values: string[]): string {
  const conditions: string[] = [];
  const start = date(filters.data_inicio, 'data_inicio');
  const end = date(filters.data_fim, 'data_fim');
  if (start) conditions.push(`a.data_hora >= ${bindValue(values, `${start}T00:00:00`)}`);
  if (end) conditions.push(`a.data_hora < (${bindValue(values, `${end}T00:00:00`)}::timestamp + interval '1 day')`);
  if (filters.obra_id) conditions.push(`a.obra_id = ${bindValue(values, filters.obra_id)}`);
  if (filters.produto) conditions.push(`p.codigo = ${bindValue(values, filters.produto.trim().toUpperCase())}`);
  if (filters.tipo_destinatario) {
    if (!['FROTA', 'TERCEIRO', 'ESPECIAL', 'EXTERNA'].includes(filters.tipo_destinatario)) throw new AbastecimentoServiceError(400, 'tipo_destinatario inválido.');
    conditions.push(`a.tipo_destinatario = ${bindValue(values, filters.tipo_destinatario)}`);
  }
  const search = filters.busca?.trim();
  if (search) {
    const parameter = bindValue(values, `%${search}%`);
    conditions.push(`(
      a.identificacao_original ILIKE ${parameter} OR a.placa_original ILIKE ${parameter} OR a.frota_original ILIKE ${parameter}
      OR f.codigo ILIKE ${parameter} OR f.placa ILIKE ${parameter} OR t.nome ILIKE ${parameter}
      OR d.codigo ILIKE ${parameter} OR d.nome ILIKE ${parameter}
      OR EXISTS (SELECT 1 FROM abastecimento_terceiro_identificacoes ti_search WHERE ti_search.terceiro_id = a.terceiro_id AND ti_search.status = 'ATIVO' AND ti_search.identificacao ILIKE ${parameter})
    )`);
  }
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

const fromClause = `
  FROM abastecimentos a
  JOIN abastecimento_produtos p ON p.id = a.produto_id
  JOIN obras o ON o.id = a.obra_id
  LEFT JOIN frotas f ON f.id = a.frota_id
  LEFT JOIN abastecimento_terceiros t ON t.id = a.terceiro_id
  LEFT JOIN abastecimento_destinacoes_especiais d ON d.id = a.destinacao_especial_id
`;

export async function listAbastecimentosHistorico(filters: HistoricoFilters = {}) {
  const values: string[] = [];
  const where = buildWhere(filters, values);
  const page = pageValue(filters.page);
  const limit = limitValue(filters.limit);
  const offset = (page - 1) * limit;
  const countResult = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total ${fromClause} ${where}`, values);
  const summaryResult = await pool.query<{ quantidade: string; total_litros: string | null; total_valor: string | null }>(`SELECT COUNT(*)::text AS quantidade, COALESCE(SUM(a.litros), 0)::text AS total_litros, COALESCE(SUM(a.valor_total), 0)::text AS total_valor ${fromClause} ${where}`, values);
  const itemValues = [...values, String(limit), String(offset)];
  const items = await pool.query(`
    SELECT a.id, a.data_hora, a.produto_id, a.obra_id, a.frota_id, a.terceiro_id, a.destinacao_especial_id, a.tipo_destinatario, a.identificador_externo, a.identificacao_original,
      a.placa_original, a.frota_original, a.litros, a.valor_total, a.km_hr, a.horimetro,
      a.bico_codigo_original, a.bico_descricao_original, a.frentista_original, a.origem_sistema,
      p.codigo AS produto_codigo, o.nome AS obra_nome, f.codigo AS frota_codigo,
      COALESCE(f.placa, NULLIF(a.placa_original, ''), CASE WHEN a.tipo_destinatario = 'FROTA' THEN f.codigo END) AS placa,
      CASE
        WHEN a.tipo_destinatario = 'FROTA' THEN f.codigo
        WHEN a.tipo_destinatario = 'TERCEIRO' THEN concat_ws(' — ', NULLIF(a.identificacao_original, ''), t.nome)
        WHEN a.tipo_destinatario = 'ESPECIAL' THEN COALESCE(d.codigo, d.nome)
        ELSE COALESCE(NULLIF(a.identificacao_original, ''), 'Externa')
      END AS destinatario,
      t.nome AS terceiro_nome, d.codigo AS destinacao_especial_codigo
    ${fromClause} ${where}
    ORDER BY a.data_hora DESC, a.id DESC
    LIMIT $${itemValues.length - 1} OFFSET $${itemValues.length}
  `, itemValues);
  const summary = summaryResult.rows[0]!;
  return {
    items: items.rows.map(row => ({ ...row, litros: Number(row.litros), valor_total: Number(row.valor_total), km_hr: row.km_hr === null ? null : Number(row.km_hr), horimetro: row.horimetro === null ? null : Number(row.horimetro) })),
    summary: { quantidade: Number(summary.quantidade), total_litros: Number(summary.total_litros), total_valor: Number(summary.total_valor) },
    pagination: { page, limit, total: Number(countResult.rows[0]?.total ?? 0), total_pages: Math.ceil(Number(countResult.rows[0]?.total ?? 0) / limit) },
  };
}
