import ExcelJS from 'exceljs';
import {
  RelatorioFilters,
  getGastosPorObra,
  getRelatorioFilterLabels,
  getGastosPorVeiculo,
  getOsPorSemana,
} from './relatorios.service.js';

const currencyFormat = 'R$ #,##0.00';

interface FilterLine {
  label: string;
  value: string;
}

const formatDate = (value: string): string => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
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

const prepareSheet = (
  workbook: ExcelJS.Workbook,
  title: string,
  filters: FilterLine[],
  headers: string[],
  widths: number[],
): { sheet: ExcelJS.Worksheet; headerRowNumber: number } => {
  const sheet = workbook.addWorksheet(title);
  sheet.addRow(['Relatório', title]);
  for (const filter of filters) sheet.addRow([filter.label, filter.value]);
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
  });
  sheet.getRow(1).font = { bold: true };
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  const headerRowNumber = headerRow.number;
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: headers.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  return { sheet, headerRowNumber };
};

const finishWorkbook = async (workbook: ExcelJS.Workbook): Promise<Buffer> => {
  workbook.creator = 'OSGestor';
  workbook.created = new Date();
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export async function exportGastosPorVeiculoExcel(filters: RelatorioFilters): Promise<Buffer> {
  const data = await getGastosPorVeiculo(filters);
  const displayFilters = await getRelatorioFilterLabels(filters);
  const workbook = new ExcelJS.Workbook();
  const { sheet, headerRowNumber } = prepareSheet(
    workbook,
    'Gastos por Veiculo',
    [
      { label: 'Período', value: periodText(filters) },
      { label: 'Obra', value: displayFilters.obra },
      { label: 'Prefixo da Frota', value: displayFilters.prefixoFrota },
      { label: 'Número da Frota', value: filterValue(filters.frota_numero, 'Todos') },
      { label: 'Natureza', value: filterValue(filters.natureza_os, 'Todas') },
      { label: 'Categoria', value: filterValue(filters.categoria_servico, 'Todas') },
    ],
    [
      'Obra', 'Nome da Obra', 'Veículo', 'Mão de Obra Interna',
      'Serviços Terceiros', 'Produtos', 'Total Gasto', 'Quantidade de OS',
    ],
    [16, 32, 16, 22, 22, 16, 18, 18],
  );
  for (const item of data) {
    sheet.addRow([
      item.obra_codigo,
      item.obra_nome,
      item.frota_codigo,
      item.total_mao_obra_interna,
      item.total_servicos_terceiros,
      item.total_produtos,
      item.total_gasto,
      item.quantidade_os,
    ]);
  }
  for (let column = 4; column <= 7; column += 1) {
    sheet.getColumn(column).numFmt = currencyFormat;
  }
  sheet.getColumn(8).numFmt = '0';
  sheet.getRow(headerRowNumber).height = 22;
  return finishWorkbook(workbook);
}

export async function exportGastosPorObraExcel(filters: RelatorioFilters): Promise<Buffer> {
  const data = await getGastosPorObra(filters);
  const displayFilters = await getRelatorioFilterLabels(filters);
  const workbook = new ExcelJS.Workbook();
  const { sheet, headerRowNumber } = prepareSheet(
    workbook,
    'Gastos por Obra',
    [
      { label: 'Período', value: periodText(filters) },
      { label: 'Obra', value: displayFilters.obra },
      { label: 'Natureza', value: filterValue(filters.natureza_os, 'Todas') },
      { label: 'Categoria', value: filterValue(filters.categoria_servico, 'Todas') },
    ],
    [
      'Código da Obra', 'Nome da Obra', 'Mão de Obra Interna',
      'Serviços Terceiros', 'Produtos', 'Total Gasto', 'Quantidade de OS',
    ],
    [18, 34, 22, 22, 16, 18, 18],
  );
  for (const item of data) {
    sheet.addRow([
      item.obra_codigo,
      item.obra_nome,
      item.total_mao_obra_interna,
      item.total_servicos_terceiros,
      item.total_produtos,
      item.total_gasto,
      item.quantidade_os,
    ]);
  }
  for (let column = 3; column <= 6; column += 1) {
    sheet.getColumn(column).numFmt = currencyFormat;
  }
  sheet.getColumn(7).numFmt = '0';
  sheet.getRow(headerRowNumber).height = 22;
  return finishWorkbook(workbook);
}

export async function exportOsPorSemanaExcel(filters: RelatorioFilters): Promise<Buffer> {
  const data = await getOsPorSemana(filters);
  const displayFilters = await getRelatorioFilterLabels(filters);
  const workbook = new ExcelJS.Workbook();
  const { sheet, headerRowNumber } = prepareSheet(
    workbook,
    'OS por Semana',
    [
      { label: 'Período', value: periodText(filters) },
      { label: 'Obra', value: displayFilters.obra },
      { label: 'Status', value: filterValue(filters.status, 'Todos') },
      { label: 'Natureza', value: filterValue(filters.natureza_os, 'Todas') },
      { label: 'Categoria', value: filterValue(filters.categoria_servico, 'Todas') },
    ],
    ['Ano', 'Semana', 'Início da Semana', 'Quantidade de OS'],
    [12, 12, 22, 20],
  );
  for (const item of data) {
    const [year, month, day] = item.data_inicio_semana.split('-').map(Number) as [number, number, number];
    sheet.addRow([
      item.ano,
      item.semana,
      new Date(Date.UTC(year, month - 1, day, 12)),
      item.quantidade_os,
    ]);
  }
  sheet.getColumn(1).numFmt = '0';
  sheet.getColumn(2).numFmt = '0';
  sheet.getColumn(3).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(4).numFmt = '0';
  sheet.getRow(headerRowNumber).height = 22;
  return finishWorkbook(workbook);
}