import { Router } from 'express';
import * as controller from '../controllers/frotas.controller.js';
export const frotasRoutes = Router();
frotasRoutes.get('/', controller.list);
frotasRoutes.get('/:id', controller.get);
frotasRoutes.post('/', controller.create);
frotasRoutes.put('/:id', controller.update);
frotasRoutes.patch('/:id/status', controller.status);
frotasRoutes.delete('/:id', controller.remove);