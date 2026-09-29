import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../src/config/database.js';
import { createAbastecimentoBico, listAbastecimentoBicos, updateAbastecimentoBico, updateAbastecimentoBicoStatus } from '../src/services/abastecimentos-bicos.service.js';
import { listAbastecimentosHistorico, listAbastecimentosHistoricoBicos } from '../src/services/abastecimentos-historico.service.js';

test('CRUD de bicos exige ponto/produto válidos e integra o filtro do histórico', async () => {
  assert.equal((await pool.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database, 'oficina_test');
  const suffix = Date.now().toString();
  const point = (await pool.query("INSERT INTO abastecimento_pontos(codigo,nome,tipo) VALUES($1,$2,'OUTRO') RETURNING id", [`TEST-BICO-P-${suffix}`, 'Ponto de teste de bicos'])).rows[0].id as string;
  const product = (await pool.query("SELECT id FROM abastecimento_produtos WHERE status='ATIVO' ORDER BY codigo LIMIT 1")).rows[0].id as string;
  try {
    await assert.rejects(() => createAbastecimentoBico(point, { codigo: '', produto_id: product }), /código|codigo/i);
    const created = await createAbastecimentoBico(point, { codigo: `TEST-BICO-${suffix}`, descricao: 'Bico de teste', produto_id: product });
    assert.equal(created.ponto_id, point); assert.equal(created.status, 'ATIVO');
    await assert.rejects(() => createAbastecimentoBico(point, { codigo: `TEST-BICO-${suffix}`, produto_id: product }), error => (error as { statusCode?: number }).statusCode === 409);
    const listed = await listAbastecimentoBicos(point); assert.equal(listed.length, 1);
    const updated = await updateAbastecimentoBico(point, created.id, { codigo: `TEST-BICO-${suffix}-EDIT`, descricao: 'Editado', produto_id: product, status: 'ATIVO' });
    assert.equal(updated.descricao, 'Editado');
    const activeCodes = await listAbastecimentosHistoricoBicos(); assert.ok(activeCodes.includes(`TEST-BICO-${suffix}-EDIT`));
    const noRecords = await listAbastecimentosHistorico({ bico: `TEST-BICO-${suffix}-EDIT` }); assert.equal(noRecords.items.length, 0);
    const inactive = await updateAbastecimentoBicoStatus(point, created.id, { status: 'INATIVO' }); assert.equal(inactive.status, 'INATIVO');
    const noHistory = await pool.query('SELECT COUNT(*)::int AS total FROM abastecimentos WHERE bico_codigo_original=$1', [`TEST-BICO-${suffix}-EDIT`]);
    assert.equal(noHistory.rows[0].total, 0);
  } finally {
    await pool.query('DELETE FROM abastecimento_bicos WHERE ponto_id=$1', [point]);
    await pool.query('DELETE FROM abastecimento_pontos WHERE id=$1', [point]);
    await pool.end();
  }
});
