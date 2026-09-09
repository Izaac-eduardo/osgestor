import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { parsePoliOs, matchPreview, type ParsedOs } from '../imports/poli-os.js';
import { pool } from '../config/database.js';

const previews = new Map<string, ParsedOs[]>();
const tokenOf = (request: Request) => typeof request.params.token === 'string' ? request.params.token : '';
const upload = (request: Request): Buffer => {
  const file = (request as Request & { file?: { buffer: Buffer; originalname: string; size: number } }).file;
  if (file) return file.buffer;
  const value = request.body?.contentBase64;
  if (typeof value !== 'string' || value.length > 20_000_000) throw new Error('Envie um arquivo XLS/XLSX válido.');
  return Buffer.from(value, 'base64');
};
export async function analyze(request: Request, response: Response): Promise<void> {
  try {
    const filename = String((request as Request & { file?: { originalname: string } }).file?.originalname ?? request.body?.filename ?? 'upload.xls');
    if (!/\.xls[x]?$/i.test(filename)) { response.status(400).json({ message: 'Apenas arquivos .xls ou .xlsx são aceitos.' }); return; }
    const items = await matchPreview(parsePoliOs(upload(request), filename));
    const token = randomUUID(); previews.set(token, items);
    response.status(200).json({ token, filename, total: items.length, counts: { prontas: items.filter(x=>x.statusPreview==='PRONTA').length, revisao: items.filter(x=>x.statusPreview==='REQUER_REVISAO').length, jaCadastradas: items.filter(x=>x.statusPreview==='JA_CADASTRADA').length }, items });
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : 'Não foi possível analisar o arquivo.' }); }
}
export async function getPreview(request: Request, response: Response): Promise<void> {
  const items = previews.get(tokenOf(request));
  if (!items) { response.status(404).json({ message: 'Prévia expirada ou não encontrada.' }); return; }
  response.json({ token: request.params.token, items });
}
export async function resolve(request: Request, response: Response): Promise<void> {
  const items = previews.get(tokenOf(request));
  if (!items) { response.status(404).json({ message: 'Prévia expirada ou não encontrada.' }); return; }
  const item = items.find(x => x.numeroOs === Number(request.params.numeroOs));
  if (!item) { response.status(404).json({ message: 'O.S. não encontrada na prévia.' }); return; }
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  for (const field of ['obraId', 'frotaId', 'natureza', 'status', 'prestadorTerceiro', 'problema'] as const) {
    if (body[field] !== undefined) (item as unknown as Record<string, unknown>)[field] = body[field];
  }
  item.pendencias = [];
  if (!item.obraId) item.pendencias.push('OBRA_PENDENTE');
  if (!item.frotaId) item.pendencias.push('FROTA_PENDENTE');
  if (!item.natureza) item.pendencias.push('NATUREZA_PENDENTE');
  if (!item.status) item.pendencias.push('STATUS_PENDENTE');
  if (item.natureza === 'TERCEIRO' && !item.prestadorTerceiro) item.pendencias.push('FORNECEDOR_PENDENTE');
  if (!item.problema && !item.itens.length) item.pendencias.push('REQUER_REVISAO');
  item.statusPreview = item.pendencias.length ? 'REQUER_REVISAO' : 'PRONTA';
  response.json(item);
}export async function confirm(request: Request, response: Response): Promise<void> {
  const items = previews.get(tokenOf(request));
  if (!items) { response.status(404).json({ message: 'Prévia expirada ou não encontrada.' }); return; }
  const selected = items.filter(x=>x.statusPreview==='PRONTA');
  const result = { importadas: 0, jaCadastradas: items.filter(x=>x.statusPreview==='JA_CADASTRADA').length, pendentes: items.length-selected.length-items.filter(x=>x.statusPreview==='JA_CADASTRADA').length, falhas: [] as Array<{numeroOs:number;motivo:string}> };
  const client=await pool.connect();
  try {
    for (const item of selected) {
      try {
        if (!item.obraId || !item.frotaId || !item.natureza || !item.status) throw new Error('Dados obrigatórios ausentes na prévia.');
        await client.query('BEGIN');
        const frota=(await client.query<{prefixo_frota_id:string;numero:string}>('SELECT prefixo_frota_id,numero FROM frotas WHERE id=$1',[item.frotaId])).rows[0]!;
        if ((await client.query('SELECT 1 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs])).rowCount) { await client.query('ROLLBACK'); result.jaCadastradas++; continue; }
        await client.query('INSERT INTO ordens_servico (numero_os,obra_id,prefixo_frota_id,frota_numero,natureza_os,categoria_servico,prestador_terceiro,data_abertura,status,observacoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[item.numeroOs,item.obraId,frota.prefixo_frota_id,Number(frota.numero),item.natureza,item.categoriaServico??null,item.natureza==='TERCEIRO'?item.prestadorTerceiro??null:null,item.data||new Date().toISOString().slice(0,10),item.status,item.problema]);
        for(const service of item.itens.filter(x=>x.tipo==='SERVICO')) await client.query('INSERT INTO servicos_os (ordem_servico_id,descricao,valor) SELECT id,$2,$3 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs,service.descricao,service.total]);
        for(const product of item.itens.filter(x=>x.tipo==='PRODUTO')) await client.query('INSERT INTO produtos_os (ordem_servico_id,descricao,quantidade,unidade,valor_unitario) SELECT id,$2,$3,$4,$5 FROM ordens_servico WHERE numero_os=$1',[item.numeroOs,product.descricao,product.quantidade,product.unidade,product.valorUnitario]);
        for(const execution of item.execucoes.filter(x=>x.funcionarioId)) await client.query('INSERT INTO ordens_servico_funcionarios (ordem_servico_id,funcionario_id) SELECT id,$2 FROM ordens_servico WHERE numero_os=$1 ON CONFLICT DO NOTHING',[item.numeroOs,execution.funcionarioId]);
        await client.query('COMMIT'); result.importadas++;
      } catch(error) { await client.query('ROLLBACK'); result.falhas.push({numeroOs:item.numeroOs,motivo:error instanceof Error?error.message:'Falha ao importar.'}); }
    }
  } finally { client.release(); previews.delete(tokenOf(request)); }
  response.json(result);
}
