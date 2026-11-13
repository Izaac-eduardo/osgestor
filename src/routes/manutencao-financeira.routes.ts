import { Router } from 'express';
import * as controller from '../controllers/manutencao-financeira.controller.js';
import { requireRole, requireMethodRole } from '../middleware/authorization.js';

export const manutencaoFinanceiraRoutes = Router();
manutencaoFinanceiraRoutes.use(requireMethodRole());
manutencaoFinanceiraRoutes.get('/por-frota', controller.porFrota);
manutencaoFinanceiraRoutes.get('/totais', controller.totais);
manutencaoFinanceiraRoutes.get('/detalhes', controller.detalhes);
manutencaoFinanceiraRoutes.get('/despesas-compartilhadas', controller.despesasCompartilhadas);
manutencaoFinanceiraRoutes.get('/desempenho-oficina', controller.desempenho);
manutencaoFinanceiraRoutes.get('/salarios-base', controller.salarios);
manutencaoFinanceiraRoutes.get('/exportar.xlsx', controller.excel);
manutencaoFinanceiraRoutes.get('/exportar.pdf', controller.pdf);
manutencaoFinanceiraRoutes.get('/desempenho-oficina/exportar.xlsx', controller.desempenhoExcel);
manutencaoFinanceiraRoutes.get('/desempenho-oficina/exportar.pdf', controller.desempenhoPdf);
manutencaoFinanceiraRoutes.post('/salarios-base', requireRole('ADMIN'), controller.salvarSalario);
manutencaoFinanceiraRoutes.put('/salarios-base/:id', requireRole('ADMIN'), controller.salvarSalario);
