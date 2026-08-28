import { Request, Response } from 'express';
import {
  OrdemServicoServiceError,
} from '../services/ordens-servico.service.js';
import {
  addFuncionarioOs,
  createProdutoOs,
  createServicoOs,
  deleteProdutoOs,
  deleteServicoOs,
  getOrdemServicoDetalhes,
  listFuncionariosOs,
  listProdutosOs,
  listServicosOs,
  removeFuncionarioOs,
  updateProdutoOs,
  updateServicoOs,
} from '../services/ordens-servico-itens.service.js';

const sendError = (response: Response, error: unknown): void => {
  if (error instanceof OrdemServicoServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno nos itens da Ordem de Serviço.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};

const routeUuid = (value: string | string[] | undefined, field: string): string => {
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new OrdemServicoServiceError(400, `${field} deve ser um UUID válido.`);
  }
  return value;
};

export async function listFuncionariosOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await listFuncionariosOs(routeUuid(request.params.id, 'id')));
  } catch (error) { sendError(response, error); }
}

export async function addFuncionarioOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json(await addFuncionarioOs(routeUuid(request.params.id, 'id'), request.body));
  } catch (error) { sendError(response, error); }
}

export async function removeFuncionarioOsController(request: Request, response: Response): Promise<void> {
  try {
    await removeFuncionarioOs(
      routeUuid(request.params.id, 'id'),
      routeUuid(request.params.funcionarioId, 'funcionarioId'),
    );
    response.status(204).send();
  } catch (error) { sendError(response, error); }
}

export async function listServicosOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await listServicosOs(routeUuid(request.params.id, 'id')));
  } catch (error) { sendError(response, error); }
}

export async function createServicoOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json(await createServicoOs(routeUuid(request.params.id, 'id'), request.body));
  } catch (error) { sendError(response, error); }
}

export async function updateServicoOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await updateServicoOs(
      routeUuid(request.params.id, 'id'),
      routeUuid(request.params.servicoId, 'servicoId'),
      request.body,
    ));
  } catch (error) { sendError(response, error); }
}

export async function deleteServicoOsController(request: Request, response: Response): Promise<void> {
  try {
    await deleteServicoOs(
      routeUuid(request.params.id, 'id'),
      routeUuid(request.params.servicoId, 'servicoId'),
    );
    response.status(204).send();
  } catch (error) { sendError(response, error); }
}

export async function listProdutosOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await listProdutosOs(routeUuid(request.params.id, 'id')));
  } catch (error) { sendError(response, error); }
}

export async function createProdutoOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json(await createProdutoOs(routeUuid(request.params.id, 'id'), request.body));
  } catch (error) { sendError(response, error); }
}

export async function updateProdutoOsController(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json(await updateProdutoOs(
      routeUuid(request.params.id, 'id'),
      routeUuid(request.params.produtoId, 'produtoId'),
      request.body,
    ));
  } catch (error) { sendError(response, error); }
}

export async function deleteProdutoOsController(request: Request, response: Response): Promise<void> {
  try {
    await deleteProdutoOs(
      routeUuid(request.params.id, 'id'),
      routeUuid(request.params.produtoId, 'produtoId'),
    );
    response.status(204).send();
  } catch (error) { sendError(response, error); }
}

export async function getOrdemServicoDetalhesController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    response.status(200).json(await getOrdemServicoDetalhes(routeUuid(request.params.id, 'id')));
  } catch (error) { sendError(response, error); }
}
