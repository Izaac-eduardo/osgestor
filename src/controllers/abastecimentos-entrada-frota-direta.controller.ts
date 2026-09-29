import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { linkExistingFrotaDiretaAbastecimento, listFrotaDiretaAbastecimentoCandidates, registerFrotaDiretaAbastecimento } from '../services/abastecimentos-entrada-frota-direta.service.js';

const run = (handler: (request: Request) => Promise<unknown>) => async (request: Request, response: Response) => {
  try { response.json(await handler(request)); }
  catch (error) { if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; } console.error('Erro no vínculo de abastecimento da frota direta.'); response.status(500).json({ message: 'Erro interno do servidor.' }); }
};
export const register = run(async request => { const result = await registerFrotaDiretaAbastecimento(String(request.params.destinoId), request.body); return result; });
export const candidates = run(async request => listFrotaDiretaAbastecimentoCandidates(String(request.params.destinoId)));
export const link = run(async request => { const body = request.body as Record<string, unknown>; return linkExistingFrotaDiretaAbastecimento(String(request.params.destinoId), String(body.abastecimento_id)); });
