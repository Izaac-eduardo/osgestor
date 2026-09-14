import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parsePoliOs } from '../src/imports/poli-os.js';
import { pool } from '../src/config/database.js';
import { normalizeSearchText } from '../src/utils/text.js';
import {
  consolidateExecutions,
  decideExecution,
  type ReconcileExecution,
  type ReconcileOrderContext,
} from '../src/services/reconciliacao-execucoes.service.js';

const extension = /\.(xls|xlsx)$/i;
const usage = 'Uso: npm.cmd run reconcile:execucoes -- <arquivo|pasta|glob> [...] [--apply]';

function expand(input: string): string[] {
  const absolute = path.resolve(input);
  if (!/[?*]/.test(input)) {
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      return fs.readdirSync(absolute).filter((file) => extension.test(file)).map((file) => path.join(absolute, file));
    }
    return fs.existsSync(absolute) && extension.test(absolute) ? [absolute] : [];
  }
  const directory = path.dirname(absolute);
  const pattern = new RegExp(`^${path.basename(absolute).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return fs.existsSync(directory) ? fs.readdirSync(directory).filter((file) => pattern.test(file)).map((file) => path.join(directory, file)) : [];
}

function readInputs(inputs: string[]): string[] {
  const files = [...new Set(inputs.flatMap(expand).map((file) => path.resolve(file)))].filter((file) => extension.test(file));
  if (!files.length) throw new Error(`Nenhum XLS/XLSX encontrado.\n${usage}`);
  return files.sort();
}

function parseArgs(): { apply: boolean; inputs: string[] } {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const inputs = args.filter((arg) => arg !== '--apply' && !arg.startsWith('--out='));
  return { apply, inputs };
}

function serializeExecution(execution: ReconcileExecution) {
  return {
    numero_os: execution.numero_os,
    funcionario: execution.funcionario_original,
    inicio: execution.inicio,
    fim: execution.fim,
    arquivos: execution.sources,
  };
}

async function loadContexts(numbers: number[]): Promise<Map<number, ReconcileOrderContext>> {
  const contexts = new Map<number, ReconcileOrderContext>();
  if (!numbers.length) return contexts;
  const orders = (await pool.query<{ id: string; numero_os: number; frota: string | null; obra: string | null; natureza: string; status: string; problema: string | null; servicos_count: number; produtos_count: number }>(
    `SELECT os.id,os.numero_os,pf.codigo||os.frota_numero frota,o.nome obra,os.natureza_os natureza,os.status,
       os.observacoes problema,
       (SELECT count(*)::int FROM servicos_os s WHERE s.ordem_servico_id=os.id) servicos_count,
       (SELECT count(*)::int FROM produtos_os p WHERE p.ordem_servico_id=os.id) produtos_count
     FROM ordens_servico os JOIN prefixos_frota pf ON pf.id=os.prefixo_frota_id JOIN obras o ON o.id=os.obra_id
     WHERE os.numero_os = ANY($1::bigint[])`, [numbers],
  )).rows;
  const ids = orders.map((order) => order.id);
  const services = ids.length ? (await pool.query<{ id: string; ordem_servico_id: string }>(
    'SELECT id, ordem_servico_id FROM servicos_os WHERE ordem_servico_id = ANY($1::uuid[])', [ids],
  )).rows : [];
  const employees = (await pool.query<{ id: string; nome: string }>('SELECT id, nome FROM funcionarios')).rows;
  const links = ids.length ? (await pool.query<{ ordem_servico_id: string; funcionario_id: string }>(
    'SELECT ordem_servico_id, funcionario_id FROM ordens_servico_funcionarios WHERE ordem_servico_id = ANY($1::uuid[])', [ids],
  )).rows : [];
  const executions = ids.length ? (await pool.query<ReconcileOrderContext['executions'][number]>(
    `SELECT e.id,e.ordem_servico_id,e.servico_os_id,e.funcionario_id,
       to_char(e.inicio,'YYYY-MM-DD"T"HH24:MI') inicio,
       to_char(e.fim,'YYYY-MM-DD"T"HH24:MI') fim
     FROM servicos_os_execucoes e WHERE e.ordem_servico_id = ANY($1::uuid[])`, [ids],
  )).rows : [];
  for (const order of orders) {
    contexts.set(Number(order.numero_os), {
      id: order.id,
      numero_os: Number(order.numero_os),
      order: {
        frota: order.frota, obra: order.obra, natureza: order.natureza, status: order.status,
        problema: order.problema, servicos_count: Number(order.servicos_count), produtos_count: Number(order.produtos_count),
      },
      services: services.filter((service) => service.ordem_servico_id === order.id),
      employees,
      linkedEmployeeIds: links.filter((link) => link.ordem_servico_id === order.id).map((link) => link.funcionario_id),
      executions: executions.filter((execution) => execution.ordem_servico_id === order.id),
    });
  }
  return contexts;
}

async function applySafe(decisions: Map<number, ReturnType<typeof decideExecution>[]>) {
  const applied = [], already = [], failed = [], rollbacks = [];
  for (const [numeroOs, orderDecisions] of decisions) {
    const safe = orderDecisions.filter((decision) => decision.kind === 'SEGURA');
    if (!safe.length) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = (await client.query<{ id: string }>('SELECT id FROM ordens_servico WHERE numero_os=$1 FOR UPDATE', [numeroOs])).rows[0];
      if (!order) throw new Error('OS_INEXISTENTE_NO_BANCO');
      const currentServices = (await client.query<{ id: string }>(
        'SELECT id FROM servicos_os WHERE ordem_servico_id=$1 ORDER BY id', [order.id],
      )).rows;
      const currentServiceId = currentServices.length === 1 ? currentServices[0]!.id : null;
      for (const decision of safe) {
        if (decision.kind !== 'SEGURA') continue;
        const employee = (await client.query<{ id: string }>(
          `SELECT f.id FROM funcionarios f JOIN ordens_servico_funcionarios x ON x.funcionario_id=f.id
           WHERE x.ordem_servico_id=$1 AND f.id=$2`, [order.id, decision.funcionarioId],
        )).rows[0];
        if (!employee) throw new Error(`FUNCIONARIO_NAO_VINCULADO:${decision.execution.funcionario_original}`);
        const existing = (await client.query<{ id: string }>(
          `SELECT id FROM servicos_os_execucoes WHERE ordem_servico_id=$1 AND funcionario_id=$2 AND inicio=$3 AND fim=$4`,
          [order.id, decision.funcionarioId, decision.execution.inicio, decision.execution.fim],
        )).rows[0];
        if (existing) { already.push({ ...serializeExecution(decision.execution), id: existing.id }); continue; }
        const inserted = (await client.query<{ id: string }>(
          `INSERT INTO servicos_os_execucoes(ordem_servico_id,servico_os_id,funcionario_id,inicio,fim)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [order.id, currentServiceId, decision.funcionarioId, decision.execution.inicio, decision.execution.fim],
        )).rows[0]!;
        applied.push({ ...serializeExecution(decision.execution), id: inserted.id, mode: currentServiceId ? 'VINCULADA' : 'GERAL', servico_os_id: currentServiceId });
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
      const reason = error instanceof Error ? error.message : String(error);
      failed.push({ numero_os: numeroOs, reason }); rollbacks.push({ numero_os: numeroOs, reason });
    } finally { client.release(); }
  }
  return { applied, already, failed, rollbacks };
}

async function main() {
  const { apply, inputs } = parseArgs();
  const files = readInputs(inputs);
  const parsed = files.flatMap((file) => parsePoliOs(fs.readFileSync(file), file));
  const raw: ReconcileExecution[] = parsed.flatMap((order) => order.execucoes.map((execution) => ({
    numero_os: order.numeroOs,
    funcionario_original: execution.funcionarioOriginal,
    inicio: execution.inicio,
    fim: execution.fim,
    sources: [order.origem],
  })));
  const executions = consolidateExecutions(raw);
  const contexts = await loadContexts([...new Set(executions.map((execution) => execution.numero_os))]);
  const decisions = new Map<number, ReturnType<typeof decideExecution>[]>();
  for (const execution of executions) decisions.set(execution.numero_os, [...(decisions.get(execution.numero_os) ?? []), decideExecution(execution, contexts.get(execution.numero_os))]);
  const allDecisions = [...decisions.values()].flat();
  const pending = allDecisions.filter((decision) => decision.kind === 'PENDENTE');
  const existing = allDecisions.filter((decision) => decision.kind === 'EXISTENTE');
  const safe = allDecisions.filter((decision) => decision.kind === 'SEGURA');
  const direct = safe.filter((decision) => decision.kind === 'SEGURA' && decision.mode === 'VINCULADA');
  const general = safe.filter((decision) => decision.kind === 'SEGURA' && decision.mode === 'GERAL');
  const sourceOrders = new Map<number, { numero_os: number; arquivos: string[]; natureza?: string; status?: string; frota?: string | null; obra?: string | null; problema?: string | null; funcionarios: string[]; servicos_count: number; produtos_count: number }>();
  for (const order of parsed) {
    const current = sourceOrders.get(order.numeroOs) ?? { numero_os: order.numeroOs, arquivos: [], funcionarios: [], servicos_count: 0, produtos_count: 0 };
    current.arquivos = [...new Set([...current.arquivos, order.origem])];
    current.natureza = order.natureza; current.status = order.status; current.frota = order.frotaOriginal; current.obra = order.parecerOriginal; current.problema = order.problema;
    current.funcionarios = [...new Set([...current.funcionarios, ...order.execucoes.map((execution) => execution.funcionarioOriginal).filter(Boolean)])];
    current.servicos_count = Math.max(current.servicos_count, order.itens.filter((item) => item.tipo === 'SERVICO').length);
    current.produtos_count = Math.max(current.produtos_count, order.itens.filter((item) => item.tipo === 'PRODUTO').length);
    sourceOrders.set(order.numeroOs, current);
  }
  const orderAudit = [...sourceOrders.values()].map((sourceOrder) => {
    const database = contexts.get(sourceOrder.numero_os)?.order;
    const divergences: string[] = [];
    if (!database) divergences.push('OS_INEXISTENTE_NO_BANCO');
    else {
      if (sourceOrder.frota && normalizeSearchText(sourceOrder.frota) !== normalizeSearchText(database.frota ?? '')) divergences.push('frota');
      if (sourceOrder.obra && normalizeSearchText(sourceOrder.obra) !== normalizeSearchText(database.obra ?? '')) divergences.push('obra');
      if (sourceOrder.natureza && normalizeSearchText(sourceOrder.natureza) !== normalizeSearchText(database.natureza)) divergences.push('natureza');
      if (sourceOrder.status && normalizeSearchText(sourceOrder.status) !== normalizeSearchText(database.status)) divergences.push('status');
      if (sourceOrder.problema && normalizeSearchText(sourceOrder.problema) !== normalizeSearchText(database.problema ?? '')) divergences.push('problema');
      const databaseEmployees = contexts.get(sourceOrder.numero_os)!.linkedEmployeeIds.map((id) => contexts.get(sourceOrder.numero_os)!.employees.find((employee) => employee.id === id)?.nome).filter((name): name is string => Boolean(name)).map(normalizeSearchText).sort();
      const sourceEmployees = sourceOrder.funcionarios.map(normalizeSearchText).sort();
      if (sourceEmployees.join('|') !== databaseEmployees.join('|')) divergences.push('funcionarios');
      if (sourceOrder.servicos_count !== database.servicos_count) divergences.push('quantidade_servicos');
      if (sourceOrder.produtos_count !== database.produtos_count) divergences.push('quantidade_produtos');
    }
    return { ...sourceOrder, banco: database ?? null, divergencias: divergences };
  });
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(), mode: apply ? 'APPLY' : 'DIAGNOSTICO', files,
    sourceOrders: new Set(parsed.map((order) => order.numeroOs)).size,
    orders: orderAudit,
    sourceExecutionsRaw: raw.length, sourceExecutionsUnique: executions.length,
    alreadyExists: existing.map((decision) => ({ ...serializeExecution(decision.execution), existing_id: decision.existingId })),
    missing: safe.map((decision) => ({ ...serializeExecution(decision.execution), mode: decision.mode, servico_os_id: decision.servicoOsId })),
    pending: pending.map((decision) => ({ ...serializeExecution(decision.execution), reason: decision.reason })),
    summary: { files: files.length, orders: new Set(parsed.map((order) => order.numeroOs)).size, executions: executions.length, already: existing.length, missing: safe.length, safe: safe.length, direct: direct.length, general: general.length, pending: pending.length },
  };
  if (apply) Object.assign(report, { application: await applySafe(decisions) });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const output = path.resolve('docs', `reconciliacao-execucoes-${stamp}.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report.summary, output, mode: report.mode }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => { await pool.end(); });
