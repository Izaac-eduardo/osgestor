import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';

test('resolver-lote altera somente campos informados e preserva destinatário manual', async () => {
  const fleets = (await pool.query<{ id: string; codigo: string; placa: string | null }>("SELECT id,codigo,placa FROM frotas WHERE status='ATIVO' ORDER BY codigo LIMIT 2")).rows;
  const obra = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE status='ATIVA' ORDER BY codigo LIMIT 1")).rows[0];
  assert.equal(fleets.length, 2); assert.ok(obra);
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`; let importId: string | undefined;
  try {
    const rows = [['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Horímetro', 'Bico', 'Frentista'], ['991001', '21/09/2026 07:00', fleets[0]!.placa || 'SEMPLACA', fleets[0]!.codigo, '10', '100', '0', '', '9 - OLEO DIESEL S500 - COMUM', 'Teste'], ['991002', '21/09/2026 08:00', fleets[0]!.placa || 'SEMPLACA', fleets[0]!.codigo, '11', '110', '0', '', '9 - OLEO DIESEL S500 - COMUM', 'Teste']];
    const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Relatorio'); const form = new FormData(); form.append('arquivo', new Blob([XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'fase10-regressao.xlsx');
    const analyzed = await fetch(`${base}/abastecimento/importacoes/polifrota/analisar`, { method: 'POST', body: form }); const analyzedBody = await analyzed.json() as { id: string; items: Array<{ id: string; frota_id: string | null; obra_id: string | null }> }; assert.equal(analyzed.status, 201); importId = analyzedBody.id; assert.equal(analyzedBody.items.length, 2);
    const first = analyzedBody.items[0]!; const second = analyzedBody.items[1]!;
    const manual = await fetch(`${base}/abastecimento/importacoes/${importId}/itens/${first.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo_destinatario: 'FROTA', frota_id: fleets[1]!.id }) }); assert.equal(manual.status, 200);
    const batch = await fetch(`${base}/abastecimento/importacoes/${importId}/resolver-lote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item_ids: [first.id, second.id], obra_id: obra.id }) }); const batchBody = await batch.json() as Array<{ frota_id: string | null; obra_id: string | null }>; assert.equal(batch.status, 200); assert.equal(batchBody[0]?.frota_id, fleets[1]!.id); assert.equal(batchBody[1]?.frota_id, fleets[0]!.id); assert.equal(batchBody[0]?.obra_id, obra.id); assert.equal(batchBody[1]?.obra_id, obra.id);
    const inverse = await fetch(`${base}/abastecimento/importacoes/${importId}/resolver-lote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item_ids: [first.id], tipo_destinatario: 'FROTA', frota_id: fleets[0]!.id }) }); const inverseBody = await inverse.json() as Array<{ frota_id: string | null; obra_id: string | null }>; assert.equal(inverse.status, 200); assert.equal(inverseBody[0]?.frota_id, fleets[0]!.id); assert.equal(inverseBody[0]?.obra_id, obra.id);
  } finally { if (importId) await pool.query('DELETE FROM abastecimento_importacoes WHERE id=$1', [importId]); await new Promise<void>(resolve => server.close(() => resolve())); }
});
