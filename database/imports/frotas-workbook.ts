import ExcelJS from 'exceljs';
import type { PoolClient } from 'pg';
import { ensureFrotaPrefix, parseFrotaFields, type FrotaFields } from '../../src/services/frotas.service.js';
import { normalizeModel, splitFleetCode } from '../../src/utils/frotas.js';

type Field = 'codigo' | 'descricao' | 'placa' | 'modelo' | 'ano';
export interface SourceRow { sheet: string; row: number }
export interface ImportRow extends FrotaFields { source: SourceRow }
export interface ImportIssue extends SourceRow { reason: string }
export interface WorkbookReport {
  rows: ImportRow[];
  ignored: ImportIssue[];
  errors: ImportIssue[];
  headers: { sheet: string; row: number; columns: Partial<Record<Field, number>> }[];
  duplicateCodes: { value: string; sources: SourceRow[] }[];
  duplicatePlates: { value: string; sources: SourceRow[] }[];
  duplicateModels: { value: string; codes: string[] }[];
}
const headerKey = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const aliases: Record<string, Field> = {
  FROTA: 'codigo', CODIGO: 'codigo', CODIGOFROTA: 'codigo', CODIGODAFROTA: 'codigo',
  DESCRICAO: 'descricao', DESCRICAODOEQUIPAMENTO: 'descricao', DESCRICAODOVEICULO: 'descricao',
  PLACA: 'placa', MODELO: 'modelo', ANO: 'ano', ANOFABRICACAO: 'ano', ANODEFABRICACAO: 'ano',
};
export function cellText(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined || (cell.type === ExcelJS.ValueType.Formula && cell.result === null)) return '';
  if (cell.type === ExcelJS.ValueType.Formula && cell.result === undefined) throw new Error('Fórmula sem resultado salvo; recalcule e salve o Excel.');
  if (cell.type === ExcelJS.ValueType.Error) throw new Error('Célula contém erro do Excel.');
  return cell.text.trim();
}
const emptyValue = (v: string) => /^(?:[-–—]|N\/?A|SEM PLACA)?$/i.test(v) ? null : v;
export function analyzeWorkbook(book: ExcelJS.Workbook): WorkbookReport {
  const report: WorkbookReport = { rows: [], ignored: [], errors: [], headers: [], duplicateCodes: [], duplicatePlates: [], duplicateModels: [] };
  for (const sheet of book.worksheets) {
    let columns: Partial<Record<Field, number>> | undefined;
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const source = { sheet: sheet.name, row: rowNumber };
      try {
        const candidate: Partial<Record<Field, number>> = {};
        let filled = 0;
        row.eachCell((cell, columnNumber) => {
          if (cell.isMerged && cell.master.address !== cell.address) return;
          const value = cellText(cell);
          if (value) filled++;
          const field = aliases[headerKey(value)];
          if (field) {
            if (candidate[field] !== undefined) throw new Error('Cabeçalho repetido: ' + field);
            candidate[field] = columnNumber;
          }
        });
        if (candidate.codigo && candidate.descricao) {
          columns = candidate;
          report.headers.push({ ...source, columns: { ...candidate } });
          report.ignored.push({ ...source, reason: 'Cabeçalho de seção.' });
          return;
        }
        if (!filled) { report.ignored.push({ ...source, reason: 'Linha vazia.' }); return; }
        if (!columns) {
          const looksLikeCode = false;
          if (looksLikeCode || filled > 1) report.errors.push({ ...source, reason: 'Dados sem cabeçalho reconhecido. Necessário identificar Frota e Descrição.' });
          else report.ignored.push({ ...source, reason: 'Título antes do cabeçalho.' });
          return;
        }
        const read = (field: Field) => columns?.[field] ? cellText(row.getCell(columns[field]!)) : '';
        const codigo = read('codigo');
        if (!codigo && filled === 1) { report.ignored.push({ ...source, reason: 'Título/rodapé sem código.' }); return; }
        if (!codigo) throw new Error('Linha preenchida sem código de frota.');
        const year = emptyValue(read('ano'));
        if (year !== null && !/^\d{4}$/.test(year)) throw new Error('Ano ambíguo ou inválido: ' + year + '. Informe um único ano com quatro dígitos.');
        const fields = parseFrotaFields({ codigo, descricao: emptyValue(read('descricao')),
          placa: emptyValue(read('placa')), modelo: emptyValue(read('modelo')), ano: year === null ? null : Number(year) });
        report.rows.push({ ...fields, source });
      } catch (error) { report.errors.push({ ...source, reason: (error as Error).message }); }
    });
  }
  return finalizeWorkbookReport(report);
}

export function finalizeWorkbookReport<T extends WorkbookReport>(report: T): T {
  for (const [field, target] of [['codigo', report.duplicateCodes], ['placa', report.duplicatePlates]] as const) {
    const groups = new Map<string, SourceRow[]>();
    for (const item of report.rows) {
      const value = item[field];
      if (value) groups.set(value, [...(groups.get(value) ?? []), item.source]);
    }
    for (const [value, sources] of groups) if (sources.length > 1) target.push({ value, sources });
  }
  const models = new Map<string, string[]>();
  for (const item of report.rows) if (item.modelo) {
    const key = normalizeModel(item.modelo);
    models.set(key, [...(models.get(key) ?? []), item.codigo]);
  }
  report.duplicateModels = [...models].filter(([, codes]) => codes.length > 1).map(([value, codes]) => ({ value, codes }));
  return report;
}
export function assertImportable(report: WorkbookReport): void {
  if (!report.rows.length || report.errors.length || report.duplicateCodes.length || report.duplicatePlates.length) {
    throw new Error('Importação bloqueada: confira linhas inválidas, códigos/placas duplicados ou ausência de registros.');
  }
}
/** Caller owns BEGIN/COMMIT/ROLLBACK. The same routine powers dry-run and apply. */
export async function importFleetRows(client: PoolClient, rows: ImportRow[]) {
  const counts = { total: rows.length, inserted: 0, updated: 0, unchanged: 0, prefixesCreated: 0,
    withPlate: rows.filter(r => r.placa).length, withoutPlate: rows.filter(r => !r.placa).length,
    withModel: rows.filter(r => r.modelo).length };
  // Serialize imports and register writes while comparing/upserting a complete snapshot.
  await client.query('LOCK TABLE prefixos_frota, frotas IN SHARE ROW EXCLUSIVE MODE');
  for (const row of rows) {
    const prefix = row.prefixo ? await ensureFrotaPrefix(client, row.prefixo) : null;
    if (prefix?.created) counts.prefixesCreated++;
    const existing = await client.query<{ id: string }>('SELECT id FROM frotas WHERE codigo=$1', [row.codigo]);
    if (!existing.rows[0]) {
      await client.query('INSERT INTO frotas (prefixo_frota_id,numero,codigo,descricao,placa,modelo,ano) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [prefix?.id ?? null, row.numero, row.codigo, row.descricao, row.placa, row.modelo, row.ano]);
      counts.inserted++;
    } else {
      // Blank source values do not erase manual data; existing inactive records stay inactive.
      const changed = await client.query(`UPDATE frotas SET
        descricao=coalesce($1,descricao), placa=coalesce($2,placa), modelo=coalesce($3,modelo), ano=coalesce($4,ano)
        WHERE id=$5 AND (descricao,placa,modelo,ano) IS DISTINCT FROM
        (coalesce($1,descricao),coalesce($2,placa),coalesce($3,modelo),coalesce($4,ano))`,
        [row.descricao, row.placa, row.modelo, row.ano, existing.rows[0].id]);
      if (changed.rowCount) counts.updated++; else counts.unchanged++;
    }
  }
  return counts;
}
