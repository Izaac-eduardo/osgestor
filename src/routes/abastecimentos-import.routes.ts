import { Router } from 'express';
import path from 'node:path';
import multer from 'multer';
import { analyzePoliFrotaController, cancelImportacaoController, confirmImportController, getImportacaoController, listImportacoesEmAndamentoController, markSubstitutionController, removeSubstitutionController, resolveBatchController, resolveItemController, searchSubstitutionTargetsController } from '../controllers/abastecimentos-import.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['.xls', '.xlsx'].includes(path.extname(file.originalname).toLowerCase())) });
export const abastecimentosImportRoutes = Router();
abastecimentosImportRoutes.post('/polifrota/analisar', upload.single('arquivo'), analyzePoliFrotaController);
abastecimentosImportRoutes.get('/polifrota/em-andamento', listImportacoesEmAndamentoController);
abastecimentosImportRoutes.get('/polifrota/substituicoes/alvos', searchSubstitutionTargetsController);
abastecimentosImportRoutes.patch('/:id/cancelar', cancelImportacaoController);
abastecimentosImportRoutes.get('/:id', getImportacaoController);
abastecimentosImportRoutes.patch('/:id/itens/:itemId', resolveItemController);
abastecimentosImportRoutes.post('/:id/itens/:itemId/substituicao', markSubstitutionController);
abastecimentosImportRoutes.delete('/:id/itens/:itemId/substituicao', removeSubstitutionController);
abastecimentosImportRoutes.post('/:id/resolver-lote', resolveBatchController);
abastecimentosImportRoutes.post('/:id/confirmar', confirmImportController);
