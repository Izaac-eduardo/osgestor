import type { Request, Response } from 'express';
import { FrotaServiceError, deleteFrota, getFrota, listFrotas, saveFrota, updateFrotaStatus } from '../services/frotas.service.js';

function routeId(request: Request): string {
  const id = request.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new FrotaServiceError(400, 'id deve ser um UUID válido.');
  }
  return id;
}
function queryText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new FrotaServiceError(400, 'Filtro deve ser texto.');
  return value;
}
const action = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response): Promise<void> => {
  try { await handler(req, res); }
  catch (error) {
    if (error instanceof FrotaServiceError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error('Erro interno no CRUD de frotas.');
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};
export const list = action(async (req, res) => {
  res.json(await listFrotas({ busca: queryText(req.query.busca), status: queryText(req.query.status),
    placa: queryText(req.query.placa), modelo: queryText(req.query.modelo) }));
});
export const get = action(async (req, res) => { res.json(await getFrota(routeId(req))); });
export const create = action(async (req, res) => { res.status(201).json(await saveFrota(req.body)); });
export const update = action(async (req, res) => { res.json(await saveFrota(req.body, routeId(req))); });
export const status = action(async (req, res) => { res.json(await updateFrotaStatus(routeId(req), req.body)); });
export const remove = action(async (req, res) => { await deleteFrota(routeId(req)); res.status(204).send(); });