import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parsePoliOs } from '../src/imports/poli-os.js';
import { pool } from '../src/config/database.js';
import { normalizeSearchText } from '../src/utils/text.js';

const files = [
  'C:\\Users\\User\\Downloads\\0109OS.XLS',
  'C:\\Users\\User\\Downloads\\0209OS.XLS',
  'C:\\Users\\User\\Downloads\\0309OS.XLS',
  'C:\\Users\\User\\Downloads\\0409OS.XLS',
].filter((file) => fs.existsSync(file));

const parsed = files.flatMap((file) => parsePoliOs(fs.readFileSync(file), file));
const candidates = new Map<number, {
  numero_os: number; arquivos: string[]; frota: string | null; obra: string | null;
  problema: string | null; servicos: Array<{ descricao: string; valor: number; tecnico: string | null }>;
  natureza_parser: string | null;
}>();
for (const order of parsed) {
  const services = order.itens.filter((item) => item.tipo === 'SERVICO');
  const matching = services.filter((item) => normalizeSearchText(item.tecnicoOriginal ?? '') === 'IZAAC EDUARDO');
  if (!matching.length) continue;
  const current = candidates.get(order.numeroOs);
  if (current) {
    current.arquivos = [...new Set([...current.arquivos, order.origem])];
    continue;
  }
  candidates.set(order.numeroOs, {
    numero_os: order.numeroOs, arquivos: [order.origem], frota: order.frotaOriginal,
    obra: order.parecerOriginal, problema: order.problema,
    servicos: matching.map((item) => ({ descricao: item.descricao, valor: item.total || item.valorUnitario, tecnico: item.tecnicoOriginal ?? null })),
    natureza_parser: order.natureza ?? null,
  });
}

type DbOrder = { id: string; numero_os: number; frota: string | null; obra: string | null; problema: string | null; natureza: string; prestador_terceiro: string | null };
type DbService = { ordem_servico_id: string; descricao: string; valor: number };
type DbExecution = { ordem_servico_id: string; funcionario: string; inicio: string; fim: string; servico_os_id: string | null };

async function main(): Promise<void> {
  const numbers = [...candidates.keys()];
  const orders = numbers.length ? (await pool.query<DbOrder>(
    `SELECT os.id, os.numero_os, pf.codigo || os.frota_numero frota, o.nome obra,
            os.observacoes problema, os.natureza_os natureza, os.prestador_terceiro
       FROM ordens_servico os
       JOIN prefixos_frota pf ON pf.id=os.prefixo_frota_id
       JOIN obras o ON o.id=os.obra_id
      WHERE os.numero_os = ANY($1::bigint[])`, [numbers],
  )).rows : [];
  const ids = orders.map((order) => order.id);
  const services = ids.length ? (await pool.query<DbService>(
    'SELECT ordem_servico_id, descricao, valor FROM servicos_os WHERE ordem_servico_id = ANY($1::uuid[])', [ids],
  )).rows : [];
  const executions = ids.length ? (await pool.query<DbExecution>(
    `SELECT e.ordem_servico_id, f.nome funcionario,
            to_char(e.inicio,'YYYY-MM-DD"T"HH24:MI') inicio,
            to_char(e.fim,'YYYY-MM-DD"T"HH24:MI') fim, e.servico_os_id
       FROM servicos_os_execucoes e
       JOIN funcionarios f ON f.id=e.funcionario_id
      WHERE e.ordem_servico_id = ANY($1::uuid[])
      ORDER BY e.inicio`, [ids],
  )).rows : [];
  const details = [...candidates.values()].sort((a, b) => a.numero_os - b.numero_os).map((source) => {
    const database = orders.find((order) => Number(order.numero_os) === source.numero_os);
    const expected = 'TERCEIRO';
    const classification = !database ? 'OS_INEXISTENTE_NO_BANCO'
      : database.natureza === expected ? 'JA_TERCEIRO'
        : database.natureza === 'INTERNA' ? 'INTERNA_INCORRETA' : 'OUTRO_CASO';
    const dbServices = database ? services.filter((service) => service.ordem_servico_id === database.id) : [];
    const dbExecutions = database ? executions.filter((execution) => execution.ordem_servico_id === database.id) : [];
    return {
      ...source,
      natureza_esperada: expected,
      classificacao: classification,
      banco: database ? {
        frota: database.frota, obra: database.obra, problema: database.problema,
        natureza: database.natureza, prestador_terceiro: database.prestador_terceiro,
        servicos: dbServices, funcionarios_execucoes: [...new Set(dbExecutions.map((execution) => execution.funcionario))],
        execucoes: dbExecutions,
      } : null,
    };
  });
  const report = {
    generatedAt: new Date().toISOString(), mode: 'DIAGNOSTICO_SOMENTE_LEITURA', files,
    regra: 'qualquer item SERVICO com tecnico_operador normalizado igual a IZAAC EDUARDO implica TERCEIRO',
    resumo: {
      candidatos: details.length,
      ja_terceiro: details.filter((item) => item.classificacao === 'JA_TERCEIRO').length,
      interna_incorreta: details.filter((item) => item.classificacao === 'INTERNA_INCORRETA').length,
      outro_caso: details.filter((item) => item.classificacao === 'OUTRO_CASO').length,
      inexistente: details.filter((item) => item.classificacao === 'OS_INEXISTENTE_NO_BANCO').length,
    },
    candidatos: details,
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const output = path.resolve('docs', `diagnostico-terceiros-${stamp}.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report.resumo, output }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); });
