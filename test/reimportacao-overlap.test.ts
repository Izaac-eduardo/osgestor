import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { testCatalog } from './support/fixtures.js';

test('reimportação sobreposta marca X como JA_IMPORTADO, preserva edição manual e permite somente Y', async () => {
  const { obra, nextObra: secondObra, product, fleet } = await testCatalog();
  const x = String(900000 + (Date.now() % 90000)); const y = String(Number(x) + 1);
  const existing = await pool.query<{ id: string }>(`INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,placa_original,frota_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES ('POLIFROTA',$1,'2026-09-21 07:00',$2,$3,'FROTA',$4,$5,$6,$5,10.000,100.0000,'test-overlap.xlsx','{}') RETURNING id`, [x, product.id, obra.id, fleet.id, fleet.codigo, fleet.placa || fleet.codigo]);
  const rows = [['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Bico', 'Frentista'], [x, '21/09/2026 07:00', fleet.placa || 'SEMPLACA', fleet.codigo, '10', '100', '0', '9 - OLEO DIESEL S500', 'Teste'], [y, '22/09/2026 07:00', fleet.placa || 'SEMPLACA', fleet.codigo, '11', '110', '0', '9 - OLEO DIESEL S500', 'Teste']];
  const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Relatorio'); const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`; let importId = '';
  try {
    const edited = await fetch(`${base}/abastecimento/historico/${existing.rows[0]!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_hora: '2026-09-21T08:30', produto_id: product.id, obra_id: secondObra.id, tipo_destinatario: 'FROTA', frota_id: fleet.id, litros: 12.345, valor_total: 91777.25, km_hr: 0, horimetro: 123.456 }) }); assert.equal(edited.status, 200);
    const form = new FormData(); form.append('arquivo', new Blob([buffer]), `test-overlap-${Date.now()}.xlsx`); const analyzed = await fetch(`${base}/abastecimento/importacoes/polifrota/analisar`, { method: 'POST', body: form }); const analyzedBody = await analyzed.json() as { id: string; items: Array<{ id: string; identificador_externo: string; status_preview: string }> }; assert.equal(analyzed.status, 201); importId = analyzedBody.id;
    const xItem = analyzedBody.items.find(item => String(item.identificador_externo) === x); const yItem = analyzedBody.items.find(item => String(item.identificador_externo) === y); assert.ok(xItem, `ids retornados: ${analyzedBody.items.map(item => item.identificador_externo).join(',')}`); assert.equal(xItem.status_preview, 'JA_IMPORTADO'); assert.ok(yItem); assert.notEqual(yItem.status_preview, 'JA_IMPORTADO');
    const resolved = await fetch(`${base}/abastecimento/importacoes/${importId}/itens/${yItem!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ obra_id: obra.id, tipo_destinatario: 'FROTA', frota_id: fleet.id }) }); assert.equal(resolved.status, 200);
    const confirmed = await fetch(`${base}/abastecimento/importacoes/${importId}/confirmar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item_ids: [xItem!.id, yItem!.id] }) }); const confirmation = await confirmed.json() as { importadas: number; ja_importados: number; falhas: unknown[] }; assert.equal(confirmed.status, 200); assert.equal(confirmation.importadas, 1); assert.equal(confirmation.ja_importados, 0); assert.deepEqual(confirmation.falhas, []);
    const values = (await pool.query<{ obra_id: string; litros: string; valor_total: string; total: string }>('SELECT obra_id,litros,valor_total,COUNT(*) OVER()::text AS total FROM abastecimentos WHERE origem_sistema=\'POLIFROTA\' AND identificador_externo=$1', [x])).rows[0]!; assert.equal(values.obra_id, secondObra.id); assert.equal(Number(values.litros), 12.345); assert.equal(Number(values.valor_total), 91777.25); assert.equal(Number(values.total), 1);
    const yCount = await pool.query('SELECT COUNT(*)::int AS count FROM abastecimentos WHERE origem_sistema=\'POLIFROTA\' AND identificador_externo=$1', [y]); assert.equal(yCount.rows[0]?.count, 1);
  } finally { if (importId) { await pool.query('DELETE FROM abastecimentos WHERE importacao_id=$1', [importId]); await pool.query('DELETE FROM abastecimento_importacoes WHERE id=$1', [importId]); } await pool.query('DELETE FROM abastecimentos WHERE origem_sistema=\'POLIFROTA\' AND identificador_externo IN ($1,$2)', [x, y]); await new Promise<void>(resolve => server.close(() => resolve())); }
});
