import PDFDocument from 'pdfkit';
import {
  OrdemServicoRelatorio,
  RelatorioFilters,
  getOrdensServicoRelatorio,
  getRelatorioFilterLabels,
} from './relatorios.service.js';

const colors = {
  primary: '#244A64',
  header: '#D9EAF7',
  border: '#AAB7C0',
  text: '#263238',
  muted: '#607D8B',
  light: '#F7FAFC',
};

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format;
const quantity = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0, maximumFractionDigits: 3,
}).format;
const duration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
};
const label = (value: string): string => value
  .toLocaleLowerCase('pt-BR').replaceAll('_', ' ')
  .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase('pt-BR'));
const date = (value: string | Date): string => {
  const normalized = value instanceof Date ? value.toISOString() : value;
  const [year, month, day] = normalized.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};
const period = (filters: RelatorioFilters): string => {
  if (filters.data_inicio && filters.data_fim) return `${date(filters.data_inicio)} a ${date(filters.data_fim)}`;
  if (filters.data_inicio) return `A partir de ${date(filters.data_inicio)}`;
  if (filters.data_fim) return `At\u00e9 ${date(filters.data_fim)}`;
  return 'Todos os per\u00edodos';
};

interface Column<T> {
  title: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  value: (row: T) => string;
}

function table<T>(
  doc: PDFKit.PDFDocument,
  rows: T[],
  columns: Array<Column<T>>,
  ensure: (height: number) => void,
): void {
  const left = doc.page.margins.left;
  const headerHeight = 20;
  const drawHeader = (): void => {
    const y = doc.y;
    let x = left;
    doc.save().fillColor(colors.header).rect(left, y, columns.reduce((a, c) => a + c.width, 0), headerHeight).fill();
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(7.5);
    for (const column of columns) {
      doc.rect(x, y, column.width, headerHeight).strokeColor(colors.border).lineWidth(0.5).stroke();
      doc.text(column.title, x + 4, y + 6, { width: column.width - 8, align: column.align, lineBreak: false });
      x += column.width;
    }
    doc.restore();
    doc.y = y + headerHeight;
  };
  ensure(headerHeight);
  drawHeader();
  rows.forEach((row, index) => {
    doc.font('Helvetica').fontSize(7.5);
    const height = Math.max(20, ...columns.map((column) =>
      doc.heightOfString(column.value(row), { width: column.width - 8 }) + 9));
    const currentPage = doc.page;
    ensure(height + headerHeight);
    if (doc.page !== currentPage) drawHeader();
    const y = doc.y;
    let x = left;
    if (index % 2) doc.save().fillColor(colors.light)
      .rect(left, y, columns.reduce((a, c) => a + c.width, 0), height).fill().restore();
    doc.fillColor(colors.text);
    for (const column of columns) {
      doc.rect(x, y, column.width, height).strokeColor(colors.border).lineWidth(0.5).stroke();
      doc.text(column.value(row), x + 4, y + 5, {
        width: column.width - 8, align: column.align, height: height - 8,
      });
      x += column.width;
    }
    doc.y = y + height;
  });
}

function materialConsolidation(orders: OrdemServicoRelatorio[]) {
  const grouped = new Map<string, {
    descricao: string; quantidade: number; unidade: string; valor_total: number;
  }>();
  for (const order of orders) {
    if (order.status === 'CANCELADA') continue;
    for (const product of order.produtos) {
      const key = `${product.descricao.trim().toLocaleLowerCase('pt-BR')}\u0000${product.unidade.trim().toLocaleUpperCase('pt-BR')}`;
      const current = grouped.get(key) ?? {
        descricao: product.descricao, quantidade: 0,
        unidade: product.unidade.toLocaleUpperCase('pt-BR'), valor_total: 0,
      };
      current.quantidade += product.quantidade;
      current.valor_total += product.valor_total;
      grouped.set(key, current);
    }
  }
  return [...grouped.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
}

export async function exportOrdensServicoPdf(filters: RelatorioFilters): Promise<Buffer> {
  const [orders, filterLabels] = await Promise.all([
    getOrdensServicoRelatorio(filters),
    getRelatorioFilterLabels(filters),
  ]);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape',
      margins: { top: 36, right: 36, bottom: 44, left: 36 },
      bufferPages: true,
      info: { Title: 'OSGestor - Relatorio de Ordens de Servico', Author: 'OSGestor' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const bottom = (): number => doc.page.height - doc.page.margins.bottom - 20;
    const addPage = (): void => {
      doc.addPage();
      doc.fillColor(colors.muted).font('Helvetica').fontSize(8)
        .text('Relat\u00f3rio de Ordens de Servi\u00e7o - continua\u00e7\u00e3o');
      doc.moveDown(0.5);
    };
    const ensure = (height: number): void => {
      if (doc.y + height > bottom()) addPage();
    };
    const section = (title: string): void => {
      ensure(28);
      doc.moveDown(0.7).fillColor(colors.primary).font('Helvetica-Bold').fontSize(10)
        .text(title, doc.page.margins.left);
      doc.moveDown(0.35);
    };

    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(20).text('OSGestor');
    doc.fontSize(15).text('Relat\u00f3rio de Ordens de Servi\u00e7o');
    doc.moveDown(0.3).fontSize(10);
    if (filters.natureza_os) doc.text(`Natureza: ${label(filters.natureza_os)}`);
    doc.text(`Per\u00edodo: ${period(filters)}`);
    if (filters.obra_id) doc.text(`Obra: ${filterLabels.obra}`);
    if (filters.prefixo_frota_id || filters.frota_numero) {
      doc.text(`Frota: ${filters.prefixo_frota_id ? filterLabels.prefixoFrota : ''}${filters.frota_numero ?? ''}`);
    }
    if (filters.status) doc.text(`Status: ${label(filters.status)}`);
    if (filters.categoria_servico) doc.text(`Categoria: ${label(filters.categoria_servico)}`);

    const effective = orders.filter((order) => order.status !== 'CANCELADA');
    const products = effective.flatMap((order) => order.produtos);
    section('RESUMO');
    doc.fillColor(colors.text).font('Helvetica').fontSize(9);
    doc.text(`Quantidade de O.S.: ${orders.length}`);
    if (filters.natureza_os === 'MATERIAL') {
      doc.text(`Quantidade de itens movimentados: ${products.length}`);
      doc.text(`Valor total de materiais: ${money(products.reduce((sum, item) => sum + item.valor_total, 0))}`);
    } else {
      doc.text(`Valor de m\u00e3o de obra: ${money(effective.reduce((sum, order) => sum + order.total_mao_obra_interna, 0))}`);
      doc.text(`Valor de materiais utilizados: ${money(products.reduce((sum, item) => sum + item.valor_total, 0))}`);
      doc.text(`Total apropriado: ${money(effective.reduce((sum, order) => sum + order.total_os, 0))}`);
      if (filters.natureza_os === 'INTERNA') {
        const minutes = effective.flatMap((order) => order.servicos)
          .flatMap((service) => service.execucoes)
          .reduce((sum, execution) => sum + execution.duracao_minutos, 0);
        doc.text(`Tempo total de servi\u00e7os registrado: ${duration(minutes)}`);
      }
    }

    section('VIS\u00c3O GERAL DAS O.S.');
    table(doc, orders, [
      { title: 'O.S.', width: 56, value: (o) => o.numero_os },
      { title: 'Frota', width: 58, value: (o) => o.frota_codigo },
      { title: 'Obra', width: 220, value: (o) => `${o.obra_nome}\n${o.obra_codigo}` },
      { title: 'Categoria', width: 100, value: (o) => o.categoria_servico ? label(o.categoria_servico) : '-' },
      { title: 'Data', width: 72, value: (o) => date(o.data_abertura) },
      { title: 'Status', width: 105, value: (o) => label(o.status) },
      { title: 'Natureza', width: 86, value: (o) => label(o.natureza_os) },
    ], ensure);

    if (filters.natureza_os === 'MATERIAL') {
      const consolidated = materialConsolidation(orders);
      section('MATERIAIS MOVIMENTADOS NO PER\u00cdODO');
      if (consolidated.length) table(doc, consolidated, [
        { title: 'Material', width: 360, value: (p) => p.descricao },
        { title: 'Quantidade', width: 115, align: 'right', value: (p) => quantity(p.quantidade) },
        { title: 'Unidade', width: 90, value: (p) => p.unidade },
        { title: 'Valor total', width: 132, align: 'right', value: (p) => money(p.valor_total) },
      ], ensure);
      else doc.fillColor(colors.muted).font('Helvetica').fontSize(9).text('Nenhum material efetivamente movimentado.');
    }

    section('DETALHAMENTO POR O.S.');
    for (const order of orders) {
      ensure(75);
      const start = doc.y;
      doc.save().fillColor(colors.header).rect(doc.page.margins.left, start, 697, 24).fill().restore();
      doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(11)
        .text(`O.S. ${order.numero_os}`, doc.page.margins.left + 7, start + 7);
      doc.y = start + 29;
      doc.fillColor(colors.text).font('Helvetica').fontSize(8.5)
        .text(`Frota: ${order.frota_codigo}    Obra: ${order.obra_nome} (${order.obra_codigo})`)
        .text(`Data: ${date(order.data_abertura)}    Status: ${label(order.status)}${order.categoria_servico ? `    Categoria: ${label(order.categoria_servico)}` : ''}`);
      if (order.status === 'CANCELADA') {
        doc.fillColor('#9A3412').font('Helvetica-Bold')
          .text('O.S. cancelada: valores exclu\u00eddos dos resumos e da consolida\u00e7\u00e3o.');
      }
      if (order.prestador_terceiro) doc.fillColor(colors.text).font('Helvetica').text(`Prestador: ${order.prestador_terceiro}`);

      if (order.funcionarios.length) {
        section('Funcion\u00e1rios');
        doc.fillColor(colors.text).font('Helvetica').fontSize(8.5)
          .text(order.funcionarios.map((employee) => employee.nome).join('  \u2022  '));
      }
      if (order.servicos.length) {
        section('Servi\u00e7os');
        for (const service of order.servicos) {
          ensure(34);
          doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(8.5)
            .text(`${service.descricao} — ${money(service.valor)}`, doc.page.margins.left);
          if (order.natureza_os === 'INTERNA' && service.execucoes.length) {
            table(doc, service.execucoes, [
              { title: 'Funcion\u00e1rio', width: 255, value: (execution) => execution.funcionario_nome },
              { title: 'Data', width: 105, value: (execution) => date(execution.inicio) },
              { title: 'In\u00edcio', width: 90, value: (execution) => execution.inicio.slice(11, 16) },
              { title: 'T\u00e9rmino', width: 90, value: (execution) => execution.fim.slice(11, 16) },
              { title: 'Tempo', width: 157, align: 'right', value: (execution) => duration(execution.duracao_minutos) },
            ], ensure);
            doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8)
              .text(`Tempo registrado no servi\u00e7o: ${duration(service.execucoes.reduce((sum, execution) => sum + execution.duracao_minutos, 0))}`, doc.page.margins.left);
          } else if (order.natureza_os === 'INTERNA') {
            doc.fillColor(colors.muted).font('Helvetica-Oblique').fontSize(8)
              .text('Nenhum per\u00edodo de trabalho registrado.', doc.page.margins.left);
          } else if (order.prestador_terceiro) {
            doc.fillColor(colors.muted).font('Helvetica').fontSize(8)
              .text(`Prestador: ${order.prestador_terceiro}`, doc.page.margins.left);
          }
          doc.moveDown(0.4);
        }
        if (order.natureza_os === 'INTERNA') {
          const orderMinutes = order.servicos.flatMap((service) => service.execucoes)
            .reduce((sum, execution) => sum + execution.duracao_minutos, 0);
          if (orderMinutes) doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(8.5)
            .text(`Tempo de servi\u00e7os registrado na O.S.: ${duration(orderMinutes)}`, doc.page.margins.left);
        }
      }
      if (order.produtos.length) {
        section(order.natureza_os === 'MATERIAL' ? 'Materiais' : 'Materiais utilizados');
        table(doc, order.produtos, [
          { title: 'Descri\u00e7\u00e3o', width: 322, value: (product) => product.descricao },
          { title: 'Quantidade', width: 92, align: 'right', value: (product) => quantity(product.quantidade) },
          { title: 'Unidade', width: 70, value: (product) => product.unidade },
          { title: 'Valor unit\u00e1rio', width: 105, align: 'right', value: (product) => money(product.valor_unitario) },
          { title: 'Total', width: 108, align: 'right', value: (product) => money(product.valor_total) },
        ], ensure);
      }
      if (!order.funcionarios.length && !order.servicos.length && !order.produtos.length) {
        doc.fillColor(colors.muted).font('Helvetica-Oblique').fontSize(8.5).text('Nenhum item registrado nesta O.S.');
      }
      doc.moveDown(0.8);
    }

    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page += 1) {
      doc.switchToPage(page);
      const y = doc.page.height - doc.page.margins.bottom - 5;
      doc.moveTo(doc.page.margins.left, y - 7)
        .lineTo(doc.page.width - doc.page.margins.right, y - 7)
        .strokeColor(colors.border).lineWidth(0.5).stroke();
      doc.fillColor(colors.muted).font('Helvetica').fontSize(7.5)
        .text('OSGestor', doc.page.margins.left, y, { lineBreak: false })
        .text(`P\u00e1gina ${page - pages.start + 1} de ${pages.count}`, 0, y, {
          width: doc.page.width - doc.page.margins.right, align: 'right', lineBreak: false,
        });
    }
    doc.end();
  });
}
