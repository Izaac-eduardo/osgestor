import { Router } from 'express';
import {
  gastosPorObraPdfController,
  gastosPorVeiculoPdfController,
  ordensServicoPdfController,
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
import { requireMethodRole } from '../middleware/authorization.js';
import { terceirosCategoriaItensController, terceirosCategoriasController } from '../controllers/terceiros-categorias.controller.js';

export const relatoriosRoutes = Router();
relatoriosRoutes.use(requireMethodRole());

relatoriosRoutes.get('/gastos-por-veiculo/pdf', gastosPorVeiculoPdfController);
relatoriosRoutes.get('/gastos-por-obra/pdf', gastosPorObraPdfController);
relatoriosRoutes.get('/os-por-semana/pdf', osPorSemanaPdfController);
relatoriosRoutes.get('/ordens-servico/pdf', ordensServicoPdfController);

relatoriosRoutes.get('/gastos-por-veiculo/excel', gastosPorVeiculoExcelController);
relatoriosRoutes.get('/gastos-por-obra/excel', gastosPorObraExcelController);
relatoriosRoutes.get('/os-por-semana/excel', osPorSemanaExcelController);

relatoriosRoutes.get('/gastos-por-veiculo', gastosPorVeiculoController);
relatoriosRoutes.get('/gastos-por-obra', gastosPorObraController);
relatoriosRoutes.get('/os-por-semana', osPorSemanaController);
relatoriosRoutes.get('/resumo', resumoController);
relatoriosRoutes.get('/terceiros-categorias', terceirosCategoriasController);
relatoriosRoutes.get('/terceiros-categorias/:categoria/itens', terceirosCategoriaItensController);
