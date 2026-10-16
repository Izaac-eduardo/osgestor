import { Router } from 'express';
import {
  createObraController,
  deleteObraController,
  getObraController,
  getNextObraCodigoController,
  listObrasController,
  updateObraController,
  updateObraStatusController,
} from '../controllers/obras.controller.js';
import { requireMethodRole } from '../middleware/authorization.js';

export const obrasRoutes = Router();
obrasRoutes.use(requireMethodRole());

obrasRoutes.get('/', listObrasController);
obrasRoutes.get('/proximo-codigo', getNextObraCodigoController);
obrasRoutes.get('/:id', getObraController);
obrasRoutes.post('/', createObraController);
obrasRoutes.put('/:id', updateObraController);
obrasRoutes.patch('/:id/status', updateObraStatusController);
obrasRoutes.delete('/:id', deleteObraController);
