import type { PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeFleetCode, normalizePlate } from '../utils/frotas.js';
import { parsePoliFrotaAbastecimentos, type PoliFrotaAbastecimentoNormalizado, type PoliFrotaProduto } from '../imports/polifrota.js';
import { pool } from '../config/database.js';

export type PreviewStatus = 'PRONTO' | 'PENDENTE_OBRA' | 'PENDENTE_DESTINATARIO' | 'FORA_ESCOPO' | 'JA_IMPORTADO' | 'ERRO' | 'IMPORTADO';
export type DestinatarioTipo = 'FROTA' | 'TERCEIRO' | 'EXTERNA' | 'ESPECIAL';
export interface ImportacaoContext { frotas: Array<{ id: string; codigo: string; placa: string | null; status: string }>; terceiroIdentificacoes?: Array<{ terceiro_id: string; identificacao_normalizada: string; status: string }>; produtoIds: Record<string, string>; especialId: string | null; importedIds: Set<string>; duplicateIds: Set<string> }
export interface PreviewResolution { obra_id: string | null; tipo_destinatario: DestinatarioTipo | null; frota_id: string | null; terceiro_id: string | null; destinacao_especial_id: string | null }
export interface PreviewItem extends PreviewResolution { id?: string; identificador_externo: string; data_hora: string | null; data_hora_original: string | null; placa_original: string | null; frota_original: string | null; litros: number | null; valor_total: number | null; km_hr: number | null; km_hr_status: string; horimetro: number | null; horimetro_status: string; bico_codigo_original: string | null; bico_descricao_original: string | null; frentista_original: string | null; linha_original: number; planilha_original: string; produto_detectado: PoliFrotaProduto; produto_id: string | null; identificacao_original: string; payload_original: Record<string, unknown>; status_preview: PreviewStatus; pendencias: { obra: boolean; destinatario: boolean; motivos: string[] } }

export class AbastecimentoImportError extends Error { constructor(public readonly statusCode: 400 | 404 | 409, message: string) { super(message); this.name = 'AbastecimentoImportError'; } }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown, field: string): string => { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AbastecimentoImportError(400, `${field} deve ser um UUID válido.`); return value; };
const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const resolutionOf = (item: PreviewItem): PreviewResolution => ({ obra_id: item.obra_id, tipo_destinatario: item.tipo_destinatario, frota_id: item.frota_id, terceiro_id: item.terceiro_id, destinacao_especial_id: item.destinacao_especial_id });

function resolveFleet(row: PoliFrotaAbastecimentoNormalizado, context: ImportacaoContext): { tipo: DestinatarioTipo | null; id: string | null; reason?: string } {
  const byCode = row.frotaNormalizada ? context.frotas.filter(frota => normalizeFleetCode(frota.codigo) === row.frotaNormalizada) : [];
  const byPlate = row.placaNormalizada ? context.frotas.filter(frota => frota.placa && normalizePlate(frota.placa) === row.placaNormalizada) : [];
  if (byCode.length && byPlate.length) {
    const same = byCode.filter(code => byPlate.some(plate => plate.id === code.id));
    if (same.length === 1) return { tipo: 'FROTA', id: same[0]!.id };
    return { tipo: null, id: null, reason: 'CONFLITO_FROTA_PLACA' };
  }
  const candidates = byCode.length ? byCode : byPlate;
  if (candidates.length === 1) return { tipo: 'FROTA', id: candidates[0]!.id };
  if (candidates.length > 1) return { tipo: null, id: null, reason: 'FROTA_AMBIGUA' };
  return { tipo: null, id: null, reason: row.frotaNormalizada || row.placaNormalizada ? 'DESTINATARIO_NAO_ENCONTRADO' : 'IDENTIFICACAO_AUSENTE' };
}

function resolveThirdParty(row: PoliFrotaAbastecimentoNormalizado, context: ImportacaoContext): { tipo: DestinatarioTipo | null; id: string | null; reason?: string } {
  const values = [row.frotaNormalizada, row.placaNormalizada].filter((value): value is string => Boolean(value));
  const matches = (context.terceiroIdentificacoes ?? []).filter(item => values.includes(item.identificacao_normalizada));
  const ids = [...new Set(matches.map(item => item.terceiro_id))];
  if (ids.length === 1) return { tipo: 'TERCEIRO', id: ids[0]! };
  if (ids.length > 1) return { tipo: null, id: null, reason: 'CONFLITO_TERCEIRO_IDENTIFICACAO' };
  return { tipo: null, id: null, reason: 'DESTINATARIO_NAO_ENCONTRADO' };
}

export function buildPreviewItem(row: PoliFrotaAbastecimentoNormalizado, context: ImportacaoContext): PreviewItem {
  const produtoId = context.produtoIds[row.produtoDetectado] ?? null;
  const motivos = row.diagnosticos.filter(item => item.nivel === 'ERRO').map(item => item.codigo);
  let tipo: DestinatarioTipo | null = null; let frotaId: string | null = null; let terceiroId: string | null = null; let especialId: string | null = null;
  const fleet = resolveFleet(row, context);
  if (fleet.tipo === 'FROTA' || fleet.reason === 'CONFLITO_FROTA_PLACA' || fleet.reason === 'FROTA_AMBIGUA') {
    tipo = fleet.tipo; frotaId = fleet.id; if (fleet.reason) motivos.push(fleet.reason);
  } else {
    const isPirulito = [row.placaNormalizada, row.frotaNormalizada].some(value => value === 'PIRULITO');
    if (isPirulito && context.especialId) { tipo = 'ESPECIAL'; especialId = context.especialId; }
    else { const third = resolveThirdParty(row, context); tipo = third.tipo; terceiroId = third.id; if (third.reason) motivos.push(third.reason); }
  }
  if (context.duplicateIds.has(row.identificadorExterno)) motivos.push('DUPLICIDADE_NO_ARQUIVO');
  const imported = context.importedIds.has(row.identificadorExterno);
  if (imported) motivos.push('JA_IMPORTADO');
  if (!produtoId && row.produtoDetectado === 'FORA_ESCOPO') motivos.push('PRODUTO_FORA_ESCOPO');
  if (!produtoId && row.produtoDetectado === 'DESCONHECIDO') motivos.push('PRODUTO_DESCONHECIDO');
  const obra = true;
  const destinatario = !tipo;
  if (obra) motivos.push('OBRA_PENDENTE');
  if (destinatario) motivos.push('DESTINATARIO_PENDENTE');
  const erro = motivos.some(reason => ['DATA_AUSENTE', 'DATA_INVALIDA', 'LITROS_AUSENTE', 'LITROS_INVALIDO', 'VALORTOTAL_AUSENTE', 'VALORTOTAL_INVALIDO', 'DUPLICIDADE_NO_ARQUIVO', 'PRODUTO_FORA_ESCOPO', 'PRODUTO_DESCONHECIDO'].includes(reason));
  const status: PreviewStatus = imported ? 'JA_IMPORTADO' : erro ? (row.produtoDetectado === 'FORA_ESCOPO' ? 'FORA_ESCOPO' : 'ERRO') : destinatario ? 'PENDENTE_DESTINATARIO' : 'PENDENTE_OBRA';
  return { identificador_externo: row.identificadorExterno, data_hora: row.dataHora, data_hora_original: row.dataHoraOriginal, placa_original: row.placaOriginal, frota_original: row.frotaOriginal, litros: row.litros, valor_total: row.valorTotal, km_hr: row.kmHr, km_hr_status: row.kmHrStatus, horimetro: row.horimetro, horimetro_status: row.horimetroStatus, bico_codigo_original: row.bicoCodigoOriginal, bico_descricao_original: row.bicoDescricaoOriginal, frentista_original: row.frentistaOriginal, linha_original: row.linhaOriginal, planilha_original: row.planilhaOriginal, produto_detectado: row.produtoDetectado, produto_id: produtoId, identificacao_original: row.frotaOriginal || row.placaOriginal || row.identificadorExterno, payload_original: row.payloadOriginal, status_preview: status, pendencias: { obra, destinatario, motivos: [...new Set(motivos)] }, obra_id: null, tipo_destinatario: tipo, frota_id: frotaId, terceiro_id: terceiroId, destinacao_especial_id: especialId };
}

async function importContext(): Promise<ImportacaoContext> {
  const [frotas, thirdPartyIdentifications, produtos, especial, imported] = await Promise.all([
    pool.query<{ id: string; codigo: string; placa: string | null; status: string }>("SELECT id,codigo,placa,status FROM frotas WHERE status='ATIVO'"),
    pool.query<{ terceiro_id: string; identificacao_normalizada: string; status: string }>("SELECT terceiro_id,identificacao_normalizada,status FROM abastecimento_terceiro_identificacoes WHERE status='ATIVO'"),
    pool.query<{ id: string; codigo: string }>("SELECT id,codigo FROM abastecimento_produtos WHERE status='ATIVO'"),
    pool.query<{ id: string }>("SELECT id FROM abastecimento_destinacoes_especiais WHERE status='ATIVO' AND codigo='PIRULITO'"),
    pool.query<{ identificador_externo: string }>("SELECT identificador_externo FROM abastecimentos WHERE origem_sistema='POLIFROTA'"),
  ]);
  return { frotas: frotas.rows, terceiroIdentificacoes: thirdPartyIdentifications.rows, produtoIds: Object.fromEntries(produtos.rows.map(item => [item.codigo, item.id])), especialId: especial.rows[0]?.id ?? null, importedIds: new Set(imported.rows.map(item => item.identificador_externo)), duplicateIds: new Set() };
}

const rowFromItem = (row: PreviewItem): Record<string, unknown> => ({ ...row, payload_normalizado: { ...row, resolucao: resolutionOf(row) } });
const itemFromDb = (row: Record<string, any>): PreviewItem => ({ ...(row.payload_normalizado as PreviewItem), id: row.id, status_preview: row.status_preview, pendencias: row.pendencias });
const counts = (items: PreviewItem[]) => ({ total: items.length, prontos: items.filter(item => item.status_preview === 'PRONTO').length, pendentesObra: items.filter(item => item.status_preview === 'PENDENTE_OBRA' && item.pendencias.destinatario === false).length, pendentesDestinatario: items.filter(item => item.status_preview === 'PENDENTE_DESTINATARIO' || item.pendencias.destinatario).length, foraEscopo: items.filter(item => item.status_preview === 'FORA_ESCOPO').length, erros: items.filter(item => item.status_preview === 'ERRO').length, jaImportados: items.filter(item => item.status_preview === 'JA_IMPORTADO').length, importados: items.filter(item => item.status_preview === 'IMPORTADO').length });

export async function analyzePoliFrota(buffer: Buffer, filename: string) {
  const rows = parsePoliFrotaAbastecimentos(buffer, filename); const ids = new Map<string, number>(); for (const row of rows) ids.set(row.identificadorExterno, (ids.get(row.identificadorExterno) ?? 0) + 1);
  const context = await importContext(); context.duplicateIds = new Set([...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  const items = rows.map(row => buildPreviewItem(row, context)); const client = await pool.connect(); const importId = randomUUID();
  try { await client.query('BEGIN'); await client.query("INSERT INTO abastecimento_importacoes(id,arquivo_nome,arquivo_sha256,origem_sistema,status,parser_versao) VALUES($1,$2,$3,'POLIFROTA','ANALISANDO',$4)", [importId, filename, hash(buffer), 'fase-6-polifrota-1']); for (const item of items) await client.query('INSERT INTO abastecimento_importacao_itens(importacao_id,identificador_externo,linha_original,planilha,payload_original,payload_normalizado,status_preview,pendencias) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [importId, item.identificador_externo, item.linha_original, item.planilha_original, item.payload_original, JSON.stringify(rowFromItem(item)), item.status_preview, JSON.stringify(item.pendencias)]); await client.query("UPDATE abastecimento_importacoes SET status='PREVIA' WHERE id=$1", [importId]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  const stored = await pool.query<{ id: string; identificador_externo: string }>('SELECT id,identificador_externo FROM abastecimento_importacao_itens WHERE importacao_id=$1 ORDER BY linha_original,id', [importId]);
  const itemIds = new Map(stored.rows.map(item => [item.identificador_externo, item.id]));
  return { id: importId, arquivo_nome: filename, arquivo_sha256: hash(buffer), status: 'PREVIA', counts: counts(items), items: items.map(item => ({ ...item, id: itemIds.get(item.identificador_externo) })) };
}

export async function getImportacao(id: string) { const importId = uuid(id, 'id'); const header = await pool.query('SELECT id,arquivo_nome,arquivo_sha256,origem_sistema,status,parser_versao,created_at,finalizada_at FROM abastecimento_importacoes WHERE id=$1', [importId]); if (!header.rows[0]) throw new AbastecimentoImportError(404, 'Importação não encontrada.'); const rows = await pool.query('SELECT id,status_preview,pendencias,payload_normalizado FROM abastecimento_importacao_itens WHERE importacao_id=$1 ORDER BY linha_original,id', [importId]); const items = rows.rows.map(itemFromDb); return { ...header.rows[0], counts: counts(items), items };
}

async function validateResolution(client: PoolClient, body: Record<string, unknown>, current: PreviewItem): Promise<PreviewResolution> {
  const type = body.tipo_destinatario === undefined ? current.tipo_destinatario : body.tipo_destinatario;
  if (type !== null && type !== 'FROTA' && type !== 'TERCEIRO' && type !== 'EXTERNA' && type !== 'ESPECIAL') throw new AbastecimentoImportError(400, 'tipo_destinatario inválido.');
  const obraId = body.obra_id === undefined ? current.obra_id : body.obra_id === null ? null : uuid(body.obra_id, 'obra_id');
  if (obraId && !(await client.query('SELECT 1 FROM obras WHERE id=$1', [obraId])).rowCount) throw new AbastecimentoImportError(404, 'Obra não encontrada.');
  const typeChanged = body.tipo_destinatario !== undefined && body.tipo_destinatario !== current.tipo_destinatario;
  const result: PreviewResolution = { obra_id: obraId, tipo_destinatario: type as DestinatarioTipo | null, frota_id: type === 'FROTA' ? (typeChanged ? null : current.frota_id) : null, terceiro_id: type === 'TERCEIRO' ? (typeChanged ? null : current.terceiro_id) : null, destinacao_especial_id: type === 'ESPECIAL' ? (typeChanged ? null : current.destinacao_especial_id) : null };
  if (type === 'FROTA' && body.frota_id !== undefined && body.frota_id !== null) { const id = uuid(body.frota_id, 'frota_id'); if (!(await client.query("SELECT 1 FROM frotas WHERE id=$1 AND status='ATIVO'", [id])).rowCount) throw new AbastecimentoImportError(404, 'Frota não encontrada ou inativa.'); result.frota_id = id; }
  if (type === 'TERCEIRO' && body.terceiro_id !== undefined && body.terceiro_id !== null) { const id = uuid(body.terceiro_id, 'terceiro_id'); if (!(await client.query("SELECT 1 FROM abastecimento_terceiros WHERE id=$1 AND status='ATIVO'", [id])).rowCount) throw new AbastecimentoImportError(404, 'Terceiro não encontrado ou inativo.'); result.terceiro_id = id; }
  if (type === 'ESPECIAL' && body.destinacao_especial_id !== undefined && body.destinacao_especial_id !== null) { const id = uuid(body.destinacao_especial_id, 'destinacao_especial_id'); if (!(await client.query("SELECT 1 FROM abastecimento_destinacoes_especiais WHERE id=$1 AND status='ATIVO'", [id])).rowCount) throw new AbastecimentoImportError(404, 'Destinação especial não encontrada ou inativa.'); result.destinacao_especial_id = id; }
  if (type === 'FROTA' && !result.frota_id) throw new AbastecimentoImportError(400, 'Selecione uma frota para o destinatário.');
  if (type === 'TERCEIRO' && !result.terceiro_id) throw new AbastecimentoImportError(400, 'Selecione um terceiro para o destinatário.');
  if (type === 'ESPECIAL' && !result.destinacao_especial_id) throw new AbastecimentoImportError(400, 'Selecione uma destinação especial para o destinatário.');
  if (!type && [body.frota_id, body.terceiro_id, body.destinacao_especial_id].some(value => value !== undefined && value !== null && value !== '')) throw new AbastecimentoImportError(400, 'Selecione um tipo de destinatário.');
  return result;
}
const recompute = (item: PreviewItem): PreviewItem => { const pendencias = { ...item.pendencias, obra: !item.obra_id, destinatario: !item.tipo_destinatario, motivos: item.pendencias.motivos.filter(m => !['OBRA_PENDENTE', 'DESTINATARIO_PENDENTE'].includes(m)) }; if (pendencias.obra) pendencias.motivos.push('OBRA_PENDENTE'); if (pendencias.destinatario) pendencias.motivos.push('DESTINATARIO_PENDENTE'); return { ...item, pendencias, status_preview: item.status_preview === 'JA_IMPORTADO' || item.status_preview === 'FORA_ESCOPO' || item.status_preview === 'ERRO' ? item.status_preview : pendencias.obra || pendencias.destinatario ? pendencias.obra ? 'PENDENTE_OBRA' : 'PENDENTE_DESTINATARIO' : 'PRONTO' }; };

export async function resolveItem(importId: string, itemId: string, body: unknown) { if (!isRecord(body)) throw new AbastecimentoImportError(400, 'Informe a resolução do item.'); const client = await pool.connect(); try { await client.query('BEGIN'); const result = await client.query('SELECT id,status_preview,pendencias,payload_normalizado FROM abastecimento_importacao_itens WHERE id=$1 AND importacao_id=$2 FOR UPDATE', [uuid(itemId, 'item_id'), uuid(importId, 'importacao_id')]); if (!result.rows[0]) throw new AbastecimentoImportError(404, 'Item de preview não encontrado.'); const item = itemFromDb(result.rows[0]); const resolution = await validateResolution(client, body, item); const next = recompute({ ...item, ...resolution }); await client.query('UPDATE abastecimento_importacao_itens SET payload_normalizado=$1,status_preview=$2,pendencias=$3 WHERE id=$4', [JSON.stringify(rowFromItem(next)), next.status_preview, JSON.stringify(next.pendencias), item.id]); await client.query('UPDATE abastecimento_importacoes SET status=CASE WHEN $2::int=0 THEN status ELSE \'PREVIA\' END WHERE id=$1', [importId, 1]); await client.query('COMMIT'); return next; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }

export async function resolveBatch(importId: string, body: unknown) { if (!isRecord(body) || !Array.isArray(body.item_ids) || !body.item_ids.length) throw new AbastecimentoImportError(400, 'Selecione ao menos um item.'); const results: PreviewItem[] = []; for (const itemId of body.item_ids) results.push(await resolveItem(importId, uuid(itemId, 'item_id'), body)); return results; }

export async function confirmImport(importId: string, body: unknown) { const id = uuid(importId, 'importacao_id'); const requested = isRecord(body) && Array.isArray(body.item_ids) ? body.item_ids.map(value => uuid(value, 'item_id')) : null; const rows = await pool.query('SELECT id,status_preview,pendencias,payload_normalizado,payload_original,identificador_externo,linha_original,planilha FROM abastecimento_importacao_itens WHERE importacao_id=$1 ORDER BY linha_original', [id]); const selected = rows.rows.filter(row => (!requested || requested.includes(row.id)) && row.status_preview === 'PRONTO'); const result = { importadas: 0, ja_importados: 0, pendentes: rows.rows.filter(row => row.status_preview !== 'PRONTO' && row.status_preview !== 'IMPORTADO').length, falhas: [] as Array<{ item_id: string; identificador_externo: string; motivo: string }> }; for (const row of selected) { const item = itemFromDb(row); const client = await pool.connect(); try { await client.query('BEGIN'); const existing = await client.query('SELECT 1 FROM abastecimentos WHERE origem_sistema=\'POLIFROTA\' AND identificador_externo=$1', [item.identificador_externo]); if (existing.rowCount) { await client.query("UPDATE abastecimento_importacao_itens SET status_preview='JA_IMPORTADO' WHERE id=$1", [row.id]); await client.query('COMMIT'); result.ja_importados++; continue; } if (!item.obra_id || !item.produto_id || !item.data_hora || !item.litros || item.valor_total === null || !item.tipo_destinatario) throw new Error('Dados obrigatórios ausentes no preview.'); await client.query('INSERT INTO abastecimentos(origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,terceiro_id,destinacao_especial_id,identificacao_original,placa_original,frota_original,litros,valor_total,km_hr,horimetro,bico_codigo_original,bico_descricao_original,frentista_original,arquivo_nome_original,planilha_original,linha_original,payload_original,importacao_id) VALUES(\'POLIFROTA\',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)', [item.identificador_externo, item.data_hora, item.produto_id, item.obra_id, item.tipo_destinatario, item.frota_id, item.terceiro_id, item.destinacao_especial_id, item.identificacao_original, item.placa_original, item.frota_original, item.litros, item.valor_total, item.km_hr, item.horimetro, item.bico_codigo_original, item.bico_descricao_original, item.frentista_original, (await pool.query<{arquivo_nome:string}>('SELECT arquivo_nome FROM abastecimento_importacoes WHERE id=$1',[id])).rows[0]?.arquivo_nome ?? 'upload', item.planilha_original, item.linha_original, item.payload_original, id]); await client.query("UPDATE abastecimento_importacao_itens SET status_preview='IMPORTADO' WHERE id=$1", [row.id]); await client.query('COMMIT'); result.importadas++; } catch (error) { await client.query('ROLLBACK'); result.falhas.push({ item_id: row.id, identificador_externo: item.identificador_externo, motivo: error instanceof Error ? error.message : 'Falha ao confirmar.' }); } finally { client.release(); } } const remaining = await pool.query<{ status_preview: PreviewStatus }>('SELECT status_preview FROM abastecimento_importacao_itens WHERE importacao_id=$1', [id]); const finished = remaining.rows.every(row => row.status_preview === 'IMPORTADO' || row.status_preview === 'JA_IMPORTADO'); await pool.query('UPDATE abastecimento_importacoes SET status=$2,finalizada_at=CASE WHEN $2=\'CONCLUIDA\' THEN now() ELSE finalizada_at END WHERE id=$1', [id, finished ? 'CONCLUIDA' : result.falhas.length && !result.importadas ? 'ERRO' : 'PREVIA']); return { ...result, status: finished ? 'CONCLUIDA' : 'PREVIA' }; }

export async function confirmImportSafe(importId: string, body: unknown) {
  const id = uuid(importId, 'importacao_id');
  const requested = isRecord(body) && Array.isArray(body.item_ids) ? body.item_ids.map(value => uuid(value, 'item_id')) : null;
  const header = await pool.query<{ arquivo_nome: string }>('SELECT arquivo_nome FROM abastecimento_importacoes WHERE id=$1', [id]);
  if (!header.rows[0]) throw new AbastecimentoImportError(404, 'Importação não encontrada.');
  const rows = await pool.query('SELECT id,status_preview,payload_normalizado,identificador_externo FROM abastecimento_importacao_itens WHERE importacao_id=$1 ORDER BY linha_original', [id]);
  const selected = rows.rows.filter(row => (!requested || requested.includes(row.id)) && row.status_preview === 'PRONTO');
  const result = { importadas: 0, ja_importados: 0, pendentes: rows.rows.filter(row => !['PRONTO', 'IMPORTADO', 'JA_IMPORTADO'].includes(row.status_preview)).length, falhas: [] as Array<{ item_id: string; identificador_externo: string; motivo: string }> };
  for (const row of selected) {
    const item = itemFromDb(row); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query("SELECT 1 FROM abastecimentos WHERE origem_sistema='POLIFROTA' AND identificador_externo=$1", [item.identificador_externo]);
      if (existing.rowCount) { await client.query("UPDATE abastecimento_importacao_itens SET status_preview='JA_IMPORTADO' WHERE id=$1", [row.id]); await client.query('COMMIT'); result.ja_importados++; continue; }
      if (!item.obra_id || !item.produto_id || !item.data_hora || item.litros === null || item.valor_total === null || !item.tipo_destinatario) throw new Error('Dados obrigatórios ausentes no preview.');
      await client.query('INSERT INTO abastecimentos(origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,terceiro_id,destinacao_especial_id,identificacao_original,placa_original,frota_original,litros,valor_total,km_hr,horimetro,bico_codigo_original,bico_descricao_original,frentista_original,arquivo_nome_original,planilha_original,linha_original,payload_original,importacao_id) VALUES(\'POLIFROTA\',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)', [item.identificador_externo, item.data_hora, item.produto_id, item.obra_id, item.tipo_destinatario, item.frota_id, item.terceiro_id, item.destinacao_especial_id, item.identificacao_original, item.placa_original, item.frota_original, item.litros, item.valor_total, item.km_hr, item.horimetro, item.bico_codigo_original, item.bico_descricao_original, item.frentista_original, header.rows[0].arquivo_nome, item.planilha_original, item.linha_original, item.payload_original, id]);
      await client.query("UPDATE abastecimento_importacao_itens SET status_preview='IMPORTADO' WHERE id=$1", [row.id]); await client.query('COMMIT'); result.importadas++;
    } catch (error) { await client.query('ROLLBACK'); result.falhas.push({ item_id: row.id, identificador_externo: item.identificador_externo, motivo: error instanceof Error ? error.message : 'Falha ao confirmar.' }); } finally { client.release(); }
  }
  const remaining = await pool.query<{ status_preview: PreviewStatus }>('SELECT status_preview FROM abastecimento_importacao_itens WHERE importacao_id=$1', [id]);
  const finished = remaining.rows.every(row => row.status_preview === 'IMPORTADO' || row.status_preview === 'JA_IMPORTADO');
  const status = finished ? 'CONCLUIDA' : result.falhas.length && !result.importadas ? 'ERRO' : 'PREVIA';
  await pool.query('UPDATE abastecimento_importacoes SET status=$2::varchar,finalizada_at=CASE WHEN $2::varchar=\'CONCLUIDA\' THEN now() ELSE finalizada_at END WHERE id=$1', [id, status]);
  return { ...result, status };
}

export { hash as sha256Arquivo };
