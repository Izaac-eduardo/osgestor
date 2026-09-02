import { Request, Response } from 'express';
import {
  exportGastosPorObraExcel,
  exportGastosPorVeiculoExcel,
  exportOsPorSemanaExcel,
} from '../services/relatorios-excel.service.js';
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
  console.error('Erro interno na exportação Excel dos relatórios.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

const sendWorkbook = (response: Response, buffer: Buffer, filename: string): void => {
  response.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.status(200).send(buffer);
};

export async function gastosPorVeiculoExcelController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const buffer = await exportGastosPorVeiculoExcel(reportFilters(request));
    sendWorkbook(response, buffer, 'relatorio-gastos-por-veiculo.xlsx');
  } catch (error) {
    sendError(response, error);
  }
}

export async function gastosPorObraExcelController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const buffer = await exportGastosPorObraExcel(reportFilters(request));
    sendWorkbook(response, buffer, 'relatorio-gastos-por-obra.xlsx');
  } catch (error) {
    sendError(response, error);
  }
}

export async function osPorSemanaExcelController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const buffer = await exportOsPorSemanaExcel(reportFilters(request));
    sendWorkbook(response, buffer, 'relatorio-os-por-semana.xlsx');
  } catch (error) {
    sendError(response, error);
  }
}