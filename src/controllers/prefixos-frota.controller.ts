import { Request, Response } from 'express';
import {
  PrefixoFrotaServiceError,
  createPrefixoFrota,
  deletePrefixoFrota,
  getPrefixoFrota,
  listPrefixosFrota,
  updatePrefixoFrota,
  updatePrefixoFrotaStatus,
} from '../services/prefixos-frota.service.js';

const sendError = (response: Response, error: unknown): void => {
  if (error instanceof PrefixoFrotaServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno no CRUD de prefixos de frota.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

const queryText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const routeId = (value: string | string[] | undefined): string => {
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new PrefixoFrotaServiceError(400, 'id deve ser um UUID válido.');
  }
  return value;
};

export async function listPrefixosFrotaController(request: Request, response: Response): Promise<void> {
  try {
    const prefixos = await listPrefixosFrota({
      status: queryText(request.query.status),
      codigo: queryText(request.query.codigo),
      descricao: queryText(request.query.descricao),
    });
    response.status(200).json(prefixos);
  } catch (error) {
    sendError(response, error);
  }
}

export async function getPrefixoFrotaController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await getPrefixoFrota(routeId(request.params.id)));
  } catch (error) {
    sendError(response, error);
  }
}

export async function createPrefixoFrotaController(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json(await createPrefixoFrota(request.body));
  } catch (error) {
    sendError(response, error);
  }
}

export async function updatePrefixoFrotaController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await updatePrefixoFrota(routeId(request.params.id), request.body));
  } catch (error) {
    sendError(response, error);
  }
}

export async function updatePrefixoFrotaStatusController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    response.status(200).json(await updatePrefixoFrotaStatus(routeId(request.params.id), request.body));
  } catch (error) {
    sendError(response, error);
  }
}

export async function deletePrefixoFrotaController(request: Request, response: Response): Promise<void> {
  try {
    await deletePrefixoFrota(routeId(request.params.id));
    response.status(204).send();
  } catch (error) {
    sendError(response, error);
  }
}
