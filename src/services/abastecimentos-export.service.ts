import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { pool } from "../config/database.js";
import {
  getRelatorioAbastecimentos,
  type RelatorioAbastecimentosFilters,
} from "./abastecimentos-relatorios.service.js";
import {
  getRelatorioEntradas,
  type EntradasRelatorioFilters,
} from "./abastecimentos-entradas-relatorio.service.js";

type FilterLine = { label: string; value: string };
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const quantity = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const numberValue = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const dateLabel = (value: string | undefined): string =>
  value ? value.split("-").reverse().join("/") : "Todos";
const periodLabel = (start?: string, end?: string): string =>
  start && end
    ? `${dateLabel(start)} a ${dateLabel(end)}`
    : start
      ? `A partir de ${dateLabel(start)}`
      : end
        ? `Até ${dateLabel(end)}`
        : "Todos";
const generatedAt = (): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
const safePart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
const filenameDate = (
  filters: { data_inicio?: string; data_fim?: string },
  prefix: string,
  extension: string,
): string => {
  const suffix =
    filters.data_inicio && filters.data_fim
      ? `${filters.data_inicio}_a_${filters.data_fim}`
      : filters.data_inicio
        ? `a-partir-de-${filters.data_inicio}`
        : filters.data_fim
          ? `ate-${filters.data_fim}`
          : `todos-${new Date().toISOString().slice(0, 10)}`;
  return `${safePart(prefix)}_${safePart(suffix)}.${extension}`;
};

const styleHeader = (row: ExcelJS.Row): void => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF285877" },
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
};
const addMeta = (
  sheet: ExcelJS.Worksheet,
  title: string,
  filters: FilterLine[],
): void => {
  sheet.addRow(["OSGestor", title]).font = {
    bold: true,
    size: 14,
    color: { argb: "FF285877" },
  };
  for (const filter of filters) sheet.addRow([filter.label, filter.value]);
  sheet.addRow(["Gerado em", generatedAt()]);
  sheet.addRow([]);
};
const addTable = (
  sheet: ExcelJS.Worksheet,
  headers: string[],
  rows: Array<Array<string | number | Date | null>>,
  widths: number[],
): void => {
  const header = sheet.addRow(headers);
  styleHeader(header);
  for (const row of rows) sheet.addRow(row);
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: headers.length },
  };
  sheet.views = [{ state: "frozen", ySplit: header.number }];
};
const finishWorkbook = async (workbook: ExcelJS.Workbook): Promise<Buffer> => {
  workbook.creator = "OSGestor";
  workbook.created = new Date();
  return Buffer.from(await workbook.xlsx.writeBuffer());
};
const filtersAbastecimentos = (
  filters: RelatorioAbastecimentosFilters,
): FilterLine[] => [
  {
    label: "Período",
    value: periodLabel(filters.data_inicio, filters.data_fim),
  },
  { label: "Obra", value: filters.obra_id ?? "Todas" },
  { label: "Busca", value: filters.busca ?? "Todas" },
  { label: "Produto", value: filters.produto ?? "Todos" },
  {
    label: "Tipo de destinatário",
    value: filters.tipo_destinatario ?? "Todos",
  },
];
const filtersEntradas = (filters: EntradasRelatorioFilters): FilterLine[] => [
  {
    label: "Período",
    value: periodLabel(filters.data_inicio, filters.data_fim),
  },
  { label: "Produto", value: filters.produto_id ?? "Todos" },
  { label: "NF", value: filters.numero_nf ?? "Todas" },
  { label: "Ponto", value: filters.ponto_id ?? "Todos" },
];

interface AbastecimentoExportRow {
  data_hora: string;
  identificador_externo: string;
  produto: string;
  litros: number;
  valor: number;
  obra: string;
  tipo_destinatario: string;
  destinatario: string;
  placa: string;
  km_hr: number | null;
  horimetro: number | null;
  bico: string;
  frentista: string;
  origem: string;
}
const abastecimentoWhere = (
  filters: RelatorioAbastecimentosFilters,
  values: string[],
): string => {
  const conditions: string[] = [];
  const bind = (value: string): string => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.data_inicio)
    conditions.push(
      `a.data_hora >= ${bind(`${filters.data_inicio}T00:00:00`)}`,
    );
  if (filters.data_fim)
    conditions.push(
      `a.data_hora < (${bind(`${filters.data_fim}T00:00:00`)}::timestamp + interval '1 day')`,
    );
  if (filters.obra_id) conditions.push(`a.obra_id=${bind(filters.obra_id)}`);
  if (filters.produto)
    conditions.push(`p.codigo=${bind(filters.produto.trim().toUpperCase())}`);
  if (filters.tipo_destinatario)
    conditions.push(`a.tipo_destinatario=${bind(filters.tipo_destinatario)}`);
  if (filters.busca?.trim()) {
    const search = bind(`%${filters.busca.trim()}%`);
    conditions.push(
      `(a.identificacao_original ILIKE ${search} OR a.placa_original ILIKE ${search} OR a.frota_original ILIKE ${search} OR f.codigo ILIKE ${search} OR f.placa ILIKE ${search} OR t.nome ILIKE ${search} OR d.codigo ILIKE ${search} OR d.nome ILIKE ${search} OR EXISTS (SELECT 1 FROM abastecimento_terceiro_identificacoes ti WHERE ti.terceiro_id=a.terceiro_id AND ti.status='ATIVO' AND ti.identificacao ILIKE ${search}))`,
    );
  }
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
};
const loadAbastecimentos = async (
  filters: RelatorioAbastecimentosFilters,
): Promise<AbastecimentoExportRow[]> => {
  const values: string[] = [];
  const clause = abastecimentoWhere(filters, values);
  const result = await pool.query(
    `SELECT a.data_hora,a.identificador_externo,p.codigo produto,o.nome obra,a.tipo_destinatario,COALESCE(f.codigo,t.nome,d.codigo,NULLIF(a.identificacao_original,''),'Externa') destinatario,COALESCE(f.placa,NULLIF(a.placa_original,'')) placa,a.litros,a.valor_total,a.km_hr,a.horimetro,a.bico_codigo_original bico,a.frentista_original frentista,a.origem_sistema origem FROM abastecimentos a JOIN abastecimento_produtos p ON p.id=a.produto_id JOIN obras o ON o.id=a.obra_id LEFT JOIN frotas f ON f.id=a.frota_id LEFT JOIN abastecimento_terceiros t ON t.id=a.terceiro_id LEFT JOIN abastecimento_destinacoes_especiais d ON d.id=a.destinacao_especial_id ${clause} ORDER BY a.data_hora DESC,a.id DESC`,
    values,
  );
  return result.rows.map((row) => ({
    ...row,
    data_hora: new Date(row.data_hora).toISOString(),
    litros: Number(row.litros),
    valor: Number(row.valor_total),
    km_hr: numberValue(row.km_hr),
    horimetro: numberValue(row.horimetro),
    placa: row.placa ?? "",
    bico: row.bico ?? "",
    frentista: row.frentista ?? "",
    origem: row.origem ?? "",
  }));
};

const entryFilters = (
  filters: EntradasRelatorioFilters,
): EntradasRelatorioFilters => ({ ...filters, page: 1, limit: 0 });
const destinationsText = (
  destinations: Array<{ ponto_codigo: string; litros: number }>,
): string =>
  destinations
    .map((item: any) => `${item.ponto_codigo}: ${quantity.format(item.litros)} L`)
    .join(" | ");

export async function exportAbastecimentosExcel(
  filters: RelatorioAbastecimentosFilters,
): Promise<Buffer> {
  const [reportResult, rowsResult] = await Promise.all([
    getRelatorioAbastecimentos(filters),
    loadAbastecimentos(filters),
  ]);
  const report: any = reportResult;
  const rows: any[] = rowsResult as any[];
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Resumo");
  addMeta(
    summary,
    "Relatório de Abastecimentos",
    filtersAbastecimentos(filters),
  );
  summary.addRow(["Resumo"]);
  summary.addRow(["Abastecimentos", report.summary.quantidade]);
  summary.addRow(["Litros", report.summary.litros]);
  summary.addRow(["Valor", report.summary.valor]);
  summary.addRow(["Destinatários distintos", report.summary.destinatarios]);
  summary.addRow([]);
  summary.addRow(["Por Produto"]);
  addTable(
    summary,
    ["Produto", "Abastecimentos", "Litros", "%", "Valor", "% do valor"],
    report.por_produto.map((item: any) => [
      item.produto,
      item.quantidade,
      item.litros,
      report.summary.litros ? item.litros / report.summary.litros : 0,
      item.valor,
      report.summary.valor ? item.valor / report.summary.valor : 0,
    ]),
    [24, 18, 16, 12, 18, 14],
  );
  summary.getColumn(4).numFmt = "0.00%";
  summary.getColumn(6).numFmt = "0.00%";
  summary.addRow([]);
  summary.addRow(["Por Obra"]);
  addTable(
    summary,
    ["Obra", "Abastecimentos", "Litros", "Valor"],
    report.por_obra.map((item: any) => [
      item.obra,
      item.quantidade,
      item.litros,
      item.valor,
    ]),
    [32, 18, 16, 18],
  );
  summary.addRow([]);
  summary.addRow(["Por Frota"]);
  addTable(
    summary,
    ["Frota", "Placa/Identificação", "Abastecimentos", "Litros", "Valor"],
    report.por_frota.map((item: any) => [
      item.frota,
      item.placa,
      item.quantidade,
      item.litros,
      item.valor,
    ]),
    [24, 22, 18, 16, 18],
  );
  summary.addRow([]);
  summary.addRow(["Por Terceiro"]);
  addTable(
    summary,
    ["Terceiro", "Abastecimentos", "Litros", "Valor"],
    report.por_terceiro.map((item: any) => [
      item.terceiro,
      item.quantidade,
      item.litros,
      item.valor,
    ]),
    [32, 18, 16, 18],
  );
  summary.addRow([]);
  summary.addRow(["Destinações Especiais"]);
  addTable(
    summary,
    ["Destinação", "Abastecimentos", "Litros", "Valor"],
    report.especiais.map((item: any) => [
      item.destinacao,
      item.quantidade,
      item.litros,
      item.valor,
    ]),
    [32, 18, 16, 18],
  );
  summary.addRow([]);
  summary.addRow(["Evolução"]);
  addTable(
    summary,
    ["Período", "Abastecimentos", "Litros", "Valor"],
    report.evolucao.map((item: any) => [
      item.data,
      item.quantidade,
      item.litros,
      item.valor,
    ]),
    [18, 18, 16, 18],
  );
  const detail = workbook.addWorksheet("Abastecimentos");
  addMeta(detail, "Abastecimentos", filtersAbastecimentos(filters));
  addTable(
    detail,
    [
      "Data/Hora",
      "Nro. Abast.",
      "Produto",
      "Litros",
      "Valor",
      "Obra",
      "Tipo de destinatário",
      "Frota/Destinatário",
      "Placa/Identificação",
      "Km/Hr.",
      "Horímetro",
      "Bico",
      "Frentista",
      "Origem",
    ],
    rows.map((row) => [
      new Date(row.data_hora),
      row.identificador_externo,
      row.produto,
      row.litros,
      row.valor,
      row.obra,
      row.tipo_destinatario,
      row.destinatario,
      row.placa,
      row.km_hr,
      row.horimetro,
      row.bico,
      row.frentista,
      row.origem,
    ]),
    [20, 16, 18, 14, 16, 28, 22, 28, 22, 14, 14, 12, 24, 14],
  );
  detail.getColumn(1).numFmt = "dd/mm/yyyy hh:mm";
  detail.getColumn(4).numFmt = "#,##0.000";
  detail.getColumn(5).numFmt = "R$ #,##0.0000";
  detail.getColumn(10).numFmt = "0.000";
  detail.getColumn(11).numFmt = "0.000";
  for (const sheet of [summary, detail]) {
    for (const column of [3, 4, 5, 6])
      sheet.getColumn(column).alignment = { horizontal: "right" };
  }
  return finishWorkbook(workbook);
}

export async function exportEntradasExcel(
  filters: EntradasRelatorioFilters,
): Promise<Buffer> {
  const report: any = await getRelatorioEntradas(entryFilters(filters));
  const filterLines = filtersEntradas(filters);
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Resumo");
  addMeta(summary, "Relatório de Entradas", filterLines);
  summary.addRow(["Resumo"]);
  summary.addRow(["Entradas", report.summary.entradas]);
  summary.addRow(["Litros NF", report.summary.litros_nf]);
  summary.addRow(["Valor NF", report.summary.valor_nf]);
  summary.addRow([]);
  summary.addRow(["Por Produto"]);
  addTable(
    summary,
    ["Produto", "Entradas", "Litros NF", "%", "Valor NF", "% do valor"],
    report.por_produto.map((item: any) => [
      item.nome,
      item.quantidade,
      item.litros_nf,
      report.summary.litros_nf ? item.litros_nf / report.summary.litros_nf : 0,
      item.valor_nf,
      report.summary.valor_nf ? item.valor_nf / report.summary.valor_nf : 0,
    ]),
    [24, 14, 16, 12, 18, 14],
  );
  summary.getColumn(4).numFmt = "0.00%";
  summary.getColumn(6).numFmt = "0.00%";
  summary.addRow([]);
  summary.addRow(["Por Ponto"]);
  addTable(
    summary,
    ["Ponto", "Entradas relacionadas", "Litros recebidos"],
    report.por_ponto.map((item: any) => [item.codigo, item.entradas, item.litros]),
    [24, 22, 18],
  );
  summary.addRow([]);
  summary.addRow(["Evolução"]);
  addTable(
    summary,
    ["Período", "Entradas", "Litros NF", "Valor NF"],
    report.evolucao.map((item: any) => [
      item.periodo,
      item.entradas,
      item.litros_nf,
      item.valor_nf,
    ]),
    [18, 14, 18, 18],
  );
  const entries = workbook.addWorksheet("Entradas");
  addMeta(entries, "Entradas", filterLines);
  addTable(
    entries,
    [
      "Data",
      "NF",
      "Produto",
      "Litros NF",
      "Valor NF",
      "Total distribuído",
      "Destinos",
    ],
    report.items.map((item: any) => [
      new Date(item.data_entrada),
      item.numero_nf,
      item.produto_nome,
      item.litros_nf,
      item.valor_total_nf,
      item.total_distribuido,
      destinationsText(item.destinos),
    ]),
    [16, 18, 24, 16, 18, 20, 60],
  );
  entries.getColumn(1).numFmt = "dd/mm/yyyy";
  entries.getColumn(4).numFmt = "#,##0.000";
  entries.getColumn(5).numFmt = "R$ #,##0.00";
  entries.getColumn(6).numFmt = "#,##0.000";
  const destinations = workbook.addWorksheet("Destinos");
  addMeta(destinations, "Destinos das Entradas", filterLines);
  const destinationRows = report.items.flatMap((item: any) =>
    item.destinos.map(
      (destination: any) =>
        [
          item.id,
          item.numero_nf,
          new Date(item.data_entrada),
          item.produto_nome,
          destination.ponto_codigo,
          destination.litros,
        ] as Array<string | number | Date | null>,
    ),
  );
  addTable(
    destinations,
    ["Entrada", "NF", "Data", "Produto", "Ponto", "Litros"],
    destinationRows,
    [38, 18, 16, 24, 18, 16],
  );
  destinations.getColumn(3).numFmt = "dd/mm/yyyy";
  destinations.getColumn(6).numFmt = "#,##0.000";
  return finishWorkbook(workbook);
}

interface PdfSection {
  title: string;
  headers: string[];
  rows: string[][];
}
const pdf = (
  title: string,
  filters: FilterLine[],
  summary: string[],
  sections: PdfSection[],
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 42, right: 36, bottom: 42, left: 36 },
      bufferPages: true,
      info: { Title: `OSGestor - ${title}`, Author: "OSGestor" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const addTitle = (): void => {
      doc
        .fillColor("#285877")
        .font("Helvetica-Bold")
        .fontSize(18)
        .text("OSGestor");
      doc.fontSize(13).text(title);
      doc.moveDown(0.35);
      doc
        .fillColor("#607D8B")
        .font("Helvetica")
        .fontSize(8)
        .text(`Gerado em: ${generatedAt()}`);
      for (const filter of filters)
        doc.text(`${filter.label}: ${filter.value}`);
      doc.moveDown(0.5);
    };
    const table = (section: PdfSection): void => {
      doc.addPage();
      doc
        .fillColor("#285877")
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(section.title);
      doc.moveDown(0.35);
      const widths = Array.from(
        { length: section.headers.length },
        () => pageWidth / section.headers.length,
      );
      const row = (values: string[], header: boolean): void => {
        const y = doc.y;
        const height = 18;
        let x = doc.page.margins.left;
        doc
          .save()
          .fillColor(header ? "#D9EAF7" : "#FFFFFF")
          .rect(doc.page.margins.left, y, pageWidth, height)
          .fill()
          .restore();
        doc
          .font(header ? "Helvetica-Bold" : "Helvetica")
          .fontSize(7)
          .fillColor("#263238");
        values.forEach((value, index) => {
          doc
            .rect(x, y, widths[index]!, height)
            .strokeColor("#AAB7C0")
            .lineWidth(0.4)
            .stroke();
          doc.text(
            value.length > 38 ? `${value.slice(0, 35)}...` : value,
            x + 3,
            y + 5,
            { width: widths[index]! - 6, lineBreak: false },
          );
          x += widths[index]!;
        });
        doc.y = y + height;
      };
      row(section.headers, true);
      for (const values of section.rows) {
        if (doc.y + 24 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .fillColor("#285877")
            .text(`${title} (continuação)`);
          doc.moveDown(0.3);
          row(section.headers, true);
        }
        row(values, false);
      }
    };
    doc.addPage();
    addTitle();
    doc.fillColor("#285877").font("Helvetica-Bold").fontSize(11).text("Resumo");
    doc.fillColor("#263238").font("Helvetica").fontSize(9);
    summary.forEach((line) => doc.text(line));
    sections.forEach(table);
    const range = doc.bufferedPageRange();
    for (
      let index = range.start;
      index < range.start + range.count;
      index += 1
    ) {
      doc.switchToPage(index);
      const y = doc.page.height - 24;
      doc
        .moveTo(doc.page.margins.left, y - 8)
        .lineTo(doc.page.width - doc.page.margins.right, y - 8)
        .strokeColor("#AAB7C0")
        .stroke();
      doc
        .fillColor("#607D8B")
        .font("Helvetica")
        .fontSize(8)
        .text("OSGestor", doc.page.margins.left, y);
      doc.text(`Página ${index + 1}`, 0, y, {
        width: doc.page.width - doc.page.margins.right,
        align: "right",
      });
    }
    doc.end();
  });

export async function exportAbastecimentosPdf(
  filters: RelatorioAbastecimentosFilters,
): Promise<Buffer> {
  const report: any = await getRelatorioAbastecimentos(filters);
  const sections: PdfSection[] = [
    {
      title: "Distribuição por Produto",
      headers: ["Produto", "Abastecimentos", "Litros", "Valor"],
      rows: report.por_produto.map((item: any) => [
        item.produto,
        String(item.quantidade),
        quantity.format(item.litros),
        money.format(item.valor),
      ]),
    },
    {
      title: "Distribuição por Obra",
      headers: ["Obra", "Abastecimentos", "Litros", "Valor"],
      rows: report.por_obra.map((item: any) => [
        item.obra,
        String(item.quantidade),
        quantity.format(item.litros),
        money.format(item.valor),
      ]),
    },
    {
      title: "Frotas",
      headers: [
        "Frota",
        "Placa/Identificação",
        "Abastecimentos",
        "Litros",
        "Valor",
      ],
      rows: report.por_frota.map((item: any) => [
        item.frota,
        item.placa,
        String(item.quantidade),
        quantity.format(item.litros),
        money.format(item.valor),
      ]),
    },
    {
      title: "Terceiros",
      headers: ["Terceiro", "Abastecimentos", "Litros", "Valor"],
      rows: report.por_terceiro.map((item: any) => [
        item.terceiro,
        String(item.quantidade),
        quantity.format(item.litros),
        money.format(item.valor),
      ]),
    },
    {
      title: "Destinações Especiais",
      headers: ["Destinação", "Abastecimentos", "Litros", "Valor"],
      rows: report.especiais.map((item: any) => [
        item.destinacao,
        String(item.quantidade),
        quantity.format(item.litros),
        money.format(item.valor),
      ]),
    },
    {
      title: "Evolução temporal",
      headers: ["Período", "Abastecimentos", "Litros", "Valor"],
      rows: report.evolucao.map((item: any) => [
        item.data,
        String(item.quantidade),
        quantity.format(item.litros),
        money.format(item.valor),
      ]),
    },
  ];
  return pdf(
    "Relatório de Abastecimentos",
    filtersAbastecimentos(filters),
    [
      `Abastecimentos: ${report.summary.quantidade}`,
      `Litros: ${quantity.format(report.summary.litros)}`,
      `Valor: ${money.format(report.summary.valor)}`,
      `Destinatários distintos: ${report.summary.destinatarios}`,
    ],
    sections,
  );
}

export async function exportEntradasPdf(
  filters: EntradasRelatorioFilters,
): Promise<Buffer> {
  const report: any = await getRelatorioEntradas(entryFilters(filters));
  const sections: PdfSection[] = [
    {
      title: "Distribuição por Produto",
      headers: ["Produto", "Entradas", "Litros NF", "Valor NF"],
      rows: report.por_produto.map((item: any) => [
        item.nome,
        String(item.quantidade),
        quantity.format(item.litros_nf),
        money.format(item.valor_nf),
      ]),
    },
    {
      title: "Recebimento por Ponto",
      headers: ["Ponto", "Entradas relacionadas", "Litros recebidos"],
      rows: report.por_ponto.map((item: any) => [
        item.codigo,
        String(item.entradas),
        quantity.format(item.litros),
      ]),
    },
    {
      title: "Evolução temporal",
      headers: ["Período", "Entradas", "Litros NF", "Valor NF"],
      rows: report.evolucao.map((item: any) => [
        item.periodo,
        String(item.entradas),
        quantity.format(item.litros_nf),
        money.format(item.valor_nf),
      ]),
    },
    {
      title: "Entradas",
      headers: ["Data", "NF", "Produto", "Litros NF", "Valor NF"],
      rows: report.items.map((item: any) => [
        item.data_entrada.slice(0, 10).split("-").reverse().join("/"),
        item.numero_nf,
        item.produto_nome,
        quantity.format(item.litros_nf),
        money.format(item.valor_total_nf),
      ]),
    },
  ];
  return pdf(
    "Relatório de Entradas",
    filtersEntradas(filters),
    [
      `Entradas: ${report.summary.entradas}`,
      `Litros NF: ${quantity.format(report.summary.litros_nf)}`,
      `Valor NF: ${money.format(report.summary.valor_nf)}`,
    ],
    sections,
  );
}

export const exportFilenames = {
  abastecimentos: (filters: RelatorioAbastecimentosFilters, ext: string) =>
    filenameDate(filters, "abastecimentos", ext),
  entradas: (filters: EntradasRelatorioFilters, ext: string) =>
    filenameDate(filters, "entradas", ext),
};
