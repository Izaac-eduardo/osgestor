import { Router } from 'express';
import { pool } from '../config/database.js';

export const routes = Router();

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