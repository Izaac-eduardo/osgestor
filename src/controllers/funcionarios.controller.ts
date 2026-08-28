import { Request, Response } from 'express';
import {
  FuncionarioServiceError,
  createFuncionario,
  deleteFuncionario,
  getFuncionario,
  listFuncionarios,
  updateFuncionario,
  updateFuncionarioStatus,
} from '../services/funcionarios.service.js';

const sendError = (response: Response, error: unknown): void => {
  if (error instanceof FuncionarioServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno no CRUD de funcionários.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

const queryText = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;

const routeId = (value: string | string[] | undefined): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new FuncionarioServiceError(400, 'id deve ser um UUID válido.');
  }
  return value;
};

export async function listFuncionariosController(request: Request, response: Response): Promise<void> {
  try {
    const funcionarios = await listFuncionarios({
      status: queryText(request.query.status),
      nome: queryText(request.query.nome),
      matricula: queryText(request.query.matricula),
      cargo: queryText(request.query.cargo),
    });
    response.status(200).json(funcionarios);
  } catch (error) { sendError(response, error); }
}

export async function getFuncionarioController(request: Request, response: Response): Promise<void> {
  try { response.status(200).json(await getFuncionario(routeId(request.params.id))); }
  catch (error) { sendError(response, error); }
}

export async function createFuncionarioController(request: Request, response: Response): Promise<void> {
  try { response.status(201).json(await createFuncionario(request.body)); }
  catch (error) { sendError(response, error); }
}

export async function updateFuncionarioController(request: Request, response: Response): Promise<void> {
  try { response.status(200).json(await updateFuncionario(routeId(request.params.id), request.body)); }
  catch (error) { sendError(response, error); }
}

export async function updateFuncionarioStatusController(request: Request, response: Response): Promise<void> {
  try { response.status(200).json(await updateFuncionarioStatus(routeId(request.params.id), request.body)); }
  catch (error) { sendError(response, error); }
}

export async function deleteFuncionarioController(request: Request, response: Response): Promise<void> {
  try { await deleteFuncionario(routeId(request.params.id)); response.status(204).send(); }
  catch (error) { sendError(response, error); }
}
