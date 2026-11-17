import { createHash } from 'node:crypto';
import { pool } from '../config/database.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { applyContabilSharedDecision, canDecideContabilSharedExpense, parseContabilidade, normalizeSubcentro, CONTABILIDADE_INICIO_OPERACAO, type ContabilClassification, type ContabilLancamento, type ContabilFleetMatch, type ContabilDespesaCompartilhadaStatus, type ContabilDecision } from '../imports/contabilidade.js';
import { recordAudit } from './audit.service.js';
import { manualDecisionBlocks, type ManualDecisionBlock } from '../imports/contabilidade-decision.js';
import { accountingDateOutsidePeriod, parseAccountingPeriod, type AccountingPeriod } from '../imports/contabilidade-period.js';
import { duplicateOccurrenceLines, duplicateReviewInputError } from '../imports/contabilidade-duplicates.js';
import { contabilPreviewBlocksConfirmation, summarizeContabilPreviewItems, type ContabilPreviewValueSummary } from '../imports/contabilidade-preview.js';
export { contabilPreviewBlocksConfirmation, summarizeContabilPreviewItems } from '../imports/contabilidade-preview.js';
export type { ContabilPreviewValueSummary } from '../imports/contabilidade-preview.js';

export class ContabilidadeImportError extends Error { constructor(public readonly statusCode: 400 | 403 | 404 | 409, message: string, public readonly code = 'CONTABILIDADE_ERROR', public readonly blocks?: ManualDecisionBlock[]) { super(message); } }
export interface ContabilImportResumo { id: string; arquivo_nome: string; hash_arquivo: string; total: number; classificados: number; pendentes: number; pendentes_classificacao: number; pendentes_frota: number; reimportada: boolean; }
export interface ContabilPreviewItem { linha_original: number; produto_original: string | null; subcentro_original: string | null; classificacao: ContabilClassification; frota: string | null; frota_destino: string | null; identificacao_frota: ContabilFleetMatch; valor_total: number | null; data_conta: string | null; motivo_pendencia: string | null; duplicado_no_arquivo: boolean; linhas_duplicadas: number[]; duplicidade_revisada: boolean; justificativa_duplicidade: string | null; revisada_por: string | null; duplicado_em_importacao_anterior: boolean; fora_periodo_autorizado: boolean; valor_total_invalido: boolean; bloqueios_decisao: ManualDecisionBlock[]; despesa_compartilhada_status: ContabilDespesaCompartilhadaStatus; combustivel_status: 'FORA_ESCOPO_COMBUSTIVEL' | 'AMBIGUO' | null; }
export interface ContabilPreview { token: string; arquivo_nome: string; hash_arquivo: string; arquivo_ja_importado: boolean; total: number; periodo: AccountingPeriod; intervalo_observado: { inicio: string | null; fim: string | null }; periodo_operacional_inicio: string; frotas_identificadas: string[]; categorias: Record<ContabilClassification, number>; duplicados: number; valor_duplicado: string; fora_periodo: number; valor_fora_periodo: string; historico_sem_periodo: number; periodo_sobreposto: boolean; inconsistencias: number; pendentes: number; valor_pendente_classificacao: string; valor_compartilhado_aguardando: string; valor_excluido_escopo: string; compartilhadas_aguardando: number; compartilhadas_aprovadas: number; compartilhadas_desconsideradas: number; valor_compartilhado_aprovado: string; confirmacao_bloqueada: boolean; total_elegivel: string; itens: ContabilPreviewItem[]; somente_leitura: true; }

type FleetRef = { id: string; codigo: string };
type AliasRef = { frota_id: string; identificador_normalizado: string };
const fileHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
type StoredPreview = { token: string; buffer: Buffer; arquivoNome: string; hash: string; parsedHash: string; preview: ContabilPreview; expiresAt: number; result?: ContabilImportResumo };
const previews = new Map<string, StoredPreview>();
const confirmationsInFlight = new Map<string, Promise<ContabilImportResumo>>();
const duplicateReviewsInFlight = new Set<string>();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

async function resolveFleet(client: { query: typeof pool.query }, subcentro: string | null, code: string | null): Promise<{ id: string | null; match: ContabilFleetMatch }> {
  const normalized = normalizeSubcentro(subcentro);
  if (normalized === 'FROTAS DIVERSAS') return { id: null, match: 'PENDENTE' };
  if (!normalized) return { id: null, match: 'PENDENTE' };
  const candidates = [normalized, normalized.replace(/^FROTA\s+/, ''), normalizeSubcentro(code)];
  const exact = await client.query<FleetRef>('SELECT id,codigo FROM frotas WHERE upper(regexp_replace(btrim(codigo), \'[[:space:]-]+\', \'\', \'g\')) = ANY($1::text[]) AND status=\'ATIVO\'', [candidates.filter(Boolean).map(value => value.replace(/[\s-]+/g, ''))]);
  if (exact.rows.length === 1) return { id: exact.rows[0]!.id, match: 'EXATA' };
  const alias = await client.query<AliasRef>(`SELECT a.frota_id,a.identificador_normalizado FROM frota_identificadores_externos a JOIN frotas f ON f.id=a.frota_id AND f.status='ATIVO' WHERE a.origem='CONTABILIDADE' AND a.identificador_normalizado=$1`, [normalized]);
  if (alias.rows.length === 1) return { id: alias.rows[0]!.frota_id, match: 'ALIAS' };
  if (alias.rows.length > 1 || exact.rows.length > 1) return { id: null, match: 'PENDENTE' };
  if (code && normalizeSubcentro(code) !== normalized) {
    const codeAlias = await client.query<AliasRef>(`SELECT a.frota_id,a.identificador_normalizado FROM frota_identificadores_externos a JOIN frotas f ON f.id=a.frota_id AND f.status='ATIVO' WHERE a.origem='CONTABILIDADE' AND a.identificador_normalizado=$1`, [normalizeSubcentro(code)]);
    if (codeAlias.rows.length === 1) return { id: codeAlias.rows[0]!.frota_id, match: 'ALIAS' };
  }
  return { id: null, match: 'PENDENTE' };
}

const pendingReason = (row: ContabilLancamento, match: ContabilFleetMatch, duplicate: boolean, duplicatePrevious: boolean, decision?: ContabilDespesaCompartilhadaStatus): string | null => [row.classificacao === 'PENDENTE' ? 'CLASSIFICACAO_NAO_MAPEADA' : null, row.combustivelStatus === 'AMBIGUO' ? 'COMBUSTIVEL_AMBIGUO' : null, row.despesaCompartilhadaStatus === 'AGUARDANDO_DECISAO' && decision !== 'APROVADA' && decision !== 'DESCONSIDERADA' ? 'DESPESA_COMPARTILHADA_AGUARDANDO_DECISAO' : null, match === 'PENDENTE' && normalizeSubcentro(row.subcentroOriginal) !== 'FROTAS DIVERSAS' && row.despesaCompartilhadaStatus !== 'AGUARDANDO_DECISAO' && row.despesaCompartilhadaStatus !== 'FORA_ESCOPO_COMBUSTIVEL' ? 'FROTA_NAO_IDENTIFICADA' : null, !row.dataConta ? 'DATA_CONTA_NAO_INFORMADA' : row.dataConta < CONTABILIDADE_INICIO_OPERACAO ? 'COMPETENCIA_ANTERIOR_A_NOVEMBRO_2026' : null, row.valorTotalInvalido || row.valorTotal === null ? 'VALOR_TOTAL_INVALIDO' : null, duplicate ? 'POSSIVEL_DUPLICIDADE_NO_ARQUIVO' : null, duplicatePrevious ? 'DUPLICADO_EM_IMPORTACAO_ANTERIOR' : null].filter(Boolean).join(',') || null;

function itemParams(importacaoId: string, row: ContabilLancamento, fleet: { id: string | null; match: ContabilFleetMatch }, status = row.despesaCompartilhadaStatus, actorId: string | null = null) {
  const decided = status === 'APROVADA' || status === 'DESCONSIDERADA';
  return [importacaoId, row.fingerprint, row.planilhaOriginal, row.linhaOriginal, JSON.stringify(row.dadosOriginais), row.controleOriginal, row.dataLancamento, row.dataConta, row.notaOriginal, row.codigoProdutoOriginal, row.produtoOriginal, row.tipoMovimentacaoOriginal, row.quantidade, row.valorUnitario, row.valorTotal, row.subcentroCodigoOriginal, row.subcentroOriginal, row.planoContasCodigoOriginal, row.planoContasOriginal, row.categoriaContabil, row.classificacao, fleet.id, fleet.match, pendingReason(row, fleet.match, false, false, status), status, decided ? actorId : null, decided ? new Date() : null];
}

export type DuplicateReviewDecision = { linhaOriginal: number; linhasRelacionadas: number[]; justificativa: string };
type ContabilDecisionValue = { status: ContabilDespesaCompartilhadaStatus; frotaId?: string | null; duplicateReview?: DuplicateReviewDecision };

async function assertPeriodCanBeImported(client: { query: typeof pool.query }, period: AccountingPeriod): Promise<void> {
  const unknown = await client.query<{ total: number }>("SELECT count(*)::int AS total FROM importacoes_contabeis WHERE status <> 'CANCELADA' AND (periodo_inicio IS NULL OR periodo_fim IS NULL)");
  if (Number(unknown.rows[0]?.total ?? 0) > 0) throw new ContabilidadeImportError(409, 'Existem importações anteriores sem período reconciliado. A confirmação está bloqueada.', 'LEGACY_PERIODS_UNRECONCILED');
  const overlap = await client.query<{ id: string }>("SELECT id FROM importacoes_contabeis WHERE status <> 'CANCELADA' AND periodo_inicio <= $2::date AND periodo_fim >= $1::date LIMIT 1", [period.inicio, period.fim]);
  if (overlap.rows[0]) throw new ContabilidadeImportError(409, 'O período informado se sobrepõe a uma importação contábil já confirmada.', 'ACCOUNTING_PERIOD_OVERLAP');
}

export async function importContabilidade(buffer: Buffer, arquivoNome: string, periodInput: AccountingPeriod, actor?: AuthenticatedRequestUser, decisions?: Map<number, ContabilDecisionValue>): Promise<ContabilImportResumo> {
  let period: AccountingPeriod;
  try { period = parseAccountingPeriod(periodInput?.inicio, periodInput?.fim, CONTABILIDADE_INICIO_OPERACAO); }
  catch (error) { throw new ContabilidadeImportError(400, (error as Error).message, 'INVALID_ACCOUNTING_PERIOD'); }
  const hash = fileHash(buffer);
  const rows = parseContabilidade(buffer, arquivoNome);
  if (rows.some(row => accountingDateOutsidePeriod(row.dataConta, period) || !row.dataConta || row.dataConta < CONTABILIDADE_INICIO_OPERACAO)) throw new ContabilidadeImportError(409, 'Ha lancamentos com Data Conta ausente ou fora do periodo informado.', 'INVALID_ACCOUNTING_PERIOD');
  if (rows.some(row => row.valorTotalInvalido || row.valorTotal === null)) throw new ContabilidadeImportError(409, 'Ha lancamentos com valor total ausente ou invalido.', 'INVALID_TOTAL_VALUE');
  if (rows.some(row => row.combustivelStatus === 'AMBIGUO')) throw new ContabilidadeImportError(409, 'Ha lancamentos com classificacao de combustivel ambigua.', 'AMBIGUOUS_FUEL_CLASSIFICATION');
  for (const [line, relatedLines] of duplicateOccurrenceLines(rows)) {
    const review = decisions?.get(line)?.duplicateReview;
    const actualLines = JSON.stringify([...relatedLines].sort((a, b) => a - b));
    const reviewedLines = review ? JSON.stringify([...review.linhasRelacionadas].sort((a, b) => a - b)) : '';
    if (!review || review.linhaOriginal !== line || reviewedLines !== actualLines || review.justificativa.trim().length < 20) throw new ContabilidadeImportError(409, 'A linha ' + line + ' possui possivel duplicidade no arquivo e exige revisao ADMIN com justificativa.', 'DUPLICATE_IN_FILE');
  }
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN'); transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('osgestor-contabilidade-periodos'))");
    const existing = await client.query<{ id: string }>('SELECT id FROM importacoes_contabeis WHERE hash_arquivo=$1', [hash]);
    if (existing.rows[0]) { await client.query('ROLLBACK'); transactionOpen = false; return getImportResumo(existing.rows[0].id, true, client); }
    await assertPeriodCanBeImported(client, period);
    const prior = await client.query<{ fingerprint: string }>('SELECT fingerprint FROM lancamentos_contabeis WHERE fingerprint = ANY($1::char(64)[])', [rows.map(row => row.fingerprint)]);
    if (prior.rows.length) throw new ContabilidadeImportError(409, 'Um ou mais lancamentos ja constam em importacao anterior.', 'DUPLICATE_IN_PREVIOUS_IMPORT');
    const inserted = await client.query<{ id: string }>('INSERT INTO importacoes_contabeis(arquivo_nome,hash_arquivo,tamanho_bytes,criado_por,periodo_inicio,periodo_fim) VALUES($1,$2,$3,$4,$5::date,$6::date) RETURNING id', [arquivoNome, hash, buffer.length, actor?.id ?? null, period.inicio, period.fim]);
    const importacaoId = inserted.rows[0]!.id;
    for (const row of rows) {
      const fleet = await resolveFleet(client, row.subcentroOriginal, row.subcentroCodigoOriginal);
      const decision = decisions?.get(row.linhaOriginal);
      const destination = decision?.frotaId ? { id: decision.frotaId, match: 'MANUAL' as ContabilFleetMatch } : fleet;
      await client.query('INSERT INTO lancamentos_contabeis(importacao_id,fingerprint,planilha_original,linha_original,dados_originais,controle_original,data_lancamento,data_conta,nota_original,codigo_produto_original,produto_original,tipo_movimentacao_original,quantidade,valor_unitario,valor_total,subcentro_codigo_original,subcentro_original,plano_contas_codigo_original,plano_contas_original,categoria_contabil,classificacao,frota_id,identificacao_frota,motivo_pendencia,despesa_compartilhada_status,decidido_por,decidido_em) VALUES (' + Array.from({ length: 27 }, (_, index) => '$' + (index + 1)).join(',') + ')', itemParams(importacaoId, row, destination, decision?.status, actor?.id ?? null));
    }
    await recordAudit({ actor, acao: 'IMPORTAR', modulo: 'IMPORTACOES_CONTABEIS', entidade: 'importacoes_contabeis', entidadeId: importacaoId, dadosPosteriores: { id: importacaoId, arquivo_nome: arquivoNome, hash_arquivo: hash, periodo_inicio: period.inicio, periodo_fim: period.fim, total: rows.length } }, client);
    await client.query('COMMIT'); transactionOpen = false;
    return getImportResumo(importacaoId, false, client);
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    const code = (error as { code?: string }).code;
    if (code === '23505') throw new ContabilidadeImportError(409, 'O arquivo ou algum lancamento ja foi importado; a transacao foi revertida.', 'DUPLICATE_PERSISTENCE_CONFLICT');
    if (code === '23P01') throw new ContabilidadeImportError(409, 'O periodo informado conflita com outra importacao; a transacao foi revertida.', 'ACCOUNTING_PERIOD_OVERLAP');
    throw error;
  } finally { client.release(); }
}

const money = (value: number): string => value.toFixed(2);
export async function analisarContabilidade(buffer: Buffer, arquivoNome: string, periodInput: AccountingPeriod): Promise<ContabilPreview> {
  let declaredPeriod: AccountingPeriod;
  try { declaredPeriod = parseAccountingPeriod(periodInput?.inicio, periodInput?.fim, CONTABILIDADE_INICIO_OPERACAO); }
  catch (error) { throw new ContabilidadeImportError(400, (error as Error).message, 'INVALID_ACCOUNTING_PERIOD'); }
  const rows = parseContabilidade(buffer, arquivoNome);
  const hash = fileHash(buffer);
  const existing = await pool.query<{ id: string }>('SELECT id FROM importacoes_contabeis WHERE hash_arquivo=$1', [hash]);
  const existingFingerprints = new Set<string>((await pool.query<{ fingerprint: string }>('SELECT fingerprint FROM lancamentos_contabeis WHERE fingerprint = ANY($1::char(64)[])', [rows.map(row => row.fingerprint)])).rows.map(row => row.fingerprint));
  const repeatedLines = duplicateOccurrenceLines(rows);
  const categories: Record<ContabilClassification, number> = { PECAS_EXTERNAS: 0, SERVICOS_TERCEIRIZADOS: 0, PENDENTE: 0 };
  const fleetNames = new Set<string>();
  let duplicateCount = 0; let duplicateValue = 0; let outOfPeriod = 0; let outOfPeriodValue = 0; let eligible = 0;
  const items: ContabilPreviewItem[] = [];
  for (const row of rows) {
    const fleet = await resolveFleet(pool, row.subcentroOriginal, row.subcentroCodigoOriginal);
    const duplicate = repeatedLines.has(row.linhaOriginal);
    const duplicatePrevious = existingFingerprints.has(row.fingerprint);
    const outsidePeriod = accountingDateOutsidePeriod(row.dataConta, declaredPeriod) || !row.dataConta || row.dataConta < CONTABILIDADE_INICIO_OPERACAO;
    if (duplicate || duplicatePrevious) { duplicateCount += 1; duplicateValue += row.valorTotal ?? 0; }
    if (outsidePeriod) { outOfPeriod += 1; outOfPeriodValue += row.valorTotal ?? 0; }
    if (fleet.id && row.subcentroOriginal) fleetNames.add(row.subcentroOriginal);
    categories[row.classificacao] += 1;
    const pending = [pendingReason(row, fleet.match, duplicate, duplicatePrevious), outsidePeriod ? 'DATA_CONTA_FORA_DO_PERIODO' : null].filter(Boolean).join(',') || null;
    if (!pending && row.valorTotal !== null && row.despesaCompartilhadaStatus === 'NAO_COMPARTILHADA') eligible += row.valorTotal;
    const previewItem: ContabilPreviewItem = { linha_original: row.linhaOriginal, produto_original: row.produtoOriginal, subcentro_original: row.subcentroOriginal, classificacao: row.classificacao, frota: row.despesaCompartilhadaStatus === 'AGUARDANDO_DECISAO' ? null : row.subcentroOriginal, frota_destino: null, identificacao_frota: fleet.match, valor_total: row.valorTotal, data_conta: row.dataConta, motivo_pendencia: pending, duplicado_no_arquivo: duplicate, linhas_duplicadas: repeatedLines.get(row.linhaOriginal) ?? [], duplicidade_revisada: false, justificativa_duplicidade: null, revisada_por: null, duplicado_em_importacao_anterior: duplicatePrevious, fora_periodo_autorizado: outsidePeriod, valor_total_invalido: row.valorTotalInvalido || row.valorTotal === null, bloqueios_decisao: [], despesa_compartilhada_status: row.despesaCompartilhadaStatus, combustivel_status: row.combustivelStatus };
    previewItem.bloqueios_decisao = manualDecisionBlocks(previewItem);
    items.push(previewItem);
  }
  const dates = rows.map(row => row.dataConta).filter((value): value is string => Boolean(value)).sort();
  const history = await pool.query<{ total: number }>("SELECT count(*)::int total FROM importacoes_contabeis WHERE status <> 'CANCELADA' AND (periodo_inicio IS NULL OR periodo_fim IS NULL)");
  const overlap = await pool.query<{ has_overlap: boolean }>("SELECT EXISTS(SELECT 1 FROM importacoes_contabeis WHERE status <> 'CANCELADA' AND periodo_inicio <= $2::date AND periodo_fim >= $1::date) AS has_overlap", [declaredPeriod.inicio, declaredPeriod.fim]);
  const historyWithoutPeriod = Number(history.rows[0]?.total ?? 0);
  const periodOverlaps = overlap.rows[0]?.has_overlap ?? false;
  const token = createHash('sha256').update(hash + ':' + Date.now() + ':' + Math.random()).digest('hex');
  const parsedHash = createHash('sha256').update(JSON.stringify(rows.map(row => row.fingerprint))).digest('hex');
  const sharedAwaiting = items.filter(item => item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length;
  const sharedApproved = items.filter(item => item.despesa_compartilhada_status === 'APROVADA').length;
  const sharedDisregarded = items.filter(item => item.despesa_compartilhada_status === 'DESCONSIDERADA').length;
  const sharedApprovedValue = items.filter(item => item.despesa_compartilhada_status === 'APROVADA').reduce((sum, item) => sum + (item.valor_total ?? 0), 0);
  const values = summarizeContabilPreviewItems(items);
  const blocked = contabilPreviewBlocksConfirmation(items, outOfPeriod, existing.rows.length > 0, historyWithoutPeriod, periodOverlaps);
  const preview: ContabilPreview = { token, arquivo_nome: arquivoNome, hash_arquivo: hash, arquivo_ja_importado: existing.rows.length > 0, total: rows.length, periodo: declaredPeriod, intervalo_observado: { inicio: dates[0] ?? null, fim: dates.at(-1) ?? null }, periodo_operacional_inicio: CONTABILIDADE_INICIO_OPERACAO, frotas_identificadas: [...fleetNames], categorias: categories, duplicados: duplicateCount, valor_duplicado: money(duplicateValue), fora_periodo: outOfPeriod, valor_fora_periodo: money(outOfPeriodValue), historico_sem_periodo: historyWithoutPeriod, periodo_sobreposto: periodOverlaps, inconsistencias: items.filter(item => item.motivo_pendencia !== null).length, pendentes: items.filter(item => item.motivo_pendencia !== null).length, valor_pendente_classificacao: money(values.valorPendenteClassificacao), valor_compartilhado_aguardando: money(values.valorCompartilhadoAguardando), valor_excluido_escopo: money(values.valorExcluidoEscopo), compartilhadas_aguardando: sharedAwaiting, compartilhadas_aprovadas: sharedApproved, compartilhadas_desconsideradas: sharedDisregarded, valor_compartilhado_aprovado: money(sharedApprovedValue), confirmacao_bloqueada: blocked, total_elegivel: money(eligible), itens: items, somente_leitura: true };
  previews.set(token, { token, buffer: Buffer.from(buffer), arquivoNome, hash, parsedHash, preview, expiresAt: Date.now() + PREVIEW_TTL_MS });
  for (const [key, value] of previews) if (value.expiresAt <= Date.now()) previews.delete(key);
  return preview;
}

export async function confirmarContabilidade(token: string, actor?: AuthenticatedRequestUser): Promise<ContabilImportResumo> {
  const stored = previews.get(token);
  if (!stored || stored.expiresAt <= Date.now()) { previews.delete(token); throw new ContabilidadeImportError(404, 'Prévia contábil expirada ou não encontrada.'); }
  if (stored.result) return stored.result;
  const running = confirmationsInFlight.get(token);
  if (running) return running;
  const confirmation = confirmStoredPreview(stored, actor);
  confirmationsInFlight.set(token, confirmation);
  try { return await confirmation; } finally { confirmationsInFlight.delete(token); }
}

function refreshPreviewSummary(preview: ContabilPreview): void {
  const pendingItems = preview.itens.filter(item => item.motivo_pendencia !== null || item.bloqueios_decisao.length > 0 || item.combustivel_status === 'AMBIGUO' || item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO');
  const approved = preview.itens.filter(item => item.despesa_compartilhada_status === 'APROVADA');
  preview.compartilhadas_aguardando = preview.itens.filter(item => item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length;
  preview.compartilhadas_aprovadas = approved.length;
  preview.compartilhadas_desconsideradas = preview.itens.filter(item => item.despesa_compartilhada_status === 'DESCONSIDERADA').length;
  preview.valor_compartilhado_aprovado = money(approved.reduce((sum, item) => sum + (item.valor_total ?? 0), 0));
  preview.pendentes = pendingItems.length;
  preview.inconsistencias = pendingItems.length;
  const values = summarizeContabilPreviewItems(preview.itens);
  preview.valor_pendente_classificacao = money(values.valorPendenteClassificacao);
  preview.valor_compartilhado_aguardando = money(values.valorCompartilhadoAguardando);
  preview.valor_excluido_escopo = money(values.valorExcluidoEscopo);
  preview.confirmacao_bloqueada = contabilPreviewBlocksConfirmation(preview.itens, preview.fora_periodo, preview.arquivo_ja_importado, preview.historico_sem_periodo, preview.periodo_sobreposto);
  preview.total_elegivel = money(preview.itens.filter(item => !item.motivo_pendencia && item.bloqueios_decisao.length === 0 && ['NAO_COMPARTILHADA', 'APROVADA'].includes(item.despesa_compartilhada_status)).reduce((sum, item) => sum + (item.valor_total ?? 0), 0));
}

export async function revisarDuplicidadeContabil(token: string, linhaOriginal: number, justificativaInput: unknown, actor?: AuthenticatedRequestUser): Promise<ContabilPreview> {
  if (!actor || actor.role !== 'ADMIN') throw new ContabilidadeImportError(403, 'Somente ADMIN pode revisar possiveis duplicidades.', 'DUPLICATE_REVIEW_FORBIDDEN');
  const key = token + ':' + linhaOriginal;
  if (duplicateReviewsInFlight.has(key)) throw new ContabilidadeImportError(409, 'Esta linha ja esta sendo revisada.', 'DUPLICATE_REVIEW_ALREADY_DECIDED');
  duplicateReviewsInFlight.add(key);
  try { return await performDuplicateReview(token, linhaOriginal, justificativaInput, actor); }
  finally { duplicateReviewsInFlight.delete(key); }
}

async function performDuplicateReview(token: string, linhaOriginal: number, justificativaInput: unknown, actor: AuthenticatedRequestUser): Promise<ContabilPreview> {
  const stored = previews.get(token);
  if (!stored || stored.expiresAt <= Date.now()) throw new ContabilidadeImportError(404, 'Previa contabil expirada ou nao encontrada.');
  const justification = typeof justificativaInput === 'string' ? justificativaInput.trim() : '';
  if (stored.preview.confirmacao_bloqueada && (stored.preview.arquivo_ja_importado || stored.preview.fora_periodo > 0 || stored.preview.historico_sem_periodo > 0 || stored.preview.periodo_sobreposto)) throw new ContabilidadeImportError(409, 'A previa possui bloqueios gerais de confirmacao e nao pode ser liberada por revisao manual.', 'DUPLICATE_REVIEW_HAS_GLOBAL_BLOCK');
  const item = stored.preview.itens.find(value => value.linha_original === linhaOriginal);
  if (!item || !item.duplicado_no_arquivo || item.linhas_duplicadas.length < 2) throw new ContabilidadeImportError(409, 'A linha nao esta marcada como possivel duplicidade neste arquivo.', 'DUPLICATE_REVIEW_NOT_CANDIDATE');
  const reviewInputError = duplicateReviewInputError(actor?.role, linhaOriginal, item.linhas_duplicadas, justificativaInput);
  if (reviewInputError) throw new ContabilidadeImportError(400, 'A justificativa deve conter entre 20 e 1000 caracteres.', reviewInputError);
  if (item.duplicidade_revisada) throw new ContabilidadeImportError(409, 'Esta linha ja teve sua possivel duplicidade revisada.', 'DUPLICATE_REVIEW_ALREADY_DECIDED');
  if (item.despesa_compartilhada_status !== 'AGUARDANDO_DECISAO') throw new ContabilidadeImportError(409, 'A revisao esta disponivel somente para lancamentos de FROTAS DIVERSAS aguardando decisao.', 'DUPLICATE_REVIEW_NOT_MANUAL_ITEM');
  const otherBlocks = manualDecisionBlocks({ ...item, duplicado_no_arquivo: false });
  if (otherBlocks.length) throw new ContabilidadeImportError(409, 'A linha possui outros bloqueios impeditivos: ' + otherBlocks.map(block => block.mensagem).join(' '), otherBlocks[0]!.codigo, otherBlocks);
  await recordAudit({ actor, acao: 'EDITAR', modulo: 'IMPORTACOES_CONTABEIS', entidade: 'revisao_duplicidade_previa', entidadeId: token + ':' + linhaOriginal, dadosPosteriores: { decisao: 'AUTORIZAR_OCORRENCIA_DISTINTA', justificativa: justification, arquivo_nome: stored.arquivoNome, hash_arquivo: stored.hash, linha_original: linhaOriginal, linhas_envolvidas: item.linhas_duplicadas } });
  item.duplicidade_revisada = true;
  item.justificativa_duplicidade = justification;
  item.revisada_por = actor.username;
  item.bloqueios_decisao = manualDecisionBlocks({ ...item, duplicado_no_arquivo: false });
  item.motivo_pendencia = item.motivo_pendencia?.split(',').filter(reason => reason !== 'POSSIVEL_DUPLICIDADE_NO_ARQUIVO').join(',') || null;
  refreshPreviewSummary(stored.preview);
  return stored.preview;
}

export async function decidirDespesaCompartilhada(token: string, linhaOriginal: number, decisao: ContabilDecision, frotaId?: string | null, actor?: AuthenticatedRequestUser): Promise<ContabilPreview> {
  if (!actor || !canDecideContabilSharedExpense(actor.role)) throw new ContabilidadeImportError(403, 'Somente administradores podem decidir despesas compartilhadas.');
  const stored = previews.get(token);
  if (!stored || stored.expiresAt <= Date.now()) throw new ContabilidadeImportError(404, 'Previa contabil expirada ou nao encontrada.');
  const item = stored.preview.itens.find(value => value.linha_original === linhaOriginal);
  if (!item || item.despesa_compartilhada_status === 'FORA_ESCOPO_COMBUSTIVEL') throw new ContabilidadeImportError(400, 'Item nao e uma despesa compartilhada elegivel para decisao.');
  const decisionBlocks = manualDecisionBlocks({ ...item, duplicado_no_arquivo: item.duplicado_no_arquivo && !item.duplicidade_revisada });
  if (decisionBlocks.length) {
    const code = decisionBlocks.length === 1 ? decisionBlocks[0]!.codigo : 'MANUAL_DECISION_BLOCKED';
    throw new ContabilidadeImportError(409, 'Decisao manual bloqueada: ' + decisionBlocks.map(block => block.mensagem).join(' '), code, decisionBlocks);
  }
  if (item.despesa_compartilhada_status !== 'AGUARDANDO_DECISAO') throw new ContabilidadeImportError(409, 'Este lancamento ja possui uma decisao manual.', 'MANUAL_DECISION_ALREADY_SET');
  if (frotaId) { const fleet = await pool.query('SELECT 1 FROM frotas WHERE id=$1 AND status=\'ATIVO\'', [frotaId]); if (!fleet.rows[0]) throw new ContabilidadeImportError(400, 'A frota informada nao existe ou esta inativa.'); }
  item.despesa_compartilhada_status = applyContabilSharedDecision(decisao);
  item.frota_destino = decisao === 'APROVAR' && frotaId ? frotaId : null;
  item.motivo_pendencia = item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? 'DESPESA_COMPARTILHADA_AGUARDANDO_DECISAO' : null;
  item.bloqueios_decisao = [];
  refreshPreviewSummary(stored.preview);
  if (actor) await recordAudit({ actor, acao: 'EDITAR', modulo: 'IMPORTACOES_CONTABEIS', entidade: 'previa_contabil', entidadeId: token, dadosPosteriores: { linha_original: linhaOriginal, decisao: item.despesa_compartilhada_status, frota_id: item.frota_destino, revisao_duplicidade: item.duplicidade_revisada } });
  return stored.preview;
}

async function confirmStoredPreview(stored: StoredPreview, actor?: AuthenticatedRequestUser): Promise<ContabilImportResumo> {
  if (fileHash(stored.buffer) !== stored.hash) throw new ContabilidadeImportError(409, 'A prévia não corresponde mais ao arquivo analisado.');
  const reparsed = parseContabilidade(stored.buffer, stored.arquivoNome);
  const reparsedHash = createHash('sha256').update(JSON.stringify(reparsed.map(row => row.fingerprint))).digest('hex');
  if (reparsed.length !== stored.preview.total || reparsedHash !== stored.parsedHash) {
    throw new ContabilidadeImportError(409, 'A prévia está inconsistente; analise o arquivo novamente.');
  }
  if (stored.preview.arquivo_ja_importado) throw new ContabilidadeImportError(409, 'Este arquivo ja foi importado anteriormente.', 'FILE_ALREADY_IMPORTED');
  if (stored.preview.fora_periodo > 0) throw new ContabilidadeImportError(409, 'Data Conta ausente ou fora do periodo informado.', 'INVALID_ACCOUNTING_PERIOD');
  if (stored.preview.historico_sem_periodo > 0) throw new ContabilidadeImportError(409, 'Importacoes anteriores sem periodo exigem reconciliacao.', 'LEGACY_PERIODS_UNRECONCILED');
  if (stored.preview.periodo_sobreposto) throw new ContabilidadeImportError(409, 'O periodo informado se sobrepoe a outra importacao.', 'ACCOUNTING_PERIOD_OVERLAP');
  const itemBlock = stored.preview.itens.flatMap(item => item.bloqueios_decisao)[0];
  if (itemBlock) throw new ContabilidadeImportError(409, itemBlock.mensagem, itemBlock.codigo, [itemBlock]);
  if (stored.preview.confirmacao_bloqueada) throw new ContabilidadeImportError(409, 'Confirmacao bloqueada por inconsistencias financeiras.', 'ACCOUNTING_CONFIRMATION_BLOCKED');
  const decisions = new Map(stored.preview.itens.filter(item => item.despesa_compartilhada_status === 'APROVADA' || item.despesa_compartilhada_status === 'DESCONSIDERADA' || item.duplicidade_revisada).map(item => [item.linha_original, { status: item.despesa_compartilhada_status, frotaId: item.frota_destino, ...(item.duplicidade_revisada ? { duplicateReview: { linhaOriginal: item.linha_original, linhasRelacionadas: item.linhas_duplicadas, justificativa: item.justificativa_duplicidade ?? '' } } : {}) }] as [number, ContabilDecisionValue]));
  const result = await importContabilidade(stored.buffer, stored.arquivoNome, stored.preview.periodo, actor, decisions);
  stored.result = result;
  return result;
}

async function getImportResumo(id: string, reimportada: boolean, db: { query: typeof pool.query }): Promise<ContabilImportResumo> {
  const result = await db.query<ContabilImportResumo>(`SELECT i.id,i.arquivo_nome,i.hash_arquivo,count(l.id)::int total,count(l.id) FILTER (WHERE l.classificacao<>'PENDENTE' AND l.identificacao_frota<>'PENDENTE')::int classificados,count(l.id) FILTER (WHERE l.classificacao='PENDENTE' OR l.identificacao_frota='PENDENTE')::int pendentes,count(l.id) FILTER (WHERE l.classificacao='PENDENTE')::int pendentes_classificacao,count(l.id) FILTER (WHERE l.identificacao_frota='PENDENTE')::int pendentes_frota FROM importacoes_contabeis i LEFT JOIN lancamentos_contabeis l ON l.importacao_id=i.id WHERE i.id=$1 GROUP BY i.id`, [id]);
  if (!result.rows[0]) throw new ContabilidadeImportError(404, 'Importação contábil não encontrada.');
  return { ...result.rows[0], reimportada };
}

export async function getContabilidadeImport(id: string): Promise<ContabilImportResumo> { return getImportResumo(id, false, pool); }
export async function listContabilidadeImports(): Promise<ContabilImportResumo[]> { return (await pool.query<ContabilImportResumo>(`SELECT i.id,i.arquivo_nome,i.hash_arquivo,count(l.id)::int total,count(l.id) FILTER (WHERE l.classificacao<>'PENDENTE' AND l.identificacao_frota<>'PENDENTE')::int classificados,count(l.id) FILTER (WHERE l.classificacao='PENDENTE' OR l.identificacao_frota='PENDENTE')::int pendentes,count(l.id) FILTER (WHERE l.classificacao='PENDENTE')::int pendentes_classificacao,count(l.id) FILTER (WHERE l.identificacao_frota='PENDENTE')::int pendentes_frota,false reimportada FROM importacoes_contabeis i LEFT JOIN lancamentos_contabeis l ON l.importacao_id=i.id GROUP BY i.id ORDER BY i.criado_em DESC`)).rows; }
export async function listContabilidadeItems(importacaoId: string): Promise<unknown[]> { return (await pool.query(`SELECT id,importacao_id,planilha_original,linha_original,controle_original,data_lancamento,data_conta,nota_original,codigo_produto_original,produto_original,tipo_movimentacao_original,quantidade,valor_unitario,valor_total,subcentro_codigo_original,subcentro_original,plano_contas_codigo_original,plano_contas_original,categoria_contabil,classificacao,frota_id,identificacao_frota,motivo_pendencia,dados_originais FROM lancamentos_contabeis WHERE importacao_id=$1 ORDER BY linha_original`, [importacaoId])).rows; }

export async function updateContabilidadeItem(id: string, body: { frota_id?: string | null; classificacao?: ContabilClassification }, actor?: AuthenticatedRequestUser): Promise<unknown> {
  if (body.classificacao !== undefined && !['PECAS_EXTERNAS', 'SERVICOS_TERCEIRIZADOS', 'PENDENTE'].includes(body.classificacao)) throw new ContabilidadeImportError(400, 'Classificação inválida.');
  const hasFleet = Object.prototype.hasOwnProperty.call(body, 'frota_id');
  if (hasFleet && body.frota_id) {
    const fleet = await pool.query('SELECT 1 FROM frotas WHERE id=$1 AND status=\'ATIVO\'', [body.frota_id]);
    if (!fleet.rows[0]) throw new ContabilidadeImportError(400, 'A frota informada não existe ou está inativa.');
  }
  const before = (await pool.query('SELECT classificacao,frota_id,identificacao_frota,motivo_pendencia FROM lancamentos_contabeis WHERE id=$1', [id])).rows[0];
  const result = await pool.query(`UPDATE lancamentos_contabeis SET frota_id=CASE WHEN $1::boolean THEN $2::uuid ELSE frota_id END, classificacao=CASE WHEN $3::boolean THEN $4::varchar ELSE classificacao END, identificacao_frota=CASE WHEN $1::boolean AND $2::uuid IS NULL THEN 'PENDENTE' WHEN $1::boolean THEN 'MANUAL' ELSE identificacao_frota END, motivo_pendencia=CASE WHEN (CASE WHEN $3::boolean THEN $4::varchar ELSE classificacao END)<>'PENDENTE' AND (CASE WHEN $1::boolean THEN $2::uuid ELSE frota_id END) IS NOT NULL THEN NULL ELSE motivo_pendencia END WHERE id=$5 RETURNING *`, [hasFleet, body.frota_id ?? null, body.classificacao !== undefined, body.classificacao ?? null, id]);
  if (!result.rows[0]) throw new ContabilidadeImportError(404, 'Lançamento contábil não encontrado.');
  if (actor) await recordAudit({ actor, acao: 'EDITAR', modulo: 'IMPORTACOES_CONTABEIS', entidade: 'lancamentos_contabeis', entidadeId: id, dadosAnteriores: before, dadosPosteriores: { classificacao: result.rows[0].classificacao, frota_id: result.rows[0].frota_id, identificacao_frota: result.rows[0].identificacao_frota, motivo_pendencia: result.rows[0].motivo_pendencia } });
  return result.rows[0];
}
