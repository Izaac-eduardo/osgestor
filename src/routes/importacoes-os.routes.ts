import { Router } from 'express';
import multer from 'multer';
import { analyze, confirm, getPreview, resolve } from '../controllers/importacoes-os.controller.js';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /\\.xls[x]?$/i.test(file.originalname)) });
export const importacoesOsRoutes = Router();
importacoesOsRoutes.post('/analisar', upload.single('arquivo'), analyze);
importacoesOsRoutes.get('/:token', getPreview);
importacoesOsRoutes.patch('/:token/itens/:numeroOs', resolve);
importacoesOsRoutes.post('/:token/confirmar', confirm);
