import { normalizeSearchText } from '../utils/text.js';

export interface ReconcileExecution {
  numero_os: number;
  funcionario_original: string;
  inicio: string;
  fim: string;
  sources: string[];
}

export interface ReconcileOrderContext {
  id: string;
  numero_os: number;
  order: {
    frota: string | null;
    obra: string | null;
    natureza: string;
    status: string;
    problema: string | null;
    servicos_count: number;
    produtos_count: number;
  };
  services: Array<{ id: string }>;
  employees: Array<{ id: string; nome: string }>;
  linkedEmployeeIds: string[];
  executions: Array<{
    id: string;
    funcionario_id: string;
    inicio: string;
    fim: string;
    servico_os_id: string | null;
  }>;
}

export type ExecutionDecision =
  | { kind: 'EXISTENTE'; execution: ReconcileExecution; existingId: string }
  | { kind: 'SEGURA'; execution: ReconcileExecution; funcionarioId: string; servicoOsId: string | null; mode: 'VINCULADA' | 'GERAL' }
  | { kind: 'PENDENTE'; execution: ReconcileExecution; reason: string };

export const executionKey = (execution: Pick<ReconcileExecution, 'funcionario_original' | 'inicio' | 'fim'>): string =>
  `${normalizeSearchText(execution.funcionario_original)}|${execution.inicio.slice(0, 16)}|${execution.fim.slice(0, 16)}`;

export const dbExecutionKey = (execution: { funcionario_nome: string; inicio: string; fim: string }): string =>
  `${normalizeSearchText(execution.funcionario_nome)}|${execution.inicio.slice(0, 16)}|${execution.fim.slice(0, 16)}`;

export function consolidateExecutions(executions: ReconcileExecution[]): ReconcileExecution[] {
  const map = new Map<string, ReconcileExecution>();
  for (const execution of executions) {
    const key = `${execution.numero_os}|${executionKey(execution)}`;
    const current = map.get(key);
    if (current) current.sources = [...new Set([...current.sources, ...execution.sources])];
    else map.set(key, { ...execution, sources: [...execution.sources] });
  }
  return [...map.values()];
}

export function decideExecution(execution: ReconcileExecution, context?: ReconcileOrderContext): ExecutionDecision {
  if (!context) return { kind: 'PENDENTE', execution, reason: 'OS_INEXISTENTE_NO_BANCO' };
  const existing = context.executions.find((row) => dbExecutionKey({
    funcionario_nome: context.employees.find((employee) => employee.id === row.funcionario_id)?.nome ?? '',
    inicio: row.inicio,
    fim: row.fim,
  }) === executionKey(execution));
  if (existing) return { kind: 'EXISTENTE', execution, existingId: existing.id };
  const employees = context.employees.filter((employee) =>
    normalizeSearchText(employee.nome) === normalizeSearchText(execution.funcionario_original));
  if (employees.length !== 1) return { kind: 'PENDENTE', execution, reason: employees.length ? 'FUNCIONARIO_AMBIGUO' : 'FUNCIONARIO_NAO_ENCONTRADO' };
  if (!context.linkedEmployeeIds.includes(employees[0]!.id)) {
    return { kind: 'PENDENTE', execution, reason: 'FUNCIONARIO_NAO_VINCULADO' };
  }
  const inicio = new Date(execution.inicio);
  const fim = new Date(execution.fim);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim <= inicio) {
    return { kind: 'PENDENTE', execution, reason: 'PERIODO_INVALIDO' };
  }
  if (inicio.toISOString().slice(0, 10) !== fim.toISOString().slice(0, 10)) {
    return { kind: 'PENDENTE', execution, reason: 'PERIODO_EM_DIAS_DIFERENTES' };
  }
  const linked = context.services.length === 1 ? context.services[0]!.id : null;
  return { kind: 'SEGURA', execution, funcionarioId: employees[0]!.id, servicoOsId: linked, mode: linked ? 'VINCULADA' : 'GERAL' };
}
