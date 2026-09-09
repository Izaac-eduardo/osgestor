import { readFile, writeFile } from 'node:fs/promises';
import { parsePoliOs } from '../src/imports/poli-os.js';
import * as XLSX from 'xlsx';

const filename = process.argv[2] ?? 'C:/Users/User/Downloads/TESTE.XLS';
async function main() {
const items = parsePoliOs(await readFile(filename), filename);
const workbook = XLSX.read(await readFile(filename), { type: 'buffer', raw: false });
const sourceSheet = workbook.Sheets[workbook.SheetNames[0]!]!;
const sourceValue = sourceSheet['AM615']?.v;
const sourceTotal = typeof sourceValue === 'number' ? sourceValue : Number(String(sourceValue ?? '').replace(',', '.')) || undefined;
const report = {
  arquivo: filename,
  ordens: items.length,
  intervalo: [Math.min(...items.map(x => x.numeroOs)), Math.max(...items.map(x => x.numeroOs))],
  status: items.reduce<Record<string, number>>((a, x) => { const k = x.status ?? 'PENDENTE'; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  natureza: items.reduce<Record<string, number>>((a, x) => { const k = x.natureza ?? 'PENDENTE'; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  comProdutos: items.filter(x => x.itens.some(i => i.tipo === 'PRODUTO')).length,
  comServicos: items.filter(x => x.itens.some(i => i.tipo === 'SERVICO')).length,
  semItens: items.filter(x => x.itens.length === 0).map(x => x.numeroOs),
  execucoes: items.reduce((n, x) => n + x.execucoes.length, 0),
  problemasMultilinha: items.filter(x => (x.problema?.split('\n').length ?? 0) > 1).map(x => x.numeroOs),
  totalRelatorio: sourceTotal ?? items.reduce((n, x) => n + (x.totalOrigem ?? 0), 0),
  amostras: items.slice(0, 3).map(x => ({ numeroOs: x.numeroOs, frota: x.frotaOriginal, problema: x.problema, parecer: x.parecerOriginal, itens: x.itens.length, execucoes: x.execucoes.length }))
};
const output = process.argv[3] ?? 'docs/diagnostico-teste-xls.json';
await writeFile(output, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
