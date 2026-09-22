import { pool } from '../../src/config/database.js';

export async function testCatalog() {
  const obra = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE codigo='TEST-OBRA-001'")).rows[0];
  const nextObra = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE codigo='TEST-OBRA-002'")).rows[0];
  const fleet = (await pool.query<{ id: string; codigo: string; placa: string | null }>("SELECT id,codigo,placa FROM frotas WHERE codigo='TST01'")).rows[0];
  const secondFleet = (await pool.query<{ id: string; codigo: string; placa: string | null }>("SELECT id,codigo,placa FROM frotas WHERE codigo='TST02'")).rows[0];
  const product = (await pool.query<{ id: string; codigo: string }>("SELECT id,codigo FROM abastecimento_produtos WHERE codigo='DIESEL_S500'")).rows[0];
  const third = (await pool.query<{ id: string; nome: string }>("SELECT id,nome FROM abastecimento_terceiros WHERE codigo='TEST-TERCEIRO-001'")).rows[0];
  const special = (await pool.query<{ id: string; codigo: string }>("SELECT id,codigo FROM abastecimento_destinacoes_especiais WHERE codigo='PIRULITO'")).rows[0];
  if (!obra || !nextObra || !fleet || !secondFleet || !product || !third || !special) throw new Error('Fixtures do banco de teste não foram preparadas. Execute npm run prepare:test-db.');
  return { obra, nextObra, fleet, secondFleet, product, third, special };
}

export async function cleanupTestRows(ids: string[]) {
  if (!ids.length) return;
  await pool.query('DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])', [ids]);
}
