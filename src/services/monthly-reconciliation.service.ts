import { pool } from '../config/database.js';
import { matchPreview, parsePoliOs, type ParsedItem, type ParsedOs } from '../imports/poli-os.js';
import { buildPoliImport, type PoliImport } from '../imports/poli-canonical.js';
import { normalizeSearchText } from '../utils/text.js';

export const reconciliationClassifications = ['NEW', 'NO_CHANGE', 'SAFE_UPDATE', 'PROTECTED_OVERRIDE', 'REVIEW', 'BLOCKED'] as const;
export type ReconciliationClassification = typeof reconciliationClassifications[number];

export type ReconciliationReasonCode =
  | 'UNRESOLVED_WORK' | 'UNRESOLVED_FLEET' | 'NATURE_CONFLICT' | 'PROTECTED_OVERRIDE'
  | 'SOURCE_CHANGED_AFTER_OVERRIDE' | 'AMBIGUOUS_ITEM_IDENTITY' | 'POSSIBLE_ITEM_REMOVAL'
  | 'POSSIBLE_NEW_ITEM' | 'ITEM_MATCH_UNCERTAIN' | 'AMBIGUOUS_FLEET_MODEL' | 'UNLINKED_EXECUTION'
  | 'STATUS_CONFLICT' | 'OBRA_CONFLICT' | 'FLEET_CONFLICT' | 'LEGACY_CLASSIFICATION';

export interface ReconciliationDifference {
  domain: 'os' | 'item' | 'execution' | 'reference';
  field: string;
  currentValue: unknown;
  sourceValue: unknown;
  action: 'NONE' | 'PROPOSE_UPDATE' | 'PRESERVE' | 'REVIEW' | 'BLOCK';
  reasonCode?: ReconciliationReasonCode;
  protected: boolean;
  matchContext?: { sourceItems: unknown[]; currentItems: unknown[]; candidateContext: string; reason: string };
}

export interface ReconciliationResult {
  numeroOs: number;
  classification: ReconciliationClassification;
  differences: ReconciliationDifference[];
  blockers: Array<{ reasonCode: ReconciliationReasonCode; description: string }>;
  reviews: Array<{ reasonCode: ReconciliationReasonCode; description: string }>;
  safeUpdates: Array<{ field: string; currentValue: unknown; sourceValue: unknown; reason: string }>;
  protectedOverrides: Array<{ field: string; sourceValue: unknown; currentValue: unknown; valorOrigem: unknown; valorOverride: unknown }>;
  audit?: { sourceItemCounts: { products: number; services: number }; currentItemCounts: { products: number; services: number }; currentNatureza: string | null; sourceNatureza: string | null; currentStatus: string | null; sourceStatus: string | null };
}

export interface MonthlyReconciliationReport {
  metadata: { arquivo: string; importacao: PoliImport; parser: string; readOnly: true; queryStrategy: string };
  summary: { totalOs: number; classifications: Record<ReconciliationClassification, number>; totalDifferences: number };
  reasonCounts: Record<string, number>;
  fieldCounts: Record<string, number>;
  results: ReconciliationResult[];
}

interface DbOrder { id: string; numero_os: string; obra_id: string; frota_id: string | null; natureza_os: string; categoria_servico: string | null; status: string; status_original: string | null; status_origem: string | null; observacoes: string | null; }
interface DbItem { id: string; ordem_servico_id: string; descricao: string; quantidade?: string; unidade?: string; valor_unitario?: string; valor?: string; classificacao_servico?: string; classificacao_origem?: string; codigo_poli: string | null; fingerprint_contexto: string | null; hash_conteudo: string | null; }
interface DbExecution { id: string; ordem_servico_id: string; servico_os_id: string | null; funcionario_id: string; inicio: string; fim: string; fingerprint_contexto: string | null; hash_conteudo: string | null; }
interface DbOverride { ordem_servico_id: string; campo: 'natureza_os' | 'obra_id' | 'status'; valor_origem: unknown; valor_override: unknown; }
interface Snapshot { order: DbOrder; services: DbItem[]; products: DbItem[]; executions: DbExecution[]; overrides: DbOverride[]; }

const text = (value: unknown): string => normalizeSearchText(String(value ?? ''));
const money = (value: unknown): string => Number(value ?? 0).toFixed(2);
const decodeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};
const addCount = (map: Record<string, number>, key: string, increment = 1): void => { map[key] = (map[key] ?? 0) + increment; };

function statusSafe(current: string, source: string): boolean {
  if (current === source) return false;
  if (current === 'ABERTA' && ['EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA'].includes(source)) return true;
  if (current === 'EM_ANDAMENTO' && ['FINALIZADA', 'CANCELADA'].includes(source)) return true;
  return false;
}

function overrideFor(snapshot: Snapshot, field: DbOverride['campo']): DbOverride | undefined {
  return snapshot.overrides.find(value => value.campo === field);
}

function compareField(result: ReconciliationResult, snapshot: Snapshot, field: 'natureza_os' | 'obra_id' | 'status', currentValue: unknown, sourceValue: unknown, safe: boolean, reasonCode: ReconciliationReasonCode, safeReason: string): void {
  if (sourceValue === undefined || sourceValue === null || currentValue === sourceValue) return;
  const override = overrideFor(snapshot, field);
  if (override && override.valor_origem !== sourceValue) {
    result.reviews.push({ reasonCode: 'SOURCE_CHANGED_AFTER_OVERRIDE', description: `${field}: a fonte mudou após o override.` });
    result.differences.push({ domain: 'os', field, currentValue, sourceValue, action: 'REVIEW', reasonCode: 'SOURCE_CHANGED_AFTER_OVERRIDE', protected: true });
    return;
  }
  if (override && currentValue === override.valor_override && sourceValue === override.valor_origem) {
    result.protectedOverrides.push({ field, sourceValue, currentValue, valorOrigem: override.valor_origem, valorOverride: override.valor_override });
    result.differences.push({ domain: 'os', field, currentValue, sourceValue, action: 'PRESERVE', reasonCode: 'PROTECTED_OVERRIDE', protected: true });
    return;
  }
  if (safe) {
    result.safeUpdates.push({ field, currentValue, sourceValue, reason: safeReason });
    result.differences.push({ domain: 'os', field, currentValue, sourceValue, action: 'PROPOSE_UPDATE', protected: false });
  } else {
    result.reviews.push({ reasonCode, description: `${field}: divergência sem política segura.` });
    result.differences.push({ domain: 'os', field, currentValue, sourceValue, action: 'REVIEW', reasonCode, protected: false });
  }
}

type ItemIdentityLevel = 'DETERMINISTIC' | 'AMBIGUOUS' | 'NONE';
interface ItemIdentityDecision { level: ItemIdentityLevel; row?: DbItem; candidateContext: string; }

function itemLabel(item: ParsedItem | DbItem): Record<string, unknown> {
  return 'tipo' in item
    ? { tipo: item.tipo, descricao: item.descricao, codigoPoli: item.codigo_poli ?? null, fingerprint: item.fingerprintContexto ?? null }
    : { descricao: item.descricao, codigoPoli: item.codigo_poli ?? null, fingerprint: item.fingerprint_contexto ?? null };
}

function matchItemIdentity(incoming: ParsedItem, existing: DbItem[], consumed: Set<string>): ItemIdentityDecision {
  const available = existing.filter(item => !consumed.has(item.id));
  const fingerprintCandidates = incoming.fingerprintContexto
    ? available.filter(item => item.fingerprint_contexto === incoming.fingerprintContexto)
    : [];
  if (fingerprintCandidates.length === 1) return { level: 'DETERMINISTIC', row: fingerprintCandidates[0], candidateContext: 'exact contextual fingerprint' };
  if (fingerprintCandidates.length > 1) return { level: 'AMBIGUOUS', candidateContext: 'non-unique contextual fingerprint' };
  const hashCandidates = incoming.hashConteudo ? available.filter(item => item.hash_conteudo === incoming.hashConteudo) : [];
  const codeCandidates = incoming.codigo_poli ? available.filter(item => item.codigo_poli === incoming.codigo_poli) : [];
  if (hashCandidates.length || codeCandidates.length) return { level: 'AMBIGUOUS', candidateContext: `auxiliary candidates without identity: hash=${hashCandidates.length}, codigo_poli=${codeCandidates.length}` };
  return { level: 'NONE', candidateContext: 'no identifiable candidate' };
}

function compareItemType(result: ReconciliationResult, incoming: ParsedItem[], existing: DbItem[], field: 'servicos' | 'produtos'): void {
  const consumed = new Set<string>();
  const unmatchedIncoming: Array<{ item: ParsedItem; decision: ItemIdentityDecision }> = [];
  for (const item of incoming) {
    const decision = matchItemIdentity(item, existing, consumed);
    if (decision.level === 'DETERMINISTIC' && decision.row) consumed.add(decision.row.id);
    else unmatchedIncoming.push({ item, decision });
  }
  const unmatchedCurrent = existing.filter(item => !consumed.has(item.id));
  if (unmatchedIncoming.length && unmatchedCurrent.length) {
    const reasonCode = 'ITEM_MATCH_UNCERTAIN';
    const sourceItems = unmatchedIncoming.map(item => itemLabel(item.item));
    const currentItems = unmatchedCurrent.map(item => itemLabel(item));
    result.reviews.push({ reasonCode, description: `${field}: unmatched items on both sides; inclusion or removal cannot be proven.` });
    result.differences.push({ domain: 'item', field, currentValue: currentItems, sourceValue: sourceItems, action: 'REVIEW', reasonCode, protected: false, matchContext: { sourceItems, currentItems, candidateContext: unmatchedIncoming.map(item => item.decision.candidateContext).join('; '), reason: 'ITEM_MATCH_UNCERTAIN' } });
    return;
  }
  if (unmatchedIncoming.length) for (const item of unmatchedIncoming) {
    const reasonCode = 'POSSIBLE_NEW_ITEM';
    result.reviews.push({ reasonCode, description: `${field}: no current item of this type; candidate new item.` });
    result.differences.push({ domain: 'item', field, currentValue: null, sourceValue: itemLabel(item.item), action: 'REVIEW', reasonCode, protected: false });
  }
  if (unmatchedCurrent.length) for (const item of unmatchedCurrent) {
    const reasonCode = 'POSSIBLE_ITEM_REMOVAL';
    result.reviews.push({ reasonCode, description: `${field}: current item has no source counterpart and no unmatched source item exists.` });
    result.differences.push({ domain: 'item', field, currentValue: itemLabel(item), sourceValue: null, action: 'REVIEW', reasonCode, protected: false });
  }
}

function compareItems(result: ReconciliationResult, parsed: ParsedOs, snapshot: Snapshot): void {
  compareItemType(result, parsed.itens.filter(item => item.tipo === 'SERVICO'), snapshot.services, 'servicos');
  compareItemType(result, parsed.itens.filter(item => item.tipo === 'PRODUTO'), snapshot.products, 'produtos');
  for (const execution of parsed.execucoes) if (!execution.funcionarioId || !execution.hashConteudo) {
    result.reviews.push({ reasonCode: 'UNLINKED_EXECUTION', description: 'Source execution lacks sufficient identity/provenance.' });
    result.differences.push({ domain: 'execution', field: 'execucoes', currentValue: null, sourceValue: execution, action: 'REVIEW', reasonCode: 'UNLINKED_EXECUTION', protected: false });
  }
  for (const execution of snapshot.executions) if (execution.servico_os_id === null) {
    result.reviews.push({ reasonCode: 'UNLINKED_EXECUTION', description: 'Historical execution has no deterministic service link.' });
    result.differences.push({ domain: 'execution', field: 'servico_os_id', currentValue: null, sourceValue: null, action: 'REVIEW', reasonCode: 'UNLINKED_EXECUTION', protected: false });
  }
}

function classify(result: ReconciliationResult, isNew: boolean): ReconciliationClassification {
  if (isNew) return result.blockers.length ? 'BLOCKED' : 'NEW';
  if (result.blockers.length) return 'BLOCKED';
  if (result.reviews.length) return 'REVIEW';
  if (result.protectedOverrides.length) return 'PROTECTED_OVERRIDE';
  if (result.safeUpdates.length) return 'SAFE_UPDATE';
  return 'NO_CHANGE';
}

export function classifyReconciliation(parsed: ParsedOs, snapshot: Snapshot | undefined): ReconciliationResult {
  const result: ReconciliationResult = { numeroOs: parsed.numeroOs, classification: 'NO_CHANGE', differences: [], blockers: [], reviews: [], safeUpdates: [], protectedOverrides: [] };
  if (!snapshot) {
    if (parsed.pendencias.some(value => value.startsWith('OBRA_PENDENTE') || value.startsWith('OBRA_AMBIGUA'))) result.blockers.push({ reasonCode: 'UNRESOLVED_WORK', description: 'Obra obrigatória não resolvida.' });
    if (parsed.pendencias.some(value => value.startsWith('FROTA_PENDENTE'))) result.blockers.push({ reasonCode: 'UNRESOLVED_FLEET', description: 'Frota obrigatória não resolvida.' });
    result.classification = classify(result, true);
    return result;
  }
  const order = snapshot.order;
  result.audit = { sourceItemCounts: { products: parsed.itens.filter(item => item.tipo === 'PRODUTO').length, services: parsed.itens.filter(item => item.tipo === 'SERVICO').length }, currentItemCounts: { products: snapshot.products.length, services: snapshot.services.length }, currentNatureza: order.natureza_os, sourceNatureza: parsed.natureza ?? null, currentStatus: order.status, sourceStatus: parsed.status ?? null };
  if (parsed.pendencias.some(value => value.startsWith('OBRA_PENDENTE') || value.startsWith('OBRA_AMBIGUA'))) result.blockers.push({ reasonCode: 'UNRESOLVED_WORK', description: 'Obra externa não resolvida com segurança.' });
  if (parsed.pendencias.some(value => value.startsWith('FROTA_PENDENTE'))) result.blockers.push({ reasonCode: 'UNRESOLVED_FLEET', description: 'Frota externa não resolvida com segurança.' });
  compareField(result, snapshot, 'status', order.status, parsed.status, Boolean(parsed.status && statusSafe(order.status, parsed.status)), 'STATUS_CONFLICT', 'Transição de status homologada e progressiva.');
  compareField(result, snapshot, 'natureza_os', order.natureza_os, parsed.natureza, false, 'NATURE_CONFLICT', 'Divergência histórica de natureza exige revisão.');
  compareField(result, snapshot, 'obra_id', order.obra_id, parsed.obraId, Boolean(parsed.obraId), 'OBRA_CONFLICT', 'Referência de obra resolvida diretamente ou por alias persistente.');
  if (parsed.frotaId && parsed.frotaId !== order.frota_id) {
    result.reviews.push({ reasonCode: 'AMBIGUOUS_FLEET_MODEL', description: 'Representação dual da frota não permite decisão inequívoca.' });
    result.differences.push({ domain: 'reference', field: 'frota_id', currentValue: order.frota_id, sourceValue: parsed.frotaId, action: 'REVIEW', reasonCode: 'AMBIGUOUS_FLEET_MODEL', protected: false });
  }
  compareItems(result, parsed, snapshot);
  result.classification = classify(result, false);
  return result;
}

async function loadSnapshots(numbers: number[]): Promise<Map<number, Snapshot>> {
  const snapshots = new Map<number, Snapshot>();
  if (!numbers.length) return snapshots;
  const orders = (await pool.query<DbOrder>(`SELECT id,numero_os,obra_id,frota_id,natureza_os,categoria_servico,status,status_original,status_origem,observacoes FROM ordens_servico WHERE numero_os = ANY($1::bigint[])`, [numbers])).rows;
  const ids = orders.map(row => row.id);
  if (!ids.length) return snapshots;
  const [services, products, executions, overrides] = await Promise.all([
    pool.query<DbItem>(`SELECT id,ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem,codigo_poli,fingerprint_contexto,hash_conteudo FROM servicos_os WHERE ordem_servico_id = ANY($1::uuid[])`, [ids]),
    pool.query<DbItem>(`SELECT id,ordem_servico_id,descricao,quantidade,unidade,valor_unitario,codigo_poli,fingerprint_contexto,hash_conteudo FROM produtos_os WHERE ordem_servico_id = ANY($1::uuid[])`, [ids]),
    pool.query<DbExecution>(`SELECT id,ordem_servico_id,servico_os_id,funcionario_id,to_char(inicio,'YYYY-MM-DD"T"HH24:MI') inicio,to_char(fim,'YYYY-MM-DD"T"HH24:MI') fim,fingerprint_contexto,hash_conteudo FROM servicos_os_execucoes WHERE ordem_servico_id = ANY($1::uuid[])`, [ids]),
    pool.query<DbOverride>(`SELECT ordem_servico_id,campo,valor_origem,valor_override FROM ordens_servico_overrides WHERE ordem_servico_id = ANY($1::uuid[])`, [ids]),
  ]);
  for (const order of orders) snapshots.set(Number(order.numero_os), { order, services: services.rows.filter(row => row.ordem_servico_id === order.id), products: products.rows.filter(row => row.ordem_servico_id === order.id), executions: executions.rows.filter(row => row.ordem_servico_id === order.id), overrides: overrides.rows.map(row => ({ ...row, valor_origem: decodeJson(row.valor_origem), valor_override: decodeJson(row.valor_override) })).filter(row => row.ordem_servico_id === order.id) });
  return snapshots;
}

export async function reconcileMonthly(buffer: Buffer, filename: string): Promise<MonthlyReconciliationReport> {
  const importacao = buildPoliImport(buffer, filename, 'CONSOLIDADA', 'POLI');
  const parsed = parsePoliOs(buffer, filename, importacao, { resolveDatabase: false });
  await matchPreview(parsed, { resolveDatabase: false });
  const snapshots = await loadSnapshots(parsed.map(value => value.numeroOs));
  const results = parsed.map(value => classifyReconciliation(value, snapshots.get(value.numeroOs)));
  const classifications = Object.fromEntries(reconciliationClassifications.map(value => [value, 0])) as Record<ReconciliationClassification, number>;
  const reasonCounts: Record<string, number> = {};
  const fieldCounts: Record<string, number> = {};
  for (const result of results) {
    classifications[result.classification]++;
    for (const difference of result.differences) { addCount(fieldCounts, difference.field); if (difference.reasonCode) addCount(reasonCounts, difference.reasonCode); }
    for (const review of result.reviews) addCount(reasonCounts, review.reasonCode);
    for (const blocker of result.blockers) addCount(reasonCounts, blocker.reasonCode);
  }
  return { metadata: { arquivo: filename, importacao, parser: 'src/imports/poli-canonical.ts + src/imports/poli-os.ts', readOnly: true, queryStrategy: 'parser canônico sem resolução FOR UPDATE; referências em lote; snapshot por ANY(uuid[])' }, summary: { totalOs: results.length, classifications, totalDifferences: results.reduce((sum, value) => sum + value.differences.length, 0) }, reasonCounts, fieldCounts, results };
}
