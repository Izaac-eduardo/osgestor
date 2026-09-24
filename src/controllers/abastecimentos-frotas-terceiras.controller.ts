import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { createFrotaTerceira, getFrotaTerceira, listFrotasTerceiras, updateFrotaTerceira, updateFrotaTerceiraStatus } from '../services/abastecimentos-frotas-terceiras.service.js';

const queryText = (value: unknown): string | undefined => value === undefined ? undefined : typeof value === 'string' ? value : (() => { throw new AbastecimentoServiceError(400, 'Filtro deve ser texto.'); })();
const queryBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new AbastecimentoServiceError(400, 'sem_terceiro deve ser true ou false.');
};
const action = (handler: (request: Request, response: Response) => Promise<void>) => async (request: Request, response: Response): Promise<void> => {
  try { await handler(request, response); }
  catch (error) { if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; } console.error('Erro interno no cadastro de frotas terceiras.'); response.status(500).json({ message: 'Erro interno do servidor.' }); }
};

export const list = action(async (request, response) => {
  response.json(await listFrotasTerceiras({ busca: queryText(request.query.busca), tipo: queryText(request.query.tipo), status: queryText(request.query.status), terceiro_id: queryText(request.query.terceiro_id), sem_terceiro: queryBoolean(request.query.sem_terceiro) }));
});
export const get = action(async (request, response) => { response.json(await getFrotaTerceira(String(request.params.id))); });
export const create = action(async (request, response) => { response.status(201).json(await createFrotaTerceira(request.body)); });
export const update = action(async (request, response) => { response.json(await updateFrotaTerceira(String(request.params.id), request.body)); });
export const status = action(async (request, response) => { response.json(await updateFrotaTerceiraStatus(String(request.params.id), request.body)); });
