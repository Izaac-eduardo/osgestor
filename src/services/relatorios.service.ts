import { pool } from '../config/database.js';
import {
  ordemServicoCategorias,
  ordemServicoNaturezas,
  ordemServicoStatuses,
} from './ordens-servico.service.js';

export interface RelatorioFilters {
  obra_id?: string;
  prefixo_frota_id?: string;
  frota_numero?: string;
  data_inicio?: string;
  data_fim?: string;
  natureza_os?: string;
  categoria_servico?: string;
  status?: string;
}

export class RelatorioServiceError extends Error {
  constructor(public readonly statusCode: 400, message: string) {
    super(message);
    this.name = 'RelatorioServiceError';
  }
}

interface GastosVeiculoRow {
  obra_id: string;
  obra_codigo: string;
  obra_nome: string;
  prefixo_frota_id: string;
  frota_prefixo: string;
  frota_numero: number;
  frota_codigo: string;
  total_mao_obra_interna: string;
  total_servicos_terceiros: string;
  total_produtos: string;
  total_gasto: string;
  quantidade_os: string;
}

interface GastosObraRow {
  obra_id: string;
  obra_codigo: string;
  obra_nome: string;
  total_mao_obra_interna: string;
  total_servicos_terceiros: string;
  total_produtos: string;
  total_gasto: string;
  quantidade_os: string;
}

interface OsSemanaRow {
  ano: string;
  semana: string;
  data_inicio_semana: string;
  quantidade_os: string;
}

interface ResumoRow {
  quantidade_os: string;
  os_abertas: string;
  os_em_andamento: string;
  os_aguardando_peca: string;
  os_finalizadas: string;
  os_canceladas: string;
  total_mao_obra_interna: string;
  total_servicos_terceiros: string;
  total_produtos: string;
  total_gasto: string;
}

type FilterName = keyof RelatorioFilters;
type QueryValue = string | number;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const validateFilters = (filters: RelatorioFilters, allowed: readonly FilterName[]): void => {
  const accepts = (field: FilterName): boolean => allowed.includes(field);
  if (accepts('obra_id') && filters.obra_id !== undefined && !uuidPattern.test(filters.obra_id)) {
    throw new RelatorioServiceError(400, 'obra_id deve ser um UUID válido.');
  }
  if (
    accepts('prefixo_frota_id')
    && filters.prefixo_frota_id !== undefined
    && !uuidPattern.test(filters.prefixo_frota_id)
  ) {
    throw new RelatorioServiceError(400, 'prefixo_frota_id deve ser um UUID válido.');
  }
  if (accepts('data_inicio') && filters.data_inicio !== undefined && !isValidDate(filters.data_inicio)) {
    throw new RelatorioServiceError(400, 'data_inicio deve estar no formato YYYY-MM-DD.');
  }
  if (accepts('data_fim') && filters.data_fim !== undefined && !isValidDate(filters.data_fim)) {
    throw new RelatorioServiceError(400, 'data_fim deve estar no formato YYYY-MM-DD.');
  }
  if (
    accepts('data_inicio')
    && accepts('data_fim')
    && filters.data_inicio !== undefined
    && filters.data_fim !== undefined
    && filters.data_inicio > filters.data_fim
  ) {
    throw new RelatorioServiceError(400, 'data_inicio não pode ser posterior a data_fim.');
  }
  if (
    accepts('natureza_os')
    && filters.natureza_os !== undefined
    && !ordemServicoNaturezas.some((value) => value === filters.natureza_os)
  ) {
    throw new RelatorioServiceError(400, 'natureza_os inválida.');
  }
  if (
    accepts('categoria_servico')
    && filters.categoria_servico !== undefined
    && !ordemServicoCategorias.some((value) => value === filters.categoria_servico)
  ) {
    throw new RelatorioServiceError(400, 'categoria_servico inválida.');
  }
  if (
    accepts('status')
    && filters.status !== undefined
    && !ordemServicoStatuses.some((value) => value === filters.status)
  ) {
    throw new RelatorioServiceError(400, 'status inválido.');
  }
  if (accepts('frota_numero') && filters.frota_numero !== undefined) {
    if (!/^\d+$/.test(filters.frota_numero) || filters.frota_numero === '0') {
      throw new RelatorioServiceError(400, 'frota_numero deve ser um inteiro positivo válido.');
    }
    const value = Number(filters.frota_numero);
    if (!Number.isSafeInteger(value) || value > 2147483647) {
      throw new RelatorioServiceError(400, 'frota_numero deve ser um inteiro positivo válido.');
    }
  }
};

const buildWhere = (
  filters: RelatorioFilters,
  allowed: readonly FilterName[],
  initialConditions: string[] = [],
): { where: string; values: QueryValue[] } => {
  validateFilters(filters, allowed);
  const conditions = [...initialConditions];
  const values: QueryValue[] = [];
  const add = (column: string, value: QueryValue): void => {
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  };
  if (allowed.includes('obra_id') && filters.obra_id !== undefined) add('obra_id', filters.obra_id);
  if (allowed.includes('prefixo_frota_id') && filters.prefixo_frota_id !== undefined) {
    add('prefixo_frota_id', filters.prefixo_frota_id);
  }
  if (allowed.includes('frota_numero') && filters.frota_numero !== undefined) {
    add('frota_numero', Number(filters.frota_numero));
  }
  if (allowed.includes('natureza_os') && filters.natureza_os !== undefined) {
    add('natureza_os', filters.natureza_os);
  }
  if (allowed.includes('categoria_servico') && filters.categoria_servico !== undefined) {
    add('categoria_servico', filters.categoria_servico);
  }
  if (allowed.includes('status') && filters.status !== undefined) add('status', filters.status);
  if (allowed.includes('data_inicio') && filters.data_inicio !== undefined) {
    values.push(filters.data_inicio);
    conditions.push(`data_abertura >= $${values.length}`);
  }
  if (allowed.includes('data_fim') && filters.data_fim !== undefined) {
    values.push(filters.data_fim);
    conditions.push(`data_abertura <= $${values.length}`);
  }
  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
};

const numeric = (value: string, field: string): number => {
  const converted = Number(value);
  if (!Number.isFinite(converted) || Math.abs(converted) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Valor numérico fora da faixa segura em ${field}.`);
  }
  return converted;
};

export interface RelatorioFilterLabels {
  obra: string;
  prefixoFrota: string;
}

interface OrdemRelatorioRow {
  id: string;
  numero_os: string;
  obra_codigo: string;
  obra_nome: string;
  frota_codigo: string;
  natureza_os: 'INTERNA' | 'TERCEIRO' | 'MATERIAL';
  categoria_servico: string | null;
  prestador_terceiro: string | null;
  data_abertura: string;
  status: string;
  total_mao_obra_interna: string;
  total_servicos_terceiros: string;
  total_produtos: string;
  total_os: string;
}

interface FuncionarioRelatorioRow { ordem_servico_id: string; nome: string }
interface ServicoRelatorioRow { ordem_servico_id: string; descricao: string; valor: string }
interface ProdutoRelatorioRow {
  ordem_servico_id: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  valor_unitario: string;
  valor_total: string;
}

export interface OrdemServicoRelatorio extends Omit<OrdemRelatorioRow,
  'total_mao_obra_interna' | 'total_servicos_terceiros' | 'total_produtos' | 'total_os'> {
  total_mao_obra_interna: number;
  total_servicos_terceiros: number;
  total_produtos: number;
  total_os: number;
  funcionarios: Array<{ nome: string }>;
  servicos: Array<{ descricao: string; valor: number }>;
  produtos: Array<{
    descricao: string;
    quantidade: number;
    unidade: string;
    valor_unitario: number;
    valor_total: number;
  }>;
}

export async function getRelatorioFilterLabels(filters: RelatorioFilters): Promise<RelatorioFilterLabels> {
  const [obraResult, prefixoResult] = await Promise.all([
    filters.obra_id
      ? pool.query<{ codigo: string; nome: string }>('SELECT codigo, nome FROM obras WHERE id = $1', [filters.obra_id])
      : Promise.resolve({ rows: [] }),
    filters.prefixo_frota_id
      ? pool.query<{ codigo: string }>('SELECT codigo FROM prefixos_frota WHERE id = $1', [filters.prefixo_frota_id])
      : Promise.resolve({ rows: [] }),
  ]);
  const obra = obraResult.rows[0];
  const prefixo = prefixoResult.rows[0];
  return {
    obra: obra ? `${obra.nome} · ${obra.codigo}` : 'Todas',
    prefixoFrota: prefixo?.codigo ?? 'Todos',
  };
}

export async function getOrdensServicoRelatorio(
  filters: RelatorioFilters,
): Promise<OrdemServicoRelatorio[]> {
  const allowed: FilterName[] = [
    'obra_id', 'prefixo_frota_id', 'frota_numero', 'data_inicio', 'data_fim',
    'natureza_os', 'categoria_servico', 'status',
  ];
  const { where, values } = buildWhere(filters, allowed);
  const ordensResult = await pool.query<OrdemRelatorioRow>(
    `SELECT id, numero_os, obra_codigo, obra_nome, frota_codigo, natureza_os,
       categoria_servico, prestador_terceiro, data_abertura, status,
       total_mao_obra_interna, total_servicos_terceiros, total_produtos, total_os
     FROM vw_ordens_servico_resumo
     ${where}
     ORDER BY data_abertura ASC, numero_os ASC`,
    values,
  );
  if (ordensResult.rows.length === 0) return [];

  const ids = ordensResult.rows.map((ordem) => ordem.id);
  const [funcionariosResult, servicosResult, produtosResult] = await Promise.all([
    pool.query<FuncionarioRelatorioRow>(
      `SELECT osf.ordem_servico_id, f.nome
       FROM ordens_servico_funcionarios osf
       JOIN funcionarios f ON f.id = osf.funcionario_id
       WHERE osf.ordem_servico_id = ANY($1::uuid[])
       ORDER BY f.nome ASC`,
      [ids],
    ),
    pool.query<ServicoRelatorioRow>(
      `SELECT ordem_servico_id, descricao, valor
       FROM servicos_os WHERE ordem_servico_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [ids],
    ),
    pool.query<ProdutoRelatorioRow>(
      `SELECT ordem_servico_id, descricao, quantidade, unidade, valor_unitario, valor_total
       FROM produtos_os WHERE ordem_servico_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [ids],
    ),
  ]);

  const byOrder = <T extends { ordem_servico_id: string }>(rows: T[]): Map<string, T[]> => {
    const result = new Map<string, T[]>();
    for (const row of rows) {
      const group = result.get(row.ordem_servico_id) ?? [];
      group.push(row);
      result.set(row.ordem_servico_id, group);
    }
    return result;
  };
  const funcionarios = byOrder(funcionariosResult.rows);
  const servicos = byOrder(servicosResult.rows);
  const produtos = byOrder(produtosResult.rows);

  return ordensResult.rows.map((ordem) => ({
    ...ordem,
    total_mao_obra_interna: numeric(ordem.total_mao_obra_interna, 'total_mao_obra_interna'),
    total_servicos_terceiros: numeric(ordem.total_servicos_terceiros, 'total_servicos_terceiros'),
    total_produtos: numeric(ordem.total_produtos, 'total_produtos'),
    total_os: numeric(ordem.total_os, 'total_os'),
    funcionarios: (funcionarios.get(ordem.id) ?? []).map(({ nome }) => ({ nome })),
    servicos: (servicos.get(ordem.id) ?? []).map(({ descricao, valor }) => ({
      descricao,
      valor: numeric(valor, 'servicos.valor'),
    })),
    produtos: (produtos.get(ordem.id) ?? []).map((produto) => ({
      descricao: produto.descricao,
      quantidade: numeric(produto.quantidade, 'produtos.quantidade'),
      unidade: produto.unidade,
      valor_unitario: numeric(produto.valor_unitario, 'produtos.valor_unitario'),
      valor_total: numeric(produto.valor_total, 'produtos.valor_total'),
    })),
  }));
}
export async function getGastosPorVeiculo(filters: RelatorioFilters) {
  const allowed: FilterName[] = [
    'obra_id', 'prefixo_frota_id', 'frota_numero', 'data_inicio', 'data_fim',
    'natureza_os', 'categoria_servico',
  ];
  const { where, values } = buildWhere(filters, allowed, ["status <> 'CANCELADA'"]);
  const result = await pool.query<GastosVeiculoRow>(
    `SELECT
       obra_id, obra_codigo, obra_nome, prefixo_frota_id, frota_prefixo,
       frota_numero, frota_codigo,
       SUM(total_mao_obra_interna) AS total_mao_obra_interna,
       SUM(total_servicos_terceiros) AS total_servicos_terceiros,
       SUM(total_produtos) AS total_produtos,
       SUM(total_os) AS total_gasto,
       COUNT(*) AS quantidade_os
     FROM vw_ordens_servico_resumo
     ${where}
     GROUP BY obra_id, obra_codigo, obra_nome, prefixo_frota_id, frota_prefixo,
       frota_numero, frota_codigo
     ORDER BY total_gasto DESC`,
    values,
  );
  return result.rows.map((row) => ({
    ...row,
    total_mao_obra_interna: numeric(row.total_mao_obra_interna, 'total_mao_obra_interna'),
    total_servicos_terceiros: numeric(row.total_servicos_terceiros, 'total_servicos_terceiros'),
    total_produtos: numeric(row.total_produtos, 'total_produtos'),
    total_gasto: numeric(row.total_gasto, 'total_gasto'),
    quantidade_os: numeric(row.quantidade_os, 'quantidade_os'),
  }));
}

export async function getGastosPorObra(filters: RelatorioFilters) {
  const allowed: FilterName[] = [
    'obra_id', 'data_inicio', 'data_fim', 'natureza_os', 'categoria_servico',
  ];
  const { where, values } = buildWhere(filters, allowed, ["status <> 'CANCELADA'"]);
  const result = await pool.query<GastosObraRow>(
    `SELECT
       obra_id, obra_codigo, obra_nome,
       SUM(total_mao_obra_interna) AS total_mao_obra_interna,
       SUM(total_servicos_terceiros) AS total_servicos_terceiros,
       SUM(total_produtos) AS total_produtos,
       SUM(total_os) AS total_gasto,
       COUNT(*) AS quantidade_os
     FROM vw_ordens_servico_resumo
     ${where}
     GROUP BY obra_id, obra_codigo, obra_nome
     ORDER BY total_gasto DESC`,
    values,
  );
  return result.rows.map((row) => ({
    ...row,
    total_mao_obra_interna: numeric(row.total_mao_obra_interna, 'total_mao_obra_interna'),
    total_servicos_terceiros: numeric(row.total_servicos_terceiros, 'total_servicos_terceiros'),
    total_produtos: numeric(row.total_produtos, 'total_produtos'),
    total_gasto: numeric(row.total_gasto, 'total_gasto'),
    quantidade_os: numeric(row.quantidade_os, 'quantidade_os'),
  }));
}

export async function getOsPorSemana(filters: RelatorioFilters) {
  const allowed: FilterName[] = [
    'data_inicio', 'data_fim', 'obra_id', 'status', 'natureza_os', 'categoria_servico',
  ];
  const { where, values } = buildWhere(filters, allowed);
  const result = await pool.query<OsSemanaRow>(
    `SELECT
       EXTRACT(ISOYEAR FROM data_abertura)::integer AS ano,
       EXTRACT(WEEK FROM data_abertura)::integer AS semana,
       to_char(date_trunc('week', data_abertura), 'YYYY-MM-DD') AS data_inicio_semana,
       COUNT(*) AS quantidade_os
     FROM vw_ordens_servico_resumo
     ${where}
     GROUP BY ano, semana, data_inicio_semana
     ORDER BY ano ASC, semana ASC`,
    values,
  );
  return result.rows.map((row) => ({
    ano: numeric(row.ano, 'ano'),
    semana: numeric(row.semana, 'semana'),
    data_inicio_semana: row.data_inicio_semana,
    quantidade_os: numeric(row.quantidade_os, 'quantidade_os'),
  }));
}

export async function getResumo(filters: RelatorioFilters) {
  const allowed: FilterName[] = ['data_inicio', 'data_fim', 'obra_id'];
  const { where, values } = buildWhere(filters, allowed);
  const result = await pool.query<ResumoRow>(
    `SELECT
       COUNT(*) AS quantidade_os,
       COUNT(*) FILTER (WHERE status = 'ABERTA') AS os_abertas,
       COUNT(*) FILTER (WHERE status = 'EM_ANDAMENTO') AS os_em_andamento,
       COUNT(*) FILTER (WHERE status = 'AGUARDANDO_PECA') AS os_aguardando_peca,
       COUNT(*) FILTER (WHERE status = 'FINALIZADA') AS os_finalizadas,
       COUNT(*) FILTER (WHERE status = 'CANCELADA') AS os_canceladas,
       COALESCE(SUM(total_mao_obra_interna) FILTER (WHERE status <> 'CANCELADA'), 0)
         AS total_mao_obra_interna,
       COALESCE(SUM(total_servicos_terceiros) FILTER (WHERE status <> 'CANCELADA'), 0)
         AS total_servicos_terceiros,
       COALESCE(SUM(total_produtos) FILTER (WHERE status <> 'CANCELADA'), 0)
         AS total_produtos,
       COALESCE(SUM(total_os) FILTER (WHERE status <> 'CANCELADA'), 0) AS total_gasto
     FROM vw_ordens_servico_resumo
     ${where}`,
    values,
  );
  const row = result.rows[0]!;
  return {
    quantidade_os: numeric(row.quantidade_os, 'quantidade_os'),
    os_abertas: numeric(row.os_abertas, 'os_abertas'),
    os_em_andamento: numeric(row.os_em_andamento, 'os_em_andamento'),
    os_aguardando_peca: numeric(row.os_aguardando_peca, 'os_aguardando_peca'),
    os_finalizadas: numeric(row.os_finalizadas, 'os_finalizadas'),
    os_canceladas: numeric(row.os_canceladas, 'os_canceladas'),
    total_mao_obra_interna: numeric(row.total_mao_obra_interna, 'total_mao_obra_interna'),
    total_servicos_terceiros: numeric(row.total_servicos_terceiros, 'total_servicos_terceiros'),
    total_produtos: numeric(row.total_produtos, 'total_produtos'),
    total_gasto: numeric(row.total_gasto, 'total_gasto'),
  };
}
