import { pool } from '../config/database.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { isMaintenanceTollExpense, matchesDiverseMaintenanceFilters, sumCurrencyValues } from './maintenance-accounting-eligibility.js';

export class ManutencaoFinanceiraError extends Error { constructor(public readonly statusCode: 400 | 403 | 404 | 409, message: string) { super(message); } }
export type ManutencaoNature = 'MAO_DE_OBRA_INTERNA' | 'MATERIAIS_ALMOXARIFADO' | 'PECAS_EXTERNAS' | 'SERVICOS_TERCEIRIZADOS';
export interface ManutencaoFilters { data_inicio: string; data_fim: string; frota_id?: string; frota_codigo?: string; natureza?: ManutencaoNature; categoria?: ManutencaoNature; origem?: string; }
export interface SalarioBaseFields { ano: number; mes: number; valor_consolidado: string | number; observacoes?: string | null; }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const validateFilters = (filters: ManutencaoFilters): void => {
  const natureza = filters.natureza ?? filters.categoria;
  if (natureza !== undefined && !['PECAS_EXTERNAS', 'SERVICOS_TERCEIRIZADOS', 'MATERIAIS_ALMOXARIFADO', 'MAO_DE_OBRA_INTERNA'].includes(natureza)) throw new ManutencaoFinanceiraError(400, 'natureza invalida.');
  if (filters.frota_codigo !== undefined && !filters.frota_codigo.trim()) throw new ManutencaoFinanceiraError(400, 'frota_codigo inválido.');
  if (!isoDate(filters.data_inicio) || !isoDate(filters.data_fim) || filters.data_inicio > filters.data_fim) throw new ManutencaoFinanceiraError(400, 'Informe um período válido no formato YYYY-MM-DD.');
  if (filters.frota_id !== undefined && !uuid.test(filters.frota_id)) throw new ManutencaoFinanceiraError(400, 'frota_id inválido.');
  if (filters.categoria !== undefined && !['PECAS_EXTERNAS', 'SERVICOS_TERCEIRIZADOS', 'MATERIAIS_ALMOXARIFADO', 'MAO_DE_OBRA_INTERNA'].includes(filters.categoria)) throw new ManutencaoFinanceiraError(400, 'categoria inválida.');
  if (filters.origem !== undefined && !['CONTABILIDADE', 'OS'].includes(filters.origem)) throw new ManutencaoFinanceiraError(400, 'origem inválida.');
};
const money = (value: unknown): string => String(value ?? '0');
const addMoney = (...values: string[]): string => { const cents = values.reduce((total, value) => { const [whole, fraction = ''] = value.split('.'); return total + BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2)); }, 0n); const sign = cents < 0n ? '-' : ''; const absolute = cents < 0n ? -cents : cents; return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`; };

const SQL_NORMALIZED_PRODUCT = "upper(btrim(regexp_replace(translate(coalesce(l.produto_original,''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'), '[[:space:]]+', ' ', 'g')))";
const SQL_TOLL_EXCLUSION = `AND ${SQL_NORMALIZED_PRODUCT} NOT LIKE '%PASSAGEM PEDAGIO%' AND ${SQL_NORMALIZED_PRODUCT} NOT LIKE '%MENSALIDADE PEDAGIO%'`;
const SQL_NORMALIZED_SUBCENTER = "upper(btrim(regexp_replace(coalesce(l.subcentro_original,''), '[[:space:]]+', ' ', 'g')))";
const SQL_NORMAL_ACCOUNTING_ELIGIBILITY = "((COALESCE(l.despesa_compartilhada_status,'NAO_COMPARTILHADA')='NAO_COMPARTILHADA' AND l.identificacao_frota<>'PENDENTE') OR (l.despesa_compartilhada_status='APROVADA' AND l.frota_id IS NOT NULL AND l.identificacao_frota<>'PENDENTE'))";
const SQL_DIVERSE_ACCOUNTING_ELIGIBILITY = `l.despesa_compartilhada_status='APROVADA' AND l.frota_id IS NULL AND ${SQL_NORMALIZED_SUBCENTER}='FROTAS DIVERSAS'`;

export interface DesempenhoOficinaRow { valor_servicos_internos: string | number; salario_base_informado: string | number | null; meses_no_periodo: number; meses_com_salario: number; meses_sem_salario: number; competencias_sem_salario: string[]; diferenca_gerencial_estimada: string | number | null; periodo_salarial_completo?: boolean; }
export interface DesempenhoOficinaDetalhe { ordem_servico_id: string; numero_os: number; status: string; data_abertura: string; frota: string; descricao: string; valor: string; }
export function normalizeDesempenhoOficina(row: DesempenhoOficinaRow | null | undefined) {
  const value = row ?? { valor_servicos_internos: '0', salario_base_informado: null, meses_no_periodo: 0, meses_com_salario: 0, meses_sem_salario: 0, competencias_sem_salario: [], diferenca_gerencial_estimada: null };
  const incomplete = Number(value.meses_sem_salario) > 0 || value.periodo_salarial_completo === false;
  const hasCompletePeriod = Number(value.meses_no_periodo) > 0 && !incomplete;
  return {
    criterio_competencia: 'Serviços internos: data_abertura; salário: ano/mês cadastrado; lançamentos contábeis: data_conta.',
    valor_servicos_internos: money(value.valor_servicos_internos),
    salario_base_cadastrado: hasCompletePeriod ? money(value.salario_base_informado) : null,
    salario_base_informado: money(value.salario_base_informado),
    diferenca_gerencial_estimada: incomplete || value.diferenca_gerencial_estimada === null ? null : money(value.diferenca_gerencial_estimada),
    meses_no_periodo: Number(value.meses_no_periodo), meses_com_salario: Number(value.meses_com_salario), meses_sem_salario: Number(value.meses_sem_salario), periodo_salarial_completo: value.periodo_salarial_completo !== false,
    competencias_sem_salario: value.competencias_sem_salario, dados_incompletos: incomplete,
  };
}

function filterValues(filters: ManutencaoFilters): { values: Array<string | null> } {
  const values = [filters.data_inicio, filters.data_fim, filters.frota_id ?? null, filters.natureza ?? filters.categoria ?? null, filters.origem ?? null, filters.frota_codigo?.trim() || null];
  return { values };
}

export async function getManutencaoPorFrota(filters: ManutencaoFilters): Promise<unknown[]> {
  validateFilters(filters); const { values } = filterValues(filters);
  const result = await pool.query(`WITH cont AS (
    SELECT l.frota_id, COUNT(*) FILTER (WHERE l.classificacao IN ('PECAS_EXTERNAS','SERVICOS_TERCEIRIZADOS'))::int lancamentos, SUM(CASE WHEN l.classificacao='PECAS_EXTERNAS' THEN l.valor_total ELSE 0 END) pecas_externas,
           SUM(CASE WHEN l.classificacao='SERVICOS_TERCEIRIZADOS' THEN l.valor_total ELSE 0 END) servicos_terceirizados
      FROM lancamentos_contabeis l JOIN frotas f ON f.id=l.frota_id
     WHERE l.frota_id IS NOT NULL AND ${SQL_NORMAL_ACCOUNTING_ELIGIBILITY} ${SQL_TOLL_EXCLUSION} AND l.classificacao IN ('PECAS_EXTERNAS','SERVICOS_TERCEIRIZADOS')
       AND l.data_conta BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR l.frota_id=$3::uuid) AND ($4::text IS NULL OR l.classificacao=$4) AND ($5::text IS NULL OR $5='CONTABILIDADE') AND ($6::text IS NULL OR f.codigo=$6)
     GROUP BY l.frota_id
  ), diversas AS (
    SELECT COUNT(*)::int lancamentos,
           COALESCE(SUM(l.valor_total) FILTER (WHERE l.classificacao='PECAS_EXTERNAS'),0)::numeric pecas_externas,
           COALESCE(SUM(l.valor_total) FILTER (WHERE l.classificacao='SERVICOS_TERCEIRIZADOS'),0)::numeric servicos_terceirizados
      FROM lancamentos_contabeis l
     WHERE ${SQL_DIVERSE_ACCOUNTING_ELIGIBILITY} ${SQL_TOLL_EXCLUSION}
       AND l.classificacao IN ('PECAS_EXTERNAS','SERVICOS_TERCEIRIZADOS')
       AND l.data_conta BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL) AND ($4::text IS NULL OR l.classificacao=$4) AND ($5::text IS NULL OR $5='CONTABILIDADE') AND ($6::text IS NULL)
  ), materiais AS (
    SELECT os.frota_id,COUNT(*)::int lancamentos,SUM(COALESCE(p.valor_total_original,p.valor_total)) materiais_almoxarifado
      FROM ordens_servico os JOIN produtos_os p ON p.ordem_servico_id=os.id
     WHERE os.frota_id IS NOT NULL AND os.natureza_os IN ('INTERNA','MATERIAL') AND os.status='FINALIZADA' AND os.data_fechamento BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR os.frota_id=$3::uuid) AND ($4::text IS NULL OR $4='MATERIAIS_ALMOXARIFADO') AND ($5::text IS NULL OR $5='OS') AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM frotas filtro_frota WHERE filtro_frota.id=os.frota_id AND filtro_frota.codigo=$6))
       AND NOT EXISTS (SELECT 1 FROM ordens_servico_item_reclassificacoes r WHERE r.produto_os_id=p.id)
     GROUP BY os.frota_id
  ), internos AS (
    SELECT os.frota_id,COUNT(*)::int lancamentos,SUM(s.valor) mao_obra_interna
      FROM ordens_servico os JOIN servicos_os s ON s.ordem_servico_id=os.id
     WHERE os.frota_id IS NOT NULL AND os.status='FINALIZADA' AND s.classificacao_servico='INTERNO' AND os.data_fechamento BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR os.frota_id=$3::uuid) AND ($4::text IS NULL OR $4='MAO_DE_OBRA_INTERNA') AND ($5::text IS NULL OR $5='OS') AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM frotas filtro_frota WHERE filtro_frota.id=os.frota_id AND filtro_frota.codigo=$6))
     GROUP BY os.frota_id
  )
  SELECT f.id frota_id,f.codigo prefixo,f.placa,(COALESCE(cont.lancamentos,0)+COALESCE(materiais.lancamentos,0)+COALESCE(internos.lancamentos,0))::int lancamentos,COALESCE(cont.pecas_externas,0)::numeric pecas_externas,
         COALESCE(cont.servicos_terceirizados,0)::numeric servicos_terceirizados,COALESCE(materiais.materiais_almoxarifado,0)::numeric materiais_almoxarifado,
         (COALESCE(cont.pecas_externas,0)+COALESCE(cont.servicos_terceirizados,0)+COALESCE(materiais.materiais_almoxarifado,0))::numeric total_efetivo,
         COALESCE(internos.mao_obra_interna,0)::numeric mao_obra_interna,
         (COALESCE(cont.pecas_externas,0)+COALESCE(cont.servicos_terceirizados,0)+COALESCE(materiais.materiais_almoxarifado,0)+COALESCE(internos.mao_obra_interna,0))::numeric total_gerencial
    FROM frotas f LEFT JOIN cont ON cont.frota_id=f.id LEFT JOIN materiais ON materiais.frota_id=f.id LEFT JOIN internos ON internos.frota_id=f.id
   WHERE (cont.frota_id IS NOT NULL OR materiais.frota_id IS NOT NULL OR internos.frota_id IS NOT NULL)${filters.frota_id ? ' AND f.id=$3' : ''}${filters.frota_codigo ? ' AND f.codigo=$6' : ''}
   UNION ALL
   SELECT NULL::uuid frota_id,'Frotas Diversas'::text prefixo,NULL::text placa,diversas.lancamentos,
          diversas.pecas_externas,diversas.servicos_terceirizados,0::numeric materiais_almoxarifado,
          (diversas.pecas_externas+diversas.servicos_terceirizados)::numeric total_efetivo,0::numeric mao_obra_interna,
          (diversas.pecas_externas+diversas.servicos_terceirizados)::numeric total_gerencial
     FROM diversas WHERE diversas.lancamentos>0
   ORDER BY prefixo`, values).then(result => result.rows.map(row => ({ ...row, pecas_externas: money(row.pecas_externas), servicos_terceirizados: money(row.servicos_terceirizados), materiais_almoxarifado: money(row.materiais_almoxarifado), total_efetivo: money(row.total_efetivo), mao_obra_interna: money(row.mao_obra_interna), total_gerencial: money(row.total_gerencial) })));
  return result;
}

export async function getManutencaoTotais(filters: ManutencaoFilters): Promise<Record<string, string>> {
  validateFilters(filters); const { values } = filterValues(filters);
  const result = await pool.query(`SELECT
    (SELECT COALESCE(SUM(l.valor_total),0)::numeric FROM lancamentos_contabeis l LEFT JOIN frotas f ON f.id=l.frota_id WHERE l.classificacao='PECAS_EXTERNAS' AND ${SQL_NORMAL_ACCOUNTING_ELIGIBILITY} ${SQL_TOLL_EXCLUSION} AND l.data_conta BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR l.frota_id=$3::uuid) AND ($4::text IS NULL OR $4='PECAS_EXTERNAS') AND ($5::text IS NULL OR $5='CONTABILIDADE') AND ($6::text IS NULL OR f.codigo=$6)) +
    (SELECT COALESCE(SUM(l.valor_total),0)::numeric FROM lancamentos_contabeis l WHERE ${SQL_DIVERSE_ACCOUNTING_ELIGIBILITY} AND l.classificacao='PECAS_EXTERNAS' ${SQL_TOLL_EXCLUSION} AND l.data_conta BETWEEN $1::date AND $2::date AND $3::uuid IS NULL AND ($4::text IS NULL OR $4='PECAS_EXTERNAS') AND ($5::text IS NULL OR $5='CONTABILIDADE') AND $6::text IS NULL) pecas_externas,
    (SELECT COALESCE(SUM(l.valor_total),0)::numeric FROM lancamentos_contabeis l LEFT JOIN frotas f ON f.id=l.frota_id WHERE l.classificacao='SERVICOS_TERCEIRIZADOS' AND ${SQL_NORMAL_ACCOUNTING_ELIGIBILITY} ${SQL_TOLL_EXCLUSION} AND l.data_conta BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR l.frota_id=$3::uuid) AND ($4::text IS NULL OR $4='SERVICOS_TERCEIRIZADOS') AND ($5::text IS NULL OR $5='CONTABILIDADE') AND ($6::text IS NULL OR f.codigo=$6)) +
    (SELECT COALESCE(SUM(l.valor_total),0)::numeric FROM lancamentos_contabeis l WHERE ${SQL_DIVERSE_ACCOUNTING_ELIGIBILITY} AND l.classificacao='SERVICOS_TERCEIRIZADOS' ${SQL_TOLL_EXCLUSION} AND l.data_conta BETWEEN $1::date AND $2::date AND $3::uuid IS NULL AND ($4::text IS NULL OR $4='SERVICOS_TERCEIRIZADOS') AND ($5::text IS NULL OR $5='CONTABILIDADE') AND $6::text IS NULL) servicos_terceirizados,
    (SELECT COALESCE(SUM(COALESCE(p.valor_total_original,p.valor_total)),0)::numeric FROM ordens_servico os JOIN produtos_os p ON p.ordem_servico_id=os.id WHERE os.frota_id IS NOT NULL AND os.natureza_os IN ('INTERNA','MATERIAL') AND os.status='FINALIZADA' AND os.data_fechamento BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR os.frota_id=$3::uuid) AND ($4::text IS NULL OR $4='MATERIAIS_ALMOXARIFADO') AND ($5::text IS NULL OR $5='OS') AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM frotas f WHERE f.id=os.frota_id AND f.codigo=$6)) AND NOT EXISTS (SELECT 1 FROM ordens_servico_item_reclassificacoes r WHERE r.produto_os_id=p.id)) materiais_almoxarifado,
    (SELECT COALESCE(SUM(s.valor),0)::numeric FROM ordens_servico os JOIN servicos_os s ON s.ordem_servico_id=os.id WHERE os.frota_id IS NOT NULL AND os.status='FINALIZADA' AND s.classificacao_servico='INTERNO' AND os.data_fechamento BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR os.frota_id=$3::uuid) AND ($4::text IS NULL OR $4='MAO_DE_OBRA_INTERNA') AND ($5::text IS NULL OR $5='OS') AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM frotas f WHERE f.id=os.frota_id AND f.codigo=$6)) AND ($4::text IS NULL OR $4='MAO_DE_OBRA_INTERNA')) mao_obra_interna`, values).then(result => result.rows[0]);
  const row = result ?? {};
  const parts = String(row.pecas_externas ?? '0'); const third = String(row.servicos_terceirizados ?? '0'); const materials = String(row.materiais_almoxarifado ?? '0');
  const internal = String(row.mao_obra_interna ?? '0');
  return { pecas_externas: parts, servicos_terceirizados: third, materiais_almoxarifado: materials, total_efetivo: addMoney(parts, third, materials), mao_obra_interna: internal, total_gerencial: addMoney(parts, third, materials, internal) };
}

export async function getManutencaoDetalhes(filters: ManutencaoFilters): Promise<unknown[]> {
  validateFilters(filters); const values = [filters.data_inicio, filters.data_fim, filters.frota_id ?? null, filters.natureza ?? filters.categoria ?? null, filters.origem ?? null, filters.frota_codigo?.trim() || null]; const fleet = ' AND ($3::uuid IS NULL OR frota_id=$3::uuid) AND ($4::text IS NULL OR categoria=$4) AND ($5::text IS NULL OR origem=$5) AND ($6::text IS NULL OR f.codigo=$6)';
  const result = await pool.query(`SELECT itens.data,itens.referencia,itens.categoria,itens.descricao,itens.quantidade,itens.unidade,itens.valor,itens.origem,itens.prestador,itens.funcionario,itens.frota_id,COALESCE(itens.frota_exibicao,f.codigo) frota,f.placa FROM (
    SELECT to_char(l.data_conta,'YYYY-MM-DD') data,COALESCE(l.nota_original,l.controle_original) referencia,l.classificacao categoria,l.produto_original descricao,l.quantidade,NULL::text unidade,l.valor_total valor,'CONTABILIDADE' origem,NULL prestador,NULL funcionario,l.frota_id,CASE WHEN l.frota_id IS NULL THEN 'Frotas Diversas'::text ELSE NULL::text END frota_exibicao FROM lancamentos_contabeis l WHERE ((l.frota_id IS NOT NULL AND ${SQL_NORMAL_ACCOUNTING_ELIGIBILITY}) OR (${SQL_DIVERSE_ACCOUNTING_ELIGIBILITY})) ${SQL_TOLL_EXCLUSION} AND l.classificacao IN ('PECAS_EXTERNAS','SERVICOS_TERCEIRIZADOS') AND l.data_conta BETWEEN $1::date AND $2::date
    UNION ALL
    SELECT to_char(os.data_fechamento,'YYYY-MM-DD'),os.numero_os::text,'MATERIAIS_ALMOXARIFADO',p.descricao,p.quantidade,p.unidade,COALESCE(p.valor_total_original,p.valor_total),'OS',NULL,NULL,os.frota_id,NULL::text FROM ordens_servico os JOIN produtos_os p ON p.ordem_servico_id=os.id WHERE os.status='FINALIZADA' AND os.natureza_os IN ('INTERNA','MATERIAL') AND os.frota_id IS NOT NULL AND os.data_fechamento BETWEEN $1::date AND $2::date AND NOT EXISTS (SELECT 1 FROM ordens_servico_item_reclassificacoes r WHERE r.produto_os_id=p.id)
    UNION ALL
    SELECT to_char(os.data_fechamento,'YYYY-MM-DD'),os.numero_os::text,'MAO_DE_OBRA_INTERNA',s.descricao,NULL,NULL,s.valor,'OS',NULL,(SELECT string_agg(DISTINCT f.nome, ', ') FROM servicos_os_execucoes e JOIN funcionarios f ON f.id=e.funcionario_id WHERE e.servico_os_id=s.id),os.frota_id,NULL::text FROM ordens_servico os JOIN servicos_os s ON s.ordem_servico_id=os.id WHERE os.status='FINALIZADA' AND os.frota_id IS NOT NULL AND s.classificacao_servico='INTERNO' AND os.data_fechamento BETWEEN $1::date AND $2::date
  ) itens LEFT JOIN frotas f ON f.id=itens.frota_id WHERE 1=1${fleet} ORDER BY COALESCE(f.codigo,'SEM FROTA'),data,referencia`, values);
  return result.rows;
}

export async function getDespesasCompartilhadas(filters: ManutencaoFilters): Promise<unknown> {
  validateFilters(filters);
  const result = await pool.query(`SELECT l.id,l.data_conta,l.nota_original,l.controle_original,l.produto_original,l.valor_total,l.classificacao,l.subcentro_original,l.despesa_compartilhada_status,l.decidido_por,l.decidido_em,l.motivo_decisao,l.frota_id,f.codigo frota,f.placa FROM lancamentos_contabeis l LEFT JOIN frotas f ON f.id=l.frota_id WHERE l.data_conta BETWEEN $1::date AND $2::date AND l.despesa_compartilhada_status IN ('AGUARDANDO_DECISAO','DESCONSIDERADA','APROVADA') AND ($3::text IS NULL OR l.classificacao=$3) AND ($4::uuid IS NULL OR l.frota_id=$4::uuid) AND ($5::text IS NULL OR f.codigo=$5) AND ($6::text IS NULL OR $6='CONTABILIDADE') ORDER BY l.data_conta,l.linha_original`, [filters.data_inicio, filters.data_fim, filters.natureza ?? filters.categoria ?? null, filters.frota_id ?? null, filters.frota_codigo?.trim() || null, filters.origem ?? null]);
  const rows = result.rows.map(row => ({ ...row, fora_custo_manutencao: isMaintenanceTollExpense(row.produto_original) }));
  const approved = rows.filter(row => row.despesa_compartilhada_status === 'APROVADA' && !row.frota_id);
  const approvedMaintenance = approved.filter(row => matchesDiverseMaintenanceFilters(row, filters));
  const approvedMaintenanceValue = sumCurrencyValues(approvedMaintenance.map(row => row.valor_total));
  return { total: rows.length, aguardando_decisao: rows.filter(row => row.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length, aprovadas: approvedMaintenance.length, desconsideradas: rows.filter(row => row.despesa_compartilhada_status === 'DESCONSIDERADA').length, valor_aprovado: approvedMaintenanceValue, itens: rows };
}

export async function getDesempenhoOficina(filters: ManutencaoFilters): Promise<unknown> {
  validateFilters(filters);
  const firstDay = filters.data_inicio.slice(0, 8) + '01';
  const lastDay = new Date(Date.UTC(Number(filters.data_fim.slice(0, 4)), Number(filters.data_fim.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const periodoSalarialCompleto = filters.data_inicio === firstDay && filters.data_fim === lastDay;
  const values = [filters.data_inicio, filters.data_fim, filters.frota_id ?? null, filters.frota_codigo?.trim() || null, periodoSalarialCompleto];
  const fleetPredicate = `AND ($3::uuid IS NULL OR os.frota_id=$3::uuid) AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM frotas filtro_frota WHERE filtro_frota.id=os.frota_id AND filtro_frota.codigo=$4))`;
  const result = await pool.query(`WITH meses AS (SELECT generate_series(date_trunc('month',$1::date),date_trunc('month',$2::date),interval '1 month')::date competencia), salarios AS (SELECT m.competencia,s.valor_consolidado FROM meses m LEFT JOIN salarios_base_oficina s ON s.ano=extract(year FROM m.competencia)::int AND s.mes=extract(month FROM m.competencia)::int), internos AS (SELECT COALESCE(SUM(s.valor),0)::numeric valor_servicos_internos,COUNT(*) FILTER (WHERE os.status='ABERTA')::int linhas_abertas,COUNT(*) FILTER (WHERE os.status='FINALIZADA')::int linhas_finalizadas,COUNT(DISTINCT os.id) FILTER (WHERE os.status='ABERTA')::int os_abertas,COUNT(DISTINCT os.id) FILTER (WHERE os.status='FINALIZADA')::int os_finalizadas FROM ordens_servico os JOIN servicos_os s ON s.ordem_servico_id=os.id WHERE os.status<>'CANCELADA' AND s.classificacao_servico='INTERNO' AND os.data_abertura BETWEEN $1::date AND $2::date ${fleetPredicate}) SELECT internos.*,SUM(salarios.valor_consolidado)::numeric salario_base_informado,COUNT(*)::int meses_no_periodo,COUNT(*) FILTER (WHERE salarios.valor_consolidado IS NOT NULL)::int meses_com_salario,COUNT(*) FILTER (WHERE salarios.valor_consolidado IS NULL)::int meses_sem_salario,ARRAY_AGG(to_char(salarios.competencia,'YYYY-MM')) FILTER (WHERE salarios.valor_consolidado IS NULL) competencias_sem_salario,CASE WHEN COUNT(*) FILTER (WHERE salarios.valor_consolidado IS NULL)>0 OR $5::boolean=false THEN NULL ELSE internos.valor_servicos_internos-COALESCE(SUM(salarios.valor_consolidado),0) END::numeric diferenca_gerencial_estimada FROM internos,salarios GROUP BY internos.valor_servicos_internos,internos.linhas_abertas,internos.linhas_finalizadas,internos.os_abertas,internos.os_finalizadas`, values).then(value => value.rows[0]);
  const detalhes = await pool.query<DesempenhoOficinaDetalhe>(`SELECT os.id ordem_servico_id,os.numero_os,os.status,to_char(os.data_abertura,'YYYY-MM-DD') data_abertura,COALESCE(f.codigo,'SEM FROTA') frota,s.descricao,s.valor::text valor FROM ordens_servico os JOIN servicos_os s ON s.ordem_servico_id=os.id LEFT JOIN frotas f ON f.id=os.frota_id WHERE os.status<>'CANCELADA' AND s.classificacao_servico='INTERNO' AND os.data_abertura BETWEEN $1::date AND $2::date ${fleetPredicate} ORDER BY os.data_abertura,os.numero_os,s.id`, values.slice(0, 4));
  const normalized = normalizeDesempenhoOficina({ ...result, periodo_salarial_completo: periodoSalarialCompleto });
  return { ...normalized, valor_mao_obra_interna_registrada: normalized.valor_servicos_internos, linhas_abertas: Number(result?.linhas_abertas ?? 0), linhas_finalizadas: Number(result?.linhas_finalizadas ?? 0), os_abertas: Number(result?.os_abertas ?? 0), os_finalizadas: Number(result?.os_finalizadas ?? 0), detalhes: detalhes.rows };
}

export async function listSalariosBase(): Promise<unknown[]> { return (await pool.query('SELECT id,ano,mes,valor_consolidado,observacoes,atualizado_por,atualizado_em FROM salarios_base_oficina ORDER BY ano DESC,mes DESC')).rows; }
export async function saveSalarioBase(fields: SalarioBaseFields, actor: AuthenticatedRequestUser, id?: string): Promise<unknown> {
  if (actor.role !== 'ADMIN') throw new ManutencaoFinanceiraError(403, 'Somente administradores podem alterar o salário-base.');
  if (!Number.isInteger(fields.ano) || fields.ano < 1900 || fields.ano > 9999 || !Number.isInteger(fields.mes) || fields.mes < 1 || fields.mes > 12) throw new ManutencaoFinanceiraError(400, 'Ano ou mês inválido.');
  const value = String(fields.valor_consolidado).replace(',', '.'); if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new ManutencaoFinanceiraError(400, 'Valor consolidado inválido.');
  const result = id ? await pool.query('UPDATE salarios_base_oficina SET ano=$1,mes=$2,valor_consolidado=$3,observacoes=$4,atualizado_por=$5,atualizado_em=now() WHERE id=$6 RETURNING *', [fields.ano, fields.mes, value, fields.observacoes ?? null, actor.id, id]) : await pool.query('INSERT INTO salarios_base_oficina(ano,mes,valor_consolidado,observacoes,atualizado_por) VALUES($1,$2,$3,$4,$5) ON CONFLICT(ano,mes) DO UPDATE SET valor_consolidado=EXCLUDED.valor_consolidado,observacoes=EXCLUDED.observacoes,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=now() RETURNING *', [fields.ano, fields.mes, value, fields.observacoes ?? null, actor.id]);
  if (!result.rows[0]) throw new ManutencaoFinanceiraError(404, 'Salário-base não encontrado.'); return result.rows[0];
}
