import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { updateAbastecimentoHistorico } from '../services/abastecimentos-historico-edit.service.js';
export async function updateAbastecimentoHistoricoController(request: Request, response: Response): Promise<void> { try { response.json(await updateAbastecimentoHistorico(String(request.params.id), request.body)); } catch (error) { if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; } console.error('Erro ao editar abastecimento.'); response.status(500).json({ message: 'Erro interno do servidor.' }); } }
