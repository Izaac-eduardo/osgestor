import 'dotenv/config';
import { Pool } from 'pg';

if ((process.env.DB_NAME ?? '').trim() !== 'oficina_test') throw new Error('Limpeza recusada: DB_NAME deve ser oficina_test.');
const pool = new Pool({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), database: 'oficina_test', user: process.env.DB_USER ?? 'postgres', password: process.env.DB_PASSWORD ?? '' });
(async () => { try { await pool.query('DELETE FROM abastecimento_substituicoes; DELETE FROM abastecimentos; DELETE FROM abastecimento_importacoes;'); } finally { await pool.end(); } })();
