import { pool } from '../config/database.js';

export const obraStatuses = ['ATIVA', 'INATIVA'] as const;
type ObraStatus = (typeof obraStatuses)[number];

export interface Obra {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  status: ObraStatus;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ObraFields {
  codigo: string;
  nome: string;
  descricao: string | null;
  status: ObraStatus;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
}

export interface ObraFilters {
  status?: string;
  codigo?: string;
  nome?: string;
}

export class ObraServiceError extends Error {
  constructor(public readonly statusCode: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'ObraServiceError';
  }
}

interface PostgresError {
  code?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPostgresError = (error: unknown): error is PostgresError => isRecord(error);

const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const optionalText = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ObraServiceError(400, `${field} deve ser um texto.`);
  }
  return value;
};

const parseFields = (body: unknown, partial = false): ObraFields | Partial<ObraFields> => {
  if (!isRecord(body)) {
    throw new ObraServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }

  const fields: Partial<ObraFields> = {};
  if (!partial || body.codigo !== undefined) {
    if (typeof body.codigo !== 'string' || body.codigo.trim() === '') {
      throw new ObraServiceError(400, 'codigo é obrigatório.');
    }
    if (body.codigo.trim().length > 50) throw new ObraServiceError(400, 'codigo deve ter no máximo 50 caracteres.');
    fields.codigo = body.codigo.trim();
  }
  if (!partial || body.nome !== undefined) {
    if (typeof body.nome !== 'string' || body.nome.trim() === '') {
      throw new ObraServiceError(400, 'nome é obrigatório.');
    }
    if (body.nome.trim().length > 255) throw new ObraServiceError(400, 'nome deve ter no máximo 255 caracteres.');
    fields.nome = body.nome.trim();
  }
  if (!partial || body.descricao !== undefined) fields.descricao = optionalText(body.descricao, 'descricao');
  if (body.status !== undefined) {
    if (body.status !== 'ATIVA' && body.status !== 'INATIVA') {
      throw new ObraServiceError(400, 'status deve ser ATIVA ou INATIVA.');
    }
    fields.status = body.status;
  } else if (!partial) {
    fields.status = 'ATIVA';
  }
  if (!partial || body.data_inicio !== undefined) fields.data_inicio = parseDate(body.data_inicio, 'data_inicio');
  if (!partial || body.data_fim !== undefined) fields.data_fim = parseDate(body.data_fim, 'data_fim');
  if (!partial || body.observacoes !== undefined) fields.observacoes = optionalText(body.observacoes, 'observacoes');

  if (!partial && fields.status === undefined) fields.status = 'ATIVA';
  if (fields.data_inicio && fields.data_fim && fields.data_fim < fields.data_inicio) {
    throw new ObraServiceError(400, 'data_fim não pode ser anterior a data_inicio.');
  }
  return fields;
};

const parseDate = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isValidDate(value)) {
    throw new ObraServiceError(400, `${field} deve estar no formato YYYY-MM-DD.`);
  }
  return value;
};

const handleDatabaseError = (error: unknown): never => {
  if (isPostgresError(error) && error.code === '23505') {
    throw new ObraServiceError(409, 'Já existe uma obra com este código.');
  }
  if (isPostgresError(error) && error.code === '23503') {
    throw new ObraServiceError(409, 'A obra já está em uso e deve ser inativada em vez de excluída.');
  }
  throw error;
};

export async function listObras(filters: ObraFilters): Promise<Obra[]> {
  if (filters.status && filters.status !== 'ATIVA' && filters.status !== 'INATIVA') {
    throw new ObraServiceError(400, 'status deve ser ATIVA ou INATIVA.');
  }
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.status) { conditions.push(`status = $${values.length + 1}`); values.push(filters.status); }
  if (filters.codigo) { conditions.push(`codigo ILIKE $${values.length + 1}`); values.push(`%${filters.codigo}%`); }
  if (filters.nome) { conditions.push(`nome ILIKE $${values.length + 1}`); values.push(`%${filters.nome}%`); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query<Obra>(`SELECT * FROM obras ${where} ORDER BY codigo ASC`, values);
  return result.rows;
}

export async function getObra(id: string): Promise<Obra> {
  const result = await pool.query<Obra>('SELECT * FROM obras WHERE id = $1', [id]);
  if (result.rows.length === 0) throw new ObraServiceError(404, 'Obra não encontrada.');
  return result.rows[0]!;
}

export async function createObra(body: unknown): Promise<Obra> {
  const fields = parseFields(body) as ObraFields;
  try {
    const result = await pool.query<Obra>(
      `INSERT INTO obras (codigo, nome, descricao, status, data_inicio, data_fim, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [fields.codigo, fields.nome, fields.descricao, fields.status, fields.data_inicio, fields.data_fim, fields.observacoes],
    );
    return result.rows[0]!;
  } catch (error) { return handleDatabaseError(error); }
}

export async function updateObra(id: string, body: unknown): Promise<Obra> {
  const fields = parseFields(body) as ObraFields;
  try {
    const result = await pool.query<Obra>(
      `UPDATE obras SET codigo = $1, nome = $2, descricao = $3, status = $4,
       data_inicio = $5, data_fim = $6, observacoes = $7 WHERE id = $8 RETURNING *`,
      [fields.codigo, fields.nome, fields.descricao, fields.status, fields.data_inicio, fields.data_fim, fields.observacoes, id],
    );
    if (result.rows.length === 0) throw new ObraServiceError(404, 'Obra não encontrada.');
    return result.rows[0]!;
  } catch (error) { return handleDatabaseError(error); }
}

export async function updateObraStatus(id: string, body: unknown): Promise<Obra> {
  if (!isRecord(body) || (body.status !== 'ATIVA' && body.status !== 'INATIVA')) {
    throw new ObraServiceError(400, 'status deve ser ATIVA ou INATIVA.');
  }
  const result = await pool.query<Obra>('UPDATE obras SET status = $1 WHERE id = $2 RETURNING *', [body.status, id]);
  if (result.rows.length === 0) throw new ObraServiceError(404, 'Obra não encontrada.');
  return result.rows[0]!;
}

export async function deleteObra(id: string): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM obras WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new ObraServiceError(404, 'Obra não encontrada.');
  } catch (error) { return handleDatabaseError(error); }
}