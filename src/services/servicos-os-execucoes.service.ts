import { pool } from '../config/database.js';
import { OrdemServicoServiceError } from './ordens-servico.service.js';

export interface ExecucaoServico {
  id: string;
  servico_os_id: string;
  funcionario_id: string;
  funcionario_nome: string;
  inicio: string;
  fim: string;
  duracao_minutos: number;
  created_at: Date;
  updated_at: Date;
}

interface ContextRow { natureza_os: 'INTERNA' | 'TERCEIRO' | 'MATERIAL' }
interface ExecucaoRow extends Omit<ExecucaoServico, 'duracao_minutos'> { duracao_minutos: string }
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

const context = async (ordemId: string, servicoId: string): Promise<ContextRow> => {
  const result = await pool.query<ContextRow>(
    `SELECT os.natureza_os FROM servicos_os s
     JOIN ordens_servico os ON os.id = s.ordem_servico_id
     WHERE s.id = $1 AND s.ordem_servico_id = $2`,
    [servicoId, ordemId],
  );
  if (!result.rows[0]) {
    throw new OrdemServicoServiceError(404, 'Serviço não encontrado nesta Ordem de Serviço.');
  }
  return result.rows[0];
};

const fields = (body: unknown): { funcionarioId: string; inicio: string; fim: string } => {
  if (typeof body !== 'object' || body === null) {
    throw new OrdemServicoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }
  const value = body as Record<string, unknown>;
  if (typeof value.funcionario_id !== 'string') {
    throw new OrdemServicoServiceError(400, 'funcionario_id é obrigatório.');
  }
  if (typeof value.inicio !== 'string' || !timestampPattern.test(value.inicio)) {
    throw new OrdemServicoServiceError(400, 'inicio deve conter data e horário válidos.');
  }
  if (typeof value.fim !== 'string' || !timestampPattern.test(value.fim)) {
    throw new OrdemServicoServiceError(400, 'fim deve conter data e horário válidos.');
  }
  const inicio = new Date(value.inicio.length === 16 ? `${value.inicio}:00` : value.inicio);
  const fim = new Date(value.fim.length === 16 ? `${value.fim}:00` : value.fim);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new OrdemServicoServiceError(400, 'Período de trabalho inválido.');
  }
  if (value.inicio.slice(0, 10) !== value.fim.slice(0, 10)) {
    throw new OrdemServicoServiceError(400, 'Cada período de trabalho deve iniciar e terminar no mesmo dia.');
  }
  if (fim <= inicio) {
    throw new OrdemServicoServiceError(400, 'O término deve ser posterior ao início.');
  }
  return { funcionarioId: value.funcionario_id, inicio: value.inicio, fim: value.fim };
};

const map = (row: ExecucaoRow): ExecucaoServico => ({
  ...row,
  duracao_minutos: Number(row.duracao_minutos),
});

const selectSql = `SELECT e.id, e.servico_os_id, e.funcionario_id, f.nome funcionario_nome,
  to_char(e.inicio, 'YYYY-MM-DD"T"HH24:MI') inicio,
  to_char(e.fim, 'YYYY-MM-DD"T"HH24:MI') fim,
  floor(extract(epoch FROM (e.fim - e.inicio)) / 60)::text duracao_minutos,
  e.created_at, e.updated_at
 FROM servicos_os_execucoes e JOIN funcionarios f ON f.id = e.funcionario_id`;

export async function listExecucoes(ordemId: string, servicoId: string): Promise<ExecucaoServico[]> {
  await context(ordemId, servicoId);
  const result = await pool.query<ExecucaoRow>(
    `${selectSql} WHERE e.servico_os_id = $1 ORDER BY e.inicio, f.nome`,
    [servicoId],
  );
  return result.rows.map(map);
}

export async function listExecucoesOrdem(ordemId: string): Promise<ExecucaoServico[]> {
  const result = await pool.query<ExecucaoRow>(
    `${selectSql} JOIN servicos_os s ON s.id = e.servico_os_id
     WHERE s.ordem_servico_id = $1 ORDER BY e.inicio, f.nome`,
    [ordemId],
  );
  return result.rows.map(map);
}

async function validate(ordemId: string, servicoId: string, body: unknown) {
  const [serviceContext, parsed] = await Promise.all([context(ordemId, servicoId), Promise.resolve(fields(body))]);
  if (serviceContext.natureza_os !== 'INTERNA') {
    throw new OrdemServicoServiceError(400, 'Execuções são permitidas somente para O.S. de natureza INTERNA.');
  }
  const linked = await pool.query(
    `SELECT 1 FROM ordens_servico_funcionarios
     WHERE ordem_servico_id = $1 AND funcionario_id = $2`,
    [ordemId, parsed.funcionarioId],
  );
  if (!linked.rows[0]) {
    throw new OrdemServicoServiceError(400, 'Selecione um funcionário vinculado à Ordem de Serviço.');
  }
  return parsed;
}

export async function createExecucao(ordemId: string, servicoId: string, body: unknown) {
  const value = await validate(ordemId, servicoId, body);
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO servicos_os_execucoes(servico_os_id, funcionario_id, inicio, fim)
     VALUES($1, $2, $3, $4) RETURNING id`,
    [servicoId, value.funcionarioId, value.inicio, value.fim],
  );
  const result = await pool.query<ExecucaoRow>(`${selectSql} WHERE e.id = $1`, [inserted.rows[0]!.id]);
  return map(result.rows[0]!);
}

export async function updateExecucao(
  ordemId: string, servicoId: string, execucaoId: string, body: unknown,
) {
  const value = await validate(ordemId, servicoId, body);
  const updated = await pool.query<{ id: string }>(
    `UPDATE servicos_os_execucoes SET funcionario_id=$1, inicio=$2, fim=$3
     WHERE id=$4 AND servico_os_id=$5 RETURNING id`,
    [value.funcionarioId, value.inicio, value.fim, execucaoId, servicoId],
  );
  if (!updated.rows[0]) throw new OrdemServicoServiceError(404, 'Execução não encontrada neste serviço.');
  const result = await pool.query<ExecucaoRow>(`${selectSql} WHERE e.id = $1`, [execucaoId]);
  return map(result.rows[0]!);
}

export async function deleteExecucao(ordemId: string, servicoId: string, execucaoId: string) {
  await context(ordemId, servicoId);
  const result = await pool.query(
    'DELETE FROM servicos_os_execucoes WHERE id=$1 AND servico_os_id=$2',
    [execucaoId, servicoId],
  );
  if (!result.rowCount) throw new OrdemServicoServiceError(404, 'Execução não encontrada neste serviço.');
}
