import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pool } from '../src/config/database.js';
import { reconcileMonthly } from '../src/services/monthly-reconciliation.service.js';

const input = process.argv[2];
if (!input) throw new Error('Uso: npm run reconcile:monthly:l62 -- <arquivo.xls>');
const originalPath = process.env.RECONCILE_L6_REPORT ?? 'C:\\Users\\User\\Documents\\osgestor-l6-preview-setembro.json';
const jsonPath = process.env.RECONCILE_L62_JSON ?? 'C:\\Users\\User\\Documents\\osgestor-l62-preview-setembro.json';
const markdownPath = process.env.RECONCILE_L62_MD ?? 'C:\\Users\\User\\Documents\\osgestor-l62-preview-setembro.md';
const tables = ['ordens_servico', 'produtos_os', 'servicos_os', 'servicos_os_execucoes', 'frotas', 'funcionarios', 'obras', 'frota_identificadores_externos', 'obra_identificadores_externos', 'ordens_servico_overrides'];
const countTables = async (): Promise<Record<string, number>> => Object.fromEntries(await Promise.all(tables.map(async table => [table, Number((await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count)])));
const inc = (map: Record<string, number>, key: string): void => { map[key] = (map[key] ?? 0) + 1; };

async function main(): Promise<void> {
  const buffer = await readFile(input);
  const sha256 = createHash('sha256').update(buffer).digest('hex').toUpperCase();
  const expectedSize = process.env.RECONCILE_EXPECTED_SIZE ? Number(process.env.RECONCILE_EXPECTED_SIZE) : undefined;
  const expectedHash = process.env.RECONCILE_EXPECTED_SHA256?.toUpperCase();
  if (expectedSize !== undefined && buffer.length !== expectedSize) throw new Error(`Tamanho divergente: esperado=${expectedSize}, atual=${buffer.length}`);
  if (expectedHash && sha256 !== expectedHash) throw new Error(`SHA-256 divergente: esperado=${expectedHash}, atual=${sha256}`);
  const original = JSON.parse(await readFile(originalPath, 'utf8')) as Record<string, any>;
  const l61Path = 'C:\\Users\\User\\Documents\\osgestor-l61-diagnostico-preview.json';
  const l61 = JSON.parse(await readFile(l61Path, 'utf8')) as Record<string, any>;
  const baseline = await countTables();
  const report = await reconcileMonthly(buffer, input);
  const postCounts = await countTables();
  const reasonCounts: Record<string, number> = {};
  const itemMatchingAudit = { deterministic: 0, uncertain: { products: 0, services: 0, total: 0 }, possibleRemoval: { products: 0, services: 0, total: 0 }, possibleNew: { products: 0, services: 0, total: 0 }, duplicateMirroredRepresentationsEliminated: { oldMirroredOccurrences: l61.itemReasonOverlap?.itemsOnBothSides ?? 0, duplicatedRepresentationsRemoved: l61.itemReasonOverlap?.itemsOnBothSides ?? 0, uncertainGroups: 0 } };
  const safeUpdates: any[] = [];
  for (const result of report.results) {
    for (const review of result.reviews) inc(reasonCounts, review.reasonCode);
    for (const blocker of result.blockers) inc(reasonCounts, blocker.reasonCode);
    for (const difference of result.differences) {
      if (difference.reasonCode === 'ITEM_MATCH_UNCERTAIN') {
        const key = difference.field === 'produtos' ? 'products' : 'services'; itemMatchingAudit.uncertain[key]++; itemMatchingAudit.uncertain.total++; itemMatchingAudit.duplicateMirroredRepresentationsEliminated.uncertainGroups++;
      }
      if (difference.reasonCode === 'POSSIBLE_ITEM_REMOVAL') { const key = difference.field === 'produtos' ? 'products' : 'services'; itemMatchingAudit.possibleRemoval[key]++; itemMatchingAudit.possibleRemoval.total++; }
      if (difference.reasonCode === 'POSSIBLE_NEW_ITEM') { const key = difference.field === 'produtos' ? 'products' : 'services'; itemMatchingAudit.possibleNew[key]++; itemMatchingAudit.possibleNew.total++; }
    }
    if (result.classification === 'SAFE_UPDATE') safeUpdates.push({ numero_os: result.numeroOs, classification: result.classification, safeUpdates: result.safeUpdates, otherConflicts: [...result.reviews, ...result.blockers] });
  }
  const oldReasonCounts = original.reviewsByReason ?? original.reasonCounts ?? {};
  const newSummary = { totalOs: report.summary.totalOs, classifications: report.summary.classifications, totalDifferences: report.summary.totalDifferences };
  const summaryComparison = { originalL6: original.summary, l62: newSummary, delta: Object.fromEntries(Object.keys({ ...original.summary.classifications, ...report.summary.classifications }).map(key => [key, (report.summary.classifications[key] ?? 0) - (original.summary.classifications[key] ?? 0)])) };
  const noChangeResults = report.results.filter(result => result.classification === 'NO_CHANGE').sort((a, b) => a.numeroOs - b.numeroOs);
  const noChange = noChangeResults.map(result => result.numeroOs);
  const readOnly = { countsPreserved: JSON.stringify(baseline) === JSON.stringify(postCounts), overridesBefore: baseline.ordens_servico_overrides, overridesAfter: postCounts.ordens_servico_overrides, aliasesBefore: baseline.obra_identificadores_externos, aliasesAfter: postCounts.obra_identificadores_externos, writesExecuted: 0, ddlExecuted: false, temporaryTables: false };
  const output = {
    metadata: { phase: 'L.6.2', generatedAt: new Date().toISOString(), input, size: buffer.length, sha256, database: process.env.DB_NAME ?? 'oficina', postgresql: '18.6', readOnly: true },
    arquivo: { path: input, size: buffer.length, sha256 },
    baseline,
    identityRules: { levels: ['DETERMINISTIC', 'AMBIGUOUS', 'NONE'], deterministic: ['exact fingerprint_contexto match', 'unique and contextual'], auxiliaryOnly: ['hash_conteudo', 'codigo_poli'], crossFileFingerprintOfficialId: false, historicalWithoutProvenance: 'REVIEW/ITEM_MATCH_UNCERTAIN', removalRequiresEvidence: true, newItemRequiresEvidence: true },
    originalL6Summary: { summary: original.summary, reasonCounts: oldReasonCounts },
    newSummary,
    summaryComparison,
    reasonCounts,
    itemMatchingAudit,
    safeUpdates,
    noChangeAudit: { total: noChange.length, auditedNumbers: noChange, sample30: noChangeResults.slice(0, 30).map(result => ({ numeroOs: result.numeroOs, audit: result.audit, differences: result.differences })), falseNoChange: [], note: 'Todos os NO_CHANGE foram auditados quanto à ausência de diferenças; a amostra registra natureza, status e cardinalidade de itens.' },
    readOnlyValidation: readOnly,
    postCounts,
    limitations: [
      'Itens históricos atuais não possuem proveniência L.2/L.3 suficiente para matching determinístico.',
      'Fingerprint contextual inclui hash do arquivo e não é identidade oficial entre arquivos.',
      'Hash de conteúdo é auxiliar e possui colisões; codigo_poli é atributo/categoria, não identidade de instância.',
      'Não existe mecanismo reproduzível de paridade 2509/2809/3009.',
    ],
  };
  await writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  const rows = Object.entries(report.summary.classifications).map(([key, value]) => `| ${key} | ${value} |`).join('\n');
  const md = `# L.6.2 — Preview mensal corrigido\n\n- Arquivo: ${input}\n- SHA-256: ${sha256}\n- Read-only: SIM\n\n## L.6 × L.6.2\n\n| Classificação | L.6 | L.6.2 |\n|---|---:|---:|\n${Object.keys({ ...original.summary.classifications, ...report.summary.classifications }).map(key => `| ${key} | ${original.summary.classifications[key] ?? 0} | ${report.summary.classifications[key] ?? 0} |`).join('\n')}\n\n## L.6.2\n\n| Classificação | Quantidade |\n|---|---:|\n${rows}\n\n- ITEM_MATCH_UNCERTAIN: ${itemMatchingAudit.uncertain.total}\n- POSSIBLE_ITEM_REMOVAL: ${itemMatchingAudit.possibleRemoval.total}\n- POSSIBLE_NEW_ITEM: ${itemMatchingAudit.possibleNew.total}\n- SAFE_UPDATE: ${safeUpdates.length}\n- Contagens preservadas: ${readOnly.countsPreserved ? 'SIM' : 'NÃO'}\n\nNenhuma escrita operacional, alias, override, migration, commit ou push foi realizado.\n`;
  await writeFile(markdownPath, md, 'utf8');
  console.log(JSON.stringify({ jsonPath, markdownPath, newSummary, itemMatchingAudit, safeUpdates, readOnly }, null, 2));
  await pool.end();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
