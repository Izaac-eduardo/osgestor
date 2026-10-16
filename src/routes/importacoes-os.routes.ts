import { Router } from 'express';
import path from 'node:path';
import multer from 'multer';
import { analyze, confirm, confirmNatureza, getPreview, resolve, revokeNatureza, updateExisting, updateSafe } from '../controllers/importacoes-os.controller.js';
import { requireMethodRole, requireRole } from '../middleware/authorization.js';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  cb(null, extension === '.xls' || extension === '.xlsx');
} });
export const importacoesOsRoutes = Router();
importacoesOsRoutes.use(requireMethodRole());
importacoesOsRoutes.post('/analisar', upload.single('arquivo'), analyze);
importacoesOsRoutes.get('/:token', getPreview);
importacoesOsRoutes.post('/:token/itens/:numeroOs/natureza-confirmacao', requireRole('ADMIN'), confirmNatureza);
importacoesOsRoutes.post('/natureza-confirmacoes/:id/revogar', requireRole('ADMIN'), revokeNatureza);
importacoesOsRoutes.patch('/:token/itens/:numeroOs', resolve);
importacoesOsRoutes.post('/:token/itens/:numeroOs/atualizar', updateExisting);
importacoesOsRoutes.post('/:token/atualizar-seguras', updateSafe);
importacoesOsRoutes.post('/:token/confirmar', confirm);
