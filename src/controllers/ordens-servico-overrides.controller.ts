import type { Request, Response } from 'express';
import {
  listOverrides,
  removeOverride,
  ordemServicoOverrideFields,
  type OrdemServicoOverrideField,
} from '../services/ordens-servico-overrides.service.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const routeUuid = (value: string | string[] | undefined, field: string): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error(`${field} deve ser um UUID válido.`);
  return value;
};

const routeField = (value: string | string[] | undefined): OrdemServicoOverrideField => {
  if (typeof value !== 'string' || !(ordemServicoOverrideFields as readonly string[]).includes(value)) throw new Error('Campo de override inválido.');
  return value as OrdemServicoOverrideField;
};

const sendError = (response: Response, error: unknown): void => {
  response.status(400).json({ message: error instanceof Error ? error.message : 'Não foi possível processar o override.' });
};

export async function listOrdemServicoOverridesController(request: Request, response: Response): Promise<void> {
  try { response.status(200).json(await listOverrides(routeUuid(request.params.id, 'id'))); }
  catch (error) { sendError(response, error); }
}

export async function removeOrdemServicoOverrideController(request: Request, response: Response): Promise<void> {
  try {
    const removed = await removeOverride(routeUuid(request.params.id, 'id'), routeField(request.params.campo));
    if (!removed) { response.status(404).json({ message: 'Override não encontrado.' }); return; }
    response.status(204).send();
  } catch (error) { sendError(response, error); }
}
