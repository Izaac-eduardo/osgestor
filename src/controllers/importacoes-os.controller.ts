import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { addPending, importedServiceOrigin, matchPreview, parsePoliOs, refreshServiceClassificationPending, resolveManualStatus, validateServiceClassificationsForConfirmation, type ParsedOs } from '../imports/poli-os.js';
import { pool } from '../config/database.js';
import { resolveLancadorFuncionarioId } from '../services/lancadores-os.service.js';
import { ordemServicoStatuses } from '../services/ordens-servico.service.js';
import { SynchronizationConflictError, synchronizeOrder } from '../services/sincronizacao-os.service.js';
import { isClassificacaoServico } from '../types/servicos-os.js';
import { buildPoliImport, type PoliImport } from '../imports/poli-canonical.js';
import { recordAudit } from '../services/audit.service.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { buildOsUpdateDiff, loadExistingOs } from '../services/sincronizacao-os.service.js';
import { NaturezaConfirmacaoError, registerNaturezaConfirmation, revokeNaturezaConfirmation } from '../services/natureza-confirmacoes.service.js';
import { persistManualResolutions, recoverManualResolutions } from '../services/importacoes-os-resolucoes.service.js';

const tokenOf = (request: Request) => typeof request.params.token === 'string' ? request.params.token : '';
const notFoundMessage = 'Prévia expirada ou não encontrada.';
const upload = (request: Request): Buffer => {
  const file = (request as Request & { file?: { buffer: Buffer; originalname: string; size: number } }).file;
  if (file) return file.buffer;
  const value = request.body?.contentBase64;
  if (typeof value !== 'string' || value.length > 20_000_000) throw new Error('Envie um arquivo XLS/XLSX válido.');
  return Buffer.from(value, 'base64');
};

async function removeExpired(): Promise<void> {
  await pool.query('DELETE FROM importacoes_os WHERE expires_at <= now()');
}
async function loadPreview(token: string): Promise<ParsedOs[] | undefined> {
  await removeExpired();
  const result = await pool.query<{ payload_json: ParsedOs }>(
    `SELECT i.payload_json FROM importacoes_os_itens i JOIN importacoes_os x ON x.id=i.importacao_id
     WHERE x.id=$1 AND x.status='ATIVA' AND x.expires_at > now() ORDER BY i.numero_os`, [token]);
  return result.rows.length ? result.rows.map(row => row.payload_json) : undefined;
}
export async function loadPreviewItem(token: string, numeroOs: number): Promise<ParsedOs | undefined> {
  const items = await loadPreview(token);
  return items?.find(item => item.numeroOs === numeroOs);
}
async function savePreview(token: string, metadata: PoliImport, items: ParsedOs[], actor?: AuthenticatedRequestUser | null, recoveredResolutions = 0): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO importacoes_os(id,arquivo_nome,origem_sistema,hash_arquivo,tamanho_arquivo,tipo_importacao,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now()+interval '24 hours')", [token, metadata.arquivoNome, metadata.origemSistema, metadata.hashArquivo, metadata.tamanhoArquivo, metadata.tipoImportacao]);
    for (const item of items) await client.query(
      'INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES ($1,$2,$3,$4,$5)',
      [token, item.numeroOs, JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias)],
    );
    await recordAudit({
      actor,
      acao: 'EDITAR',
      modulo: 'IMPORTACOES_OS',
      entidade: 'importacoes_os',
      entidadeId: token,
      dadosPosteriores: {
        id: token,
        arquivo_nome: metadata.arquivoNome,
        origem_sistema: metadata.origemSistema,
        hash_arquivo: metadata.hashArquivo,
        tamanho_arquivo: metadata.tamanhoArquivo,
        tipo_importacao: metadata.tipoImportacao,
        total_itens: items.length,
      },
      metadata: { operacao: 'PREVIA_GERADA', resultado: 'SUCESSO', resolucoes_manuais_reutilizadas: recoveredResolutions },
    }, client);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function saveItem(token: string, item: ParsedOs): Promise<boolean> {
  const result = await pool.query(
    `UPDATE importacoes_os_itens i SET payload_json=$1,status_preview=$2,pendencias_json=$3,updated_at=now()
     FROM importacoes_os x WHERE i.importacao_id=x.id AND x.id=$4 AND x.status='ATIVA' AND x.expires_at > now() AND i.numero_os=$5`,
    [JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias), token, item.numeroOs],
  );
  return Boolean(result.rowCount);
}
async function refreshNaturezaPreview(token: string, numeroOs: number): Promise<void> {
  const item = await loadPreviewItem(token, numeroOs);
  if (!item) return;
  const refreshed = (await matchPreview([item], { origemSistema: 'POLI' })).find(value => value.numeroOs === numeroOs);
  if (refreshed) await saveItem(token, refreshed);
}

export async function analyze(request: Request, response: Response): Promise<void> {
  try {
    const filename = String((request as Request & { file?: { originalname: string } }).file?.originalname ?? request.body?.filename ?? 'upload.xls');
    const extension = path.extname(filename).toLowerCase();
    if (extension !== '.xls' && extension !== '.xlsx') { response.status(400).json({ message: 'Apenas arquivos .xls ou .xlsx são aceitos.' }); return; }
    const buffer = upload(request);
    const metadata = buildPoliImport(buffer, filename, 'DIARIA', 'POLI');
    const token = randomUUID();
    const items = await matchPreview(parsePoliOs(buffer, filename, metadata), { origemSistema: metadata.origemSistema });
    const recoveredResolutions = await recoverManualResolutions(items, metadata, token);
    for (const item of items) item.importacaoId = token;
    await savePreview(token, metadata, items, request.authUser, recoveredResolutions);
    response.status(200).json({ token, filename, total: items.length, counts: { prontas: items.filter(x=>x.statusPreview==='PRONTA').length, revisao: items.filter(x=>x.statusPreview==='REQUER_REVISAO').length, jaCadastradas: items.filter(x=>x.statusPreview==='JA_CADASTRADA').length }, items });
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : 'Não foi possível analisar o arquivo.' }); }
}
export async function getPreview(request: Request, response: Response): Promise<void> {
  const items = await loadPreview(tokenOf(request));
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  response.json({ token: request.params.token, items });
}

export async function confirmNatureza(request: Request, response: Response): Promise<void> {
  try {
    const token = tokenOf(request);
    const numeroOs = Number(request.params.numeroOs);
    if (!token || !Number.isInteger(numeroOs) || !request.authUser) { response.status(400).json({ message: 'Prévia, O.S. ou autenticação inválida.' }); return; }
    const item = await loadPreviewItem(token, numeroOs);
    if (!item) { response.status(404).json({ message: notFoundMessage }); return; }
    const existing = await loadExistingOs(numeroOs);
    if (!existing) { response.status(404).json({ message: 'O.S. não encontrada.' }); return; }
    const diff = buildOsUpdateDiff(item, existing);
    if (!diff.divergencias.includes('NATUREZA_SEM_EVIDENCIA_FORTE')) { response.status(409).json({ message: 'A divergência de natureza não está mais presente.' }); return; }
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const motivo = typeof body.motivo === 'string' ? body.motivo : undefined;
    const result = await registerNaturezaConfirmation(item, request.authUser, motivo);
    await refreshNaturezaPreview(token, numeroOs);
    response.status(result.reutilizada ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof NaturezaConfirmacaoError) { response.status(error.statusCode).json({ message: error.message }); return; }
    response.status(409).json({ message: error instanceof Error ? error.message : 'Não foi possível confirmar a natureza.' });
  }
}

export async function revokeNatureza(request: Request, response: Response): Promise<void> {
  try {
    if (!request.authUser) { response.status(401).json({ message: 'Autenticação necessária.' }); return; }
    const id = typeof request.params.id === 'string' ? request.params.id : '';
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const motivo = typeof body.motivo === 'string' ? body.motivo : undefined;
    await revokeNaturezaConfirmation(id, request.authUser, motivo);
    const previewToken = typeof body.previewToken === 'string' ? body.previewToken : '';
    if (previewToken) {
      const items = await loadPreview(previewToken);
      const item = items?.find(value => value.confirmacaoNatureza?.id === id);
      if (item) await refreshNaturezaPreview(previewToken, item.numeroOs);
    }
    response.status(204).send();
  } catch (error) {
    if (error instanceof NaturezaConfirmacaoError) { response.status(error.statusCode).json({ message: error.message }); return; }
    response.status(409).json({ message: error instanceof Error ? error.message : 'Não foi possível revogar a confirmação.' });
  }
}
export async function resolve(request: Request, response: Response): Promise<void> {
  const items = await loadPreview(tokenOf(request));
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  const item = items.find(x => x.numeroOs === Number(request.params.numeroOs));
  if (!item) { response.status(404).json({ message: 'O.S. não encontrada na prévia.' }); return; }
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if ('servicoIndex' in body || 'classificacao_servico' in body) {
    const before = resolutionSnapshot(item);
    const serviceIndex = (body as Record<string, unknown>).servicoIndex;
    const classification = (body as Record<string, unknown>).classificacao_servico;
    if (!Number.isInteger(serviceIndex) || Number(serviceIndex) < 0 || !isClassificacaoServico(classification)) {
      response.status(400).json({ message: 'Serviço e classificação inválidos.' });
      return;
    }
    const service = item.itens[Number(serviceIndex)];
    if (!service || service.tipo !== 'SERVICO') {
      response.status(400).json({ message: 'Serviço não encontrado na prévia.' });
      return;
    }
    service.classificacao_servico = classification;
    service.classificacao_origem = importedServiceOrigin(service);
    item.pendencias = item.pendencias.filter(value => !value.startsWith('CLASSIFICACAO_SERVICO_PENDENTE'));
    refreshServiceClassificationPending(item.pendencias, item.itens);
    item.statusPreview = item.pendencias.length ? 'REQUER_REVISAO' : 'PRONTA';
    if (!await saveResolvedItem(tokenOf(request), item, before, request.authUser)) { response.status(404).json({ message: notFoundMessage }); return; }
    response.json(item);
    return;
  }
  if (body.status !== undefined && !ordemServicoStatuses.includes(body.status as typeof ordemServicoStatuses[number])) { response.status(400).json({ message: 'status inválido.' }); return; }
  const statusPending = item.pendencias.some(value => value.startsWith('STATUS_PENDENTE'));
  const obraPending = item.pendencias.some(value => value.startsWith('OBRA_PENDENTE') || value.startsWith('OBRA_AMBIGUA'));
  const fleetPending = item.pendencias.some(value => value.startsWith('FROTA_PENDENTE'));
  const bodyRecord = body as Record<string, unknown>;
  const requestedFleet = bodyRecord.frotaId !== undefined;
  const requestedObra = bodyRecord.obraId !== undefined;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const selectedFleet = bodyRecord.frotaId;
  const selectedObra = bodyRecord.obraId;
  const decision = bodyRecord.decisao;
  const approvedDecision = typeof decision === 'string' && ['APROVAR', 'APROVADA', 'APROVAR CANDIDATO'].includes(decision.trim().toUpperCase());
  if ((requestedFleet || requestedObra) && decision !== undefined && !approvedDecision) { response.status(409).json({ message: 'A resolução manual exige uma decisão aprovada.' }); return; }
  if (requestedFleet && (!fleetPending || typeof selectedFleet !== 'string' || !uuidPattern.test(selectedFleet))) { response.status(409).json({ message: 'A resolucao de frota exige uma pendencia de frota e um UUID valido.' }); return; }
  if (requestedObra && (!obraPending || typeof selectedObra !== 'string' || !uuidPattern.test(selectedObra))) { response.status(409).json({ message: 'A resolucao de obra exige uma pendencia de obra e um UUID valido.' }); return; }
  if (requestedFleet && !(await pool.query('SELECT 1 FROM frotas WHERE id=$1 AND status=\'ATIVO\'', [selectedFleet])).rowCount) { response.status(409).json({ message: 'A frota selecionada nao existe ou nao esta ativa.' }); return; }
  if (requestedObra && !(await pool.query('SELECT 1 FROM obras WHERE id=$1 AND status=\'ATIVA\'', [selectedObra])).rowCount) { response.status(409).json({ message: 'A obra selecionada nao existe ou nao esta ativa.' }); return; }
  const before = resolutionSnapshot(item);
  if (body.status !== undefined && !statusPending) { response.status(409).json({ message: 'Somente uma pendencia de status pode ser resolvida manualmente.' }); return; }
  for (const field of ['obraId', 'frotaId', 'natureza', 'prestadorTerceiro', 'problema'] as const) if (body[field] !== undefined) (item as unknown as Record<string, unknown>)[field] = body[field];
  const manualResolucoes = [...(item.manualResolucoes ?? [])];
  const decidedEm = new Date().toISOString();
  const decididoPor = request.authUser?.id ?? null;
  if (requestedFleet) manualResolucoes.push({ campo: 'frotaId', valorOrigem: item.frotaId ?? null, identificadorOriginal: item.frotaOriginal, valorSelecionado: selectedFleet as string, arquivoOrigem: item.origem, importacaoId: tokenOf(request), numeroOs: item.numeroOs, decisao: 'APROVAR', decididoEm: decidedEm, decididoPor });
  if (requestedObra) manualResolucoes.push({ campo: 'obraId', valorOrigem: item.obraId ?? null, identificadorOriginal: item.parecerOriginal, valorSelecionado: selectedObra as string, arquivoOrigem: item.origem, importacaoId: tokenOf(request), numeroOs: item.numeroOs, decisao: 'APROVAR', decididoEm: decidedEm, decididoPor });
  item.manualResolucoes = manualResolucoes;
  if (body.status !== undefined) resolveManualStatus(item, body.status as string);
  item.pendencias = [];
  if (!item.obraId) addPending(item.pendencias, 'OBRA_PENDENTE');
  if (!item.frotaId) addPending(item.pendencias, 'FROTA_PENDENTE');
  if (!item.natureza) addPending(item.pendencias, 'NATUREZA_PENDENTE');
  if (!item.status) addPending(item.pendencias, 'STATUS_PENDENTE');
  if (!item.problema && !item.itens.length) addPending(item.pendencias, 'DADOS_INCOMPLETOS');
  item.statusPreview = item.pendencias.length ? 'REQUER_REVISAO' : 'PRONTA';
  try {
    if (!await saveResolvedItem(tokenOf(request), item, before, request.authUser)) { response.status(404).json({ message: notFoundMessage }); return; }
  } catch (error) {
    response.status(409).json({ message: error instanceof Error ? error.message : 'Não foi possível persistir a resolução.' });
    return;
  }
  response.json(item);
}

function resolutionSnapshot(item: ParsedOs): Record<string, unknown> {
  return {
    numero_os: item.numeroOs,
    obra_id: item.obraId ?? null,
    frota_id: item.frotaId ?? null,
    natureza: item.natureza ?? null,
    status: item.status ?? null,
    manual_resolucoes: item.manualResolucoes ?? [],
    prestador_terceiro: item.prestadorTerceiro ?? null,
    problema: item.problema ?? null,
    servicos: item.itens.filter(value => value.tipo === 'SERVICO').map((value, index) => ({
      indice: index,
      codigo_poli: value.codigo_poli ?? value.codigo ?? null,
      classificacao_servico: value.classificacao_servico ?? null,
    })),
  };
}

async function saveResolvedItem(
  token: string,
  item: ParsedOs,
  before: Record<string, unknown>,
  actor?: AuthenticatedRequestUser | null,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const importacao = (await client.query<{ arquivo_nome: string; origem_sistema: string; hash_arquivo: string; tipo_importacao: 'DIARIA' | 'CONSOLIDADA' }>(
      'SELECT arquivo_nome,origem_sistema,hash_arquivo,tipo_importacao FROM importacoes_os WHERE id=$1 AND status=\'ATIVA\' AND expires_at > now() FOR UPDATE', [token],
    )).rows[0];
    if (!importacao) { await client.query('ROLLBACK'); return false; }
    await persistManualResolutions(client, { arquivoNome: importacao.arquivo_nome, origemSistema: importacao.origem_sistema as 'POLI' | 'VEGA', hashArquivo: importacao.hash_arquivo, tamanhoArquivo: 0, tipoImportacao: importacao.tipo_importacao }, item, actor);
    const result = await client.query(
      `UPDATE importacoes_os_itens i SET payload_json=$1,status_preview=$2,pendencias_json=$3,updated_at=now()
       FROM importacoes_os x WHERE i.importacao_id=x.id AND x.id=$4 AND x.status='ATIVA' AND x.expires_at > now() AND i.numero_os=$5`,
      [JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias), token, item.numeroOs],
    );
    if (!result.rowCount) { await client.query('ROLLBACK'); return false; }
    await recordAudit({
      actor,
      acao: 'EDITAR',
      modulo: 'IMPORTACOES_OS',
      entidade: 'importacoes_os_itens',
      entidadeId: `${token}:${item.numeroOs}`,
      dadosAnteriores: before,
      dadosPosteriores: resolutionSnapshot(item),
      metadata: { operacao: 'RESOLUCAO_PENDENCIA', resultado: 'SUCESSO', importacao_id: token, numero_os: item.numeroOs, campos_allowlist: ['obra_id', 'frota_id', 'natureza', 'status', 'prestador_terceiro', 'problema', 'servicos.classificacao_servico'] },
    }, client);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function updateExisting(request: Request, response: Response): Promise<void> {
  const items = await loadPreview(tokenOf(request));
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  const item = items.find(x => x.numeroOs === Number(request.params.numeroOs));
  if (!item) { response.status(404).json({ message: 'O.S. não encontrada na prévia.' }); return; }
  try {
    const diff = await synchronizeOrder(item, request.authUser);
    item.statusPreview = 'SEM_ALTERACOES';
    item.diff = { ...diff, estado: 'SEM_ALTERACOES' };
    await saveItem(tokenOf(request), item);
    response.json({ numeroOs: item.numeroOs, estado: 'SEM_ALTERACOES', diff });
  } catch (error) { const code = error instanceof SynchronizationConflictError ? error.reason : 'FALHA'; response.status(409).json({ code, message: error instanceof Error ? error.message : 'Não foi possível atualizar a O.S.' }); }
}

export async function updateSafe(request: Request, response: Response): Promise<void> {
  const items = await loadPreview(tokenOf(request));
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  const result = { atualizadas: 0, jaEstavamAtualizadas: items.filter(x => x.statusPreview === 'SEM_ALTERACOES').length, conflitos: 0, falhas: 0, semAlteracoes: 0, revisao: 0 };
  for (const item of items.filter(x => x.statusPreview === 'ATUALIZACAO_DISPONIVEL' && x.diff?.podeAtualizarAutomaticamente)) {
    try { const diff = await synchronizeOrder(item, request.authUser); result.atualizadas++; item.statusPreview = 'SEM_ALTERACOES'; item.diff = { ...diff, estado: 'SEM_ALTERACOES' }; await saveItem(tokenOf(request), item); }
    catch (error) { if (error instanceof SynchronizationConflictError) result.conflitos++; else result.falhas++; }
  }
  result.semAlteracoes = items.filter(x => x.statusPreview === 'SEM_ALTERACOES').length;
  result.revisao = items.filter(x => x.statusPreview === 'REQUER_REVISAO').length;
  response.json(result);
}

export async function confirm(request: Request, response: Response): Promise<void> {
  const token = tokenOf(request), items = await loadPreview(token);
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  const selected = items.filter(x=>x.statusPreview==='PRONTA' || x.statusPreview==='NOVA');
  const invalid = selected.find(item => { try { validateServiceClassificationsForConfirmation(item.itens); return false; } catch { return true; } });
  if (invalid) { response.status(400).json({ message: `A O.S. ${invalid.numeroOs} possui serviço sem classificação resolvida.` }); return; }
  const result = { importadas: 0, jaCadastradas: items.filter(x=>x.statusPreview==='JA_CADASTRADA').length, pendentes: items.length-selected.length-items.filter(x=>x.statusPreview==='JA_CADASTRADA').length, falhas: [] as Array<{numeroOs:number;motivo:string}> };
  const client=await pool.connect();
  try {
    for (const item of selected) { try {
      if (!item.obraId || !item.frotaId || !item.natureza || !item.status) throw new Error('Dados obrigatórios ausentes na prévia.');
      await client.query('BEGIN');
      const importacao = (await client.query<{ arquivo_nome: string; origem_sistema: string; hash_arquivo: string }>(
        'SELECT arquivo_nome,origem_sistema,hash_arquivo FROM importacoes_os WHERE id=$1 FOR UPDATE', [token],
      )).rows[0];
      const frota=(await client.query<{prefixo_frota_id:string|null;numero:string|null}>('SELECT prefixo_frota_id,numero FROM frotas WHERE id=$1',[item.frotaId])).rows[0]!;
      if ((await client.query('SELECT 1 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs])).rowCount) { await client.query('ROLLBACK'); result.jaCadastradas++; continue; }
      const lancadorCodigo = item.funcionarioAberturaCodigo ?? item.funcionarioAbertura ?? null;
      const lancadorFuncionarioId = await resolveLancadorFuncionarioId(lancadorCodigo, client);
      const insertedOrder = await client.query<{ id: string }>('INSERT INTO ordens_servico (numero_os,obra_id,frota_id,prefixo_frota_id,frota_numero,natureza_os,categoria_servico,prestador_terceiro,lancador_codigo_original,lancador_nome_original,lancador_funcionario_id,data_abertura,status,status_original,status_origem,observacoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id',[item.numeroOs,item.obraId,item.frotaId,frota.prefixo_frota_id,frota.numero===null?null:Number(frota.numero),item.natureza,item.categoriaServico??null,item.natureza==='TERCEIRO'?item.prestadorTerceiro??null:null,lancadorCodigo?.trim()||null,item.funcionarioAberturaNome?.trim()||null,lancadorFuncionarioId,item.data||new Date().toISOString().slice(0,10),item.status,item.statusOriginal,item.statusOrigem,item.problema]);
      const serviceIdsByItemIndex = new Map<number, string>();
      const serviceIds: string[] = [];
      for(const [itemIndex, service] of item.itens.entries()) {
        if (service.tipo !== 'SERVICO') continue;
        const insertedService = await client.query<{ id: string }>(
          `INSERT INTO servicos_os (
             ordem_servico_id, descricao, valor, classificacao_servico, classificacao_origem,
             categoria_gerencial, subcategoria_gerencial, origem_classificacao,
             importacao_id, origem_linha, sequencia_importacao, codigo_poli, fingerprint_contexto, hash_conteudo
           ) SELECT id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
             FROM ordens_servico WHERE numero_os = $1 RETURNING id`,
          [item.numeroOs, service.descricao, service.total, service.classificacao_servico, importedServiceOrigin(service), service.categoria_gerencial ?? null, service.subcategoria_gerencial ?? null, service.origem_classificacao ?? 'CODIGO_NAO_MAPEADO', token, service.origemLinha ?? null, service.sequenciaImportacao ?? null, service.codigo_poli ?? service.codigo ?? null, service.fingerprintContexto ?? null, service.hashConteudo ?? null],
        );
        serviceIds.push(insertedService.rows[0]!.id);
        serviceIdsByItemIndex.set(itemIndex, insertedService.rows[0]!.id);
      }
      for(const product of item.itens.filter(x=>x.tipo==='PRODUTO')) await client.query('INSERT INTO produtos_os (ordem_servico_id,descricao,quantidade,unidade,valor_unitario,valor_total_original,categoria_gerencial,subcategoria_gerencial,origem_classificacao,importacao_id,origem_linha,sequencia_importacao,codigo_poli,fingerprint_contexto,hash_conteudo) SELECT id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs,product.descricao,product.quantidade,product.unidade,product.valorUnitario,product.total,product.categoria_gerencial ?? null,product.subcategoria_gerencial ?? null,product.origem_classificacao ?? 'CODIGO_NAO_MAPEADO',token,product.origemLinha ?? null,product.sequenciaImportacao ?? null,product.codigo_poli ?? product.codigo ?? null,product.fingerprintContexto ?? null,product.hashConteudo ?? null]);
      for(const execution of item.execucoes.filter(x=>x.funcionarioId)) await client.query('INSERT INTO ordens_servico_funcionarios (ordem_servico_id,funcionario_id) SELECT id,$2 FROM ordens_servico WHERE numero_os=$1 ON CONFLICT DO NOTHING',[item.numeroOs,execution.funcionarioId]);
      for(const execution of item.execucoes.filter(x=>x.funcionarioId)) await client.query(
        `INSERT INTO servicos_os_execucoes(ordem_servico_id,servico_os_id,funcionario_id,inicio,fim,importacao_id,origem_linha,sequencia_importacao,servico_sequencia_importacao,fingerprint_contexto,hash_conteudo)
         SELECT id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 FROM ordens_servico WHERE numero_os=$1`,
        [item.numeroOs, execution.serviceItemIndex === undefined
          ? (serviceIds.length === 1 ? serviceIds[0] : null)
          : serviceIdsByItemIndex.get(execution.serviceItemIndex) ?? null,
          execution.funcionarioId, execution.inicio, execution.fim, token, execution.origemLinha ?? null, execution.sequenciaImportacao ?? null, execution.servicoSequenciaImportacao ?? null, execution.fingerprintContexto ?? null, execution.hashConteudo ?? null],
      );
      await recordAudit({
        actor: request.authUser,
        acao: 'IMPORTAR',
        modulo: 'IMPORTACOES_OS',
        entidade: 'ordens_servico',
        entidadeId: insertedOrder.rows[0]!.id,
        dadosPosteriores: {
          id: insertedOrder.rows[0]!.id,
          numero_os: item.numeroOs,
          obra_id: item.obraId,
          frota_id: item.frotaId,
          natureza_os: item.natureza,
          categoria_servico: item.categoriaServico ?? null,
          status: item.status,
          observacoes: item.problema,
          servicos_count: item.itens.filter(value => value.tipo === 'SERVICO').length,
          produtos_count: item.itens.filter(value => value.tipo === 'PRODUTO').length,
          execucoes_count: item.execucoes.filter(value => value.funcionarioId).length,
        },
        metadata: {
          operacao: 'CRIACAO',
          resultado: 'SUCESSO',
          importacao_id: token,
          numero_os: item.numeroOs,
          origem_sistema: importacao?.origem_sistema ?? item.origem,
          arquivo_nome: importacao?.arquivo_nome ?? null,
          hash_arquivo: importacao?.hash_arquivo ?? null,
          origem_linha: item.itens.map(value => value.origemLinha).filter(value => value !== undefined),
          codigos_externos: item.itens.map(value => value.codigo_poli ?? value.codigo ?? null).filter(Boolean),
        },
      }, client);
      await client.query('COMMIT'); result.importadas++;
    } catch(error) { await client.query('ROLLBACK'); result.falhas.push({numeroOs:item.numeroOs,motivo:error instanceof Error?error.message:'Falha ao importar.'}); } }
    const loteConcluido = result.falhas.length === 0 && result.pendentes === 0;
    if (loteConcluido) {
      const finalizationClient = await pool.connect();
      try {
        await finalizationClient.query('BEGIN');
        await finalizationClient.query("UPDATE importacoes_os SET status='CONCLUIDA',updated_at=now() WHERE id=$1 AND status='ATIVA'", [token]);
        await recordAudit({
          actor: request.authUser,
          acao: 'EDITAR',
          modulo: 'IMPORTACOES_OS',
          entidade: 'importacoes_os',
          entidadeId: token,
          metadata: { operacao: 'LOTE_FINALIZADO', resultado: 'SUCESSO', importacao_id: token, importadas: result.importadas, ja_cadastradas: result.jaCadastradas },
        }, finalizationClient);
        await finalizationClient.query('DELETE FROM importacoes_os_itens WHERE importacao_id=$1', [token]);
        await finalizationClient.query('COMMIT');
      } catch (error) {
        await finalizationClient.query('ROLLBACK');
        throw error;
      } finally { finalizationClient.release(); }
    }
  } finally { client.release(); }
  response.json(result);
}
