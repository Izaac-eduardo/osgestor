import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/config/database.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'este teste exige DB_NAME=oficina_test');
const stripTransaction = (sql: string) => sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, '');
const baseMigration = async (client: import('pg').PoolClient, name: string) => {
  const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await client.query(stripTransaction(sql));
};
const migrationSql = () => readFile(new URL('../migrations/031_suspender_aprovacao_poli_16612.sql', import.meta.url), 'utf8');

test('migration 031 suspende somente 16612, preserva dados e Ã© idempotente', async () => {
  const client = await pool.connect();
  const schema = `test_poli_categories_031_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await baseMigration(client, '001_create_oficina_schema.sql');
    await baseMigration(client, '029_poli_item_categorias_gerenciais.sql');
    await baseMigration(client, '030_aprovar_categorias_gerenciais_poli_os.sql');
    const sql = stripTransaction(await migrationSql());
    await client.query(sql);
    await client.query(sql);
    const target = await client.query(`SELECT categoria_gerencial,subcategoria_gerencial,status_aprovacao,fonte FROM poli_item_categorias_gerenciais WHERE codigo_poli='16612' AND tipo_item='SERVICO'`);
    assert.deepEqual(target.rows[0], { categoria_gerencial: 'MECANICA', subcategoria_gerencial: 'REPAROS GERAIS', status_aprovacao: 'PENDENTE_APROVACAO', fonte: 'POLI_OS_APROVACAO_GERENCIAL_2026-10' });
    const active = await client.query(`SELECT COUNT(*)::int AS count FROM poli_item_categorias_gerenciais WHERE tipo_item='SERVICO' AND status_aprovacao='APROVADO' AND codigo_poli IN ('1892','4782','4103','3419','2034','2226','23205','2604','3336','16352','22568','9379','2929','25779','5953','2229','12898','21888','22385','3750','8240','20580','16612','8139','8335','2472','3659','23378','3800','7331')`);
    assert.equal(active.rows[0]?.count, 29);
    const other = await client.query(`SELECT 1 FROM poli_item_categorias_gerenciais WHERE codigo_poli='1892' AND tipo_item='SERVICO' AND status_aprovacao='APROVADO'`);
    assert.equal(other.rowCount, 1);
    await client.query('ROLLBACK');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

test('migration 031 aborta diante de estado inesperado', async () => {
  const client = await pool.connect();
  const schema = `test_poli_categories_031_conflict_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await baseMigration(client, '001_create_oficina_schema.sql');
    await baseMigration(client, '029_poli_item_categorias_gerenciais.sql');
    await baseMigration(client, '030_aprovar_categorias_gerenciais_poli_os.sql');
    await client.query(`UPDATE poli_item_categorias_gerenciais SET categoria_gerencial='CONFLITO' WHERE codigo_poli='16612' AND tipo_item='SERVICO'`);
    const sql = stripTransaction(await migrationSql());
    await client.query('SAVEPOINT before_031_conflict');
    await assert.rejects(() => client.query(sql), /Estado inesperado/);
    await client.query('ROLLBACK TO SAVEPOINT before_031_conflict');
    const row = await client.query(`SELECT categoria_gerencial FROM poli_item_categorias_gerenciais WHERE codigo_poli='16612' AND tipo_item='SERVICO'`);
    assert.equal(row.rows[0]?.categoria_gerencial, 'CONFLITO');
    await client.query('ROLLBACK');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});
