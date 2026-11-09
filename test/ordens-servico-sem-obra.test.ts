import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../src/config/database.js';
import { createOrdemServico, deleteOrdemServico, getOrdemServico } from '../src/services/ordens-servico.service.js';

test('Etapa 1: cria e consulta O.S. de manutenção sem obra', async () => {
  const database = (await pool.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database;
  assert.equal(database, 'oficina_teste_fase051');
  const fleet = (await pool.query<{ id: string }>("SELECT id FROM frotas WHERE status='ATIVO' ORDER BY codigo LIMIT 1")).rows[0];
  assert.ok(fleet);
  const number = 980000000 + Math.floor(Math.random() * 1000000);
  const created = await createOrdemServico({ numero_os: number, obra_id: null, frota_id: fleet.id, natureza_os: 'INTERNA', data_abertura: '2026-11-05', status: 'FINALIZADA', observacoes: `stage1-${randomUUID()}` });
  try {
    assert.equal(created.obra_id, null);
    const summary = await getOrdemServico(created.id);
    assert.equal(summary.obra_id, null);
    assert.ok(summary.frota_codigo);
    assert.equal(summary.obra_nome, null);
  } finally {
    await deleteOrdemServico(created.id);
  }
  await pool.end();
});
