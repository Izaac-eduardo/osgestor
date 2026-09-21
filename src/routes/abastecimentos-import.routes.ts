import { Router } from 'express';
import path from 'node:path';
import multer from 'multer';
import { analyzePoliFrotaController, confirmImportController, getImportacaoController, resolveBatchController, resolveItemController } from '../controllers/abastecimentos-import.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['.xls', '.xlsx'].includes(path.extname(file.originalname).toLowerCase())) });
export const abastecimentosImportRoutes = Router();
abastecimentosImportRoutes.post('/polifrota/analisar', upload.single('arquivo'), analyzePoliFrotaController);
abastecimentosImportRoutes.get('/:id', getImportacaoController);
abastecimentosImportRoutes.patch('/:id/itens/:itemId', resolveItemController);
abastecimentosImportRoutes.post('/:id/resolver-lote', resolveBatchController);
abastecimentosImportRoutes.post('/:id/confirmar', confirmImportController);
