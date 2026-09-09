import { Request, Response } from 'express';
import { OrdemServicoServiceError } from '../services/ordens-servico.service.js';
import {
  createExecucao, deleteExecucao, listExecucoes, updateExecucao,
} from '../services/servicos-os-execucoes.service.js';

const uuid = (value: string | string[] | undefined, field: string): string => {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new OrdemServicoServiceError(400, `${field} deve ser um UUID válido.`);
  }
  return value;
};
const ids = (request: Request) => ({
  ordem: uuid(request.params.id, 'id'),
  servico: uuid(request.params.servicoId, 'servicoId'),
});
const error = (response: Response, caught: unknown): void => {
  if (caught instanceof OrdemServicoServiceError) {
    response.status(caught.statusCode).json({ message: caught.message });
  } else {
    console.error('Erro interno nas execuções de serviço.', caught);
    response.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

export async function listExecucoesController(request: Request, response: Response) {
  try { const x=ids(request); response.json(await listExecucoes(x.ordem,x.servico)); }
  catch(caught){ error(response,caught); }
}
export async function createExecucaoController(request: Request, response: Response) {
  try { const x=ids(request); response.status(201).json(await createExecucao(x.ordem,x.servico,request.body)); }
  catch(caught){ error(response,caught); }
}
export async function updateExecucaoController(request: Request, response: Response) {
  try { const x=ids(request); response.json(await updateExecucao(x.ordem,x.servico,uuid(request.params.execucaoId,'execucaoId'),request.body)); }
  catch(caught){ error(response,caught); }
}
export async function deleteExecucaoController(request: Request, response: Response) {
  try { const x=ids(request); await deleteExecucao(x.ordem,x.servico,uuid(request.params.execucaoId,'execucaoId')); response.status(204).send(); }
  catch(caught){ error(response,caught); }
}
