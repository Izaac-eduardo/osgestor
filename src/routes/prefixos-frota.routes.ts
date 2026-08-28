import { Router } from 'express';
import {
  createPrefixoFrotaController,
  deletePrefixoFrotaController,
  getPrefixoFrotaController,
  listPrefixosFrotaController,
  updatePrefixoFrotaController,
  updatePrefixoFrotaStatusController,
} from '../controllers/prefixos-frota.controller.js';

export const prefixosFrotaRoutes = Router();

prefixosFrotaRoutes.get('/', listPrefixosFrotaController);
prefixosFrotaRoutes.get('/:id', getPrefixoFrotaController);
prefixosFrotaRoutes.post('/', createPrefixoFrotaController);
prefixosFrotaRoutes.put('/:id', updatePrefixoFrotaController);
prefixosFrotaRoutes.patch('/:id/status', updatePrefixoFrotaStatusController);
prefixosFrotaRoutes.delete('/:id', deletePrefixoFrotaController);
