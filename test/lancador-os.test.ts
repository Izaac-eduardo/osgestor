import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { Pool } from 'pg';
import { resolveLancadorFuncionarioId } from '../src/services/lancadores-os.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
});

test('migration 017 cria campos, FK SET NULL, índice e mantém colunas nullable', async () => {
  const columns = await pool.query<{ column_name: string; data_type: string; character_maximum_length: number | null; is_nullable: string }>(
    `SELECT column_name,data_type,character_maximum_length,is_nullable
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ordens_servico'
        AND column_name IN ('lancador_codigo_original','lancador_nome_original','lancador_funcionario_id')
      ORDER BY column_name`,
  );
  assert.deepEqual(columns.rows, [
    { column_name: 'lancador_codigo_original', data_type: 'character varying', character_maximum_length: 50, is_nullable: 'YES' },
    { column_name: 'lancador_funcionario_id', data_type: 'uuid', character_maximum_length: null, is_nullable: 'YES' },
    { column_name: 'lancador_nome_original', data_type: 'character varying', character_maximum_length: 255, is_nullable: 'YES' },
  ]);
  const foreignKey = await pool.query<{ delete_rule: string; foreign_table_name: string; foreign_column_name: string }>(
    `SELECT rc.delete_rule,ccu.table_name AS foreign_table_name,ccu.column_name AS foreign_column_name
       FROM information_schema.referential_constraints rc
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name=rc.unique_constraint_name AND ccu.constraint_schema=rc.unique_constraint_schema
      WHERE rc.constraint_schema='public' AND rc.constraint_name='ordens_servico_lancador_funcionario_fkey'`,
  );
  assert.deepEqual(foreignKey.rows[0], { delete_rule: 'SET NULL', foreign_table_name: 'funcionarios', foreign_column_name: 'id' });
  assert.equal((await pool.query("SELECT to_regclass('public.idx_ordens_servico_lancador_funcionario') AS index_name")).rows[0]?.index_name, 'idx_ordens_servico_lancador_funcionario');
});

test('resolve lançador somente por matrícula exata, inclusive inativo', async () => {
  const client = await pool.connect();
  const matricula = `TEST-LANC-${Date.now()}`;
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO funcionarios(nome,matricula,cargo,status)
       VALUES ('Lançador Teste','${matricula}','TESTE','INATIVO') RETURNING id`,
    );
    const id = inserted.rows[0]!.id;
    assert.equal(await resolveLancadorFuncionarioId(` ${matricula} `, client), id);
    assert.equal(await resolveLancadorFuncionarioId('TEST-LANC-NAO-EXISTE', client), null);
    assert.equal(await resolveLancadorFuncionarioId(null, client), null);
    assert.equal(await resolveLancadorFuncionarioId(undefined, client), null);
    assert.equal(await resolveLancadorFuncionarioId('Lançador Teste', client), null);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

test('campos originais aceitam código sem nome e nome sem código', async () => {
  const result = await pool.query<{ codigo_is_nullable: string; nome_is_nullable: string }>(
    `SELECT
       (SELECT is_nullable FROM information_schema.columns WHERE table_name='ordens_servico' AND column_name='lancador_codigo_original') AS codigo_is_nullable,
       (SELECT is_nullable FROM information_schema.columns WHERE table_name='ordens_servico' AND column_name='lancador_nome_original') AS nome_is_nullable`,
  );
  assert.deepEqual(result.rows[0], { codigo_is_nullable: 'YES', nome_is_nullable: 'YES' });
});

test('persistência mantém lançador no nível da O.S. e duplicidade não sobrescreve', async () => {
  const client = await pool.connect();
  const numeroOs = 990000000 + Math.floor(Math.random() * 999999);
  try {
    await client.query('BEGIN');
    const employee = await client.query<{ id: string }>(
      `INSERT INTO funcionarios(nome,matricula,cargo,status)
       VALUES ('Persistência Lançador','TEST-PERSIST-LANC','TESTE','ATIVO') RETURNING id`,
    );
    const references = await client.query<{ obra_id: string; frota_id: string; prefixo_frota_id: string; frota_numero: string }>(
      `SELECT o.id AS obra_id,f.id AS frota_id,f.prefixo_frota_id,f.numero AS frota_numero
         FROM obras o CROSS JOIN frotas f
        WHERE o.codigo='TEST-OBRA-001' AND f.codigo='TST01'`,
    );
    const ref = references.rows[0]!;
    await client.query(
      `INSERT INTO ordens_servico
        (numero_os,obra_id,frota_id,prefixo_frota_id,frota_numero,natureza_os,status,data_abertura,
         lancador_codigo_original,lancador_nome_original,lancador_funcionario_id)
       VALUES ($1,$2,$3,$4,$5,'MATERIAL','ABERTA',CURRENT_DATE,$6,$7,$8)`,
      [numeroOs, ref.obra_id, ref.frota_id, ref.prefixo_frota_id, Number(ref.frota_numero), 'TEST-PERSIST-LANC', 'Persistência Lançador', employee.rows[0]!.id],
    );
    await client.query('SAVEPOINT duplicate_attempt');
    await assert.rejects(
      client.query(
        `INSERT INTO ordens_servico
          (numero_os,obra_id,frota_id,prefixo_frota_id,frota_numero,natureza_os,status,data_abertura,
           lancador_codigo_original,lancador_nome_original,lancador_funcionario_id)
         VALUES ($1,$2,$3,$4,$5,'MATERIAL','ABERTA',CURRENT_DATE,'OUTRO','Outro',NULL)`,
        [numeroOs, ref.obra_id, ref.frota_id, ref.prefixo_frota_id, Number(ref.frota_numero)],
      ),
    );
    await client.query('ROLLBACK TO SAVEPOINT duplicate_attempt');
    const existing = await client.query<{ codigo: string; nome: string; funcionario_id: string }>(
      'SELECT lancador_codigo_original AS codigo,lancador_nome_original AS nome,lancador_funcionario_id AS funcionario_id FROM ordens_servico WHERE numero_os=$1',
      [numeroOs],
    );
    assert.deepEqual(existing.rows[0], { codigo: 'TEST-PERSIST-LANC', nome: 'Persistência Lançador', funcionario_id: employee.rows[0]!.id });
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

after(async () => { await pool.end(); });
