import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { deleteAbastecimentoHistorico } from '../src/services/abastecimentos-historico-delete.service.js';
import { listAbastecimentosHistorico } from '../src/services/abastecimentos-historico.service.js';
import { getRelatorioAbastecimentos } from '../src/services/abastecimentos-relatorios.service.js';
import { updateAbastecimentoHistorico } from '../src/services/abastecimentos-historico-edit.service.js';
import { getConsumoFrota } from '../src/services/abastecimentos-consumo-frota.service.js';
import { exportAbastecimentosExcel, exportAbastecimentosPdf, exportConsumoFrotaExcel, exportConsumoFrotaPdf } from '../src/services/abastecimentos-export.service.js';
import { searchSubstitutionTargets } from '../src/services/abastecimentos-import.service.js';
import ExcelJS from 'exceljs';
import { testCatalog } from './support/fixtures.js';
import type { AuthenticatedRequestUser } from '../src/types/auth.js';
import { hashPassword } from '../src/services/password.service.js';

test('exclusão lógica preserva o registro, auditoria e remove o abastecimento dos totais', async () => {
  assert.equal(process.env.DB_NAME, 'oficina_teste_fase051');
  const { obra, product, fleet } = await testCatalog();
  const actorId = randomUUID();
  await pool.query(`INSERT INTO usuarios(id,username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,$4,'ADMIN','ATIVO',false)`, [actorId, `exclusao-${actorId}`, `${actorId}@example.invalid`, await hashPassword('Teste exclusao 2026!')]);
  const external = `EXCLUSAO-${Date.now()}`;
  const entriesBefore = (await pool.query('SELECT id,litros_nf,valor_total_nf FROM abastecimento_entradas ORDER BY id LIMIT 20')).rows;
  const id = (await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('POLIFROTA',$1,'2026-10-08 07:00',$2,$3,'FROTA',$4,$5,100,250,'exclusao-fixture.xlsx','{}') RETURNING id`, [external, product.id, obra.id, fleet.id, fleet.codigo])).rows[0]!.id;
  const admin: AuthenticatedRequestUser = { id: actorId, username: `exclusao-${actorId}`, email: `${actorId}@example.invalid`, role: 'ADMIN', status: 'ATIVO', must_change_password: false, sessionId: 'teste-session', tokenHash: 'teste-token' };
  const operator = { ...admin, role: 'OPERADOR' as const };
  try {
    await assert.rejects(() => deleteAbastecimentoHistorico(id, {}, operator), (error: Error & { statusCode?: number }) => error.statusCode === 403);
    for (const body of [undefined, {}, { motivo: '' }, { motivo: '   ' }]) {
      await assert.rejects(
        () => deleteAbastecimentoHistorico(id, body, admin),
        (error: Error & { statusCode?: number; message?: string }) => error.statusCode === 400 && error.message === 'O motivo da exclusão é obrigatório.',
      );
    }
    await deleteAbastecimentoHistorico(id, { motivo: '  Lançamento incorreto em teste  ' }, admin);
    const stored = (await pool.query<{ excluido_at: Date | null; excluido_por: string; motivo_exclusao: string; litros: string; valor_total: string }>('SELECT excluido_at,excluido_por,motivo_exclusao,litros,valor_total FROM abastecimentos WHERE id=$1', [id])).rows[0]!;
    assert.ok(stored.excluido_at); assert.equal(stored.excluido_por, admin.id); assert.equal(stored.motivo_exclusao, 'Lançamento incorreto em teste'); assert.equal(stored.litros, '100.000'); assert.equal(stored.valor_total, '250.0000');
    assert.equal((await listAbastecimentosHistorico({ busca: external })).items.some(item => item.id === id), false);
    const report = await getRelatorioAbastecimentos({ busca: external });
    assert.equal(report.summary.quantidade, 0); assert.equal(report.summary.litros, 0); assert.equal(report.summary.valor, 0);
    const consumption = await getConsumoFrota({ frota_id: fleet.id, data_inicio: '2026-10-08', data_fim: '2026-10-08', all: true });
    assert.equal(consumption.frotas.some((item: { intervalos?: Array<{ abastecimentos?: Array<{ id: string }> }> }) => item.intervalos?.some(interval => interval.abastecimentos?.some(fuel => fuel.id === id))), false);
    const excel = new ExcelJS.Workbook(); await excel.xlsx.load(await exportAbastecimentosExcel({ busca: external }));
    const detail = excel.getWorksheet('Abastecimentos')!;
    assert.equal(detail.getRows(1, detail.rowCount).some(row => row.getCell(1).value instanceof Date && String(row.getCell(2).value) === external), false);
    assert.equal((await exportAbastecimentosPdf({ busca: external })).includes(Buffer.from(external)), false);
    assert.equal((await exportConsumoFrotaExcel({ frota_id: fleet.id, data_inicio: '2026-10-08', data_fim: '2026-10-08' })).length > 0, true);
    assert.equal((await exportConsumoFrotaPdf({ frota_id: fleet.id, data_inicio: '2026-10-08', data_fim: '2026-10-08' })).length > 0, true);
    await assert.rejects(() => updateAbastecimentoHistorico(id, {} as never, admin), (error: Error & { statusCode?: number }) => error.statusCode === 409);
    const duplicateCandidate = (await pool.query('SELECT 1 FROM abastecimentos WHERE origem_sistema=$1 AND identificador_externo=$2', ['POLIFROTA', external])).rowCount;
    assert.equal(duplicateCandidate, 1);
    assert.equal((await searchSubstitutionTargets({ busca: external })).some(item => item.id === id), false);
    const entriesAfter = (await pool.query('SELECT id,litros_nf,valor_total_nf FROM abastecimento_entradas ORDER BY id LIMIT 20')).rows;
    assert.deepEqual(entriesAfter, entriesBefore);
    assert.equal((await pool.query(`SELECT COUNT(*)::int count FROM auditoria WHERE entidade='abastecimentos' AND entidade_id=$1 AND acao='EXCLUIR'`, [id])).rows[0]!.count, 1);
    await assert.rejects(() => deleteAbastecimentoHistorico(id, { motivo: 'Tentativa duplicada em teste' }, admin), (error: Error & { statusCode?: number }) => error.statusCode === 409);
    await assert.rejects(() => deleteAbastecimentoHistorico('00000000-0000-4000-8000-000000000099', { motivo: 'ID inexistente em teste' }, admin), (error: Error & { statusCode?: number }) => error.statusCode === 404);
  } finally {
    await pool.query(`DELETE FROM auditoria WHERE entidade='abastecimentos' AND entidade_id=$1`, [id]);
    await pool.query('DELETE FROM abastecimentos WHERE id=$1', [id]);
    await pool.query('DELETE FROM usuarios WHERE id=$1', [actorId]);
  }
});
