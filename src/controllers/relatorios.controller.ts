import { Request, Response } from 'express';
import {
  RelatorioFilters,
  RelatorioServiceError,
  getGastosPorObra,
  getGastosPorVeiculo,
  getOsPorSemana,
  getResumo,
} from '../services/relatorios.service.js';

const sendError = (response: Response, error: unknown): void => {
  if (error instanceof RelatorioServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno no módulo de relatórios.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

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

export async function gastosPorVeiculoController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await getGastosPorVeiculo(reportFilters(request)));
  } catch (error) {
    sendError(response, error);
  }
}

export async function gastosPorObraController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await getGastosPorObra(reportFilters(request)));
  } catch (error) {
    sendError(response, error);
  }
}

export async function osPorSemanaController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await getOsPorSemana(reportFilters(request)));
  } catch (error) {
    sendError(response, error);
  }
}

export async function resumoController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await getResumo(reportFilters(request)));
  } catch (error) {
    sendError(response, error);
  }
}