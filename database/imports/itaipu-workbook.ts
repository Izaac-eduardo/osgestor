import ExcelJS from 'exceljs';
import { parseFrotaFields } from '../../src/services/frotas.service.js';
import { normalizeFleetCode, splitFleetCode } from '../../src/utils/frotas.js';
import { cellText, finalizeWorkbookReport, type ImportRow, type SourceRow, type WorkbookReport } from './frotas-workbook.js';

export type YearPolicy = 'fabricacao' | 'modelo';
type Identifier = 'placa' | 'modelo' | 'codigo-repetido';
interface Section { prefix: string; header: 'PLACA' | 'MODELO'; identifier: Identifier }
const sections: Record<string, Section> = {};
const add = (names: string[], prefix: string, header: 'PLACA' | 'MODELO', identifier: Identifier = header === 'PLACA' ? 'placa' : 'modelo') => {
  for (const name of names) sections[name] = { prefix, header, identifier };
};
add(['AUTOMOVEIS'], 'A', 'PLACA');
add(['VAN'], 'VAN', 'MODELO', 'placa');
add(['ONIBUS'], 'ON', 'PLACA');
add(['CAMINHAOGUINCHO'], 'CG', 'PLACA');
add(['CAMINHAOLEVE'], 'C', 'PLACA');
add(['CAMINHAOVIGA'], 'CV', 'PLACA');
add(['CAMINHAOCOMBOIO'], 'CC', 'PLACA');
add(['CAMINHAOESPARGIDOR'], 'CE', 'PLACA');
add(['CAMINHAOIRRIGACAO'], 'CI', 'PLACA');
add(['CAVALOMECANICO'], 'CM', 'PLACA');
add(['CAMINHAOPESADO'], 'CP', 'PLACA');
add(['CAMINHAOTRACADO'], 'CT', 'PLACA');
add(['OFFTHEROAD'], 'OTR', 'PLACA');
add(['CAMINHAOTANQUECOMBUSTIVEL'], 'CTC', 'PLACA');
add(['CAMINHAOOFICINA'], 'O', 'PLACA');
add(['MOTO'], 'M', 'MODELO');
add(['TRATORDERODAS'], 'TR', 'MODELO');
add(['PACARREGADEIRA'], 'PC', 'MODELO');
add(['ESCAVADEIRAHIDRAULICA'], 'EH', 'MODELO');
add(['ROLOCOMPACTADORSOLO', 'ROLOCOMPATADORBETUMINOSO', 'ROLOCOMPACTADORBETUMINOSO'], 'RC', 'MODELO');
add(['ROLOCOMPACTADORDEPNEUS'], 'RCP', 'MODELO');
add(['RETROESCAVADEIRA'], 'RE', 'MODELO');
add(['MOTONIVELADORA'], 'MN', 'MODELO');
add(['MINICARREGADEIRA'], 'MC', 'MODELO');
add(['PAVIMENTADORADEASFALTO'], 'PA', 'MODELO');
add(['FREZADORADEASFALTO', 'FRESADORADEASFALTO'], 'FA', 'MODELO');
add(['TRATORDEESTEIRA'], 'TE', 'MODELO');
add(['PERFURATRIZHIDRAULICA'], 'PH', 'MODELO');
add(['EMPILHADEIRA'], 'EP', 'MODELO');
add(['PERFURATRIZPNEUMATICA'], 'PP', 'MODELO');
add(['COMPRESSORDEAR'], 'CA', 'PLACA', 'modelo');
add(['VASSOURACOLETORA'], 'VC', 'MODELO');
add(['MAQUINAMEIOFIO'], 'MM', 'MODELO');
add(['ROMPEDORHIDRAULICO'], 'RH', 'PLACA', 'modelo');
add(['GRADEARADORA'], 'GA', 'PLACA', 'codigo-repetido');
add(['ENXADAROTATIVA'], 'ER', 'MODELO');
add(['CARRETINHASINALIZACAO'], 'CS', 'PLACA');
add(['CARRETINHASONDAROTATIVA'], 'CSR', 'PLACA');
add(['GERADORDEENERGIA'], 'GE', 'MODELO');
add(['TANQUEIRRIGADEIRA'], 'I', 'MODELO');
add(['SEMIREBOQUE'], 'SR', 'PLACA');
add(['USINAASFALTO'], 'UA', 'PLACA');

const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const optional = (value: string) => /^(?:[-–—]|N\/?A|SEM PLACA)?$/i.test(value) ? null : value;
export interface Adjustment extends SourceRow {
  codigo: string; field: 'ano' | 'identificacao'; input: string; output: string | number | null; reason: string;
}
interface ItaipuRow extends ImportRow {
  original: { codigo: string; descricao: string; ano: string; identificacao: string; section: string; header: string };
}
export interface ItaipuReport extends WorkbookReport {
  profile: 'itaipu'; yearPolicy: YearPolicy; rows: ItaipuRow[]; adjustments: Adjustment[];
  declaredTotals: (SourceRow & { total: number })[];
}

function parseYear(raw: string, policy: YearPolicy): { value: number | null; reason?: string } {
  if (optional(raw) === null) return { value: null };
  if (/^\d{4}$/.test(raw)) return { value: Number(raw) };
  const match = /^(\d{4})\s*\/\s*(\d{2}|\d{4})$/.exec(raw);
  if (!match) throw new Error('Ano inválido: ' + raw);
  const first = Number(match[1]), suffix = match[2]!;
  let second = suffix.length === 4 ? Number(suffix) : Math.floor(first / 100) * 100 + Number(suffix);
  if (suffix.length === 2 && second < first && first % 100 === 99 && Number(suffix) === 0) second += 100;
  const plausible = second >= first && second <= first + 1;
  if (policy === 'modelo' && !plausible) throw new Error('Ano do modelo inconsistente: ' + raw + '. Necessário corrigir a origem.');
  return { value: policy === 'fabricacao' ? first : second,
    reason: (policy === 'fabricacao' ? 'Primeiro ano (fabricação).' : 'Segundo ano (modelo).') +
      (plausible ? '' : ' Segundo valor inconsistente na origem; preservado no relatório, sem correção presumida.') };
}

/** Explicit, reviewed layout for the official Itaipu workbook; never inferred from a plate-shaped string. */
export function analyzeItaipuWorkbook(book: ExcelJS.Workbook, yearPolicy: YearPolicy): ItaipuReport {
  const report: ItaipuReport = { profile: 'itaipu', yearPolicy, rows: [], ignored: [], errors: [], headers: [],
    duplicateCodes: [], duplicatePlates: [], duplicateModels: [], adjustments: [], declaredTotals: [] };
  for (const sheet of book.worksheets) {
    let section: Section | undefined, sectionName = '';
    const initialRows = report.rows.length, totals: number[] = [];
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const source = { sheet: sheet.name, row: rowNumber }, row = sheet.getRow(rowNumber);
      try {
        const ordinal = cellText(row.getCell(1));
        const code = cellText(row.getCell(2)), description = cellText(row.getCell(3));
        const year = cellText(row.getCell(5)), identification = cellText(row.getCell(6));
        if (![ordinal, code, description, year, identification].some(Boolean)) {
          report.ignored.push({ ...source, reason: 'Linha vazia nas colunas do cadastro.' }); continue;
        }
        if (key(ordinal) === 'N' && key(year) === 'ANO') {
          sectionName = code; section = sections[key(code)];
          if (!section || key(identification) !== section.header || !description) {
            section = undefined;
            throw new Error('Seção/cabeçalho não reconhecido no perfil Itaipu: ' + code + ' / ' + identification);
          }
          report.headers.push({ ...source, columns: { codigo: 2, descricao: 3, ano: 5,
            ...(section.identifier === 'codigo-repetido' ? {} : { [section.identifier]: 6 }) } });
          report.ignored.push({ ...source, reason: 'Cabeçalho de seção: ' + sectionName });
          continue;
        }
        const total = /^TOTAL\s+(\d+)\s+EQUIPAMENTOS$/i.exec(ordinal);
        if (total) {
          totals.push(Number(total[1])); report.declaredTotals.push({ ...source, total: Number(total[1]) });
          report.ignored.push({ ...source, reason: 'Totalizador da relação.' }); continue;
        }
        if (key(ordinal) === 'RELACAODEFROTAS') {
          report.ignored.push({ ...source, reason: 'Título da relação.' }); continue;
        }
        if (!section || !/^\d+$/.test(ordinal)) throw new Error('Linha sem seção reconhecida ou sem número sequencial.');
        const parsedCode = splitFleetCode(code);
        if (parsedCode.prefixo !== section.prefix) throw new Error('Prefixo incompatível com a seção ' + sectionName + ': ' + code);
        const parsedYear = parseYear(year, yearPolicy);
        if (parsedYear.reason) report.adjustments.push({ ...source, codigo: parsedCode.codigo,
          field: 'ano', input: year, output: parsedYear.value, reason: parsedYear.reason });
        let placa: string | null = null, modelo: string | null = null;
        if (section.identifier === 'codigo-repetido') {
          if (optional(identification) !== null && normalizeFleetCode(identification) !== parsedCode.codigo) {
            throw new Error('Identificação da grade difere da frota; revisar antes de definir placa/modelo.');
          }
          if (optional(identification) !== null) report.adjustments.push({ ...source, codigo: parsedCode.codigo,
            field: 'identificacao', input: identification, output: null,
            reason: 'Coluna PLACA repete o código da grade; não representa placa ou modelo. Modelo não inferido da descrição.' });
        } else {
          if (section.identifier === 'placa') placa = optional(identification); else modelo = optional(identification);
          if (section.header.toLowerCase() !== section.identifier && optional(identification) !== null) {
            report.adjustments.push({ ...source, codigo: parsedCode.codigo, field: 'identificacao',
              input: identification, output: identification, reason: 'Cabeçalho ' + section.header + ' mapeado para ' + section.identifier + ' conforme seção ' + sectionName + '.' });
          }
        }
        const fields = parseFrotaFields({ codigo: code, descricao: description, placa, modelo, ano: parsedYear.value });
        report.rows.push({ ...fields, source, original: { codigo: code, descricao: description, ano: year,
          identificacao: identification, section: sectionName, header: section.header } });
      } catch (error) { report.errors.push({ ...source, reason: (error as Error).message }); }
    }
    const found = report.rows.length - initialRows;
    if (totals.some(total => total !== found)) report.errors.push({ sheet: sheet.name, row: sheet.rowCount,
      reason: 'Total declarado (' + [...new Set(totals)].join(', ') + ') difere das ' + found + ' frotas válidas identificadas.' });
  }
  return finalizeWorkbookReport(report);
}