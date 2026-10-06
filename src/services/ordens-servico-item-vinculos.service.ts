import { pool } from '../config/database.js';

export const itemVinculoTipos = ['PRODUTO', 'SERVICO'] as const;
export type ItemVinculoTipo = typeof itemVinculoTipos[number];

export const itemVinculoMetodos = [
  'IMPORTADO_DIRETO',
  'MATCH_EXATO_HOMOLOGADO',
  'MANUAL',
] as const;
export type ItemVinculoMetodo = typeof itemVinculoMetodos[number];

export const itemVinculoEstados = ['ATIVO', 'REVOGADO'] as const;
export type ItemVinculoEstado = typeof itemVinculoEstados[number];

export interface OrdemServicoItemVinculo {
  id: string;
  importacao_id: string;
  ordem_servico_id: string;
  tipo_item: ItemVinculoTipo;
  produto_os_id: string | null;
  servico_os_id: string | null;
  fingerprint_contexto: string;
  origem_linha: number | null;
  sequencia_importacao: number | null;
  codigo_poli: string | null;
  hash_conteudo: string | null;
  metodo_vinculo: ItemVinculoMetodo;
  estado_vinculo: ItemVinculoEstado;
  homologado_por: string | null;
  homologado_em: Date | null;
  justificativa: string | null;
  evidencia_snapshot: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateItemVinculoInput {
  importacaoId: string;
  ordemServicoId: string;
  tipoItem: ItemVinculoTipo;
  produtoOsId?: string;
  servicoOsId?: string;
  fingerprintContexto: string;
  origemLinha?: number | null;
  sequenciaImportacao?: number | null;
  codigoPoli?: string | null;
  hashConteudo?: string | null;
  metodoVinculo: ItemVinculoMetodo;
  homologadoPor?: string | null;
  homologadoEm?: Date | null;
  justificativa?: string | null;
  evidenciaSnapshot?: Record<string, unknown>;
}

type ItemVinculoDb = { query: typeof pool.query };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends readonly string[]>(value: unknown, values: T): value is T[number] =>
  typeof value === 'string' && values.includes(value);

const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} é obrigatório.`);
  return value.trim();
};

const rowOf = (row: Record<string, unknown>): OrdemServicoItemVinculo => ({
  id: row.id as string,
  importacao_id: row.importacao_id as string,
  ordem_servico_id: row.ordem_servico_id as string,
  tipo_item: row.tipo_item as ItemVinculoTipo,
  produto_os_id: (row.produto_os_id as string | null) ?? null,
  servico_os_id: (row.servico_os_id as string | null) ?? null,
  fingerprint_contexto: row.fingerprint_contexto as string,
  origem_linha: (row.origem_linha as number | null) ?? null,
  sequencia_importacao: (row.sequencia_importacao as number | null) ?? null,
  codigo_poli: (row.codigo_poli as string | null) ?? null,
  hash_conteudo: (row.hash_conteudo as string | null) ?? null,
  metodo_vinculo: row.metodo_vinculo as ItemVinculoMetodo,
  estado_vinculo: row.estado_vinculo as ItemVinculoEstado,
  homologado_por: (row.homologado_por as string | null) ?? null,
  homologado_em: (row.homologado_em as Date | null) ?? null,
  justificativa: (row.justificativa as string | null) ?? null,
  evidencia_snapshot: (row.evidencia_snapshot as Record<string, unknown>) ?? {},
  created_at: row.created_at as Date,
  updated_at: row.updated_at as Date,
});

function validateInput(input: CreateItemVinculoInput): void {
  if (!isOneOf(input.tipoItem, itemVinculoTipos)) throw new Error('tipoItem inválido.');
  if (!isOneOf(input.metodoVinculo, itemVinculoMetodos)) throw new Error('metodoVinculo inválido.');
  const fingerprint = requiredText(input.fingerprintContexto, 'fingerprintContexto');
  if (fingerprint.length > 128) throw new Error('fingerprintContexto excede 128 caracteres.');
  const itemId = input.tipoItem === 'PRODUTO' ? input.produtoOsId : input.servicoOsId;
  const otherId = input.tipoItem === 'PRODUTO' ? input.servicoOsId : input.produtoOsId;
  if (!itemId || otherId) throw new Error('O item informado não corresponde ao tipo do vínculo.');
  if (input.metodoVinculo === 'IMPORTADO_DIRETO') {
    if (input.homologadoPor || input.homologadoEm) throw new Error('IMPORTADO_DIRETO não aceita homologação.');
  } else if (!requiredText(input.homologadoPor, 'homologadoPor')) {
    throw new Error('Vínculo homologado exige homologadoPor.');
  } else if (input.homologadoEm !== undefined && !(input.homologadoEm instanceof Date)) {
    throw new Error('homologadoEm deve ser uma data.');
  }
  if (input.evidenciaSnapshot !== undefined && !isRecord(input.evidenciaSnapshot)) {
    throw new Error('evidenciaSnapshot deve ser um objeto.');
  }
}

async function validateReferences(db: ItemVinculoDb, input: CreateItemVinculoInput): Promise<void> {
  const importacao = await db.query('SELECT 1 FROM importacoes_os WHERE id=$1', [input.importacaoId]);
  if (!importacao.rowCount) throw new Error('Importação não encontrada.');
  const order = await db.query('SELECT 1 FROM ordens_servico WHERE id=$1', [input.ordemServicoId]);
  if (!order.rowCount) throw new Error('Ordem de Serviço não encontrada.');
  const itemId = input.tipoItem === 'PRODUTO' ? input.produtoOsId : input.servicoOsId;
  const table = input.tipoItem === 'PRODUTO' ? 'produtos_os' : 'servicos_os';
  const item = await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND ordem_servico_id=$2`, [itemId, input.ordemServicoId]);
  if (!item.rowCount) throw new Error('O item não pertence à Ordem de Serviço informada.');
}

export async function createItemVinculo(input: CreateItemVinculoInput, db: ItemVinculoDb = pool): Promise<OrdemServicoItemVinculo> {
  validateInput(input);
  await validateReferences(db, input);
  const homologadoPor = input.metodoVinculo === 'IMPORTADO_DIRETO' ? null : requiredText(input.homologadoPor, 'homologadoPor');
  const homologadoEm = input.metodoVinculo === 'IMPORTADO_DIRETO' ? null : (input.homologadoEm ?? new Date());
  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO ordens_servico_item_vinculos(
       importacao_id,ordem_servico_id,tipo_item,produto_os_id,servico_os_id,
       fingerprint_contexto,origem_linha,sequencia_importacao,codigo_poli,hash_conteudo,
       metodo_vinculo,homologado_por,homologado_em,justificativa,evidencia_snapshot
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     RETURNING *`,
    [
      input.importacaoId, input.ordemServicoId, input.tipoItem, input.produtoOsId ?? null,
      input.servicoOsId ?? null, input.fingerprintContexto.trim(), input.origemLinha ?? null,
      input.sequenciaImportacao ?? null, input.codigoPoli ?? null, input.hashConteudo ?? null,
      input.metodoVinculo, homologadoPor, homologadoEm, input.justificativa ?? null,
      JSON.stringify(input.evidenciaSnapshot ?? {}),
    ],
  );
  return rowOf(result.rows[0]!);
}

export async function getItemVinculo(id: string, db: ItemVinculoDb = pool): Promise<OrdemServicoItemVinculo | undefined> {
  const result = await db.query<Record<string, unknown>>('SELECT * FROM ordens_servico_item_vinculos WHERE id=$1', [id]);
  return result.rows[0] ? rowOf(result.rows[0]) : undefined;
}

export async function getActiveItemVinculoByOccurrence(
  importacaoId: string,
  ordemServicoId: string,
  tipoItem: ItemVinculoTipo,
  fingerprintContexto: string,
  db: ItemVinculoDb = pool,
): Promise<OrdemServicoItemVinculo | undefined> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM ordens_servico_item_vinculos
     WHERE importacao_id=$1 AND ordem_servico_id=$2 AND tipo_item=$3
       AND fingerprint_contexto=$4 AND estado_vinculo='ATIVO'`,
    [importacaoId, ordemServicoId, tipoItem, fingerprintContexto],
  );
  return result.rows[0] ? rowOf(result.rows[0]) : undefined;
}

export async function listActiveItemVinculos(ordemServicoId: string, db: ItemVinculoDb = pool): Promise<OrdemServicoItemVinculo[]> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM ordens_servico_item_vinculos
     WHERE ordem_servico_id=$1 AND estado_vinculo='ATIVO'
     ORDER BY created_at,id`,
    [ordemServicoId],
  );
  return result.rows.map(rowOf);
}

export async function revokeItemVinculo(id: string, justificativa: string, db: ItemVinculoDb = pool): Promise<OrdemServicoItemVinculo | undefined> {
  const reason = requiredText(justificativa, 'justificativa');
  const result = await db.query<Record<string, unknown>>(
    `UPDATE ordens_servico_item_vinculos
     SET estado_vinculo='REVOGADO', justificativa=$2
     WHERE id=$1 AND estado_vinculo='ATIVO'
     RETURNING *`,
    [id, reason],
  );
  return result.rows[0] ? rowOf(result.rows[0]) : undefined;
}
