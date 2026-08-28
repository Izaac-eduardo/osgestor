import { Request, Response } from 'express';
import { ObraServiceError, createObra, deleteObra, getObra, listObras, updateObra, updateObraStatus } from '../services/obras.service.js';

const sendError = (response: Response, error: unknown): void => {
  if (error instanceof ObraServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno no CRUD de obras.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

const queryText = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;

const routeId = (value: string | string[] | undefined): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ObraServiceError(400, 'id deve ser um UUID válido.');
  }
  return value;
};

export async function listObrasController(request: Request, response: Response): Promise<void> {
  try {
    const obras = await listObras({
      status: queryText(request.query.status),
      codigo: queryText(request.query.codigo),
      nome: queryText(request.query.nome),
    });
    response.status(200).json(obras);
  } catch (error) { sendError(response, error); }
}

export async function getObraController(request: Request, response: Response): Promise<void> {
  try { response.status(200).json(await getObra(routeId(request.params.id))); }
  catch (error) { sendError(response, error); }
}

export async function createObraController(request: Request, response: Response): Promise<void> {
  try { response.status(201).json(await createObra(request.body)); }
  catch (error) { sendError(response, error); }
}

export async function updateObraController(request: Request, response: Response): Promise<void> {
  try { response.status(200).json(await updateObra(routeId(request.params.id), request.body)); }
  catch (error) { sendError(response, error); }
}

export async function updateObraStatusController(request: Request, response: Response): Promise<void> {
  try { response.status(200).json(await updateObraStatus(routeId(request.params.id), request.body)); }
  catch (error) { sendError(response, error); }
}

export async function deleteObraController(request: Request, response: Response): Promise<void> {
  try { await deleteObra(routeId(request.params.id)); response.status(204).send(); }
  catch (error) { sendError(response, error); }
}