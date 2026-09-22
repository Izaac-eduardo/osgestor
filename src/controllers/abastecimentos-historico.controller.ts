import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { listAbastecimentosHistorico } from '../services/abastecimentos-historico.service.js';

const queryText = (value: unknown): string | undefined => value === undefined ? undefined : typeof value === 'string' ? value : (() => { throw new AbastecimentoServiceError(400, 'Filtro deve ser texto.'); })();

export async function listAbastecimentosHistoricoController(request: Request, response: Response): Promise<void> {
  try {
    response.json(await listAbastecimentosHistorico({
      data_inicio: queryText(request.query.data_inicio), data_fim: queryText(request.query.data_fim), obra_id: queryText(request.query.obra_id),
      busca: queryText(request.query.busca), produto: queryText(request.query.produto), tipo_destinatario: queryText(request.query.tipo_destinatario),
      page: queryText(request.query.page), limit: queryText(request.query.limit),
    }));
  } catch (error) {
    if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; }
    console.error('Erro ao consultar histórico de abastecimentos.'); response.status(500).json({ message: 'Erro interno do servidor.' });
  }
}
