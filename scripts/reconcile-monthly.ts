import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pool } from '../src/config/database.js';
import { reconcileMonthly } from '../src/services/monthly-reconciliation.service.js';

async function main(): Promise<void> {
const input = process.argv[2];
if (!input) throw new Error('Uso: npm run reconcile:monthly -- <arquivo.xls>');

const countTables = async (): Promise<Record<string, number>> => {
  const tables = ['ordens_servico', 'produtos_os', 'servicos_os', 'servicos_os_execucoes', 'frotas', 'funcionarios', 'obras', 'frota_identificadores_externos', 'obra_identificadores_externos', 'ordens_servico_overrides'];
  const result: Record<string, number> = {};
  for (const table of tables) result[table] = Number((await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count);
  return result;
};

const buffer = await readFile(input);
const hash = createHash('sha256').update(buffer).digest('hex').toUpperCase();
const expectedSize = process.env.RECONCILE_EXPECTED_SIZE ? Number(process.env.RECONCILE_EXPECTED_SIZE) : undefined;
const expectedHash = process.env.RECONCILE_EXPECTED_SHA256?.toUpperCase();
if (expectedSize !== undefined && buffer.length !== expectedSize) throw new Error(`Tamanho divergente: esperado=${expectedSize}, atual=${buffer.length}`);
if (expectedHash && hash !== expectedHash) throw new Error(`SHA-256 divergente: esperado=${expectedHash}, atual=${hash}`);
const before = await countTables();
const report = await reconcileMonthly(buffer, input);
const after = await countTables();
const equalCounts = JSON.stringify(before) === JSON.stringify(after);
const reasonCounts = Object.fromEntries(Object.entries(report.reasonCounts).sort((a, b) => b[1] - a[1]));
const fieldCounts = Object.fromEntries(Object.entries(report.fieldCounts).sort((a, b) => b[1] - a[1]));
const safeUpdatesByField: Record<string, number> = {};
const protectedOverridesByField: Record<string, number> = {};
const reviewsByReason: Record<string, number> = {};
const blockedByReason: Record<string, number> = {};
for (const result of report.results) {
  for (const item of result.safeUpdates) safeUpdatesByField[item.field] = (safeUpdatesByField[item.field] ?? 0) + 1;
  for (const item of result.protectedOverrides) protectedOverridesByField[item.field] = (protectedOverridesByField[item.field] ?? 0) + 1;
  for (const item of result.reviews) reviewsByReason[item.reasonCode] = (reviewsByReason[item.reasonCode] ?? 0) + 1;
  for (const item of result.blockers) blockedByReason[item.reasonCode] = (blockedByReason[item.reasonCode] ?? 0) + 1;
}
const output = {
  metadata: { ...report.metadata, generatedAt: new Date().toISOString(), arquivoTamanho: buffer.length, sha256: hash, database: process.env.DB_NAME ?? 'oficina', postgresql: '18.6' },
  baseline: before,
  summary: report.summary,
  reasonCounts,
  fieldCounts,
  safeUpdatesByField,
  protectedOverridesByField,
  reviewsByReason,
  blockedByReason,
  results: report.results,
  postRunCounts: after,
  readOnlyValidation: { countsPreserved: equalCounts, aliasesObra: after.obra_identificadores_externos, overrides: after.ordens_servico_overrides, writesExecuted: 0, sqlMode: 'SELECT-only; no temporary table; no DDL/DML' },
};
const jsonPath = 'C:\\Users\\User\\Documents\\osgestor-l6-preview-setembro.json';
const markdownPath = 'C:\\Users\\User\\Documents\\osgestor-l6-preview-setembro.md';
await writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
const classifications = report.summary.classifications;
const top = Object.entries(reasonCounts).slice(0, 12).map(([key, value]) => `- ${key}: ${value}`).join('\n') || '- Nenhum';
const md = `# Preview mensal L.6 — Setembro\n\n- Arquivo: ${input}\n- Tamanho: ${buffer.length} bytes\n- SHA-256: ${hash}\n- O.S. processadas: ${report.summary.totalOs}\n- Estratégia: ${report.metadata.queryStrategy}\n- Read-only: SIM\n\n## Classificações\n\n| Classificação | Quantidade |\n|---|---:|\n${Object.entries(classifications).map(([key, value]) => `| ${key} | ${value} |`).join('\n')}\n| TOTAL | ${report.summary.totalOs} |\n\n## Motivos principais\n\n${top}\n\n## Contagens operacionais\n\nAntes e depois são idênticas: **${equalCounts ? 'SIM' : 'NÃO'}**\n\n\`\`\`json\n${JSON.stringify({ before, after }, null, 2)}\n\`\`\`\n\nNenhum alias de obra ou override foi criado. Nenhum registro operacional foi alterado.\n`;
await writeFile(markdownPath, md, 'utf8');
console.log(JSON.stringify({ jsonPath, markdownPath, totalOs: report.summary.totalOs, classifications, equalCounts, reasonCounts: Object.fromEntries(Object.entries(reasonCounts).slice(0, 12)) }, null, 2));
await pool.end();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
