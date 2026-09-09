import { importacoesOsRoutes } from './importacoes-os.routes.js'
import { Router } from 'express';
import { pool } from '../config/database.js';
import { funcionariosRoutes } from './funcionarios.routes.js';
import { obrasRoutes } from './obras.routes.js';
import { ordensServicoRoutes } from './ordens-servico.routes.js';
import { prefixosFrotaRoutes } from './prefixos-frota.routes.js';
import { relatoriosRoutes } from './relatorios.routes.js';

export const routes = Router();

routes.use('/obras', obrasRoutes);
routes.use('/funcionarios', funcionariosRoutes);
routes.use('/ordens-servico', ordensServicoRoutes);
routes.use('/prefixos-frota', prefixosFrotaRoutes);
routes.use('/relatorios', relatoriosRoutes);
routes.use('/importacoes-os', importacoesOsRoutes);

routes.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', message: 'API OSGestor está funcionando.' });
});

routes.get('/health/database', async (_request, response) => {
  try {
    const result = await pool.query<{ now: Date }>('SELECT NOW() AS now');
    response.status(200).json({
      status: 'ok',
      message: 'Banco de dados conectado.',
      databaseTime: result.rows[0]?.now ?? null,
    });
  } catch (error) {
    console.error('Falha na verificação da conexão com o banco de dados.', error);
    response.status(500).json({
      status: 'error',
      message: 'Não foi possível conectar ao banco de dados.',
    });
  }
});
