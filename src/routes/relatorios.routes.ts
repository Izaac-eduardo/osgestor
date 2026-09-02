import { Router } from 'express';
import {
  gastosPorObraPdfController,
  gastosPorVeiculoPdfController,
  osPorSemanaPdfController,
} from '../controllers/relatorios-pdf.controller.js';
import {
  gastosPorObraExcelController,
  gastosPorVeiculoExcelController,
  osPorSemanaExcelController,
} from '../controllers/relatorios-excel.controller.js';
import {
  gastosPorObraController,
  gastosPorVeiculoController,
  osPorSemanaController,
  resumoController,
} from '../controllers/relatorios.controller.js';

export const relatoriosRoutes = Router();

relatoriosRoutes.get('/gastos-por-veiculo/pdf', gastosPorVeiculoPdfController);
relatoriosRoutes.get('/gastos-por-obra/pdf', gastosPorObraPdfController);
relatoriosRoutes.get('/os-por-semana/pdf', osPorSemanaPdfController);

relatoriosRoutes.get('/gastos-por-veiculo/excel', gastosPorVeiculoExcelController);
relatoriosRoutes.get('/gastos-por-obra/excel', gastosPorObraExcelController);
relatoriosRoutes.get('/os-por-semana/excel', osPorSemanaExcelController);

relatoriosRoutes.get('/gastos-por-veiculo', gastosPorVeiculoController);
relatoriosRoutes.get('/gastos-por-obra', gastosPorObraController);
relatoriosRoutes.get('/os-por-semana', osPorSemanaController);
relatoriosRoutes.get('/resumo', resumoController);