import { pool } from '../config/database.js';
import { normalizeSearchText } from '../utils/text.js';
import type { ParsedExecucao, ParsedItem, ParsedOs } from '../imports/poli-os.js';

export type SyncPreviewState = 'NOVA' | 'ATUALIZACAO_DISPONIVEL' | 'SEM_ALTERACOES' | 'REQUER_REVISAO';

export class SynchronizationConflictError extends Error {
  constructor(public readonly reason: 'PREVIEW_DESATUALIZADO' | 'DIFF_INSEGURO' | 'JA_ATUALIZADA', message: string) {
    super(message);
    this.name = 'SynchronizationConflictError';
  }
}

export interface ExistingOsSnapshot {
  id: string;
  numeroOs: number;
  obraId: string;
  obra: string | null;
  frotaId: string | null;
  frota: string | null;
  natureza: string;
  categoria: string | null;
  status: string;
  problema: string | null;
  dataFechamento: string | null;
  servicos: Array<{ id: string; descricao: string; valor: number }>;
  produtos: Array<{ id: string; descricao: string; quantidade: number; unidade: string; valorUnitario: number }>;
  execucoes: Array<{ id: string; funcionarioId: string; inicio: string; fim: string; servicoOsId: string | null }>;
}

export interface SyncDiffItem<T> { atual: T; novo: T; }
export interface OsUpdateDiff {
  numeroOs: number;
  estado: SyncPreviewState;
  status?: SyncDiffItem<string>;
  categoria?: SyncDiffItem<string | null>;
  natureza?: SyncDiffItem<string>;
  problema?: SyncDiffItem<string | null>;
  novosServicos: ParsedItem[];
  servicosAlterados: Array<{ atual: ExistingOsSnapshot['servicos'][number]; novo: ParsedItem }>;
  novosProdutos: ParsedItem[];
  produtosAlterados: Array<{ atual: ExistingOsSnapshot['produtos'][number]; novo: ParsedItem }>;
  novasExecucoes: ParsedExecucao[];
  divergencias: string[];
  avisos: string[];
  podeAtualizarAutomaticamente: boolean;
}

export const orderUpdateSql = `UPDATE ordens_servico SET status=$1::varchar(30),categoria_servico=$2::varchar(50),observacoes=$3::text,
         data_fechamento=CASE WHEN $1::varchar(30)='FINALIZADA' AND status IS DISTINCT FROM $1::varchar(30) AND data_fechamento IS NULL THEN CURRENT_DATE ELSE data_fechamento END
       WHERE id=$4::uuid`;

const text = (value: string | null | undefined): string => normalizeSearchText(value ?? '');
const money = (value: number): string => value.toFixed(2);
const serviceKey = (value: { descricao: string; valor: number }): string => `${text(value.descricao)}|${money(value.valor)}`;
const productKey = (value: { descricao: string; quantidade: number; unidade: string; valorUnitario: number }): string =>
  `${text(value.descricao)}|${text(value.unidade)}|${value.quantidade.toFixed(3)}|${money(value.valorUnitario)}`;
const executionKey = (value: { funcionarioId: string; inicio: string; fim: string }): string =>
  `${value.funcionarioId}|${value.inicio.slice(0, 16)}|${value.fim.slice(0, 16)}`;
const specificCategory = (value: string | null | undefined): boolean => Boolean(value && value !== 'OUTROS');
const serviceGroup = (value: string): string | undefined => {
  const normalized = text(value);
  if (/^(?:MAO DE OBRA )?LUBRIFIC(?:ADOR|AR|ACAO)\b/.test(normalized) || normalized === 'LUBRIFICACAO') return 'LUBRIFICACAO';
  if (/^(?:MAO DE OBRA MECANICO|MECANICA)\b/.test(normalized)) return 'MECANICA';
  if (/^(?:SERVICO )?BORRACHARIA\b/.test(normalized)) return 'BORRACHARIA';
  if (/^(?:MAO DE OBRA SOLDADOR|SOLDAGEM)\b/.test(normalized)) return 'SOLDAGEM';
  if (/^(?:MAO DE OBRA FUNILEIRO|FUNILARIA)\b/.test(normalized)) return 'FUNILARIA';
  if (/^(?:MAO DE OBRA LAVADOR|LAVAGEM)\b/.test(normalized)) return 'LAVAGEM';
  return undefined;
};
const equivalentService = (current: { descricao: string; valor: number }, incoming: ParsedItem): boolean =>
  current.valor.toFixed(2) === incoming.total.toFixed(2) && Boolean(serviceGroup(current.descricao) && serviceGroup(current.descricao) === serviceGroup(incoming.descricao));
const equivalentProduct = (current: { descricao: string; quantidade: number; unidade: string; valorUnitario: number }, incoming: ParsedItem): boolean =>
  text(current.descricao) === text(incoming.descricao) && current.quantidade.toFixed(3) === incoming.quantidade.toFixed(3)
  && current.valorUnitario.toFixed(2) === incoming.valorUnitario.toFixed(2)
  && text(current.unidade) !== text(incoming.unidade)
  && ['UN', 'L'].includes(text(current.unidade)) && ['UN', 'L'].includes(text(incoming.unidade));

function consume<T>(values: T[], key: (value: T) => string, candidate: T): T | undefined {
  const index = values.findIndex(value => key(value) === key(candidate));
  return index < 0 ? undefined : values.splice(index, 1)[0];
}

const statusRank: Record<string, number> = { ABERTA: 1, EM_ANDAMENTO: 2, FINALIZADA: 3, CANCELADA: 3 };
function statusSafety(current: string, incoming: string): 'safe' | 'review' | 'none' {
  if (current === incoming) return 'none';
  if (current === 'ABERTA' && ['EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA'].includes(incoming)) return 'safe';
  if (current === 'EM_ANDAMENTO' && ['FINALIZADA', 'CANCELADA'].includes(incoming)) return 'safe';
  if ((current === 'FINALIZADA' || current === 'CANCELADA') && (statusRank[incoming] ?? 0) <= (statusRank[current] ?? 0)) return 'review';
  return 'review';
}

const validProblem = (value: string | null | undefined): boolean => {
  const normalized = text(value);
  return Boolean(normalized) && !/^\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})+$/.test(normalized);
};

export function buildOsUpdateDiff(parsed: ParsedOs, current: ExistingOsSnapshot): OsUpdateDiff {
  const divergencias: string[] = [];
  const avisos: string[] = [];
  const status = parsed.status && parsed.status !== current.status ? { atual: current.status, novo: parsed.status } : undefined;
  if (status && statusSafety(status.atual, status.novo) === 'review') divergencias.push('STATUS_REGRESSIVO_OU_CONFLITANTE');

  const incomingCategory = parsed.categoriaServico ?? null;
  const categoryIsEmptyEquivalent = current.categoria === null && incomingCategory === 'OUTROS';
  const categoria = !categoryIsEmptyEquivalent && incomingCategory !== current.categoria ? { atual: current.categoria, novo: incomingCategory } : undefined;
  if (categoria && specificCategory(current.categoria) && !specificCategory(incomingCategory)) divergencias.push('CATEGORIA_NAO_REGRESSIVA');
  if (categoria && specificCategory(current.categoria) && specificCategory(incomingCategory)) divergencias.push('CATEGORIA_CONFLITANTE');

  const natureza = parsed.natureza && parsed.natureza !== current.natureza ? { atual: current.natureza, novo: parsed.natureza } : undefined;
  if (natureza) {
    const thirdPartyEvidence = parsed.itens.some(item => item.tipo === 'SERVICO' && text(item.tecnicoOriginal) === 'IZAAC EDUARDO');
    const materialEvidence = parsed.status === 'FINALIZADA' && parsed.itens.some(item => item.tipo === 'PRODUTO')
      && !parsed.itens.some(item => item.tipo === 'SERVICO') && parsed.execucoes.length === 0;
    if (!((natureza.novo === 'TERCEIRO' && thirdPartyEvidence) || (natureza.novo === 'MATERIAL' && materialEvidence))) {
      divergencias.push('NATUREZA_SEM_EVIDENCIA_FORTE');
    }
  }

  const incomingProblem = validProblem(parsed.problema) ? parsed.problema!.trim() : null;
  const problema = text(incomingProblem) !== text(current.problema) && incomingProblem ? { atual: current.problema, novo: incomingProblem } : undefined;
  if (problema && current.problema) divergencias.push('PROBLEMA_DIVERGENTE');

  if (parsed.obraId && parsed.obraId !== current.obraId) avisos.push('OBRA_DIVERGENTE_NAO_SUBSTITUIR');
  if (parsed.frotaId && parsed.frotaId !== current.frotaId) avisos.push('FROTA_DIVERGENTE_NAO_SUBSTITUIR');

  const servicePool = [...current.servicos];
  const novosServicos: ParsedItem[] = [];
  const servicosAlterados: OsUpdateDiff['servicosAlterados'] = [];
  const incomingServices = parsed.itens.filter(value => value.tipo === 'SERVICO');
  const equivalentServices = new Set<ParsedItem>();
  for (const existing of servicePool) {
    const group = serviceGroup(existing.descricao) ?? (specificCategory(current.categoria) ? current.categoria! : undefined);
    const candidates = group ? incomingServices.filter(item => serviceGroup(item.descricao) === group) : [];
    if (candidates.length > 1 && candidates.reduce((sum, item) => sum + item.total, 0).toFixed(2) === existing.valor.toFixed(2)) {
      for (const candidate of candidates) equivalentServices.add(candidate);
      servicePool.splice(servicePool.indexOf(existing), 1);
      avisos.push('SERVICO_EQUIVALENTE_CONSOLIDADO');
    }
  }
  for (const item of incomingServices) {
    if (equivalentServices.has(item)) continue;
    if (consume(servicePool, serviceKey, { descricao: item.descricao, valor: item.total })) continue;
    const equivalent = servicePool.find(value => equivalentService(value, item));
    if (equivalent) { avisos.push('SERVICO_EQUIVALENTE_CONSOLIDADO'); servicePool.splice(servicePool.indexOf(equivalent), 1); continue; }
    const sameGroup = servicePool.find(value => serviceGroup(value.descricao) && serviceGroup(value.descricao) === serviceGroup(item.descricao));
    const sameDescription = servicePool.find(value => text(value.descricao) === text(item.descricao));
    if (sameGroup || sameDescription) { const currentService = sameGroup ?? sameDescription!; servicosAlterados.push({ atual: currentService, novo: item }); servicePool.splice(servicePool.indexOf(currentService), 1); }
    else novosServicos.push(item);
  }

  const productPool = [...current.produtos];
  const novosProdutos: ParsedItem[] = [];
  const produtosAlterados: OsUpdateDiff['produtosAlterados'] = [];
  for (const item of parsed.itens.filter(value => value.tipo === 'PRODUTO')) {
    const candidate = { descricao: item.descricao, quantidade: item.quantidade, unidade: item.unidade, valorUnitario: item.valorUnitario };
    if (consume(productPool, productKey, candidate)) continue;
    const equivalent = productPool.find(value => equivalentProduct(value, item));
    if (equivalent) { avisos.push('PRODUTO_EQUIVALENTE_UN_L'); productPool.splice(productPool.indexOf(equivalent), 1); continue; }
    const sameDescription = productPool.find(value => text(value.descricao) === text(item.descricao));
    if (sameDescription) { produtosAlterados.push({ atual: sameDescription, novo: item }); productPool.splice(productPool.indexOf(sameDescription), 1); }
    else novosProdutos.push(item);
  }

  const executionPool = [...current.execucoes];
  const novasExecucoes: ParsedExecucao[] = [];
  for (const execution of parsed.execucoes) {
    if (execution.funcionarioId && consume(executionPool, executionKey, { funcionarioId: execution.funcionarioId, inicio: execution.inicio, fim: execution.fim })) continue;
    if (execution.funcionarioId) novasExecucoes.push(execution); else divergencias.push('EXECUCAO_COM_FUNCIONARIO_NAO_RESOLVIDO');
  }
  if (servicosAlterados.length) divergencias.push('SERVICO_ALTERADO');
  if (novosServicos.length && current.servicos.length) divergencias.push('SERVICO_NAO_EQUIVALENTE');
  if (produtosAlterados.length) divergencias.push('PRODUTO_ALTERADO');

  const safeStatus = !status || statusSafety(status.atual, status.novo) === 'safe';
  const safeCategory = !categoria || (current.categoria === 'OUTROS' && specificCategory(incomingCategory));
  const safeNature = !natureza || divergencias.every(value => value !== 'NATUREZA_SEM_EVIDENCIA_FORTE');
  const safeProblem = !problema || !current.problema;
  const canUpdate = !divergencias.length && safeStatus && safeCategory && safeNature && safeProblem;
  const hasChanges = Boolean(status || categoria || natureza || problema || novosServicos.length || servicosAlterados.length || novosProdutos.length || produtosAlterados.length || novasExecucoes.length || divergencias.length);
  return { numeroOs: parsed.numeroOs, estado: !hasChanges ? 'SEM_ALTERACOES' : canUpdate ? 'ATUALIZACAO_DISPONIVEL' : 'REQUER_REVISAO', status, categoria, natureza, problema, novosServicos, servicosAlterados, novosProdutos, produtosAlterados, novasExecucoes, divergencias, avisos, podeAtualizarAutomaticamente: canUpdate };
}

export async function loadExistingOs(numeroOs: number): Promise<ExistingOsSnapshot | undefined> {
  return loadExistingOsUsing(pool, numeroOs);
}

async function loadExistingOsUsing(db: { query: typeof pool.query }, numeroOs: number): Promise<ExistingOsSnapshot | undefined> {
  const order = await db.query<{ id: string; numero_os: string; obra_id: string; obra: string; frota_id: string | null; frota: string | null; natureza_os: string; categoria_servico: string | null; status: string; observacoes: string | null; data_fechamento: string | null }>(
    `SELECT os.id, os.numero_os, os.obra_id, o.nome obra, os.frota_id,
            COALESCE(f.codigo, pf.codigo || os.frota_numero::text) frota,
            os.natureza_os, os.categoria_servico, os.status, os.observacoes, os.data_fechamento
       FROM ordens_servico os JOIN obras o ON o.id=os.obra_id
       LEFT JOIN frotas f ON f.id=os.frota_id LEFT JOIN prefixos_frota pf ON pf.id=os.prefixo_frota_id
      WHERE os.numero_os=$1 FOR UPDATE OF os`, [numeroOs]);
  if (!order.rows[0]) return undefined;
  const row = order.rows[0];
  const [services, products, executions] = await Promise.all([
    db.query<{ id: string; descricao: string; valor: string }>('SELECT id,descricao,valor FROM servicos_os WHERE ordem_servico_id=$1 ORDER BY created_at,id', [row.id]),
    db.query<{ id: string; descricao: string; quantidade: string; unidade: string; valor_unitario: string }>('SELECT id,descricao,quantidade,unidade,valor_unitario FROM produtos_os WHERE ordem_servico_id=$1 ORDER BY created_at,id', [row.id]),
    db.query<{ id: string; funcionario_id: string; inicio: string; fim: string; servico_os_id: string | null }>('SELECT id,funcionario_id,to_char(inicio,\'YYYY-MM-DD"T"HH24:MI\') inicio,to_char(fim,\'YYYY-MM-DD"T"HH24:MI\') fim,servico_os_id FROM servicos_os_execucoes WHERE ordem_servico_id=$1', [row.id]),
  ]);
  return { id: row.id, numeroOs: Number(row.numero_os), obraId: row.obra_id, obra: row.obra, frotaId: row.frota_id, frota: row.frota, natureza: row.natureza_os, categoria: row.categoria_servico, status: row.status, problema: row.observacoes, dataFechamento: row.data_fechamento, servicos: services.rows.map(value => ({ ...value, valor: Number(value.valor) })), produtos: products.rows.map(value => ({ id: value.id, descricao: value.descricao, quantidade: Number(value.quantidade), unidade: value.unidade, valorUnitario: Number(value.valor_unitario) })), execucoes: executions.rows.map(value => ({ id: value.id, funcionarioId: value.funcionario_id, inicio: value.inicio, fim: value.fim, servicoOsId: value.servico_os_id })) };
}

export async function synchronizeOrder(parsed: ParsedOs): Promise<OsUpdateDiff> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await loadExistingOsUsing(client, parsed.numeroOs);
    if (!current) throw new SynchronizationConflictError('PREVIEW_DESATUALIZADO', 'A O.S. foi alterada desde a análise. Reanalise o arquivo antes de atualizar.');
    const diff = buildOsUpdateDiff(parsed, current);
    if (diff.estado === 'SEM_ALTERACOES') throw new SynchronizationConflictError('JA_ATUALIZADA', 'Os dados desta O.S. já foram atualizados. Reanalise o arquivo.');
    if (diff.estado !== 'ATUALIZACAO_DISPONIVEL' || !diff.podeAtualizarAutomaticamente) {
      throw new SynchronizationConflictError('DIFF_INSEGURO', 'A atualização desta O.S. precisa de revisão antes de ser aplicada.');
    }
    const nextStatus = diff.status?.novo ?? current.status;
    const nextCategory = diff.categoria?.novo ?? current.categoria;
    const nextProblem = diff.problema?.novo ?? current.problema;
    await client.query(orderUpdateSql, [nextStatus, nextCategory, nextProblem, current.id]);
    for (const service of diff.novosServicos) await client.query(
      'INSERT INTO servicos_os(ordem_servico_id,descricao,valor) VALUES($1,$2,$3)', [current.id, service.descricao, service.total],
    );
    for (const product of diff.novosProdutos) await client.query(
      'INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario) VALUES($1,$2,$3,$4,$5)',
      [current.id, product.descricao, product.quantidade, product.unidade, product.valorUnitario],
    );
    for (const execution of diff.novasExecucoes) {
      await client.query('INSERT INTO ordens_servico_funcionarios(ordem_servico_id,funcionario_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [current.id, execution.funcionarioId]);
      await client.query('INSERT INTO servicos_os_execucoes(ordem_servico_id,servico_os_id,funcionario_id,inicio,fim) VALUES($1,NULL,$2,$3,$4)', [current.id, execution.funcionarioId, execution.inicio, execution.fim]);
    }
    const persisted = await loadExistingOsUsing(client, parsed.numeroOs);
    if (!persisted || buildOsUpdateDiff(parsed, persisted).estado !== 'SEM_ALTERACOES') {
      throw new Error('A validação pós-persistência não corresponde ao diff esperado; a O.S. não será confirmada.');
    }
    await client.query('COMMIT');
    return diff;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
