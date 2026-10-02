import type { Request, Response } from 'express';
import { getDashboard, type DashboardFilters } from '../services/dashboard.service.js';

export async function dashboardController(request: Request, response: Response): Promise<void> {
  try {
    const text = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined;
    const data_inicio = text(request.query.data_inicio); const data_fim = text(request.query.data_fim);
    if (!data_inicio || !data_fim) { response.status(400).json({ message: 'data_inicio e data_fim são obrigatórios.' }); return; }
    response.status(200).json(await getDashboard({ data_inicio, data_fim, obra_id: text(request.query.obra_id), natureza_os: text(request.query.natureza_os), status: text(request.query.status) } as DashboardFilters));
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : 'Não foi possível carregar o dashboard.' }); }
}
