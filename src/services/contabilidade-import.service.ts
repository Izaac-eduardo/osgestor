import { createHash } from 'node:crypto';
import { pool } from '../config/database.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { applyContabilSharedDecision, canDecideContabilSharedExpense, parseContabilidade, normalizeSubcentro, CONTABILIDADE_INICIO_OPERACAO, type ContabilClassification, type ContabilLancamento, type ContabilFleetMatch, type ContabilDespesaCompartilhadaStatus, type ContabilDecision } from '../imports/contabilidade.js';
import { recordAudit } from './audit.service.js';
import { manualDecisionBlockReasons } from '../imports/contabilidade-decision.js';

export class ContabilidadeImportError extends Error { constructor(public readonly statusCode: 400 | 403 | 404 | 409, message: string) { super(message); } }
export interface ContabilImportResumo { id: string; arquivo_nome: string; hash_arquivo: string; total: number; classificados: number; pendentes: number; pendentes_classificacao: number; pendentes_frota: number; reimportada: boolean; }
export interface ContabilPreviewItem { linha_original: number; produto_original: string | null; subcentro_original: string | null; classificacao: ContabilClassification; frota: string | null; frota_destino: string | null; identificacao_frota: ContabilFleetMatch; valor_total: number | null; data_conta: string | null; motivo_pendencia: string | null; duplicado_no_arquivo: boolean; duplicado_em_importacao_anterior: boolean; fora_periodo_autorizado: boolean; valor_total_invalido: boolean; bloqueios_decisao: string[]; despesa_compartilhada_status: ContabilDespesaCompartilhadaStatus; combustivel_status: 'FORA_ESCOPO_COMBUSTIVEL' | 'AMBIGUO' | null; }
export interface ContabilPreview { token: string; arquivo_nome: string; hash_arquivo: string; arquivo_ja_importado: boolean; total: number; periodo: { inicio: string | null; fim: string | null }; periodo_operacional_inicio: string; frotas_identificadas: string[]; categorias: Record<ContabilClassification, number>; duplicados: number; valor_duplicado: string; fora_periodo: number; valor_fora_periodo: string; inconsistencias: number; pendentes: number; valor_pendente_classificacao: string; valor_compartilhado_aguardando: string; valor_excluido_escopo: string; compartilhadas_aguardando: number; compartilhadas_aprovadas: number; compartilhadas_desconsideradas: number; valor_compartilhado_aprovado: string; confirmacao_bloqueada: boolean; total_elegivel: string; itens: ContabilPreviewItem[]; somente_leitura: true; }

export type ContabilPreviewValueSummary = { valorPendenteClassificacao: number; valorCompartilhadoAguardando: number; valorExcluidoEscopo: number };

export function summarizeContabilPreviewItems(items: Pick<ContabilPreviewItem, 'classificacao' | 'valor_total' | 'combustivel_status' | 'despesa_compartilhada_status'>[]): ContabilPreviewValueSummary {
  const value = (rows: typeof items): number => rows.reduce((total, item) => total + (item.valor_total ?? 0), 0);
  return {
    valorPendenteClassificacao: value(items.filter(item => item.classificacao === 'PENDENTE' && item.combustivel_status !== 'FORA_ESCOPO_COMBUSTIVEL')),
    valorCompartilhadoAguardando: value(items.filter(item => item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO')),
    valorExcluidoEscopo: value(items.filter(item => item.combustivel_status === 'FORA_ESCOPO_COMBUSTIVEL')),
  };
}

export function contabilPreviewBlocksConfirmation(items: Pick<ContabilPreviewItem, 'valor_total_invalido' | 'combustivel_status' | 'duplicado_em_importacao_anterior'>[], foraPeriodo: number, arquivoJaImportado = false): boolean {
  return arquivoJaImportado || foraPeriodo > 0 || items.some(item => item.valor_total_invalido || item.combustivel_status === 'AMBIGUO' || item.duplicado_em_importacao_anterior);
}

type FleetRef = { id: string; codigo: string };
type AliasRef = { frota_id: string; identificador_normalizado: string };
const fileHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const duplicateKey = (row: ContabilLancamento): string => JSON.stringify([row.dataConta, row.notaOriginal, row.codigoProdutoOriginal, row.produtoOriginal, row.quantidade, row.valorUnitario, row.valorTotal, row.subcentroOriginal, row.planoContasOriginal]);
type StoredPreview = { token: string; buffer: Buffer; arquivoNome: string; hash: string; parsedHash: string; preview: ContabilPreview; expiresAt: number; result?: ContabilImportResumo };
const previews = new Map<string, StoredPreview>();
const confirmationsInFlight = new Map<string, Promise<ContabilImportResumo>>();
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

const pendingReason = (row: ContabilLancamento, match: ContabilFleetMatch, _duplicate: boolean, duplicatePrevious: boolean, decision?: ContabilDespesaCompartilhadaStatus): string | null => [row.classificacao === 'PENDENTE' ? 'CLASSIFICACAO_NAO_MAPEADA' : null, row.combustivelStatus === 'AMBIGUO' ? 'COMBUSTIVEL_AMBIGUO' : null, row.despesaCompartilhadaStatus === 'AGUARDANDO_DECISAO' && decision !== 'APROVADA' && decision !== 'DESCONSIDERADA' ? 'DESPESA_COMPARTILHADA_AGUARDANDO_DECISAO' : null, match === 'PENDENTE' && row.despesaCompartilhadaStatus !== 'AGUARDANDO_DECISAO' && row.despesaCompartilhadaStatus !== 'FORA_ESCOPO_COMBUSTIVEL' ? 'FROTA_NAO_IDENTIFICADA' : null, !row.dataConta ? 'DATA_CONTA_NAO_INFORMADA' : row.dataConta < CONTABILIDADE_INICIO_OPERACAO ? 'COMPETENCIA_ANTERIOR_A_NOVEMBRO_2026' : null, row.valorTotalInvalido ? 'VALOR_TOTAL_INVALIDO' : null, duplicatePrevious ? 'DUPLICADO_EM_IMPORTACAO_ANTERIOR' : null].filter(Boolean).join(',') || null;

function itemParams(importacaoId: string, row: ContabilLancamento, fleet: { id: string | null; match: ContabilFleetMatch }, status = row.despesaCompartilhadaStatus, actorId: string | null = null) {
  const decided = status === 'APROVADA' || status === 'DESCONSIDERADA';
  return [importacaoId, row.fingerprint, row.planilhaOriginal, row.linhaOriginal, JSON.stringify(row.dadosOriginais), row.controleOriginal, row.dataLancamento, row.dataConta, row.notaOriginal, row.codigoProdutoOriginal, row.produtoOriginal, row.tipoMovimentacaoOriginal, row.quantidade, row.valorUnitario, row.valorTotal, row.subcentroCodigoOriginal, row.subcentroOriginal, row.planoContasCodigoOriginal, row.planoContasOriginal, row.categoriaContabil, row.classificacao, fleet.id, fleet.match, pendingReason(row, fleet.match, false, false, status), status, decided ? actorId : null, decided ? new Date() : null];
}

type ContabilDecisionValue = { status: ContabilDespesaCompartilhadaStatus; frotaId?: string | null };
export async function importContabilidade(buffer: Buffer, arquivoNome: string, actor?: AuthenticatedRequestUser, decisions?: Map<number, ContabilDecisionValue>): Promise<ContabilImportResumo> {
  const hash = fileHash(buffer); const client = await pool.connect();
  try {
    const existing = await client.query<{ id: string }>('SELECT id FROM importacoes_contabeis WHERE hash_arquivo=$1', [hash]);
    if (existing.rows[0]) return getImportResumo(existing.rows[0].id, true, client);
    const rows = parseContabilidade(buffer, arquivoNome);
    if (rows.some(row => !row.dataConta || row.dataConta < CONTABILIDADE_INICIO_OPERACAO || row.valorTotalInvalido)) throw new ContabilidadeImportError(409, 'A importaÃ§Ã£o contÃ¡bil contÃ©m competÃªncia anterior a novembro de 2026, data ou valor invÃ¡lido.');
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>('INSERT INTO importacoes_contabeis(arquivo_nome,hash_arquivo,tamanho_bytes,criado_por) VALUES($1,$2,$3,$4) RETURNING id', [arquivoNome, hash, buffer.length, actor?.id ?? null]);
    const importacaoId = inserted.rows[0]!.id;
    for (const row of rows) {
      const fleet = await resolveFleet(client, row.subcentroOriginal, row.subcentroCodigoOriginal);
      const decision = decisions?.get(row.linhaOriginal); const destination = decision?.frotaId ? { id: decision.frotaId, match: 'MANUAL' as ContabilFleetMatch } : fleet;
      await client.query(`INSERT INTO lancamentos_contabeis(importacao_id,fingerprint,planilha_original,linha_original,dados_originais,controle_original,data_lancamento,data_conta,nota_original,codigo_produto_original,produto_original,tipo_movimentacao_original,quantidade,valor_unitario,valor_total,subcentro_codigo_original,subcentro_original,plano_contas_codigo_original,plano_contas_original,categoria_contabil,classificacao,frota_id,identificacao_frota,motivo_pendencia,despesa_compartilhada_status,decidido_por,decidido_em) VALUES (${Array.from({ length: 27 }, (_, index) => `$${index + 1}`).join(',')})`, itemParams(importacaoId, row, destination, decision?.status, actor?.id ?? null));
    }
    await recordAudit({ actor, acao: 'IMPORTAR', modulo: 'IMPORTACOES_CONTABEIS', entidade: 'importacoes_contabeis', entidadeId: importacaoId, dadosPosteriores: { id: importacaoId, arquivo_nome: arquivoNome, hash_arquivo: hash, total: rows.length } }, client);
    await client.query('COMMIT');
    return getImportResumo(importacaoId, false, client);
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); if ((error as { code?: string }).code === '23505') throw new ContabilidadeImportError(409, 'O arquivo ou algum lançamento já foi importado.'); throw error; } finally { client.release(); }
}

const money = (value: number): string => value.toFixed(2);
export async function analisarContabilidade(buffer: Buffer, arquivoNome: string): Promise<ContabilPreview> {
  const rows = parseContabilidade(buffer, arquivoNome);
  const hash = fileHash(buffer);
  const existing = await pool.query<{ id: string }>('SELECT id FROM importacoes_contabeis WHERE hash_arquivo=$1', [hash]);
  const existingFingerprints = new Set<string>((await pool.query<{ fingerprint: string }>('SELECT fingerprint FROM lancamentos_contabeis WHERE fingerprint = ANY($1::char(64)[])', [rows.map(row => row.fingerprint)])).rows.map(row => row.fingerprint));
  const duplicateKeys = new Set<string>();
  const categories: Record<ContabilClassification, number> = { PECAS_EXTERNAS: 0, SERVICOS_TERCEIRIZADOS: 0, PENDENTE: 0 };
  const fleetNames = new Set<string>();
  let duplicateCount = 0;
  let duplicateValue = 0;
  let outOfPeriod = 0;
  let outOfPeriodValue = 0;
  let eligible = 0;
  const items: ContabilPreviewItem[] = [];
  for (const row of rows) {
    const fleet = await resolveFleet(pool, row.subcentroOriginal, row.subcentroCodigoOriginal);
    const key = duplicateKey(row); const duplicate = duplicateKeys.has(key); duplicateKeys.add(key);
    const duplicatePrevious = existingFingerprints.has(row.fingerprint);
    const outsidePeriod = !row.dataConta || row.dataConta < CONTABILIDADE_INICIO_OPERACAO;
    if (duplicate || duplicatePrevious) { duplicateCount += 1; duplicateValue += row.valorTotal ?? 0; }
    if (outsidePeriod) { outOfPeriod += 1; outOfPeriodValue += row.valorTotal ?? 0; }
    if (fleet.id && row.subcentroOriginal) fleetNames.add(row.subcentroOriginal);
    categories[row.classificacao] += 1;
    const pending = pendingReason(row, fleet.match, duplicate, duplicatePrevious);
    if (!pending && row.valorTotal !== null && row.despesaCompartilhadaStatus === 'NAO_COMPARTILHADA') eligible += row.valorTotal;
    const previewItem = { linha_original: row.linhaOriginal, produto_original: row.produtoOriginal, subcentro_original: row.subcentroOriginal, classificacao: row.classificacao, frota: row.despesaCompartilhadaStatus === 'AGUARDANDO_DECISAO' ? null : row.subcentroOriginal, frota_destino: null, identificacao_frota: fleet.match, valor_total: row.valorTotal, data_conta: row.dataConta, motivo_pendencia: pending, duplicado_no_arquivo: duplicate, duplicado_em_importacao_anterior: duplicatePrevious, fora_periodo_autorizado: outsidePeriod, valor_total_invalido: row.valorTotalInvalido, bloqueios_decisao: [] as string[], despesa_compartilhada_status: row.despesaCompartilhadaStatus, combustivel_status: row.combustivelStatus };
    previewItem.bloqueios_decisao = manualDecisionBlockReasons(previewItem);
    items.push(previewItem);
  }
  const token = createHash('sha256').update(`${hash}:${Date.now()}:${Math.random()}`).digest('hex');
  const dates = rows.map(row => row.dataConta).filter((value): value is string => Boolean(value)).sort();
  const parsedHash = createHash('sha256').update(JSON.stringify(rows.map(row => row.fingerprint))).digest('hex');
  const sharedAwaiting = items.filter(item => item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length;
  const sharedApproved = items.filter(item => item.despesa_compartilhada_status === 'APROVADA').length;
  const sharedDisregarded = items.filter(item => item.despesa_compartilhada_status === 'DESCONSIDERADA').length;
  const sharedApprovedValue = items.filter(item => item.despesa_compartilhada_status === 'APROVADA').reduce((sum, item) => sum + (item.valor_total ?? 0), 0);
  const values = summarizeContabilPreviewItems(items);
  const blocked = contabilPreviewBlocksConfirmation(items, outOfPeriod, existing.rows.length > 0);
  const preview: ContabilPreview = { token, arquivo_nome: arquivoNome, hash_arquivo: hash, arquivo_ja_importado: existing.rows.length > 0, total: rows.length, periodo: { inicio: dates[0] ?? null, fim: dates.at(-1) ?? null }, periodo_operacional_inicio: CONTABILIDADE_INICIO_OPERACAO, frotas_identificadas: [...fleetNames], categorias: categories, duplicados: duplicateCount, valor_duplicado: money(duplicateValue), fora_periodo: outOfPeriod, valor_fora_periodo: money(outOfPeriodValue), inconsistencias: items.filter(item => item.motivo_pendencia !== null).length, pendentes: items.filter(item => item.motivo_pendencia !== null).length, valor_pendente_classificacao: money(values.valorPendenteClassificacao), valor_compartilhado_aguardando: money(values.valorCompartilhadoAguardando), valor_excluido_escopo: money(values.valorExcluidoEscopo), compartilhadas_aguardando: sharedAwaiting, compartilhadas_aprovadas: sharedApproved, compartilhadas_desconsideradas: sharedDisregarded, valor_compartilhado_aprovado: money(sharedApprovedValue), confirmacao_bloqueada: blocked, total_elegivel: money(eligible), itens: items, somente_leitura: true };
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

export async function decidirDespesaCompartilhada(token: string, linhaOriginal: number, decisao: ContabilDecision, frotaId?: string | null, actor?: AuthenticatedRequestUser): Promise<ContabilPreview> {
  if (!actor || !canDecideContabilSharedExpense(actor.role)) throw new ContabilidadeImportError(403, 'Somente administradores podem decidir despesas compartilhadas.');
  const stored = previews.get(token);
  if (!stored || stored.expiresAt <= Date.now()) throw new ContabilidadeImportError(404, 'Prévia contábil expirada ou não encontrada.');
  const item = stored.preview.itens.find(value => value.linha_original === linhaOriginal);
  if (!item || item.despesa_compartilhada_status === 'FORA_ESCOPO_COMBUSTIVEL') throw new ContabilidadeImportError(400, 'Item não é uma despesa compartilhada elegível para decisão.');
  const decisionBlocks = manualDecisionBlockReasons(item);
  if (decisionBlocks.length) throw new ContabilidadeImportError(409, `Decisão manual bloqueada: ${decisionBlocks.join(' ')}`);
  if (frotaId) { const fleet = await pool.query('SELECT 1 FROM frotas WHERE id=$1 AND status=\'ATIVO\'', [frotaId]); if (!fleet.rows[0]) throw new ContabilidadeImportError(400, 'A frota informada não existe ou está inativa.'); }
  item.despesa_compartilhada_status = applyContabilSharedDecision(decisao);
  item.frota_destino = decisao === 'APROVAR' && frotaId ? frotaId : null;
  item.motivo_pendencia = item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? 'DESPESA_COMPARTILHADA_AGUARDANDO_DECISAO' : null;
  const pending = stored.preview.itens.filter(value => value.motivo_pendencia !== null || value.combustivel_status === 'AMBIGUO' || value.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length;
  const sharedApproved = stored.preview.itens.filter(value => value.despesa_compartilhada_status === 'APROVADA');
  stored.preview.compartilhadas_aguardando = stored.preview.itens.filter(value => value.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').length;
  stored.preview.compartilhadas_aprovadas = sharedApproved.length;
  stored.preview.compartilhadas_desconsideradas = stored.preview.itens.filter(value => value.despesa_compartilhada_status === 'DESCONSIDERADA').length;
  stored.preview.valor_compartilhado_aprovado = money(sharedApproved.reduce((sum, value) => sum + (value.valor_total ?? 0), 0));
  stored.preview.pendentes = pending;
  stored.preview.inconsistencias = pending;
  const values = summarizeContabilPreviewItems(stored.preview.itens);
  stored.preview.valor_pendente_classificacao = money(values.valorPendenteClassificacao);
  stored.preview.valor_compartilhado_aguardando = money(values.valorCompartilhadoAguardando);
  stored.preview.valor_excluido_escopo = money(values.valorExcluidoEscopo);
  stored.preview.confirmacao_bloqueada = contabilPreviewBlocksConfirmation(stored.preview.itens, stored.preview.fora_periodo, stored.preview.arquivo_ja_importado);
  stored.preview.total_elegivel = money(stored.preview.itens.filter(value => !value.motivo_pendencia && ['NAO_COMPARTILHADA', 'APROVADA'].includes(value.despesa_compartilhada_status)).reduce((sum, value) => sum + (value.valor_total ?? 0), 0));
  if (actor) await recordAudit({ actor, acao: 'EDITAR', modulo: 'IMPORTACOES_CONTABEIS', entidade: 'previa_contabil', entidadeId: token, dadosPosteriores: { linha_original: linhaOriginal, decisao: item.despesa_compartilhada_status } });
  return stored.preview;
}

async function confirmStoredPreview(stored: StoredPreview, actor?: AuthenticatedRequestUser): Promise<ContabilImportResumo> {
  if (fileHash(stored.buffer) !== stored.hash) throw new ContabilidadeImportError(409, 'A prévia não corresponde mais ao arquivo analisado.');
  const reparsed = parseContabilidade(stored.buffer, stored.arquivoNome);
  const reparsedHash = createHash('sha256').update(JSON.stringify(reparsed.map(row => row.fingerprint))).digest('hex');
  if (reparsed.length !== stored.preview.total || reparsedHash !== stored.parsedHash) {
    throw new ContabilidadeImportError(409, 'A prévia está inconsistente; analise o arquivo novamente.');
  }
  if (stored.preview.confirmacao_bloqueada) throw new ContabilidadeImportError(409, 'A confirmaÃ§Ã£o estÃ¡ bloqueada por pendÃªncias de competÃªncia, duplicidade ou valor invÃ¡lido.');
  const decisions = new Map(stored.preview.itens.filter(item => item.despesa_compartilhada_status === 'APROVADA' || item.despesa_compartilhada_status === 'DESCONSIDERADA').map(item => [item.linha_original, { status: item.despesa_compartilhada_status, frotaId: item.frota_destino }] as [number, ContabilDecisionValue]));
  const result = await importContabilidade(stored.buffer, stored.arquivoNome, actor, decisions);
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
