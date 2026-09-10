import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { addPending, parsePoliOs, matchPreview, type ParsedOs } from '../imports/poli-os.js';
import { pool } from '../config/database.js';
import { ordemServicoStatuses } from '../services/ordens-servico.service.js';

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
async function savePreview(token: string, filename: string, items: ParsedOs[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO importacoes_os(id,arquivo_nome,expires_at) VALUES ($1,$2,now()+interval '24 hours')", [token, filename]);
    for (const item of items) await client.query(
      'INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES ($1,$2,$3,$4,$5)',
      [token, item.numeroOs, JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias)],
    );
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

export async function analyze(request: Request, response: Response): Promise<void> {
  try {
    const filename = String((request as Request & { file?: { originalname: string } }).file?.originalname ?? request.body?.filename ?? 'upload.xls');
    const extension = path.extname(filename).toLowerCase();
    if (extension !== '.xls' && extension !== '.xlsx') { response.status(400).json({ message: 'Apenas arquivos .xls ou .xlsx são aceitos.' }); return; }
    const items = await matchPreview(parsePoliOs(upload(request), filename));
    const token = randomUUID();
    await savePreview(token, filename, items);
    response.status(200).json({ token, filename, total: items.length, counts: { prontas: items.filter(x=>x.statusPreview==='PRONTA').length, revisao: items.filter(x=>x.statusPreview==='REQUER_REVISAO').length, jaCadastradas: items.filter(x=>x.statusPreview==='JA_CADASTRADA').length }, items });
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : 'Não foi possível analisar o arquivo.' }); }
}
export async function getPreview(request: Request, response: Response): Promise<void> {
  const items = await loadPreview(tokenOf(request));
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  response.json({ token: request.params.token, items });
}
export async function resolve(request: Request, response: Response): Promise<void> {
  const items = await loadPreview(tokenOf(request));
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  const item = items.find(x => x.numeroOs === Number(request.params.numeroOs));
  if (!item) { response.status(404).json({ message: 'O.S. não encontrada na prévia.' }); return; }
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (body.status !== undefined && !ordemServicoStatuses.includes(body.status as typeof ordemServicoStatuses[number])) { response.status(400).json({ message: 'status inválido.' }); return; }
  for (const field of ['obraId', 'frotaId', 'natureza', 'status', 'prestadorTerceiro', 'problema'] as const) if (body[field] !== undefined) (item as unknown as Record<string, unknown>)[field] = body[field];
  item.pendencias = [];
  if (!item.obraId) addPending(item.pendencias, 'OBRA_PENDENTE');
  if (!item.frotaId) addPending(item.pendencias, 'FROTA_PENDENTE');
  if (!item.natureza) addPending(item.pendencias, 'NATUREZA_PENDENTE');
  if (!item.status) addPending(item.pendencias, 'STATUS_PENDENTE');
  if (item.natureza === 'TERCEIRO' && !item.prestadorTerceiro) addPending(item.pendencias, 'FORNECEDOR_PENDENTE');
  if (!item.problema && !item.itens.length) addPending(item.pendencias, 'DADOS_INCOMPLETOS');
  item.statusPreview = item.pendencias.length ? 'REQUER_REVISAO' : 'PRONTA';
  if (!await saveItem(tokenOf(request), item)) { response.status(404).json({ message: notFoundMessage }); return; }
  response.json(item);
}
export async function confirm(request: Request, response: Response): Promise<void> {
  const token = tokenOf(request), items = await loadPreview(token);
  if (!items) { response.status(404).json({ message: notFoundMessage }); return; }
  const selected = items.filter(x=>x.statusPreview==='PRONTA');
  const result = { importadas: 0, jaCadastradas: items.filter(x=>x.statusPreview==='JA_CADASTRADA').length, pendentes: items.length-selected.length-items.filter(x=>x.statusPreview==='JA_CADASTRADA').length, falhas: [] as Array<{numeroOs:number;motivo:string}> };
  const client=await pool.connect();
  try {
    for (const item of selected) { try {
      if (!item.obraId || !item.frotaId || !item.natureza || !item.status) throw new Error('Dados obrigatórios ausentes na prévia.');
      await client.query('BEGIN');
      const frota=(await client.query<{prefixo_frota_id:string|null;numero:string|null}>('SELECT prefixo_frota_id,numero FROM frotas WHERE id=$1',[item.frotaId])).rows[0]!;
      if ((await client.query('SELECT 1 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs])).rowCount) { await client.query('ROLLBACK'); result.jaCadastradas++; continue; }
      await client.query('INSERT INTO ordens_servico (numero_os,obra_id,frota_id,prefixo_frota_id,frota_numero,natureza_os,categoria_servico,prestador_terceiro,data_abertura,status,observacoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[item.numeroOs,item.obraId,item.frotaId,frota.prefixo_frota_id,frota.numero===null?null:Number(frota.numero),item.natureza,item.categoriaServico??null,item.natureza==='TERCEIRO'?item.prestadorTerceiro??null:null,item.data||new Date().toISOString().slice(0,10),item.status,item.problema]);
      for(const service of item.itens.filter(x=>x.tipo==='SERVICO')) await client.query('INSERT INTO servicos_os (ordem_servico_id,descricao,valor) SELECT id,$2,$3 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs,service.descricao,service.total]);
      for(const product of item.itens.filter(x=>x.tipo==='PRODUTO')) await client.query('INSERT INTO produtos_os (ordem_servico_id,descricao,quantidade,unidade,valor_unitario) SELECT id,$2,$3,$4,$5 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs,product.descricao,product.quantidade,product.unidade,product.valorUnitario]);
      for(const execution of item.execucoes.filter(x=>x.funcionarioId)) await client.query('INSERT INTO ordens_servico_funcionarios (ordem_servico_id,funcionario_id) SELECT id,$2 FROM ordens_servico WHERE numero_os=$1 ON CONFLICT DO NOTHING',[item.numeroOs,execution.funcionarioId]);
      await client.query('COMMIT'); result.importadas++;
    } catch(error) { await client.query('ROLLBACK'); result.falhas.push({numeroOs:item.numeroOs,motivo:error instanceof Error?error.message:'Falha ao importar.'}); } }
    await client.query("UPDATE importacoes_os SET status='CONCLUIDA',updated_at=now() WHERE id=$1", [token]);
    await client.query('DELETE FROM importacoes_os_itens WHERE importacao_id=$1', [token]);
  } finally { client.release(); }
  response.json(result);
}
