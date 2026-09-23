import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { getConsumoFrota } from '../services/abastecimentos-consumo-frota.service.js';

const text = (value: unknown): string | undefined => value === undefined ? undefined : typeof value === 'string' ? value : (() => { throw new AbastecimentoServiceError(400, 'Filtro deve ser texto.'); })();

export async function getConsumoFrotaController(request: Request, response: Response): Promise<void> {
  try {
    response.json(await getConsumoFrota({ data_inicio: text(request.query.data_inicio), data_fim: text(request.query.data_fim), obra_id: text(request.query.obra_id), frota_id: text(request.query.frota_id), produto: text(request.query.produto), tipo_calculo: text(request.query.tipo_calculo) as never, situacao: text(request.query.situacao) as never, page: text(request.query.page), limit: text(request.query.limit) }));
  } catch (error) {
    if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; }
    console.error('Erro ao consultar média de consumo por frota.'); response.status(500).json({ message: 'Erro interno do servidor.' });
  }
}
