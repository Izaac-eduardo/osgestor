import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/config/database.js';
import { parseFrotaFields } from '../../src/services/frotas.service.js';
import { importFleetRows } from '../imports/frotas-workbook.js';

test('migration e importação preservam O.S., unicidade, zeros e idempotência em transação isolada', async () => {
  const client = await pool.connect();
  const schema = 'test_frotas_' + randomUUID().replace(/-/g, '');
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA ' + schema);
    await client.query('SET LOCAL search_path TO ' + schema + ', public');
    const migration = async (name: string) => {
      const sql = await readFile(__dirname + '/../migrations/' + name, 'utf8');
      await client.query(sql.replace(/^\s*BEGIN\s*;/i, '').replace(/COMMIT;\s*$/i, ''));
    };
    await migration('001_create_oficina_schema.sql');
    await migration('002_create_servicos_os_execucoes.sql');
    const prefix = (await client.query("INSERT INTO prefixos_frota(codigo,status) VALUES ('CT','INATIVO') RETURNING id")).rows[0].id;
    const obra = (await client.query("INSERT INTO obras(codigo,nome) VALUES ('TESTE','Obra de teste') RETURNING id")).rows[0].id;
    const os = (await client.query("INSERT INTO ordens_servico(numero_os,obra_id,prefixo_frota_id,frota_numero,natureza_os,data_abertura) VALUES (1,$1,$2,4,'INTERNA',CURRENT_DATE) RETURNING *", [obra, prefix])).rows[0];
    await migration('003_create_frotas.sql');
    await migration('004_validate_frotas_prefixos.sql');
    assert.deepEqual((await client.query('SELECT * FROM ordens_servico WHERE id=$1', [os.id])).rows[0], os);
    assert.equal((await client.query('SELECT frota_codigo FROM vw_ordens_servico_resumo')).rows[0].frota_codigo, 'CT4');
    const rows = [
      { codigo: 'A-09', descricao: 'Automóvel', placa: 'abc-1234', ano: 2021 },
      { codigo: 'CT-04', descricao: 'Caminhão', placa: 'ABC1D23', ano: 2020 },
      { codigo: 'EH-03', descricao: 'Máquina', modelo: '416 4', ano: 2022 },
      { codigo: 'GE-01', descricao: 'Equipamento', modelo: '416 4', ano: 2023 },
    ].map((body, i) => ({ ...parseFrotaFields(body), source: { sheet: 'Teste', row: i + 1 } }));
    assert.deepEqual(await importFleetRows(client, rows), { total: 4, inserted: 4, updated: 0, unchanged: 0, prefixesCreated: 3, withPlate: 2, withoutPlate: 2, withModel: 2 });
    const second = await importFleetRows(client, rows);
    assert.equal(second.inserted, 0); assert.equal(second.updated, 0); assert.equal(second.unchanged, 4); assert.equal(second.prefixesCreated, 0);
    assert.equal((await client.query("SELECT numero FROM frotas WHERE codigo='A09'")).rows[0].numero, '09');
    assert.equal((await client.query("SELECT status FROM prefixos_frota WHERE codigo='CT'")).rows[0].status, 'INATIVO');
    await client.query("UPDATE frotas SET status='INATIVO' WHERE codigo='A09'");
    rows[0]!.descricao = 'Automóvel atualizado'; rows[0]!.placa = null;
    assert.equal((await importFleetRows(client, rows)).updated, 1);
    const updated = (await client.query("SELECT * FROM frotas WHERE codigo='A09'")).rows[0];
    assert.equal(updated.placa, 'ABC1234'); assert.equal(updated.status, 'INATIVO');
    assert.equal((await client.query("SELECT * FROM frotas WHERE upper(btrim(modelo))=upper('416 4')")).rows.length, 2);
    async function rejects(sql: string, values: unknown[], code: string) {
      await client.query('SAVEPOINT expected_failure');
      await assert.rejects(client.query(sql, values), (error: unknown) => [(code === '23503' ? '23001' : code), code].includes((error as { code: string }).code));
      await client.query('ROLLBACK TO SAVEPOINT expected_failure');
      await client.query('RELEASE SAVEPOINT expected_failure');
    }
    await rejects("UPDATE frotas SET placa='abc-1234' WHERE codigo='CT04'", [], '23505');
    await rejects("INSERT INTO frotas(prefixo_frota_id,numero) VALUES ($1,'04')", [prefix], '23505');
    await rejects("DELETE FROM prefixos_frota WHERE codigo='EH'", [], '23503');
    await rejects("UPDATE frotas SET numero='9x' WHERE codigo='A09'", [], '23514');
    await rejects("UPDATE prefixos_frota SET codigo='A1' WHERE codigo='A'", [], '23514');
    await client.query("UPDATE prefixos_frota SET codigo='AX' WHERE codigo='A'");
    assert.equal((await client.query("SELECT numero FROM frotas WHERE codigo='AX09'")).rows[0].numero, '09');
    await client.query('CREATE TABLE futura_referencia(frota_id UUID REFERENCES frotas(id) ON DELETE RESTRICT)');
    await client.query('INSERT INTO futura_referencia VALUES ($1)', [updated.id]);
    await rejects('DELETE FROM frotas WHERE id=$1', [updated.id], '23503');
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT to_regnamespace($1) AS schema', [schema])).rows[0].schema, null);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
});