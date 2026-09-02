import { pool } from '../config/database.js';

export const funcionarioStatuses = ['ATIVO', 'INATIVO'] as const;
type FuncionarioStatus = (typeof funcionarioStatuses)[number];

export interface Funcionario {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
  status: FuncionarioStatus;
  created_at: Date;
  updated_at: Date;
}

interface FuncionarioFields {
  nome: string;
  matricula: string | null;
  cargo: string | null;
  status: FuncionarioStatus;
}

export interface FuncionarioFilters {
  status?: string;
  nome?: string;
  matricula?: string;
  cargo?: string;
}

export class FuncionarioServiceError extends Error {
  constructor(public readonly statusCode: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'FuncionarioServiceError';
  }
}

interface PostgresError { code?: string; }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPostgresError = (error: unknown): error is PostgresError => isRecord(error);

const nullableText = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new FuncionarioServiceError(400, `${field} deve ser um texto ou null.`);
  }
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
};

const parseFields = (body: unknown, requireStatus: boolean): FuncionarioFields => {
  if (!isRecord(body)) {
    throw new FuncionarioServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }
  if (typeof body.nome !== 'string' || body.nome.trim() === '') {
    throw new FuncionarioServiceError(400, 'nome é obrigatório.');
  }
  const nome = body.nome.trim();
  if (nome.length > 255) {
    throw new FuncionarioServiceError(400, 'nome deve ter no máximo 255 caracteres.');
  }
  if (requireStatus && body.status === undefined) {
    throw new FuncionarioServiceError(400, 'status é obrigatório.');
  }
  const status = body.status === undefined ? 'ATIVO' : body.status;
  if (status !== 'ATIVO' && status !== 'INATIVO') {
    throw new FuncionarioServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  }
  return {
    nome,
    matricula: nullableText(body.matricula, 'matricula'),
    cargo: nullableText(body.cargo, 'cargo'),
    status,
  };
};

const handleDatabaseError = (error: unknown): never => {
  if (isPostgresError(error) && error.code === '23505') {
    throw new FuncionarioServiceError(409, 'Já existe um funcionário com esta matrícula.');
  }
  if (isPostgresError(error) && (error.code === '23503' || error.code === '23001')) {
    throw new FuncionarioServiceError(409, 'Não é possível excluir este funcionário porque ele está sendo utilizado.');
  }
  throw error;
};

export async function listFuncionarios(filters: FuncionarioFilters): Promise<Funcionario[]> {
  if (filters.status !== undefined && filters.status !== 'ATIVO' && filters.status !== 'INATIVO') {
    throw new FuncionarioServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  }
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.status !== undefined) { conditions.push(`status = $${values.length + 1}`); values.push(filters.status); }
  if (filters.nome !== undefined) { conditions.push(`nome ILIKE $${values.length + 1}`); values.push(`%${filters.nome.trim()}%`); }
  if (filters.matricula !== undefined) { conditions.push(`matricula ILIKE $${values.length + 1}`); values.push(`%${filters.matricula.trim()}%`); }
  if (filters.cargo !== undefined) { conditions.push(`cargo ILIKE $${values.length + 1}`); values.push(`%${filters.cargo.trim()}%`); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query<Funcionario>(`SELECT * FROM funcionarios ${where} ORDER BY nome ASC`, values);
  return result.rows;
}

export async function getFuncionario(id: string): Promise<Funcionario> {
  const result = await pool.query<Funcionario>('SELECT * FROM funcionarios WHERE id = $1', [id]);
  if (result.rows.length === 0) throw new FuncionarioServiceError(404, 'Funcionário não encontrado.');
  return result.rows[0]!;
}

export async function createFuncionario(body: unknown): Promise<Funcionario> {
  const fields = parseFields(body, false);
  try {
    const result = await pool.query<Funcionario>(
      `INSERT INTO funcionarios (nome, matricula, cargo, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [fields.nome, fields.matricula, fields.cargo, fields.status],
    );
    return result.rows[0]!;
  } catch (error) { return handleDatabaseError(error); }
}

export async function updateFuncionario(id: string, body: unknown): Promise<Funcionario> {
  const fields = parseFields(body, true);
  try {
    const result = await pool.query<Funcionario>(
      `UPDATE funcionarios SET nome = $1, matricula = $2, cargo = $3, status = $4
       WHERE id = $5 RETURNING *`,
      [fields.nome, fields.matricula, fields.cargo, fields.status, id],
    );
    if (result.rows.length === 0) throw new FuncionarioServiceError(404, 'Funcionário não encontrado.');
    return result.rows[0]!;
  } catch (error) { return handleDatabaseError(error); }
}

export async function updateFuncionarioStatus(id: string, body: unknown): Promise<Funcionario> {
  if (!isRecord(body) || (body.status !== 'ATIVO' && body.status !== 'INATIVO')) {
    throw new FuncionarioServiceError(400, 'status deve ser ATIVO ou INATIVO.');
  }
  const result = await pool.query<Funcionario>(
    'UPDATE funcionarios SET status = $1 WHERE id = $2 RETURNING *',
    [body.status, id],
  );
  if (result.rows.length === 0) throw new FuncionarioServiceError(404, 'Funcionário não encontrado.');
  return result.rows[0]!;
}

export async function deleteFuncionario(id: string): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM funcionarios WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new FuncionarioServiceError(404, 'Funcionário não encontrado.');
  } catch (error) { return handleDatabaseError(error); }
}
