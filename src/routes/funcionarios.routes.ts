import { Router } from 'express';
import {
  createFuncionarioController,
  deleteFuncionarioController,
  getFuncionarioController,
  listFuncionariosController,
  updateFuncionarioController,
  updateFuncionarioStatusController,
} from '../controllers/funcionarios.controller.js';

export const funcionariosRoutes = Router();

funcionariosRoutes.get('/', listFuncionariosController);
funcionariosRoutes.get('/:id', getFuncionarioController);
funcionariosRoutes.post('/', createFuncionarioController);
funcionariosRoutes.put('/:id', updateFuncionarioController);
funcionariosRoutes.patch('/:id/status', updateFuncionarioStatusController);
funcionariosRoutes.delete('/:id', deleteFuncionarioController);
