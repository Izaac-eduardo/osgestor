import 'dotenv/config';
import { analyzeItaipuWorkbook, type YearPolicy } from './itaipu-workbook.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { pool } from '../../src/config/database.js';
import { analyzeWorkbook, assertImportable, importFleetRows } from './frotas-workbook.js';

async function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  if (!file || file.startsWith('--')) throw new Error('Uso: npm.cmd run import:frotas -- "arquivo.xlsx" [--apply --expected-sha256 HASH] [--report relatorio.json]');
  const options = new Map<string, string>();
  let apply = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--apply') { apply = true; continue; }
    if ((['--report', '--expected-sha256', '--profile', '--year-policy'].includes(arg)) && args[i + 1] && !args[i + 1]!.startsWith('--')) options.set(arg, args[++i]!);
    else throw new Error('Argumento inválido: ' + arg);
  }
  const bytes = await readFile(file);
  if (bytes.subarray(0, 5).toString() === '%PDF-') throw new Error('O arquivo é um PDF renomeado como XLSX. Forneça o Excel original; nenhum dado foi importado.');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Arquivo não é um XLSX válido.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (apply && options.get('--expected-sha256') !== sha256) throw new Error('Para gravar, use --expected-sha256 com o hash exibido na conferência do mesmo arquivo.');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const profile = options.get('--profile') ?? 'generic';
  const yearPolicy = options.get('--year-policy') ?? 'fabricacao';
  if (!['generic', 'itaipu'].includes(profile)) throw new Error('Perfil inválido.');
  if (!['fabricacao', 'modelo'].includes(yearPolicy)) throw new Error('Política de ano inválida.');
  if (profile === 'generic' && options.has('--year-policy')) throw new Error('--year-policy requer --profile itaipu.');
  const analysis = profile === 'itaipu' ? analyzeItaipuWorkbook(book, yearPolicy as YearPolicy) : analyzeWorkbook(book);
  const report: Record<string, unknown> = { file, sha256, mode: apply ? 'apply' : 'dry-run',
    committed: false, ...analysis, counts: null };
  const reportPath = options.get('--report');
  // Reserve a new report before any transaction. Never overwrite an unrelated file.
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  let client;
  try {
    assertImportable(analysis);
    client = await pool.connect();
    await client.query('BEGIN');
    report.counts = await importFleetRows(client, analysis.rows);
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    report.committed = apply;
    report.outcome = apply ? 'committed' : 'rolled-back';
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    report.failure = (error as Error).message;
    report.outcome = 'failed';
    throw error;
  } finally {
    client?.release();
    const json = JSON.stringify(report, null, 2) + '\n';
    console.log(json);
    if (reportPath) await writeFile(reportPath, json);
  }
  console.log(apply ? 'Importação confirmada no banco.' : 'Conferência concluída; transação revertida, sem alterações no banco.');

}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na importação.'); process.exitCode = 1; }).finally(() => pool.end());