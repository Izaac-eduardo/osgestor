import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { createAbastecimentoManual } from '../services/abastecimentos-manual.service.js';

export async function createAbastecimentoManualController(request: Request, response: Response): Promise<void> {
  try { response.status(201).json(await createAbastecimentoManual(request.body)); }
  catch (error) {
    if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; }
    console.error('Erro ao criar abastecimento manual.'); response.status(500).json({ message: 'Erro interno do servidor.' });
  }
}
