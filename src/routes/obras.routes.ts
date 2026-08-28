import { Router } from 'express';
import {
  createObraController,
  deleteObraController,
  getObraController,
  listObrasController,
  updateObraController,
  updateObraStatusController,
} from '../controllers/obras.controller.js';

export const obrasRoutes = Router();

obrasRoutes.get('/', listObrasController);
obrasRoutes.get('/:id', getObraController);
obrasRoutes.post('/', createObraController);
obrasRoutes.put('/:id', updateObraController);
obrasRoutes.patch('/:id/status', updateObraStatusController);
obrasRoutes.delete('/:id', deleteObraController);