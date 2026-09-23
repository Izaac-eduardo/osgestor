import type { Request, Response } from 'express';
import { AbastecimentoServiceError } from '../services/abastecimentos-base.service.js';
import { getRelatorioEntradas } from '../services/abastecimentos-entradas-relatorio.service.js';

const queryText = (value: unknown): string | undefined => value === undefined ? undefined : typeof value === 'string' ? value : (() => { throw new AbastecimentoServiceError(400, 'Filtro deve ser texto.'); })();

export async function getRelatorioEntradasController(request: Request, response: Response): Promise<void> {
  try { response.json(await getRelatorioEntradas({ data_inicio: queryText(request.query.data_inicio), data_fim: queryText(request.query.data_fim), produto_id: queryText(request.query.produto_id), produto_codigo: queryText(request.query.produto_codigo), numero_nf: queryText(request.query.numero_nf), ponto_id: queryText(request.query.ponto_id), periodo: queryText(request.query.periodo) as 'dia' | 'mes' | undefined, page: Number(queryText(request.query.page) ?? 1), limit: Number(queryText(request.query.limit) ?? 25) })); }
  catch (error) { if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; } console.error('Erro ao consultar relatório de entradas.'); response.status(500).json({ message: 'Erro interno do servidor.' }); }
}
