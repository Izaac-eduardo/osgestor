import { Router } from 'express';
import {
  createOrdemServicoController,
  deleteOrdemServicoController,
  getOrdemServicoController,
  listOrdensServicoController,
  updateOrdemServicoController,
  updateOrdemServicoStatusController,
  categoriasFiltroController,
} from '../controllers/ordens-servico.controller.js';
import {
  addFuncionarioOsController,
  createProdutoOsController,
  createServicoOsController,
  deleteProdutoOsController,
  deleteServicoOsController,
  getOrdemServicoDetalhesController,
  listFuncionariosOsController,
  listProdutosOsController,
  listServicosOsController,
  listCategoriasGerenciaisController,
  removeFuncionarioOsController,
  reclassifyProdutoAsServicoController,
  updateProdutoOsController,
  updateServicoOsController,
  updateServicoGerencialManualController,
} from '../controllers/ordens-servico-itens.controller.js';
import { listOrdemServicoOverridesController, removeOrdemServicoOverrideController } from '../controllers/ordens-servico-overrides.controller.js';
import {
  createExecucaoController,
  deleteExecucaoController,
  listExecucoesController,
  updateExecucaoController,
} from '../controllers/servicos-os-execucoes.controller.js';
import { requireMethodRole, requireRole } from '../middleware/authorization.js';

export const ordensServicoRoutes = Router();
ordensServicoRoutes.use(requireMethodRole({ deleteRoles: ['ADMIN', 'OPERADOR'] }));

ordensServicoRoutes.get('/', listOrdensServicoController);
ordensServicoRoutes.get('/categorias-filtro', categoriasFiltroController);
ordensServicoRoutes.get('/categorias-gerenciais', listCategoriasGerenciaisController);
ordensServicoRoutes.get('/:id/detalhes', getOrdemServicoDetalhesController);
ordensServicoRoutes.get('/:id/funcionarios', listFuncionariosOsController);
ordensServicoRoutes.post('/:id/funcionarios', addFuncionarioOsController);
ordensServicoRoutes.delete('/:id/funcionarios/:funcionarioId', removeFuncionarioOsController);
ordensServicoRoutes.get('/:id/servicos', listServicosOsController);
ordensServicoRoutes.post('/:id/servicos', createServicoOsController);
ordensServicoRoutes.put('/:id/servicos/:servicoId', updateServicoOsController);
ordensServicoRoutes.patch('/:id/servicos/:servicoId/categoria-gerencial', requireRole('ADMIN', 'OPERADOR'), updateServicoGerencialManualController);
ordensServicoRoutes.delete('/:id/servicos/:servicoId', deleteServicoOsController);
ordensServicoRoutes.get('/:id/servicos/:servicoId/execucoes', listExecucoesController);
ordensServicoRoutes.post('/:id/servicos/:servicoId/execucoes', createExecucaoController);
ordensServicoRoutes.put('/:id/servicos/:servicoId/execucoes/:execucaoId', updateExecucaoController);
ordensServicoRoutes.delete('/:id/servicos/:servicoId/execucoes/:execucaoId', deleteExecucaoController);
ordensServicoRoutes.get('/:id/produtos', listProdutosOsController);
ordensServicoRoutes.get('/:id/overrides', listOrdemServicoOverridesController);
ordensServicoRoutes.delete('/:id/overrides/:campo', requireRole('ADMIN'), removeOrdemServicoOverrideController);
ordensServicoRoutes.post('/:id/produtos', createProdutoOsController);
ordensServicoRoutes.put('/:id/produtos/:produtoId', updateProdutoOsController);
ordensServicoRoutes.post('/:id/produtos/:produtoId/reclassificar-servico', requireRole('ADMIN'), reclassifyProdutoAsServicoController);
ordensServicoRoutes.delete('/:id/produtos/:produtoId', deleteProdutoOsController);
ordensServicoRoutes.get('/:id', getOrdemServicoController);
ordensServicoRoutes.post('/', createOrdemServicoController);
ordensServicoRoutes.put('/:id', updateOrdemServicoController);
ordensServicoRoutes.patch('/:id/status', updateOrdemServicoStatusController);
ordensServicoRoutes.delete('/:id', deleteOrdemServicoController);
