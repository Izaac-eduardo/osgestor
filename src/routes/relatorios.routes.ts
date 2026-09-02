import { Router } from 'express';
import {
  gastosPorObraController,
  gastosPorVeiculoController,
  osPorSemanaController,
  resumoController,
} from '../controllers/relatorios.controller.js';

export const relatoriosRoutes = Router();

relatoriosRoutes.get('/gastos-por-veiculo', gastosPorVeiculoController);
relatoriosRoutes.get('/gastos-por-obra', gastosPorObraController);
relatoriosRoutes.get('/os-por-semana', osPorSemanaController);
relatoriosRoutes.get('/resumo', resumoController);