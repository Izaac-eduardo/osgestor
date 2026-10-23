import { pool } from '../config/database.js';

type Queryable = { query: typeof pool.query };

export async function hasReclassificacaoSchema(db: Queryable = pool): Promise<boolean> {
  const result = await db.query<{ disponivel: boolean }>(
    `SELECT to_regclass('public.ordens_servico_item_reclassificacoes') IS NOT NULL AS disponivel`,
  );
  return result.rows[0]?.disponivel === true;
}
