import { Router } from 'express';
import multer from 'multer';
import * as controller from '../controllers/contabilidade-import.controller.js';
import { requireMethodRole } from '../middleware/authorization.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
export const contabilidadeImportRoutes = Router();
contabilidadeImportRoutes.use(requireMethodRole());
contabilidadeImportRoutes.get('/', controller.list);
contabilidadeImportRoutes.post('/analisar', upload.single('arquivo'), controller.analyze);
contabilidadeImportRoutes.post('/:id/confirmar', controller.confirm);
contabilidadeImportRoutes.get('/:id', controller.get);
contabilidadeImportRoutes.patch('/:id/itens/:itemId', controller.update);
