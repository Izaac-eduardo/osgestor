import { pool } from '../config/database.js';

export const ordemServicoNaturezas = ['INTERNA', 'TERCEIRO', 'MATERIAL'] as const;
export const ordemServicoCategorias = [
  'MECANICA',
  'AUTO_ELETRICA',
  'BORRACHARIA',
  'LUBRIFICACAO',
  'SOLDAGEM',
  'FUNILARIA',
  'HIDRAULICA',
  'OUTROS',
] as const;
export const ordemServicoStatuses = [
  'ABERTA',
  'EM_ANDAMENTO',
  'AGUARDANDO_PECA',
  'FINALIZADA',
  'CANCELADA',
] as const;

type OrdemServicoNatureza = (typeof ordemServicoNaturezas)[number];
type OrdemServicoCategoria = (typeof ordemServicoCategorias)[number];
type OrdemServicoStatus = (typeof ordemServicoStatuses)[number];

export interface OrdemServico {
  id: string;
  numero_os: string;
  obra_id: string;
  prefixo_frota_id: string;
  frota_numero: number;
  natureza_os: OrdemServicoNatureza;
  categoria_servico: OrdemServicoCategoria | null;
  prestador_terceiro: string | null;
  data_abertura: string;
  data_fechamento: string | null;
  status: OrdemServicoStatus;
  observacoes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrdemServicoResumo extends OrdemServico {
  obra_codigo: string;
  obra_nome: string;
  frota_prefixo: string;
  frota_codigo: string;
  total_mao_obra_interna: string;
  total_servicos_terceiros: string;
  total_produtos: string;
  total_os: string;
}

interface OrdemServicoFields {
  numero_os: number;
  obra_id: string;
  prefixo_frota_id: string;
  frota_numero: number;
  natureza_os: OrdemServicoNatureza;
  categoria_servico: OrdemServicoCategoria | null;
  prestador_terceiro: string | null;
  data_abertura: string;
  data_fechamento: string | null;
  status: OrdemServicoStatus;
  observacoes: string | null;
}

export interface OrdemServicoFilters {
  status?: string;
  natureza_os?: string;
  categoria_servico?: string;
  obra_id?: string;
  prefixo_frota_id?: string;
  numero_os?: string;
  frota_numero?: string;
  data_inicio?: string;
  data_fim?: string;
}

export class OrdemServicoServiceError extends Error {
  constructor(public readonly statusCode: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'OrdemServicoServiceError';
  }
}

interface PostgresError {
  code?: string;
}

interface RelationshipResult {
  obra_existe: boolean;
  prefixo_existe: boolean;
}

interface NaturezaChangeResult {
  natureza_os: OrdemServicoNatureza;
  possui_funcionarios: boolean;
  possui_servicos: boolean;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPostgresError = (error: unknown): error is PostgresError => isRecord(error);

const isNatureza = (value: unknown): value is OrdemServicoNatureza =>
  typeof value === 'string' && ordemServicoNaturezas.some((item) => item === value);

const isCategoria = (value: unknown): value is OrdemServicoCategoria =>
  typeof value === 'string' && ordemServicoCategorias.some((item) => item === value);

const isStatus = (value: unknown): value is OrdemServicoStatus =>
  typeof value === 'string' && ordemServicoStatuses.some((item) => item === value);

const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const requiredPositiveInteger = (value: unknown, field: string, max?: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || (max !== undefined && value > max)) {
    throw new OrdemServicoServiceError(400, `${field} deve ser um inteiro positivo válido.`);
  }
  return value;
};

const filterPositiveInteger = (value: string, field: string, max?: number): string => {
  if (!/^\d+$/.test(value) || value === '0') {
    throw new OrdemServicoServiceError(400, `${field} deve ser um inteiro positivo válido.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (max !== undefined && parsed > max)) {
    throw new OrdemServicoServiceError(400, `${field} deve ser um inteiro positivo válido.`);
  }
  return value;
};

const requiredUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new OrdemServicoServiceError(400, `${field} deve ser um UUID válido.`);
  }
  return value;
};

const nullableText = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new OrdemServicoServiceError(400, `${field} deve ser um texto ou null.`);
  }
  const text = value.trim();
  return text === '' ? null : text;
};

const requiredDate = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !isValidDate(value)) {
    throw new OrdemServicoServiceError(400, `${field} deve estar no formato YYYY-MM-DD.`);
  }
  return value;
};

const nullableDate = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  return requiredDate(value, field);
};

const parseFields = (body: unknown, requireStatus: boolean): OrdemServicoFields => {
  if (!isRecord(body)) {
    throw new OrdemServicoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }
  if (!isNatureza(body.natureza_os)) {
    throw new OrdemServicoServiceError(400, 'natureza_os deve ser INTERNA, TERCEIRO ou MATERIAL.');
  }
  if (requireStatus && body.status === undefined) {
    throw new OrdemServicoServiceError(400, 'status é obrigatório.');
  }
  const status = body.status === undefined ? 'ABERTA' : body.status;
  if (!isStatus(status)) {
    throw new OrdemServicoServiceError(400, 'status inválido.');
  }

  let categoria: OrdemServicoCategoria | null = null;
  if (body.categoria_servico !== undefined && body.categoria_servico !== null && body.categoria_servico !== '') {
    if (!isCategoria(body.categoria_servico)) {
      throw new OrdemServicoServiceError(400, 'categoria_servico inválida.');
    }
    categoria = body.categoria_servico;
  }

  const dataAbertura = requiredDate(body.data_abertura, 'data_abertura');
  const dataFechamento = nullableDate(body.data_fechamento, 'data_fechamento');
  if (dataFechamento !== null && dataFechamento < dataAbertura) {
    throw new OrdemServicoServiceError(400, 'data_fechamento não pode ser anterior a data_abertura.');
  }

  let prestadorTerceiro = nullableText(body.prestador_terceiro, 'prestador_terceiro');
  if (body.natureza_os === 'TERCEIRO' && prestadorTerceiro === null) {
    throw new OrdemServicoServiceError(400, 'prestador_terceiro é obrigatório para natureza TERCEIRO.');
  }
  if (body.natureza_os !== 'TERCEIRO') prestadorTerceiro = null;
  if (prestadorTerceiro !== null && prestadorTerceiro.length > 255) {
    throw new OrdemServicoServiceError(400, 'prestador_terceiro deve ter no máximo 255 caracteres.');
  }

  return {
    numero_os: requiredPositiveInteger(body.numero_os, 'numero_os'),
    obra_id: requiredUuid(body.obra_id, 'obra_id'),
    prefixo_frota_id: requiredUuid(body.prefixo_frota_id, 'prefixo_frota_id'),
    frota_numero: requiredPositiveInteger(body.frota_numero, 'frota_numero', 2147483647),
    natureza_os: body.natureza_os,
    categoria_servico: categoria,
    prestador_terceiro: prestadorTerceiro,
    data_abertura: dataAbertura,
    data_fechamento: dataFechamento,
    status,
    observacoes: nullableText(body.observacoes, 'observacoes'),
  };
};

const validateRelationships = async (obraId: string, prefixoFrotaId: string): Promise<void> => {
  const result = await pool.query<RelationshipResult>(
    `SELECT
       EXISTS (SELECT 1 FROM obras WHERE id = $1) AS obra_existe,
       EXISTS (SELECT 1 FROM prefixos_frota WHERE id = $2) AS prefixo_existe`,
    [obraId, prefixoFrotaId],
  );
  const relationships = result.rows[0]!;
  if (!relationships.obra_existe) {
    throw new OrdemServicoServiceError(400, 'A obra informada não existe.');
  }
  if (!relationships.prefixo_existe) {
    throw new OrdemServicoServiceError(400, 'O prefixo de frota informado não existe.');
  }
};

const handleWriteError = (error: unknown): never => {
  if (isPostgresError(error) && error.code === '23505') {
    throw new OrdemServicoServiceError(409, 'Já existe uma Ordem de Serviço com este número.');
  }
  if (isPostgresError(error) && error.code === '23503') {
    throw new OrdemServicoServiceError(400, 'A obra ou o prefixo de frota informado não existe.');
  }
  throw error;
};

export async function listOrdensServico(filters: OrdemServicoFilters): Promise<OrdemServicoResumo[]> {
  if (filters.status !== undefined && !isStatus(filters.status)) {
    throw new OrdemServicoServiceError(400, 'status inválido.');
  }
  if (filters.natureza_os !== undefined && !isNatureza(filters.natureza_os)) {
    throw new OrdemServicoServiceError(400, 'natureza_os inválida.');
  }
  if (filters.categoria_servico !== undefined && !isCategoria(filters.categoria_servico)) {
    throw new OrdemServicoServiceError(400, 'categoria_servico inválida.');
  }
  if (filters.obra_id !== undefined && !uuidPattern.test(filters.obra_id)) {
    throw new OrdemServicoServiceError(400, 'obra_id deve ser um UUID válido.');
  }
  if (filters.prefixo_frota_id !== undefined && !uuidPattern.test(filters.prefixo_frota_id)) {
    throw new OrdemServicoServiceError(400, 'prefixo_frota_id deve ser um UUID válido.');
  }
  if (filters.data_inicio !== undefined && !isValidDate(filters.data_inicio)) {
    throw new OrdemServicoServiceError(400, 'data_inicio deve estar no formato YYYY-MM-DD.');
  }
  if (filters.data_fim !== undefined && !isValidDate(filters.data_fim)) {
    throw new OrdemServicoServiceError(400, 'data_fim deve estar no formato YYYY-MM-DD.');
  }
  if (filters.data_inicio !== undefined && filters.data_fim !== undefined && filters.data_fim < filters.data_inicio) {
    throw new OrdemServicoServiceError(400, 'data_fim não pode ser anterior a data_inicio.');
  }

  const conditions: string[] = [];
  const values: string[] = [];
  const addCondition = (column: string, value: string): void => {
    conditions.push(`${column} = $${values.length + 1}`);
    values.push(value);
  };

  if (filters.status !== undefined) addCondition('status', filters.status);
  if (filters.natureza_os !== undefined) addCondition('natureza_os', filters.natureza_os);
  if (filters.categoria_servico !== undefined) addCondition('categoria_servico', filters.categoria_servico);
  if (filters.obra_id !== undefined) addCondition('obra_id', filters.obra_id);
  if (filters.prefixo_frota_id !== undefined) addCondition('prefixo_frota_id', filters.prefixo_frota_id);
  if (filters.numero_os !== undefined) addCondition('numero_os', filterPositiveInteger(filters.numero_os, 'numero_os'));
  if (filters.frota_numero !== undefined) {
    addCondition('frota_numero', filterPositiveInteger(filters.frota_numero, 'frota_numero', 2147483647));
  }
  if (filters.data_inicio !== undefined) {
    conditions.push(`data_abertura >= $${values.length + 1}`);
    values.push(filters.data_inicio);
  }
  if (filters.data_fim !== undefined) {
    conditions.push(`data_abertura <= $${values.length + 1}`);
    values.push(filters.data_fim);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query<OrdemServicoResumo>(
    `SELECT * FROM vw_ordens_servico_resumo ${where} ORDER BY numero_os DESC`,
    values,
  );
  return result.rows;
}

export async function getOrdemServico(id: string): Promise<OrdemServicoResumo> {
  const result = await pool.query<OrdemServicoResumo>(
    'SELECT * FROM vw_ordens_servico_resumo WHERE id = $1',
    [id],
  );
  if (result.rows.length === 0) {
    throw new OrdemServicoServiceError(404, 'Ordem de Serviço não encontrada.');
  }
  return result.rows[0]!;
}

export async function createOrdemServico(body: unknown): Promise<OrdemServico> {
  const fields = parseFields(body, false);
  await validateRelationships(fields.obra_id, fields.prefixo_frota_id);
  try {
    const result = await pool.query<OrdemServico>(
      `INSERT INTO ordens_servico (
         numero_os, obra_id, prefixo_frota_id, frota_numero, natureza_os,
         categoria_servico, prestador_terceiro, data_abertura, data_fechamento,
         status, observacoes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        fields.numero_os,
        fields.obra_id,
        fields.prefixo_frota_id,
        fields.frota_numero,
        fields.natureza_os,
        fields.categoria_servico,
        fields.prestador_terceiro,
        fields.data_abertura,
        fields.data_fechamento,
        fields.status,
        fields.observacoes,
      ],
    );
    return result.rows[0]!;
  } catch (error) {
    return handleWriteError(error);
  }
}

export async function updateOrdemServico(id: string, body: unknown): Promise<OrdemServico> {
  const fields = parseFields(body, true);
  await validateRelationships(fields.obra_id, fields.prefixo_frota_id);
  const currentResult = await pool.query<NaturezaChangeResult>(
    `SELECT
       natureza_os,
       EXISTS (
         SELECT 1 FROM ordens_servico_funcionarios WHERE ordem_servico_id = $1
       ) AS possui_funcionarios,
       EXISTS (
         SELECT 1 FROM servicos_os WHERE ordem_servico_id = $1
       ) AS possui_servicos
     FROM ordens_servico WHERE id = $1`,
    [id],
  );
  if (currentResult.rows.length === 0) {
    throw new OrdemServicoServiceError(404, 'Ordem de Serviço não encontrada.');
  }
  const current = currentResult.rows[0]!;
  if (
    current.natureza_os !== 'MATERIAL'
    && fields.natureza_os === 'MATERIAL'
    && (current.possui_funcionarios || current.possui_servicos)
  ) {
    throw new OrdemServicoServiceError(
      409,
      'Remova os funcionários vinculados e os serviços antes de alterar a natureza para MATERIAL.',
    );
  }
  try {
    const result = await pool.query<OrdemServico>(
      `UPDATE ordens_servico SET
         numero_os = $1, obra_id = $2, prefixo_frota_id = $3, frota_numero = $4,
         natureza_os = $5, categoria_servico = $6, prestador_terceiro = $7,
         data_abertura = $8, data_fechamento = $9, status = $10, observacoes = $11
       WHERE id = $12 RETURNING *`,
      [
        fields.numero_os,
        fields.obra_id,
        fields.prefixo_frota_id,
        fields.frota_numero,
        fields.natureza_os,
        fields.categoria_servico,
        fields.prestador_terceiro,
        fields.data_abertura,
        fields.data_fechamento,
        fields.status,
        fields.observacoes,
        id,
      ],
    );
    if (result.rows.length === 0) {
      throw new OrdemServicoServiceError(404, 'Ordem de Serviço não encontrada.');
    }
    return result.rows[0]!;
  } catch (error) {
    return handleWriteError(error);
  }
}

export async function updateOrdemServicoStatus(id: string, body: unknown): Promise<OrdemServico> {
  if (!isRecord(body) || !isStatus(body.status)) {
    throw new OrdemServicoServiceError(400, 'status inválido.');
  }
  const result = await pool.query<OrdemServico>(
    `UPDATE ordens_servico
     SET status = $1,
         data_fechamento = CASE
           WHEN $2 = 'FINALIZADA' AND data_fechamento IS NULL THEN CURRENT_DATE
           ELSE data_fechamento
         END
     WHERE id = $3 RETURNING *`,
    [body.status, body.status, id],
  );
  if (result.rows.length === 0) {
    throw new OrdemServicoServiceError(404, 'Ordem de Serviço não encontrada.');
  }
  return result.rows[0]!;
}

export async function deleteOrdemServico(id: string): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM ordens_servico WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new OrdemServicoServiceError(404, 'Ordem de Serviço não encontrada.');
    }
  } catch (error) {
    if (isPostgresError(error) && error.code === '23503') {
      throw new OrdemServicoServiceError(
        409,
        'A Ordem de Serviço possui relacionamentos e não pode ser excluída.',
      );
    }
    throw error;
  }
}
