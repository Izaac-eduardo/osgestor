import { Router } from 'express';
import {
  createOrdemServicoController,
  deleteOrdemServicoController,
  getOrdemServicoController,
  listOrdensServicoController,
  updateOrdemServicoController,
  updateOrdemServicoStatusController,
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
  removeFuncionarioOsController,
  updateProdutoOsController,
  updateServicoOsController,
} from '../controllers/ordens-servico-itens.controller.js';

export const ordensServicoRoutes = Router();

ordensServicoRoutes.get('/', listOrdensServicoController);
ordensServicoRoutes.get('/:id/detalhes', getOrdemServicoDetalhesController);
ordensServicoRoutes.get('/:id/funcionarios', listFuncionariosOsController);
ordensServicoRoutes.post('/:id/funcionarios', addFuncionarioOsController);
ordensServicoRoutes.delete('/:id/funcionarios/:funcionarioId', removeFuncionarioOsController);
ordensServicoRoutes.get('/:id/servicos', listServicosOsController);
ordensServicoRoutes.post('/:id/servicos', createServicoOsController);
ordensServicoRoutes.put('/:id/servicos/:servicoId', updateServicoOsController);
ordensServicoRoutes.delete('/:id/servicos/:servicoId', deleteServicoOsController);
ordensServicoRoutes.get('/:id/produtos', listProdutosOsController);
ordensServicoRoutes.post('/:id/produtos', createProdutoOsController);
ordensServicoRoutes.put('/:id/produtos/:produtoId', updateProdutoOsController);
ordensServicoRoutes.delete('/:id/produtos/:produtoId', deleteProdutoOsController);
ordensServicoRoutes.get('/:id', getOrdemServicoController);
ordensServicoRoutes.post('/', createOrdemServicoController);
ordensServicoRoutes.put('/:id', updateOrdemServicoController);
ordensServicoRoutes.patch('/:id/status', updateOrdemServicoStatusController);
ordensServicoRoutes.delete('/:id', deleteOrdemServicoController);
