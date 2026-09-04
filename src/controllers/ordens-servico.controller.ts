import { Request, Response } from 'express';
import {
  OrdemServicoServiceError,
  createOrdemServico,
  deleteOrdemServico,
  getOrdemServico,
  listOrdensServico,
  updateOrdemServico,
  updateOrdemServicoStatus,
} from '../services/ordens-servico.service.js';

const sendError = (response: Response, error: unknown): void => {
  if (error instanceof OrdemServicoServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno no CRUD de Ordens de Serviço.', error);
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

const queryText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const routeId = (value: string | string[] | undefined): string => {
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new OrdemServicoServiceError(400, 'id deve ser um UUID válido.');
  }
  return value;
};

export async function listOrdensServicoController(request: Request, response: Response): Promise<void> {
  try {
    const ordens = await listOrdensServico({
      status: queryText(request.query.status),
      natureza_os: queryText(request.query.natureza_os),
      categoria_servico: queryText(request.query.categoria_servico),
      obra_id: queryText(request.query.obra_id),
      prefixo_frota_id: queryText(request.query.prefixo_frota_id),
      numero_os: queryText(request.query.numero_os),
      frota_numero: queryText(request.query.frota_numero),
      data_inicio: queryText(request.query.data_inicio),
      data_fim: queryText(request.query.data_fim),
    });
    response.status(200).json(ordens);
  } catch (error) {
    sendError(response, error);
  }
}

export async function getOrdemServicoController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await getOrdemServico(routeId(request.params.id)));
  } catch (error) {
    sendError(response, error);
  }
}

export async function createOrdemServicoController(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json(await createOrdemServico(request.body));
  } catch (error) {
    sendError(response, error);
  }
}

export async function updateOrdemServicoController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await updateOrdemServico(routeId(request.params.id), request.body));
  } catch (error) {
    sendError(response, error);
  }
}

export async function updateOrdemServicoStatusController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    response.status(200).json(await updateOrdemServicoStatus(routeId(request.params.id), request.body));
  } catch (error) {
    sendError(response, error);
  }
}

export async function deleteOrdemServicoController(request: Request, response: Response): Promise<void> {
  try {
    await deleteOrdemServico(routeId(request.params.id));
    response.status(204).send();
  } catch (error) {
    sendError(response, error);
  }
}
