import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';

export const abastecimentoPontoTypes = ['COMBOIO', 'POSTO', 'CAMINHAO_TANQUE', 'OUTRO'] as const;
export type AbastecimentoPontoType = (typeof abastecimentoPontoTypes)[number];
export const abastecimentoStatuses = ['ATIVO', 'INATIVO'] as const;
export type AbastecimentoStatus = (typeof abastecimentoStatuses)[number];
export const abastecimentoDestinatarioTypes = ['FROTA', 'TERCEIRO', 'EXTERNA', 'ESPECIAL'] as const;

type RecordValue = Record<string, unknown>;
type DecimalInput = string | number;
type ProductRow = { id: string; codigo: string; nome: string; tipo: string; permite_entrada: boolean; permite_distribuicao: boolean; permite_abastecimento: boolean; status: AbastecimentoStatus };

export class AbastecimentoServiceError extends Error {
  constructor(public readonly statusCode: 400 | 404 | 409 | 500, message: string) { super(message); this.name = 'AbastecimentoServiceError'; }
}

const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const postgresCode = (error: unknown): string | undefined => isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const assertUuid = (value: unknown, field = 'id'): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new AbastecimentoServiceError(400, `${field} deve ser um UUID válido.`);
  return value;
};
const text = (value: unknown, field: string, required = false, max?: number): string | null => {
  if (value === undefined || value === null) { if (required) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); return null; }
  if (typeof value !== 'string') throw new AbastecimentoServiceError(400, `${field} deve ser um texto.`);
  const result = value.trim();
  if (required && !result) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`);
  if (max !== undefined && result.length > max) throw new AbastecimentoServiceError(400, `${field} deve ter no máximo ${max} caracteres.`);
  return result || null;
};
const date = (value: unknown, field: string): string => {
  const result = text(value, field, true)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new AbastecimentoServiceError(400, `${field} deve estar no formato YYYY-MM-DD.`);
  const [year, month, day] = result.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month! - 1 || parsed.getUTCDate() !== day) throw new AbastecimentoServiceError(400, `${field} é inválida.`);
  return result;
};
const decimal = (value: unknown, field: string, scale: number, positive: boolean): string => {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && !Number.isFinite(value))) throw new AbastecimentoServiceError(400, `${field} deve ser numérico.`);
  const result = String(value).trim();
  const match = /^\d+(?:\.\d+)?$/.exec(result);
  if (!match || (result.split('.')[1]?.length ?? 0) > scale) throw new AbastecimentoServiceError(400, `${field} deve possuir no máximo ${scale} casas decimais.`);
  const numeric = Number(result);
  if (!Number.isFinite(numeric) || (positive ? numeric <= 0 : numeric < 0)) throw new AbastecimentoServiceError(400, positive ? `${field} deve ser maior que zero.` : `${field} não pode ser negativo.`);
  return result;
};
const nullableText = (value: unknown, field: string, max?: number): string | null => text(value, field, false, max);
const status = (value: unknown, required = false): AbastecimentoStatus => {
  if (value === undefined && !required) return 'ATIVO';
  if (value !== 'ATIVO' && value !== 'INATIVO') throw new AbastecimentoServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  return value;
};
const mapDatabaseError = (error: unknown, duplicated: string, used: string): never => {
  const code = postgresCode(error);
  if (code === '23505') throw new AbastecimentoServiceError(409, duplicated);
  if (code === '23503' || code === '23001') throw new AbastecimentoServiceError(409, used);
  throw error;
};
const numberValue = (value: string | number | null, field: string): number | null => {
  if (value === null) return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new AbastecimentoServiceError(500, `Valor numérico inválido em ${field}.`);
  return result;
};
const productPayload = (row: ProductRow) => ({ ...row });

export async function listAbastecimentoProdutos(): Promise<ProductRow[]> {
  return (await pool.query<ProductRow>(`SELECT id,codigo,nome,tipo,permite_entrada,permite_distribuicao,permite_abastecimento,status
    FROM abastecimento_produtos WHERE status='ATIVO' ORDER BY codigo`)).rows.map(productPayload);
}

export interface PontoFields { codigo: string; nome: string; tipo: AbastecimentoPontoType; frota_id: string | null; status: AbastecimentoStatus; observacoes: string | null; }
const parsePontoFields = (body: unknown, requireStatus = false): PontoFields => {
  if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  const codigo = text(body.codigo, 'codigo', true, 30)!.toUpperCase();
  const nome = text(body.nome ?? codigo, 'nome', true, 120)!;
  if (!abastecimentoPontoTypes.includes(body.tipo as AbastecimentoPontoType)) throw new AbastecimentoServiceError(400, 'tipo de ponto inválido.');
  const frotaId = body.frota_id === undefined || body.frota_id === null || body.frota_id === '' ? null : assertUuid(body.frota_id, 'frota_id');
  return { codigo, nome, tipo: body.tipo as AbastecimentoPontoType, frota_id: frotaId, status: status(body.status, requireStatus), observacoes: nullableText(body.observacoes, 'observacoes') };
};
const ensureFrota = async (id: string | null): Promise<void> => {
  if (id && !(await pool.query('SELECT 1 FROM frotas WHERE id=$1', [id])).rowCount) throw new AbastecimentoServiceError(404, 'Frota não encontrada.');
};
export async function listAbastecimentoPontos(filters: { status?: string; codigo?: string; tipo?: string } = {}) {
  if (filters.status !== undefined && !abastecimentoStatuses.includes(filters.status as AbastecimentoStatus)) throw new AbastecimentoServiceError(400, 'status inválido.');
  if (filters.tipo !== undefined && !abastecimentoPontoTypes.includes(filters.tipo as AbastecimentoPontoType)) throw new AbastecimentoServiceError(400, 'tipo inválido.');
  const values: string[] = []; const conditions: string[] = [];
  const bind = (value: string) => { values.push(value); return `$${values.length}`; };
  if (filters.status) conditions.push(`p.status=${bind(filters.status)}`);
  if (filters.tipo) conditions.push(`p.tipo=${bind(filters.tipo)}`);
  if (filters.codigo?.trim()) conditions.push(`p.codigo ILIKE ${bind(`%${filters.codigo.trim()}%`)}`);
  const result = await pool.query(`SELECT p.* FROM abastecimento_pontos p ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY p.codigo`, values);
  return result.rows;
}
export async function getAbastecimentoPonto(id: string) {
  const result = await pool.query('SELECT * FROM abastecimento_pontos WHERE id=$1', [assertUuid(id)]);
  if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Ponto operacional não encontrado.');
  return result.rows[0];
}
export async function createAbastecimentoPonto(body: unknown) {
  const fields = parsePontoFields(body); await ensureFrota(fields.frota_id);
  try { return (await pool.query('INSERT INTO abastecimento_pontos(codigo,nome,tipo,frota_id,status,observacoes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', Object.values(fields))).rows[0]; }
  catch (error) { return mapDatabaseError(error, 'Já existe um ponto operacional com este código.', 'Não é possível salvar o ponto operacional.'); }
}
export async function updateAbastecimentoPonto(id: string, body: unknown) {
  const pointId = assertUuid(id); const fields = parsePontoFields(body, true); await ensureFrota(fields.frota_id);
  try { const result = await pool.query('UPDATE abastecimento_pontos SET codigo=$1,nome=$2,tipo=$3,frota_id=$4,status=$5,observacoes=$6 WHERE id=$7 RETURNING *', [...Object.values(fields), pointId]); if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Ponto operacional não encontrado.'); return result.rows[0]; }
  catch (error) { return mapDatabaseError(error, 'Já existe um ponto operacional com este código.', 'Não é possível salvar o ponto operacional.'); }
}
export async function updateAbastecimentoPontoStatus(id: string, body: unknown) {
  if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'Informe o status.');
  const result = await pool.query('UPDATE abastecimento_pontos SET status=$1 WHERE id=$2 RETURNING *', [status(body.status, true), assertUuid(id)]);
  if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Ponto operacional não encontrado.'); return result.rows[0];
}
export async function deleteAbastecimentoPonto(id: string): Promise<void> {
  try { const result = await pool.query('DELETE FROM abastecimento_pontos WHERE id=$1', [assertUuid(id)]); if (!result.rowCount) throw new AbastecimentoServiceError(404, 'Ponto operacional não encontrado.'); }
  catch (error) { return mapDatabaseError(error, 'Já existe um ponto operacional com este código.', 'Não é possível excluir o ponto porque ele está sendo utilizado.'); }
}

export async function listPontoProdutos(pontoId: string) {
  const id = assertUuid(pontoId); if (!(await pool.query('SELECT 1 FROM abastecimento_pontos WHERE id=$1', [id])).rowCount) throw new AbastecimentoServiceError(404, 'Ponto operacional não encontrado.');
  return (await pool.query(`SELECT pr.id,pr.codigo,pr.nome,pr.tipo,pr.permite_entrada,pr.permite_distribuicao,pr.permite_abastecimento,pp.ativo
    FROM abastecimento_pontos_produtos pp JOIN abastecimento_produtos pr ON pr.id=pp.produto_id WHERE pp.ponto_id=$1 ORDER BY pr.codigo`, [id])).rows;
}
export async function replacePontoProdutos(pontoId: string, body: unknown) {
  const pointId = assertUuid(pontoId); if (!(await pool.query('SELECT 1 FROM abastecimento_pontos WHERE id=$1', [pointId])).rowCount) throw new AbastecimentoServiceError(404, 'Ponto operacional não encontrado.');
  const raw = Array.isArray(body) ? body : isRecord(body) ? body.produto_ids : undefined;
  if (!Array.isArray(raw)) throw new AbastecimentoServiceError(400, 'Envie produto_ids como uma lista.');
  const ids = raw.map((value) => assertUuid(value, 'produto_id'));
  if (new Set(ids).size !== ids.length) throw new AbastecimentoServiceError(400, 'Não repita produtos na compatibilidade.');
  const products = (await pool.query<ProductRow>('SELECT * FROM abastecimento_produtos WHERE id=ANY($1::uuid[])', [ids])).rows;
  if (products.length !== ids.length) throw new AbastecimentoServiceError(404, 'Produto não encontrado.');
  if (products.some((product) => product.status !== 'ATIVO')) throw new AbastecimentoServiceError(400, 'Compatibilidade exige produto ativo.');
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query('DELETE FROM abastecimento_pontos_produtos WHERE ponto_id=$1', [pointId]); for (const productId of ids) await client.query('INSERT INTO abastecimento_pontos_produtos(ponto_id,produto_id) VALUES($1,$2)', [pointId, productId]); await client.query('COMMIT'); return listPontoProdutos(pointId); }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export interface TerceiroFields { codigo: string | null; nome: string; documento: string | null; status: AbastecimentoStatus; observacoes: string | null; }
const parseTerceiroFields = (body: unknown, requireStatus = false): TerceiroFields => {
  if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  const codigo = nullableText(body.codigo, 'codigo', 50)?.toUpperCase() ?? null;
  return { codigo, nome: text(body.nome, 'nome', true, 255)!, documento: nullableText(body.documento, 'documento', 30), status: status(body.status, requireStatus), observacoes: nullableText(body.observacoes, 'observacoes') };
};
export async function listAbastecimentoTerceiros(filters: { status?: string; codigo?: string; nome?: string } = {}) {
  if (filters.status !== undefined && !abastecimentoStatuses.includes(filters.status as AbastecimentoStatus)) throw new AbastecimentoServiceError(400, 'status inválido.');
  const values: string[] = []; const conditions: string[] = []; const bind = (value: string) => { values.push(value); return `$${values.length}`; };
  if (filters.status) conditions.push(`status=${bind(filters.status)}`); if (filters.codigo?.trim()) conditions.push(`codigo ILIKE ${bind(`%${filters.codigo.trim()}%`)}`); if (filters.nome?.trim()) conditions.push(`nome ILIKE ${bind(`%${filters.nome.trim()}%`)}`);
  return (await pool.query(`SELECT * FROM abastecimento_terceiros ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY nome`, values)).rows;
}
export async function getAbastecimentoTerceiro(id: string) { const result = await pool.query('SELECT * FROM abastecimento_terceiros WHERE id=$1', [assertUuid(id)]); if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Terceiro não encontrado.'); return result.rows[0]; }
export async function createAbastecimentoTerceiro(body: unknown) { const fields=parseTerceiroFields(body); try { return (await pool.query('INSERT INTO abastecimento_terceiros(codigo,nome,documento,status,observacoes) VALUES($1,$2,$3,$4,$5) RETURNING *',Object.values(fields))).rows[0]; } catch(error){return mapDatabaseError(error,'Já existe um terceiro com este código.','Não é possível salvar o terceiro.');} }
export async function updateAbastecimentoTerceiro(id: string, body: unknown) { const fields=parseTerceiroFields(body,true); try { const r=await pool.query('UPDATE abastecimento_terceiros SET codigo=$1,nome=$2,documento=$3,status=$4,observacoes=$5 WHERE id=$6 RETURNING *',[...Object.values(fields),assertUuid(id)]); if(!r.rows[0])throw new AbastecimentoServiceError(404,'Terceiro não encontrado.'); return r.rows[0]; }catch(error){return mapDatabaseError(error,'Já existe um terceiro com este código.','Não é possível salvar o terceiro.');} }
export async function deleteAbastecimentoTerceiro(id: string): Promise<void> { try { const r=await pool.query('DELETE FROM abastecimento_terceiros WHERE id=$1',[assertUuid(id)]);if(!r.rowCount)throw new AbastecimentoServiceError(404,'Terceiro não encontrado.'); }catch(error){return mapDatabaseError(error,'Já existe um terceiro com este código.','Não é possível excluir o terceiro porque ele está sendo utilizado.');} }

export interface EspecialFields { codigo: string; nome: string; descricao: string | null; status: AbastecimentoStatus; }
const parseEspecialFields = (body: unknown, requireStatus = false): EspecialFields => { if(!isRecord(body))throw new AbastecimentoServiceError(400,'O corpo da requisição deve ser um objeto.'); return {codigo:text(body.codigo,'codigo',true,50)!.toUpperCase(),nome:text(body.nome,'nome',true,120)!,descricao:nullableText(body.descricao,'descricao'),status:status(body.status,requireStatus)}; };
export async function listAbastecimentoEspeciais(filters:{status?:string}={}) { if(filters.status!==undefined&&!abastecimentoStatuses.includes(filters.status as AbastecimentoStatus))throw new AbastecimentoServiceError(400,'status inválido.'); return (await pool.query('SELECT * FROM abastecimento_destinacoes_especiais'+(filters.status?' WHERE status=$1':'')+' ORDER BY codigo',filters.status?[filters.status]:[])).rows; }
export async function getAbastecimentoEspecial(id:string){const r=await pool.query('SELECT * FROM abastecimento_destinacoes_especiais WHERE id=$1',[assertUuid(id)]);if(!r.rows[0])throw new AbastecimentoServiceError(404,'Destinação especial não encontrada.');return r.rows[0];}
export async function createAbastecimentoEspecial(body:unknown){const f=parseEspecialFields(body);try{return(await pool.query('INSERT INTO abastecimento_destinacoes_especiais(codigo,nome,descricao,status) VALUES($1,$2,$3,$4) RETURNING *',Object.values(f))).rows[0];}catch(e){return mapDatabaseError(e,'Já existe uma destinação especial com este código.','Não é possível salvar a destinação especial.');}}
export async function updateAbastecimentoEspecial(id:string,body:unknown){const f=parseEspecialFields(body,true);try{const r=await pool.query('UPDATE abastecimento_destinacoes_especiais SET codigo=$1,nome=$2,descricao=$3,status=$4 WHERE id=$5 RETURNING *',[...Object.values(f),assertUuid(id)]);if(!r.rows[0])throw new AbastecimentoServiceError(404,'Destinação especial não encontrada.');return r.rows[0];}catch(e){return mapDatabaseError(e,'Já existe uma destinação especial com este código.','Não é possível salvar a destinação especial.');}}
export async function deleteAbastecimentoEspecial(id:string):Promise<void>{try{const r=await pool.query('DELETE FROM abastecimento_destinacoes_especiais WHERE id=$1',[assertUuid(id)]);if(!r.rowCount)throw new AbastecimentoServiceError(404,'Destinação especial não encontrada.');}catch(e){return mapDatabaseError(e,'Já existe uma destinação especial com este código.','Não é possível excluir a destinação especial porque ela está sendo utilizada.');}}

interface DestinationInput { ponto_id: string; litros: string; observacoes: string | null; }
interface EntradaFields { data_entrada: string; numero_nf: string; produto_id: string; litros_nf: string; valor_total_nf: string; observacoes: string | null; destinos: DestinationInput[]; }
const parseDestinos = (value: unknown): DestinationInput[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AbastecimentoServiceError(400, 'destinos deve ser uma lista.');
  return value.map((item, index) => { if(!isRecord(item))throw new AbastecimentoServiceError(400, `destinos[${index}] deve ser um objeto.`); return {ponto_id:assertUuid(item.ponto_id,`destinos[${index}].ponto_id`),litros:decimal(item.litros,`destinos[${index}].litros`,3,true),observacoes:nullableText(item.observacoes,`destinos[${index}].observacoes`)}; });
};
const parseEntradaFields = (body: unknown): EntradaFields => { if(!isRecord(body))throw new AbastecimentoServiceError(400,'O corpo da requisição deve ser um objeto.'); return {data_entrada:date(body.data_entrada,'data_entrada'),numero_nf:text(body.numero_nf,'numero_nf',true,80)!,produto_id:assertUuid(body.produto_id,'produto_id'),litros_nf:decimal(body.litros_nf,'litros_nf',3,true),valor_total_nf:decimal(body.valor_total_nf,'valor_total_nf',2,false),observacoes:nullableText(body.observacoes,'observacoes'),destinos:parseDestinos(body.destinos)}; };
const getProduct = async (db: typeof pool | PoolClient, id: string): Promise<ProductRow> => { const r=await db.query<ProductRow>('SELECT * FROM abastecimento_produtos WHERE id=$1',[id]);if(!r.rows[0])throw new AbastecimentoServiceError(404,'Produto não encontrado.');if(r.rows[0].status!=='ATIVO')throw new AbastecimentoServiceError(400,'Produto está inativo.');return r.rows[0]; };
const validateDestinos = async (db: PoolClient, product: ProductRow, destinos: DestinationInput[]) => {
  if (destinos.length && !product.permite_distribuicao) throw new AbastecimentoServiceError(400,'Este produto não permite distribuição.');
  if (!destinos.length) return;
  const ids=[...new Set(destinos.map(x=>x.ponto_id))]; const points=(await db.query<{id:string;status:AbastecimentoStatus}>('SELECT id,status FROM abastecimento_pontos WHERE id=ANY($1::uuid[])',[ids])).rows;
  if(points.length!==ids.length)throw new AbastecimentoServiceError(404,'Ponto operacional não encontrado.');
  for(const point of points){if(point.status!=='ATIVO')throw new AbastecimentoServiceError(400,'Não é possível distribuir para ponto inativo.');const compatible=await db.query('SELECT 1 FROM abastecimento_pontos_produtos WHERE ponto_id=$1 AND produto_id=$2 AND ativo=true',[point.id,product.id]);if(!compatible.rowCount)throw new AbastecimentoServiceError(400,'Ponto operacional não é compatível com o produto informado.');}
};
const destinationRows = async (db: typeof pool | PoolClient, entryId: string) => (await db.query(`SELECT d.id,d.ponto_id,d.litros,d.observacoes,p.codigo AS ponto_codigo,p.nome AS ponto_nome FROM abastecimento_entrada_destinos d JOIN abastecimento_pontos p ON p.id=d.ponto_id WHERE d.entrada_id=$1 ORDER BY d.created_at,d.id`,[entryId])).rows.map(row=>({...row,litros:numberValue(row.litros,'destinos.litros')}));
const destinationRowsBatch = async (db: typeof pool | PoolClient, entryIds: string[]) => {
  const grouped = new Map<string, Array<RecordValue & { litros: number }>>();
  if (!entryIds.length) return grouped;
  const rows = (await db.query(`SELECT d.id,d.entrada_id,d.ponto_id,d.litros,d.observacoes,p.codigo AS ponto_codigo,p.nome AS ponto_nome FROM abastecimento_entrada_destinos d JOIN abastecimento_pontos p ON p.id=d.ponto_id WHERE d.entrada_id=ANY($1::uuid[]) ORDER BY d.created_at,d.id`, [entryIds])).rows;
  for (const row of rows) { const list = grouped.get(row.entrada_id) ?? []; list.push({ ...row, litros: numberValue(row.litros, 'destinos.litros') }); grouped.set(row.entrada_id, list); }
  return grouped;
};
const entryResponse = async (db: typeof pool | PoolClient, row: RecordValue) => { const destinos=await destinationRows(db,row.id as string); return {id:row.id,data_entrada:row.data_entrada,numero_nf:row.numero_nf,produto:{id:row.produto_id,codigo:row.produto_codigo,nome:row.produto_nome},produto_id:row.produto_id,litros_nf:numberValue(row.litros_nf as string,'litros_nf'),valor_total_nf:numberValue(row.valor_total_nf as string,'valor_total_nf'),total_distribuido:destinos.reduce((sum,item)=>sum+(item.litros??0),0),observacoes:row.observacoes,destinos,created_at:row.created_at,updated_at:row.updated_at}; };
const entryResponseFromDestinations = (row: RecordValue, destinos: Array<RecordValue & { litros: number }>) => ({id:row.id,data_entrada:row.data_entrada,numero_nf:row.numero_nf,produto:{id:row.produto_id,codigo:row.produto_codigo,nome:row.produto_nome},produto_id:row.produto_id,litros_nf:numberValue(row.litros_nf as string,'litros_nf'),valor_total_nf:numberValue(row.valor_total_nf as string,'valor_total_nf'),total_distribuido:destinos.reduce((sum,item)=>sum+(item.litros??0),0),observacoes:row.observacoes,destinos,created_at:row.created_at,updated_at:row.updated_at});
const entrySelect = `SELECT e.*,p.codigo AS produto_codigo,p.nome AS produto_nome FROM abastecimento_entradas e JOIN abastecimento_produtos p ON p.id=e.produto_id`;
export async function getAbastecimentoEntrada(id:string){const r=await pool.query(entrySelect+' WHERE e.id=$1',[assertUuid(id)]);if(!r.rows[0])throw new AbastecimentoServiceError(404,'Entrada não encontrada.');return entryResponse(pool,r.rows[0]);}
export async function createAbastecimentoEntrada(body:unknown){const f=parseEntradaFields(body);const client=await pool.connect();try{await client.query('BEGIN');const product=await getProduct(client,f.produto_id);if(!product.permite_entrada)throw new AbastecimentoServiceError(400,'Produto não permite entrada.');await validateDestinos(client,product,f.destinos);const inserted=await client.query('INSERT INTO abastecimento_entradas(data_entrada,numero_nf,produto_id,litros_nf,valor_total_nf,observacoes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[f.data_entrada,f.numero_nf,f.produto_id,f.litros_nf,f.valor_total_nf,f.observacoes]);const id=inserted.rows[0].id as string;for(const d of f.destinos)await client.query('INSERT INTO abastecimento_entrada_destinos(entrada_id,ponto_id,litros,observacoes) VALUES($1,$2,$3,$4)',[id,d.ponto_id,d.litros,d.observacoes]);const row=await client.query(entrySelect+' WHERE e.id=$1',[id]);await client.query('COMMIT');return entryResponse(pool,row.rows[0]);}catch(e){await client.query('ROLLBACK');if(e instanceof AbastecimentoServiceError)throw e;return mapDatabaseError(e,'Já existe uma entrada com estes dados.','Não é possível salvar a entrada.');}finally{client.release();}}
export async function updateAbastecimentoEntrada(id:string,body:unknown){const entryId=assertUuid(id);const f=parseEntradaFields(body);const client=await pool.connect();try{await client.query('BEGIN');const existing=await client.query('SELECT id FROM abastecimento_entradas WHERE id=$1 FOR UPDATE',[entryId]);if(!existing.rows[0])throw new AbastecimentoServiceError(404,'Entrada não encontrada.');const product=await getProduct(client,f.produto_id);if(!product.permite_entrada)throw new AbastecimentoServiceError(400,'Produto não permite entrada.');await validateDestinos(client,product,f.destinos);await client.query('UPDATE abastecimento_entradas SET data_entrada=$1,numero_nf=$2,produto_id=$3,litros_nf=$4,valor_total_nf=$5,observacoes=$6 WHERE id=$7',[f.data_entrada,f.numero_nf,f.produto_id,f.litros_nf,f.valor_total_nf,f.observacoes,entryId]);await client.query('DELETE FROM abastecimento_entrada_destinos WHERE entrada_id=$1',[entryId]);for(const d of f.destinos)await client.query('INSERT INTO abastecimento_entrada_destinos(entrada_id,ponto_id,litros,observacoes) VALUES($1,$2,$3,$4)',[entryId,d.ponto_id,d.litros,d.observacoes]);const row=await client.query(entrySelect+' WHERE e.id=$1',[entryId]);await client.query('COMMIT');return entryResponse(pool,row.rows[0]);}catch(e){await client.query('ROLLBACK');if(e instanceof AbastecimentoServiceError)throw e;return mapDatabaseError(e,'Já existe uma entrada com estes dados.','Não é possível salvar a entrada.');}finally{client.release();}}
export interface EntradaFilters { data_inicio?: string; data_fim?: string; produto_id?: string; produto_codigo?: string; numero_nf?: string; ponto_id?: string; }
export async function listAbastecimentoEntradas(filters:EntradaFilters={}){const values:string[]=[];const conditions:string[]=[];const bind=(x:string)=>{values.push(x);return `$${values.length}`};if(filters.data_inicio)conditions.push(`e.data_entrada>=${bind(date(filters.data_inicio,'data_inicio'))}`);if(filters.data_fim)conditions.push(`e.data_entrada<=${bind(date(filters.data_fim,'data_fim'))}`);if(filters.produto_id)conditions.push(`e.produto_id=${bind(assertUuid(filters.produto_id,'produto_id'))}`);if(filters.produto_codigo?.trim())conditions.push(`p.codigo=${bind(filters.produto_codigo.trim().toUpperCase())}`);if(filters.numero_nf?.trim())conditions.push(`e.numero_nf ILIKE ${bind('%'+filters.numero_nf.trim()+'%')}`);if(filters.ponto_id)conditions.push(`EXISTS (SELECT 1 FROM abastecimento_entrada_destinos fd WHERE fd.entrada_id=e.id AND fd.ponto_id=${bind(assertUuid(filters.ponto_id,'ponto_id'))})`);const rows=(await pool.query(entrySelect+' '+(conditions.length?'WHERE '+conditions.join(' AND '):'')+' ORDER BY e.data_entrada DESC,e.created_at DESC',values)).rows;const grouped=await destinationRowsBatch(pool,rows.map(row=>row.id as string));return rows.map(row=>entryResponseFromDestinations(row,grouped.get(row.id as string)??[]));}
export async function deleteAbastecimentoEntrada(id:string):Promise<void>{const entryId=assertUuid(id);const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query('DELETE FROM abastecimento_entrada_destinos WHERE entrada_id=$1',[entryId]);const e=await client.query('DELETE FROM abastecimento_entradas WHERE id=$1',[entryId]);if(!e.rowCount)throw new AbastecimentoServiceError(404,'Entrada não encontrada.');await client.query('COMMIT');void r;}catch(error){await client.query('ROLLBACK');if(error instanceof AbastecimentoServiceError)throw error;return mapDatabaseError(error,'Entrada duplicada.','Não é possível excluir a entrada.');}finally{client.release();}}
