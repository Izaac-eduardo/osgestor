import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { importContabilidade, listContabilidadeItems, updateContabilidadeItem } from '../src/services/contabilidade-import.service.js';

test('importador contábil classifica, preserva origem e bloqueia reimportação', async () => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const fleet = (await pool.query<{ id: string }>('SELECT id FROM frotas WHERE status=\'ATIVO\' LIMIT 1')).rows[0];
  assert.ok(fleet);
  const alias = `FROTA TESTE ${suffix}`;
  await pool.query('INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado) VALUES($1,\'CONTABILIDADE\',$2,$2)', [fleet.id, alias]);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Controle', 'Data Lançamento', 'Data Conta', 'Nro. Nota', 'Cód Produto', 'Produto', 'Tipo de Movimentação', 'Quantidade', 'Valor Unitário', 'Total', 'Cód. SubCentro', 'SubCentro', 'Cód. Plano de Contas', 'Plano de Contas'],
    ['T1', '05/11/2026 00:00', '05/11/2026 00:00', 'N1', 'P1', 'PEÇA', 'Saída', '1', '10,00', '10,00', '1', alias, '235', 'CUSTO PECAS / OFICINA'],
    ['T2', '05/11/2026 00:00', '05/11/2026 00:00', 'N2', 'P2', 'CONSUMO', 'Saída', '2', '5,00', '10,00', '1', 'SEM-FROTA', '274', 'CUSTO USO E CONSUMO'],
  ]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = `contabil-${suffix}.xlsx`;
  let importId = '';
  try {
    const first = await importContabilidade(buffer, filename);
    importId = first.id;
    assert.equal(first.total, 2); assert.equal(first.classificados, 1); assert.equal(first.pendentes, 1); assert.equal(first.pendentes_classificacao, 1); assert.equal(first.pendentes_frota, 1);
    const items = await listContabilidadeItems(first.id) as Array<Record<string, unknown>>;
    assert.equal(items[0]?.classificacao, 'PECAS_EXTERNAS'); assert.equal(items[0]?.identificacao_frota, 'ALIAS'); assert.equal(items[0]?.linha_original, 2); assert.equal((items[0]?.dados_originais as Record<string, unknown>)?.Produto, 'PEÇA');
    const corrected = await updateContabilidadeItem(String(items[1]?.id), { frota_id: fleet.id, classificacao: 'PECAS_EXTERNAS' }) as Record<string, unknown>;
    assert.equal(corrected.frota_id, fleet.id); assert.equal(corrected.classificacao, 'PECAS_EXTERNAS'); assert.equal(corrected.identificacao_frota, 'MANUAL');
    const second = await importContabilidade(buffer, filename); assert.equal(second.reimportada, true); assert.equal(second.total, 2);
  } finally {
    if (importId) { await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id=$1', [importId]); await pool.query('DELETE FROM importacoes_contabeis WHERE id=$1', [importId]); }
    await pool.query('DELETE FROM frota_identificadores_externos WHERE identificador=$1 AND origem=\'CONTABILIDADE\'', [alias]);
    await pool.end();
  }
});
