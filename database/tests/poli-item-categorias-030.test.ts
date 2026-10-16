import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/config/database.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'este teste exige DB_NAME=oficina_test');

const stripTransaction = (sql: string) => sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, '');
let migration: string;
test.before(async () => {
  migration = await readFile(new URL('../migrations/030_aprovar_categorias_gerenciais_poli_os.sql', import.meta.url), 'utf8');
});
const baseMigration = async (client: import('pg').PoolClient, name: string) => {
  const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await client.query(stripTransaction(sql));
};

test('migration 030 promove os quatro conflitos, insere 21 códigos e é idempotente', async () => {
  const client = await pool.connect();
  const schema = `test_poli_categories_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await baseMigration(client, '001_create_oficina_schema.sql');
    await baseMigration(client, '029_poli_item_categorias_gerenciais.sql');
    await client.query(stripTransaction(migration));
    await client.query('COMMIT');
    await client.query('BEGIN');
    await client.query(stripTransaction(migration));

    const rows = await client.query<{ codigo_poli: string; categoria_gerencial: string; subcategoria_gerencial: string; status_aprovacao: string }>(
      `SELECT codigo_poli,categoria_gerencial,subcategoria_gerencial,status_aprovacao
         FROM poli_item_categorias_gerenciais
        WHERE tipo_item='SERVICO' AND codigo_poli IN ('1892','4782','4103','3419','2034','2226','23205','2604','3336','16352','22568','9379','2929','25779','5953','2229','12898','21888','22385','3750','8240','20580','16612','8139','8335','2472','3659','23378','3800','7331')
        ORDER BY codigo_poli`,
    );
    assert.equal(rows.rowCount, 30);
    assert.equal(new Set(rows.rows.map(row => row.codigo_poli)).size, 30);
    assert.ok(rows.rows.every(row => row.status_aprovacao === 'APROVADO' && row.categoria_gerencial && row.subcategoria_gerencial));
    assert.equal(rows.rows.find(row => row.codigo_poli === '2604')?.categoria_gerencial, 'TAPEÇARIA');
    assert.equal(rows.rows.find(row => row.codigo_poli === '8240')?.categoria_gerencial, 'SOLDA');
    assert.equal(rows.rows.find(row => row.codigo_poli === '3800')?.categoria_gerencial, 'ALINHAMENTO_BALANCEAMENTO');
    assert.equal(rows.rows.find(row => row.codigo_poli === '7331')?.categoria_gerencial, 'CHAVEIRO');

    const osCount = await client.query('SELECT COUNT(*)::int AS count FROM ordens_servico');
    const serviceCount = await client.query('SELECT COUNT(*)::int AS count FROM servicos_os');
    const productCount = await client.query('SELECT COUNT(*)::int AS count FROM produtos_os');
    assert.equal(osCount.rows[0]?.count, 0);
    assert.equal(serviceCount.rows[0]?.count, 0);
    assert.equal(productCount.rows[0]?.count, 0);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

test('migration 030 aborta sem sobrescrever conflito inesperado', async () => {
  const client = await pool.connect();
  const schema = `test_poli_categories_conflict_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await baseMigration(client, '001_create_oficina_schema.sql');
    await baseMigration(client, '029_poli_item_categorias_gerenciais.sql');
    await client.query("UPDATE poli_item_categorias_gerenciais SET categoria_gerencial='CONFLITO' WHERE codigo_poli='2226' AND tipo_item='SERVICO'");
    await assert.rejects(() => client.query(stripTransaction(migration)), /Conflito inesperado|divergente/);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
