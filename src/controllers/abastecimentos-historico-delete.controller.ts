import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { deleteAbastecimentoHistorico } from '../services/abastecimentos-historico-delete.service.js';

export async function deleteAbastecimentoHistoricoController(request: Request, response: Response): Promise<void> {
  try {
    response.json(await deleteAbastecimentoHistorico(String(request.params.id), request.body, request.authUser));
  } catch (error) {
    if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; }
    console.error('Erro ao excluir abastecimento.');
    response.status(500).json({ message: 'Erro interno do servidor.' });
  }
}
