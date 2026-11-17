import PDFDocument from 'pdfkit';
import type { MaintenanceReportData, MaintenanceReportRow } from './manutencao-financeira-report-model.js';
import { accountingMaintenanceExclusionLabel, type AccountingMaintenanceExclusionReason } from './maintenance-accounting-eligibility.js';

const money = (value: unknown): number => Number(value ?? 0);
const brl = (value: unknown): string => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(money(value));
const date = (value: unknown): string => { const text = String(value ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10).split('-').reverse().join('/') : text; };
const nature: Record<string, string> = { PECAS_EXTERNAS: 'Peças externas', SERVICOS_TERCEIRIZADOS: 'Serviços terceirizados', MATERIAIS_ALMOXARIFADO: 'Materiais do almoxarifado', MAO_DE_OBRA_INTERNA: 'Mão de obra interna' };
const sum = (rows: MaintenanceReportRow[], key: string): number => rows.reduce<number>((total, row) => total + money(row[key]), 0);

export type MaintenanceNatureTotals = {
  lancamentos: number;
  pecas_externas: number;
  servicos_terceirizados: number;
  materiais_almoxarifado: number;
  mao_obra_interna: number;
  total_efetivo: number;
};

export function summarizeMaintenanceRows(rows: MaintenanceReportRow[]): MaintenanceNatureTotals {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const category = String(row.categoria ?? '');
    totals[category] = (totals[category] ?? 0) + money(row.valor);
  }
  const pecas = totals.PECAS_EXTERNAS ?? 0;
  const servicos = totals.SERVICOS_TERCEIRIZADOS ?? 0;
  const materiais = totals.MATERIAIS_ALMOXARIFADO ?? 0;
  return {
    lancamentos: rows.length,
    pecas_externas: pecas,
    servicos_terceirizados: servicos,
    materiais_almoxarifado: materiais,
    mao_obra_interna: totals.MAO_DE_OBRA_INTERNA ?? 0,
    total_efetivo: pecas + servicos + materiais,
  };
}

export function summarizeMaintenanceReport(summary: MaintenanceReportRow[]): MaintenanceNatureTotals {
  return {
    lancamentos: summary.reduce((total, row) => total + Number(row.lancamentos ?? 0), 0),
    pecas_externas: sum(summary, 'pecas_externas'),
    servicos_terceirizados: sum(summary, 'servicos_terceirizados'),
    materiais_almoxarifado: sum(summary, 'materiais_almoxarifado'),
    mao_obra_interna: sum(summary, 'mao_obra_interna'),
    total_efetivo: sum(summary, 'total_efetivo'),
  };
}

export function buildMaintenanceSummaryTotalRow(summary: MaintenanceReportRow[]): MaintenanceReportRow {
  const totals = summarizeMaintenanceReport(summary);
  return {
    prefixo: 'TOTAL',
    placa: '',
    ...totals,
    // Compatibilidade com a chave utilizada pela coluna do PDF.
    servicos_terceiros: totals.servicos_terceirizados,
  };
}

type Column = { title: string; width: number; value: (row: MaintenanceReportRow) => string; align?: 'left' | 'right' };

export function renderMaintenancePdf(data: MaintenanceReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 42, bottom: 48, left: 34, right: 34 }, bufferPages: true, info: { Title: 'OS Gestor - Manutenção por Frota', Author: 'OS Gestor' } });
    const chunks: Buffer[] = [];
    const left = doc.page.margins.left;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);

    const filterText = `Período: ${date(data.filters.data_inicio)} a ${date(data.filters.data_fim)} | Frota: ${data.filters.frota_codigo ?? data.filters.frota_id ?? 'Todas'} | Natureza: ${nature[data.filters.natureza ?? data.filters.categoria ?? ''] ?? 'Todas as naturezas'}`;
    const newPage = () => { doc.addPage(); doc.x = left; doc.y = doc.page.margins.top; };
    const ensureSpace = (height: number) => { if (doc.y + height > bottom) newPage(); };

    const documentHeader = () => { doc.x = left; doc.fillColor('#244A64').font('Helvetica-Bold').fontSize(17).text('OS Gestor', left, doc.y, { lineBreak: false }); doc.fillColor('#E67E22').fontSize(10).text('Itaipu Engenharia', left, doc.y + 20, { lineBreak: false }); doc.fillColor('#263238').fontSize(13).text('Custos de Manutenção por Frota', left, doc.y + 36, { lineBreak: false }); doc.fillColor('#607D8B').font('Helvetica').fontSize(8).text(filterText, left, doc.y + 54, { lineBreak: false }); doc.y += 76; };
    const sectionHeading = (title: string, minimum = 90) => { ensureSpace(minimum + 6); doc.y += 6; doc.x = left; doc.fillColor('#244A64').font('Helvetica-Bold').fontSize(13).text(title, left, doc.y, { lineBreak: false }); doc.y += 30; };

    const tableRowHeight = (row: MaintenanceReportRow): number => Math.max(20, Math.ceil(String(row.descricao ?? '').length / 65) * 11 + 8);
    const drawTable = (columns: Column[], rows: MaintenanceReportRow[], options: { emphasizeLast?: boolean } = {}) => {
      const drawHeader = () => { if (doc.y + 26 > bottom) newPage(); const y = doc.y; doc.save().fillColor('#244A64').rect(left, y, width, 22).fill(); let x = left; doc.fillColor('#FFF').font('Helvetica-Bold').fontSize(7); for (const column of columns) { doc.text(column.title, x + 3, y + 7, { width: column.width - 6, align: column.align ?? 'left', lineBreak: false }); x += column.width; } doc.restore(); doc.y = y + 24; };
      drawHeader();
      rows.forEach((row, index) => { const height = tableRowHeight(row); if (doc.y + height > bottom) { newPage(); drawHeader(); } const y = doc.y; const emphasized = options.emphasizeLast === true && index === rows.length - 1; if (emphasized) doc.save().fillColor('#E8F0F4').rect(left, y, width, height).fill().restore(); else if (index % 2) doc.save().fillColor('#F3F6F8').rect(left, y, width, height).fill().restore(); let x = left; doc.fillColor('#263238').font(emphasized ? 'Helvetica-Bold' : 'Helvetica').fontSize(7); for (const column of columns) { doc.text(column.value(row), x + 3, y + 5, { width: column.width - 6, height: height - 5, align: column.align ?? 'left', lineGap: 1, ellipsis: true }); x += column.width; } doc.y = y + height; });
    };

    const drawFleetSummary = (rows: MaintenanceReportRow[]) => {
      const totals = summarizeMaintenanceRows(rows);
      const cells: Array<[string, string]> = [['Lançamentos', String(totals.lancamentos)], ['Peças externas', brl(totals.pecas_externas)], ['Serviços terceirizados', brl(totals.servicos_terceirizados)], ['Materiais do almoxarifado', brl(totals.materiais_almoxarifado)], ['Mão de obra interna', brl(totals.mao_obra_interna)], ['Total', brl(totals.total_efetivo)]];
      const gap = 6; const cellWidth = (width - gap * 2) / 3; const cellHeight = 30; const startY = doc.y;
      cells.forEach(([label, value], index) => { const column = index % 3; const row = Math.floor(index / 3); const x = left + column * (cellWidth + gap); const y = startY + row * (cellHeight + gap); doc.save().fillColor('#F3F6F8').roundedRect(x, y, cellWidth, cellHeight, 3).fill().restore(); doc.fillColor('#607D8B').font('Helvetica').fontSize(6.5).text(label, x + 7, y + 5, { width: cellWidth - 14, lineBreak: false }); doc.fillColor('#263238').font('Helvetica-Bold').fontSize(8).text(value, x + 7, y + 15, { width: cellWidth - 14, lineBreak: false }); });
      doc.y = startY + cellHeight * 2 + gap * 2 + 4;
    };

    documentHeader();
    const summaryColumns: Column[] = [
      { title: 'Frota', width: 70, value: row => String(row.prefixo ?? '') }, { title: 'Placa', width: 70, value: row => String(row.placa ?? '') }, { title: 'Lanç.', width: 42, align: 'right', value: row => String(row.lancamentos ?? 0) }, { title: 'Peças', width: 82, align: 'right', value: row => brl(row.pecas_externas) }, { title: 'Serviços terceiros', width: 100, align: 'right', value: row => brl(row.servicos_terceiros) }, { title: 'Materiais', width: 92, align: 'right', value: row => brl(row.materiais_almoxarifado) }, { title: 'Mão de obra interna', width: 122, align: 'right', value: row => brl(row.mao_obra_interna) }, { title: 'Total', width: 82, align: 'right', value: row => brl(row.total_efetivo) },
    ];
    const reportTotals = summarizeMaintenanceReport(data.summary);
    const summaryRows = data.summary.map(row => ({ ...row, servicos_terceiros: row.servicos_terceirizados }));
    const summaryTotalRow = buildMaintenanceSummaryTotalRow(data.summary);
    sectionHeading('Resumo por frota'); drawTable(summaryColumns, [...summaryRows, summaryTotalRow], { emphasizeLast: true });

    const grouped = new Map<string, MaintenanceReportRow[]>(); for (const row of data.details) { const key = String(row.frota ?? 'SEM FROTA'); grouped.set(key, [...(grouped.get(key) ?? []), row]); }
    const fleets = [...grouped.entries()];
    const fleetStartMinimum = (firstRow: MaintenanceReportRow): number => 142 + tableRowHeight(firstRow);
    const detailSectionHeadingHeight = 54;
    if (fleets.length) {
      const firstFleetRow = fleets[0]?.[1][0];
      if (firstFleetRow) {
        sectionHeading('Detalhamento dos custos por frota', detailSectionHeadingHeight + fleetStartMinimum(firstFleetRow));
      }
    }
    const drawFleetSeparator = (hasNext: boolean, nextFirstRow: MaintenanceReportRow | undefined) => {
      const separatorHeight = 22;
      const nextFleetMinimum = nextFirstRow ? fleetStartMinimum(nextFirstRow) : 0;
      if (!hasNext || !nextFirstRow || doc.y + separatorHeight + nextFleetMinimum + 6 > bottom) return;
      doc.y += 10;
      const y = doc.y;
      doc.save().strokeColor('#D8E0E5').lineWidth(0.6).moveTo(left, y).lineTo(left + width, y).stroke().restore();
      doc.y += 12;
    };
    fleets.forEach(([fleet, rows], index) => { const first = rows[0] ?? {}; const minimum = fleetStartMinimum(first); sectionHeading(`Frota ${fleet} — Placa ${String(first.placa ?? 'Sem placa')}`, minimum); drawFleetSummary(rows); doc.y += 12; drawTable([{ title: 'Data', width: 54, value: row => date(row.data) }, { title: 'O.S./Doc.', width: 78, value: row => String(row.referencia ?? '') }, { title: 'Descrição', width: 260, value: row => String(row.descricao ?? '') }, { title: 'Natureza', width: 100, value: row => nature[String(row.categoria)] ?? String(row.categoria ?? '') }, { title: 'Origem', width: 75, value: row => String(row.origem ?? '') }, { title: 'Valor', width: 82, align: 'right', value: row => brl(row.valor) }], rows); drawFleetSeparator(index < fleets.length - 1, fleets[index + 1]?.[1][0]); });
    if (data.shared.length) { sectionHeading('Despesas compartilhadas', 120); drawTable([{ title: 'Data', width: 54, value: row => date(row.data_conta) }, { title: 'Documento', width: 86, value: row => String(row.nota_original ?? row.controle_original ?? '') }, { title: 'Descrição', width: 190, value: row => String(row.produto_original ?? '') }, { title: 'Categoria', width: 90, value: row => nature[String(row.classificacao)] ?? String(row.classificacao ?? '') }, { title: 'Valor', width: 78, align: 'right', value: row => brl(row.valor_total) }, { title: 'Situação', width: 96, value: row => String(row.despesa_compartilhada_status ?? '') }, { title: 'Tratamento', width: 112, value: row => accountingMaintenanceExclusionLabel(row.motivo_fora_custo_manutencao as AccountingMaintenanceExclusionReason | null) ?? (row.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? 'Aguardando decisão' : row.despesa_compartilhada_status === 'DESCONSIDERADA' ? 'Desconsiderada' : 'Conforme elegibilidade') }], data.shared); }
    const finalSummaryHeight = data.shared.length ? 124 : 92;
    sectionHeading('Resumo financeiro', finalSummaryHeight); doc.font('Helvetica').fontSize(9).fillColor('#263238').text(`Peças externas: ${brl(reportTotals.pecas_externas)}`); doc.text(`Serviços terceirizados: ${brl(reportTotals.servicos_terceirizados)}`); doc.text(`Materiais do almoxarifado: ${brl(reportTotals.materiais_almoxarifado)}`); doc.text(`Total: ${brl(reportTotals.total_efetivo)}`); doc.text(`Mão de obra interna: ${brl(reportTotals.mao_obra_interna)}`); doc.moveDown(.5); doc.font('Helvetica-Bold').text('Despesas compartilhadas elegíveis para manutenção'); doc.font('Helvetica').text(`Aprovadas: ${brl(data.sharedTotals.approvedValue)}`); doc.text(`Pendentes: ${data.sharedTotals.pending} | Desconsideradas: ${data.sharedTotals.disregarded}`);
    const pages = doc.bufferedPageRange(); for (let i = pages.start; i < pages.start + pages.count; i += 1) { doc.switchToPage(i); doc.fillColor('#607D8B').font('Helvetica').fontSize(7).text(`OS Gestor - Página ${i - pages.start + 1}`, left, doc.page.height - 28, { lineBreak: false }); } doc.end();
  });
}
