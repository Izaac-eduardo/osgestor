import { Router } from 'express';
import path from 'node:path';
import multer from 'multer';
import { analyze, confirm, getPreview, resolve } from '../controllers/importacoes-os.controller.js';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  console.log('[importacoes-os] fileFilter', { originalname: file.originalname, mimetype: file.mimetype, extension });
  cb(null, extension === '.xls' || extension === '.xlsx');
} });
export const importacoesOsRoutes = Router();
importacoesOsRoutes.post('/analisar', upload.single('arquivo'), analyze);
importacoesOsRoutes.get('/:token', getPreview);
importacoesOsRoutes.patch('/:token/itens/:numeroOs', resolve);
importacoesOsRoutes.post('/:token/confirmar', confirm);
