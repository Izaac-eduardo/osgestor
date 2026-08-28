import { pool } from '../config/database.js';
import {
  OrdemServicoResumo,
  OrdemServicoServiceError,
  getOrdemServico,
} from './ordens-servico.service.js';

type NaturezaOs = 'INTERNA' | 'TERCEIRO' | 'MATERIAL';

export interface FuncionarioOs {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
  status: 'ATIVO' | 'INATIVO';
}

export interface ServicoOs {
  id: string;
  ordem_servico_id: string;
  descricao: string;
  valor: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProdutoOs {
  id: string;
  ordem_servico_id: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  valor_unitario: string;
  valor_total: string;
  created_at: Date;
  updated_at: Date;
}

interface ServicoFields {
  descricao: string;
  valor: number;
}

interface ProdutoFields {
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
}

interface OrdemNaturezaRow {
  natureza_os: NaturezaOs;
}

interface ExistsRow {
  existe: boolean;
}

interface PostgresError {
  code?: string;
}

export interface OrdemServicoDetalhes
  extends Omit<
    OrdemServicoResumo,
    | 'total_mao_obra_interna'
    | 'total_servicos_terceiros'
    | 'total_produtos'
    | 'total_os'
  > {
  funcionarios: FuncionarioOs[];
  servicos: Array<Omit<ServicoOs, 'valor'> & { valor: number }>;
  produtos: Array<
    Omit<ProdutoOs, 'quantidade' | 'valor_unitario' | 'valor_total'> & {
      quantidade: number;
      valor_unitario: number;
      valor_total: number;
    }
  >;
  total_mao_obra_interna: number;
  total_servicos_terceiros: number;
  total_produtos: number;
  total_os: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPostgresError = (error: unknown): error is PostgresError => isRecord(error);

const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OrdemServicoServiceError(400, `${field} é obrigatório.`);
  }
  return value.trim();
};

const decimalNumber = (
  value: unknown,
  field: string,
  scale: number,
  strictlyPositive: boolean,
  maximum: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new OrdemServicoServiceError(400, `${field} deve ser numérico.`);
  }
  if ((strictlyPositive && value <= 0) || (!strictlyPositive && value < 0)) {
    const comparison = strictlyPositive ? 'maior que zero' : 'maior ou igual a zero';
    throw new OrdemServicoServiceError(400, `${field} deve ser ${comparison}.`);
  }
  if (value > maximum) {
    throw new OrdemServicoServiceError(400, `${field} excede o limite permitido.`);
  }
  const factor = 10 ** scale;
  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-8) {
    throw new OrdemServicoServiceError(400, `${field} deve ter no máximo ${scale} casas decimais.`);
  }
  return value;
};

const parseServico = (body: unknown): ServicoFields => {
  if (!isRecord(body)) {
    throw new OrdemServicoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }
  return {
    descricao: requiredText(body.descricao, 'descricao'),
    valor: decimalNumber(body.valor, 'valor', 2, false, 9999999999.99),
  };
};

const parseProduto = (body: unknown): ProdutoFields => {
  if (!isRecord(body)) {
    throw new OrdemServicoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }
  return {
    descricao: requiredText(body.descricao, 'descricao'),
    quantidade: decimalNumber(body.quantidade, 'quantidade', 3, true, 999999999.999),
    unidade: requiredText(body.unidade, 'unidade').toUpperCase(),
    valor_unitario: decimalNumber(
      body.valor_unitario,
      'valor_unitario',
      2,
      false,
      9999999999.99,
    ),
  };
};

const getOrdemNatureza = async (ordemServicoId: string): Promise<NaturezaOs> => {
  const result = await pool.query<OrdemNaturezaRow>(
    'SELECT natureza_os FROM ordens_servico WHERE id = $1',
    [ordemServicoId],
  );
  if (result.rows.length === 0) {
    throw new OrdemServicoServiceError(404, 'Ordem de Serviço não encontrada.');
  }
  return result.rows[0]!.natureza_os;
};

const ensureFuncionarioExists = async (funcionarioId: string): Promise<void> => {
  const result = await pool.query<ExistsRow>(
    'SELECT EXISTS (SELECT 1 FROM funcionarios WHERE id = $1) AS existe',
    [funcionarioId],
  );
  if (!result.rows[0]!.existe) {
    throw new OrdemServicoServiceError(404, 'Funcionário não encontrado.');
  }
};

const rawFuncionarios = async (ordemServicoId: string): Promise<FuncionarioOs[]> => {
  const result = await pool.query<FuncionarioOs>(
    `SELECT f.id, f.nome, f.matricula, f.cargo, f.status
     FROM ordens_servico_funcionarios osf
     JOIN funcionarios f ON f.id = osf.funcionario_id
     WHERE osf.ordem_servico_id = $1
     ORDER BY f.nome ASC`,
    [ordemServicoId],
  );
  return result.rows;
};

const rawServicos = async (ordemServicoId: string): Promise<ServicoOs[]> => {
  const result = await pool.query<ServicoOs>(
    'SELECT * FROM servicos_os WHERE ordem_servico_id = $1 ORDER BY created_at ASC',
    [ordemServicoId],
  );
  return result.rows;
};

const rawProdutos = async (ordemServicoId: string): Promise<ProdutoOs[]> => {
  const result = await pool.query<ProdutoOs>(
    'SELECT * FROM produtos_os WHERE ordem_servico_id = $1 ORDER BY created_at ASC',
    [ordemServicoId],
  );
  return result.rows;
};

const numericToNumber = (value: string, field: string): number => {
  const converted = Number(value);
  if (!Number.isFinite(converted) || Math.abs(converted) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Valor NUMERIC fora da faixa segura em ${field}.`);
  }
  return converted;
};

export async function listFuncionariosOs(ordemServicoId: string): Promise<FuncionarioOs[]> {
  await getOrdemNatureza(ordemServicoId);
  return rawFuncionarios(ordemServicoId);
}

export async function addFuncionarioOs(ordemServicoId: string, body: unknown): Promise<FuncionarioOs> {
  if (!isRecord(body) || typeof body.funcionario_id !== 'string') {
    throw new OrdemServicoServiceError(400, 'funcionario_id é obrigatório.');
  }
  const funcionarioId = body.funcionario_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(funcionarioId)) {
    throw new OrdemServicoServiceError(400, 'funcionario_id deve ser um UUID válido.');
  }
  const natureza = await getOrdemNatureza(ordemServicoId);
  if (natureza === 'MATERIAL') {
    throw new OrdemServicoServiceError(
      400,
      'OS de natureza MATERIAL aceita somente produtos e não permite funcionários.',
    );
  }
  await ensureFuncionarioExists(funcionarioId);
  try {
    await pool.query(
      `INSERT INTO ordens_servico_funcionarios (ordem_servico_id, funcionario_id)
       VALUES ($1, $2)`,
      [ordemServicoId, funcionarioId],
    );
  } catch (error) {
    if (isPostgresError(error) && error.code === '23505') {
      throw new OrdemServicoServiceError(409, 'O funcionário já está vinculado a esta OS.');
    }
    if (isPostgresError(error) && error.code === '23503') {
      throw new OrdemServicoServiceError(404, 'Ordem de Serviço ou funcionário não encontrado.');
    }
    throw error;
  }
  const result = await pool.query<FuncionarioOs>(
    'SELECT id, nome, matricula, cargo, status FROM funcionarios WHERE id = $1',
    [funcionarioId],
  );
  return result.rows[0]!;
}

export async function removeFuncionarioOs(
  ordemServicoId: string,
  funcionarioId: string,
): Promise<void> {
  const result = await pool.query(
    `DELETE FROM ordens_servico_funcionarios
     WHERE ordem_servico_id = $1 AND funcionario_id = $2`,
    [ordemServicoId, funcionarioId],
  );
  if (result.rowCount === 0) {
    throw new OrdemServicoServiceError(404, 'Vínculo entre funcionário e OS não encontrado.');
  }
}

export async function listServicosOs(ordemServicoId: string): Promise<ServicoOs[]> {
  await getOrdemNatureza(ordemServicoId);
  return rawServicos(ordemServicoId);
}

export async function createServicoOs(ordemServicoId: string, body: unknown): Promise<ServicoOs> {
  const fields = parseServico(body);
  const natureza = await getOrdemNatureza(ordemServicoId);
  if (natureza === 'MATERIAL') {
    throw new OrdemServicoServiceError(
      400,
      'OS de natureza MATERIAL aceita somente produtos e não permite serviços.',
    );
  }
  const result = await pool.query<ServicoOs>(
    `INSERT INTO servicos_os (ordem_servico_id, descricao, valor)
     VALUES ($1, $2, $3) RETURNING *`,
    [ordemServicoId, fields.descricao, fields.valor],
  );
  return result.rows[0]!;
}

export async function updateServicoOs(
  ordemServicoId: string,
  servicoId: string,
  body: unknown,
): Promise<ServicoOs> {
  const fields = parseServico(body);
  const result = await pool.query<ServicoOs>(
    `UPDATE servicos_os SET descricao = $1, valor = $2
     WHERE id = $3 AND ordem_servico_id = $4 RETURNING *`,
    [fields.descricao, fields.valor, servicoId, ordemServicoId],
  );
  if (result.rows.length === 0) {
    throw new OrdemServicoServiceError(404, 'Serviço não encontrado nesta Ordem de Serviço.');
  }
  return result.rows[0]!;
}

export async function deleteServicoOs(ordemServicoId: string, servicoId: string): Promise<void> {
  const result = await pool.query(
    'DELETE FROM servicos_os WHERE id = $1 AND ordem_servico_id = $2',
    [servicoId, ordemServicoId],
  );
  if (result.rowCount === 0) {
    throw new OrdemServicoServiceError(404, 'Serviço não encontrado nesta Ordem de Serviço.');
  }
}

export async function listProdutosOs(ordemServicoId: string): Promise<ProdutoOs[]> {
  await getOrdemNatureza(ordemServicoId);
  return rawProdutos(ordemServicoId);
}

export async function createProdutoOs(ordemServicoId: string, body: unknown): Promise<ProdutoOs> {
  const fields = parseProduto(body);
  await getOrdemNatureza(ordemServicoId);
  const result = await pool.query<ProdutoOs>(
    `INSERT INTO produtos_os (
       ordem_servico_id, descricao, quantidade, unidade, valor_unitario
     ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      ordemServicoId,
      fields.descricao,
      fields.quantidade,
      fields.unidade,
      fields.valor_unitario,
    ],
  );
  return result.rows[0]!;
}

export async function updateProdutoOs(
  ordemServicoId: string,
  produtoId: string,
  body: unknown,
): Promise<ProdutoOs> {
  const fields = parseProduto(body);
  const result = await pool.query<ProdutoOs>(
    `UPDATE produtos_os
     SET descricao = $1, quantidade = $2, unidade = $3, valor_unitario = $4
     WHERE id = $5 AND ordem_servico_id = $6 RETURNING *`,
    [
      fields.descricao,
      fields.quantidade,
      fields.unidade,
      fields.valor_unitario,
      produtoId,
      ordemServicoId,
    ],
  );
  if (result.rows.length === 0) {
    throw new OrdemServicoServiceError(404, 'Produto não encontrado nesta Ordem de Serviço.');
  }
  return result.rows[0]!;
}

export async function deleteProdutoOs(ordemServicoId: string, produtoId: string): Promise<void> {
  const result = await pool.query(
    'DELETE FROM produtos_os WHERE id = $1 AND ordem_servico_id = $2',
    [produtoId, ordemServicoId],
  );
  if (result.rowCount === 0) {
    throw new OrdemServicoServiceError(404, 'Produto não encontrado nesta Ordem de Serviço.');
  }
}

export async function getOrdemServicoDetalhes(id: string): Promise<OrdemServicoDetalhes> {
  const resumo = await getOrdemServico(id);
  const [funcionarios, servicos, produtos] = await Promise.all([
    rawFuncionarios(id),
    rawServicos(id),
    rawProdutos(id),
  ]);
  return {
    ...resumo,
    funcionarios,
    servicos: servicos.map((servico) => ({
      ...servico,
      valor: numericToNumber(servico.valor, 'servicos.valor'),
    })),
    produtos: produtos.map((produto) => ({
      ...produto,
      quantidade: numericToNumber(produto.quantidade, 'produtos.quantidade'),
      valor_unitario: numericToNumber(produto.valor_unitario, 'produtos.valor_unitario'),
      valor_total: numericToNumber(produto.valor_total, 'produtos.valor_total'),
    })),
    total_mao_obra_interna: numericToNumber(
      resumo.total_mao_obra_interna,
      'total_mao_obra_interna',
    ),
    total_servicos_terceiros: numericToNumber(
      resumo.total_servicos_terceiros,
      'total_servicos_terceiros',
    ),
    total_produtos: numericToNumber(resumo.total_produtos, 'total_produtos'),
    total_os: numericToNumber(resumo.total_os, 'total_os'),
  };
}
