import PDFDocument from 'pdfkit';
import {
  RelatorioFilters,
  getGastosPorObra,
  getRelatorioFilterLabels,
  getGastosPorVeiculo,
  getOsPorSemana,
} from './relatorios.service.js';

type Orientation = 'portrait' | 'landscape';
type Alignment = 'left' | 'center' | 'right';

interface Column<T> {
  title: string;
  width: number;
  align?: Alignment;
  value: (item: T) => string;
}

interface PdfOptions<T> {
  title: string;
  orientation: Orientation;
  filters: Array<{ label: string; value: string }>;
  columns: Array<Column<T>>;
  rows: T[];
  summary: string[];
}

const colors = {
  primary: '#244A64',
  header: '#D9EAF7',
  border: '#AAB7C0',
  text: '#263238',
  muted: '#607D8B',
};

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = (value: number): string => moneyFormatter.format(value);

const formatDate = (value: string): string => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const generationDate = (): string => {
  const now = new Date();
  const date = [now.getDate(), now.getMonth() + 1, now.getFullYear()]
    .map((value, index) => index < 2 ? String(value).padStart(2, '0') : String(value))
    .join('/');
  return `${date} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const periodText = (filters: RelatorioFilters): string => {
  if (filters.data_inicio !== undefined && filters.data_fim !== undefined) {
    return `${formatDate(filters.data_inicio)} a ${formatDate(filters.data_fim)}`;
  }
  if (filters.data_inicio !== undefined) return `A partir de ${formatDate(filters.data_inicio)}`;
  if (filters.data_fim !== undefined) return `Até ${formatDate(filters.data_fim)}`;
  return 'Todos';
};

const filterValue = (value: string | undefined, empty: string): string => value ?? empty;

const commonFilters = (filters: RelatorioFilters, obraLabel: string): Array<{ label: string; value: string }> => [
  { label: 'Período', value: periodText(filters) },
  { label: 'Obra', value: obraLabel },
];

const fitText = (doc: PDFKit.PDFDocument, text: string, width: number): string => {
  if (doc.widthOfString(text) <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && doc.widthOfString(`${shortened}...`) > width) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
};

const generatePdf = <T>(options: PdfOptions<T>): Promise<Buffer> => new Promise((resolve, reject) => {
  const doc = new PDFDocument({
    size: 'A4',
    layout: options.orientation,
    margins: { top: 42, right: 40, bottom: 48, left: 40 },
    bufferPages: true,
    autoFirstPage: false,
    info: { Title: `OSGestor - ${options.title}`, Author: 'OSGestor' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const tableWidth = options.columns.reduce((total, column) => total + column.width, 0);
  const left = 40;
  const rowHeight = 22;
  const footerSpace = 32;

  const drawTableHeader = (): void => {
    const y = doc.y;
    let x = left;
    doc.save().fillColor(colors.header).rect(left, y, tableWidth, rowHeight).fill();
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(8);
    for (const column of options.columns) {
      doc.rect(x, y, column.width, rowHeight).strokeColor(colors.border).stroke();
      doc.text(column.title, x + 4, y + 7, {
        width: column.width - 8,
        align: column.align ?? 'left',
        lineBreak: false,
      });
      x += column.width;
    }
    doc.restore();
    doc.y = y + rowHeight;
  };

  const addContinuationPage = (): void => {
    doc.addPage();
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(12)
      .text(`OSGestor - ${options.title} (continuação)`, left, doc.page.margins.top);
    doc.moveDown(0.6);
    drawTableHeader();
  };

  const ensureSpace = (height: number): void => {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom - footerSpace) {
      addContinuationPage();
    }
  };

  doc.addPage();
  doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(20).text('OSGestor');
  doc.fontSize(14).text(`Relatório de ${options.title}`);
  doc.moveDown(0.3);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(9)
    .text(`Data de geração: ${generationDate()}`);
  doc.moveDown(0.8);
  doc.fillColor(colors.text).fontSize(9);
  for (const filter of options.filters) {
    doc.font('Helvetica-Bold').text(`${filter.label}: `, { continued: true })
      .font('Helvetica').text(filter.value);
  }
  doc.moveDown(0.5);
  doc.moveTo(left, doc.y).lineTo(left + tableWidth, doc.y).strokeColor(colors.primary).lineWidth(1).stroke();
  doc.moveDown(0.7);
  drawTableHeader();

  options.rows.forEach((item, rowIndex) => {
    ensureSpace(rowHeight);
    const y = doc.y;
    let x = left;
    if (rowIndex % 2 === 1) {
      doc.save().fillColor('#F7FAFC').rect(left, y, tableWidth, rowHeight).fill().restore();
    }
    doc.fillColor(colors.text).font('Helvetica').fontSize(8);
    for (const column of options.columns) {
      doc.rect(x, y, column.width, rowHeight).strokeColor(colors.border).lineWidth(0.5).stroke();
      const value = fitText(doc, column.value(item), column.width - 8);
      doc.text(value, x + 4, y + 7, {
        width: column.width - 8,
        align: column.align ?? 'left',
        lineBreak: false,
      });
      x += column.width;
    }
    doc.y = y + rowHeight;
  });

  ensureSpace(20 + options.summary.length * 15);
  doc.moveDown(0.8);
  doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10).text('Resumo');
  doc.fillColor(colors.text).font('Helvetica').fontSize(9);
  for (const line of options.summary) doc.text(line);

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const footerY = doc.page.height - doc.page.margins.bottom - 12;
    doc.save();
    doc.moveTo(doc.page.margins.left, footerY - 7)
      .lineTo(doc.page.width - doc.page.margins.right, footerY - 7)
      .strokeColor(colors.border).lineWidth(0.5).stroke();
    doc.fillColor(colors.muted).font('Helvetica').fontSize(8)
      .text('OSGestor', doc.page.margins.left, footerY, { lineBreak: false });
    doc.text(`Página ${index - range.start + 1}`, 0, footerY, {
      width: doc.page.width - doc.page.margins.right,
      align: 'right',
      lineBreak: false,
    });
    doc.restore();
  }
  doc.end();
});

export async function exportGastosPorVeiculoPdf(filters: RelatorioFilters): Promise<Buffer> {
  const rows = await getGastosPorVeiculo(filters);
  const displayFilters = await getRelatorioFilterLabels(filters);
  const totalOs = rows.reduce((total, item) => total + item.quantidade_os, 0);
  const totalGeral = rows.reduce((total, item) => total + item.total_gasto, 0);
  return generatePdf({
    title: 'Gastos por Veículo',
    orientation: 'landscape',
    filters: [
      ...commonFilters(filters, displayFilters.obra),
      { label: 'Prefixo da Frota', value: displayFilters.prefixoFrota },
      { label: 'Número da Frota', value: filterValue(filters.frota_numero, 'Todos') },
      { label: 'Natureza', value: filterValue(filters.natureza_os, 'Todas') },
      { label: 'Categoria', value: filterValue(filters.categoria_servico, 'Todas') },
    ],
    columns: [
      { title: 'Obra', width: 92, value: (item) => item.obra_codigo },
      { title: 'Veículo', width: 76, value: (item) => item.frota_codigo },
      { title: 'Mão de Obra', width: 118, align: 'right', value: (item) => money(item.total_mao_obra_interna) },
      { title: 'Terceiros', width: 110, align: 'right', value: (item) => money(item.total_servicos_terceiros) },
      { title: 'Produtos', width: 105, align: 'right', value: (item) => money(item.total_produtos) },
      { title: 'Total', width: 120, align: 'right', value: (item) => money(item.total_gasto) },
      { title: 'Qtd. OS', width: 65, align: 'right', value: (item) => String(item.quantidade_os) },
    ],
    rows,
    summary: [
      `Total de veículos: ${rows.length}`,
      `Total de OS: ${totalOs}`,
      `Total geral: ${money(totalGeral)}`,
    ],
  });
}

export async function exportGastosPorObraPdf(filters: RelatorioFilters): Promise<Buffer> {
  const rows = await getGastosPorObra(filters);
  const displayFilters = await getRelatorioFilterLabels(filters);
  const totalOs = rows.reduce((total, item) => total + item.quantidade_os, 0);
  const totalGeral = rows.reduce((total, item) => total + item.total_gasto, 0);
  return generatePdf({
    title: 'Gastos por Obra',
    orientation: 'landscape',
    filters: [
      ...commonFilters(filters, displayFilters.obra),
      { label: 'Natureza', value: filterValue(filters.natureza_os, 'Todas') },
      { label: 'Categoria', value: filterValue(filters.categoria_servico, 'Todas') },
    ],
    columns: [
      { title: 'Código', width: 72, value: (item) => item.obra_codigo },
      { title: 'Obra', width: 165, value: (item) => item.obra_nome },
      { title: 'Mão de Obra', width: 112, align: 'right', value: (item) => money(item.total_mao_obra_interna) },
      { title: 'Terceiros', width: 105, align: 'right', value: (item) => money(item.total_servicos_terceiros) },
      { title: 'Produtos', width: 98, align: 'right', value: (item) => money(item.total_produtos) },
      { title: 'Total', width: 112, align: 'right', value: (item) => money(item.total_gasto) },
      { title: 'Qtd. OS', width: 62, align: 'right', value: (item) => String(item.quantidade_os) },
    ],
    rows,
    summary: [
      `Total de obras: ${rows.length}`,
      `Total de OS: ${totalOs}`,
      `Total geral: ${money(totalGeral)}`,
    ],
  });
}

export async function exportOsPorSemanaPdf(filters: RelatorioFilters): Promise<Buffer> {
  const rows = await getOsPorSemana(filters);
  const displayFilters = await getRelatorioFilterLabels(filters);
  const totalOs = rows.reduce((total, item) => total + item.quantidade_os, 0);
  return generatePdf({
    title: 'OS por Semana',
    orientation: 'portrait',
    filters: [
      ...commonFilters(filters, displayFilters.obra),
      { label: 'Status', value: filterValue(filters.status, 'Todos') },
      { label: 'Natureza', value: filterValue(filters.natureza_os, 'Todas') },
      { label: 'Categoria', value: filterValue(filters.categoria_servico, 'Todas') },
    ],
    columns: [
      { title: 'Ano', width: 80, align: 'center', value: (item) => String(item.ano) },
      { title: 'Semana', width: 85, align: 'center', value: (item) => String(item.semana) },
      { title: 'Início da Semana', width: 180, align: 'center', value: (item) => formatDate(item.data_inicio_semana) },
      { title: 'Quantidade de OS', width: 155, align: 'right', value: (item) => String(item.quantidade_os) },
    ],
    rows,
    summary: [
      `Semanas no relatório: ${rows.length}`,
      `Total de OS: ${totalOs}`,
    ],
  });
}