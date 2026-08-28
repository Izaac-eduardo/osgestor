import { Router } from 'express';
import {
  createOrdemServicoController,
  deleteOrdemServicoController,
  getOrdemServicoController,
  listOrdensServicoController,
  updateOrdemServicoController,
  updateOrdemServicoStatusController,
} from '../controllers/ordens-servico.controller.js';

export const ordensServicoRoutes = Router();

ordensServicoRoutes.get('/', listOrdensServicoController);
ordensServicoRoutes.get('/:id', getOrdemServicoController);
ordensServicoRoutes.post('/', createOrdemServicoController);
ordensServicoRoutes.put('/:id', updateOrdemServicoController);
ordensServicoRoutes.patch('/:id/status', updateOrdemServicoStatusController);
ordensServicoRoutes.delete('/:id', deleteOrdemServicoController);
