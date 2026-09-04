import { Request, Response } from 'express';
import {
  exportGastosPorObraPdf,
  exportGastosPorVeiculoPdf,
  exportOsPorSemanaPdf,
} from '../services/relatorios-pdf.service.js';
import { exportOrdensServicoPdf } from '../services/ordens-servico-pdf.service.js';
import { RelatorioFilters, RelatorioServiceError } from '../services/relatorios.service.js';

const queryText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const reportFilters = (request: Request): RelatorioFilters => ({
  obra_id: queryText(request.query.obra_id),
  prefixo_frota_id: queryText(request.query.prefixo_frota_id),
  frota_numero: queryText(request.query.frota_numero),
  data_inicio: queryText(request.query.data_inicio),
  data_fim: queryText(request.query.data_fim),
  natureza_os: queryText(request.query.natureza_os),
  categoria_servico: queryText(request.query.categoria_servico),
  status: queryText(request.query.status),
});

const sendError = (response: Response, error: unknown): void => {
  if (error instanceof RelatorioServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno na exportação PDF dos relatórios.', error);
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

const sendPdf = (response: Response, buffer: Buffer, filename: string): void => {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.status(200).send(buffer);
};

export async function gastosPorVeiculoPdfController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const buffer = await exportGastosPorVeiculoPdf(reportFilters(request));
    sendPdf(response, buffer, 'relatorio-gastos-por-veiculo.pdf');
  } catch (error) {
    sendError(response, error);
  }
}

export async function gastosPorObraPdfController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const buffer = await exportGastosPorObraPdf(reportFilters(request));
    sendPdf(response, buffer, 'relatorio-gastos-por-obra.pdf');
  } catch (error) {
    sendError(response, error);
  }
}

export async function osPorSemanaPdfController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const buffer = await exportOsPorSemanaPdf(reportFilters(request));
    sendPdf(response, buffer, 'relatorio-os-por-semana.pdf');
  } catch (error) {
    sendError(response, error);
  }
}


export async function ordensServicoPdfController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const buffer = await exportOrdensServicoPdf(reportFilters(request));
    sendPdf(response, buffer, 'relatorio-ordens-servico.pdf');
  } catch (error) {
    sendError(response, error);
  }
}
