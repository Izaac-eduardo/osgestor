import { createHash } from 'node:crypto';
import { pool } from '../config/database.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { parseContabilidade, normalizeSubcentro, CONTABILIDADE_INICIO_OPERACAO, type ContabilClassification, type ContabilLancamento, type ContabilFleetMatch } from '../imports/contabilidade.js';
import { recordAudit } from './audit.service.js';

export class ContabilidadeImportError extends Error { constructor(public readonly statusCode: 400 | 404 | 409, message: string) { super(message); } }
export interface ContabilImportResumo { id: string; arquivo_nome: string; hash_arquivo: string; total: number; classificados: number; pendentes: number; pendentes_classificacao: number; pendentes_frota: number; reimportada: boolean; }
export interface ContabilPreviewItem { linha_original: number; produto_original: string | null; classificacao: ContabilClassification; frota: string | null; identificacao_frota: ContabilFleetMatch; valor_total: number | null; data_conta: string | null; motivo_pendencia: string | null; duplicado_no_arquivo: boolean; duplicado_em_importacao_anterior: boolean; fora_periodo_autorizado: boolean; valor_total_invalido: boolean; }
export interface ContabilPreview { token: string; arquivo_nome: string; hash_arquivo: string; arquivo_ja_importado: boolean; total: number; periodo: { inicio: string | null; fim: string | null }; periodo_operacional_inicio: string; frotas_identificadas: string[]; categorias: Record<ContabilClassification, number>; duplicados: number; valor_duplicado: string; fora_periodo: number; valor_fora_periodo: string; inconsistencias: number; pendentes: number; confirmacao_bloqueada: boolean; total_elegivel: string; itens: ContabilPreviewItem[]; somente_leitura: true; }

type FleetRef = { id: string; codigo: string };
type AliasRef = { frota_id: string; identificador_normalizado: string };
const fileHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
type StoredPreview = { token: string; buffer: Buffer; arquivoNome: string; hash: string; parsedHash: string; preview: ContabilPreview; expiresAt: number; result?: ContabilImportResumo };
const previews = new Map<string, StoredPreview>();
const confirmationsInFlight = new Map<string, Promise<ContabilImportResumo>>();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

async function resolveFleet(client: { query: typeof pool.query }, subcentro: string | null, code: string | null): Promise<{ id: string | null; match: ContabilFleetMatch }> {
  const normalized = normalizeSubcentro(subcentro);
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

const pendingReason = (row: ContabilLancamento, match: ContabilFleetMatch, duplicate: boolean, duplicatePrevious: boolean): string | null => [row.classificacao === 'PENDENTE' ? 'CLASSIFICACAO_NAO_MAPEADA' : null, match === 'PENDENTE' ? 'FROTA_NAO_IDENTIFICADA' : null, !row.dataConta ? 'DATA_CONTA_NAO_INFORMADA' : row.dataConta < CONTABILIDADE_INICIO_OPERACAO ? 'COMPETENCIA_ANTERIOR_A_NOVEMBRO_2026' : null, row.valorTotalInvalido ? 'VALOR_TOTAL_INVALIDO' : null, duplicate ? 'DUPLICADO_NO_ARQUIVO' : null, duplicatePrevious ? 'DUPLICADO_EM_IMPORTACAO_ANTERIOR' : null].filter(Boolean).join(',') || null;

function itemParams(importacaoId: string, row: ContabilLancamento, fleet: { id: string | null; match: ContabilFleetMatch }) {
  return [importacaoId, row.fingerprint, row.planilhaOriginal, row.linhaOriginal, JSON.stringify(row.dadosOriginais), row.controleOriginal, row.dataLancamento, row.dataConta, row.notaOriginal, row.codigoProdutoOriginal, row.produtoOriginal, row.tipoMovimentacaoOriginal, row.quantidade, row.valorUnitario, row.valorTotal, row.subcentroCodigoOriginal, row.subcentroOriginal, row.planoContasCodigoOriginal, row.planoContasOriginal, row.categoriaContabil, row.classificacao, fleet.id, fleet.match, pendingReason(row, fleet.match, false, false)];
}

export async function importContabilidade(buffer: Buffer, arquivoNome: string, actor?: AuthenticatedRequestUser): Promise<ContabilImportResumo> {
  const hash = fileHash(buffer); const client = await pool.connect();
  try {
    const existing = await client.query<{ id: string }>('SELECT id FROM importacoes_contabeis WHERE hash_arquivo=$1', [hash]);
    if (existing.rows[0]) return getImportResumo(existing.rows[0].id, true, client);
    const rows = parseContabilidade(buffer, arquivoNome);
    const fingerprints = new Set<string>();
    const duplicate = rows.some(row => { if (fingerprints.has(row.fingerprint)) return true; fingerprints.add(row.fingerprint); return false; });
    if (rows.some(row => !row.dataConta || row.dataConta < CONTABILIDADE_INICIO_OPERACAO || row.valorTotalInvalido) || duplicate) throw new ContabilidadeImportError(409, 'A importaÃ§Ã£o contÃ¡bil contÃ©m competÃªncia anterior a novembro de 2026, data/valor invÃ¡lido ou duplicidade.');
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>('INSERT INTO importacoes_contabeis(arquivo_nome,hash_arquivo,tamanho_bytes,criado_por) VALUES($1,$2,$3,$4) RETURNING id', [arquivoNome, hash, buffer.length, actor?.id ?? null]);
    const importacaoId = inserted.rows[0]!.id;
    for (const row of rows) {
      const fleet = await resolveFleet(client, row.subcentroOriginal, row.subcentroCodigoOriginal);
      await client.query(`INSERT INTO lancamentos_contabeis(importacao_id,fingerprint,planilha_original,linha_original,dados_originais,controle_original,data_lancamento,data_conta,nota_original,codigo_produto_original,produto_original,tipo_movimentacao_original,quantidade,valor_unitario,valor_total,subcentro_codigo_original,subcentro_original,plano_contas_codigo_original,plano_contas_original,categoria_contabil,classificacao,frota_id,identificacao_frota,motivo_pendencia) VALUES (${Array.from({ length: 24 }, (_, index) => `$${index + 1}`).join(',')})`, itemParams(importacaoId, row, fleet));
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
  const fingerprints = new Set<string>();
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
    const duplicate = fingerprints.has(row.fingerprint); fingerprints.add(row.fingerprint);
    const duplicatePrevious = existingFingerprints.has(row.fingerprint);
    const outsidePeriod = !row.dataConta || row.dataConta < CONTABILIDADE_INICIO_OPERACAO;
    if (duplicate || duplicatePrevious) { duplicateCount += 1; duplicateValue += row.valorTotal ?? 0; }
    if (outsidePeriod) { outOfPeriod += 1; outOfPeriodValue += row.valorTotal ?? 0; }
    if (fleet.id && row.subcentroOriginal) fleetNames.add(row.subcentroOriginal);
    categories[row.classificacao] += 1;
    const pending = pendingReason(row, fleet.match, duplicate, duplicatePrevious);
    if (!pending && row.valorTotal !== null) eligible += row.valorTotal;
    items.push({ linha_original: row.linhaOriginal, produto_original: row.produtoOriginal, classificacao: row.classificacao, frota: row.subcentroOriginal, identificacao_frota: fleet.match, valor_total: row.valorTotal, data_conta: row.dataConta, motivo_pendencia: pending, duplicado_no_arquivo: duplicate, duplicado_em_importacao_anterior: duplicatePrevious, fora_periodo_autorizado: outsidePeriod, valor_total_invalido: row.valorTotalInvalido });
  }
  const token = createHash('sha256').update(`${hash}:${Date.now()}:${Math.random()}`).digest('hex');
  const dates = rows.map(row => row.dataConta).filter((value): value is string => Boolean(value)).sort();
  const parsedHash = createHash('sha256').update(JSON.stringify(rows.map(row => row.fingerprint))).digest('hex');
  const blocked = duplicateCount > 0 || outOfPeriod > 0 || items.some(item => item.valor_total_invalido);
  const preview: ContabilPreview = { token, arquivo_nome: arquivoNome, hash_arquivo: hash, arquivo_ja_importado: existing.rows.length > 0, total: rows.length, periodo: { inicio: dates[0] ?? null, fim: dates.at(-1) ?? null }, periodo_operacional_inicio: CONTABILIDADE_INICIO_OPERACAO, frotas_identificadas: [...fleetNames], categorias: categories, duplicados: duplicateCount, valor_duplicado: money(duplicateValue), fora_periodo: outOfPeriod, valor_fora_periodo: money(outOfPeriodValue), inconsistencias: items.filter(item => item.motivo_pendencia !== null).length, pendentes: items.filter(item => item.motivo_pendencia !== null).length, confirmacao_bloqueada: blocked, total_elegivel: money(eligible), itens: items, somente_leitura: true };
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

async function confirmStoredPreview(stored: StoredPreview, actor?: AuthenticatedRequestUser): Promise<ContabilImportResumo> {
  if (fileHash(stored.buffer) !== stored.hash) throw new ContabilidadeImportError(409, 'A prévia não corresponde mais ao arquivo analisado.');
  const reparsed = parseContabilidade(stored.buffer, stored.arquivoNome);
  const reparsedHash = createHash('sha256').update(JSON.stringify(reparsed.map(row => row.fingerprint))).digest('hex');
  if (reparsed.length !== stored.preview.total || reparsedHash !== stored.parsedHash) {
    throw new ContabilidadeImportError(409, 'A prévia está inconsistente; analise o arquivo novamente.');
  }
  if (stored.preview.confirmacao_bloqueada) throw new ContabilidadeImportError(409, 'A confirmaÃ§Ã£o estÃ¡ bloqueada por pendÃªncias de competÃªncia, duplicidade ou valor invÃ¡lido.');
  const result = await importContabilidade(stored.buffer, stored.arquivoNome, actor);
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
