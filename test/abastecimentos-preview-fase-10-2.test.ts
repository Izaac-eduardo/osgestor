import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';

test('resolução individual e em lote devolve somente os itens atualizados', async () => {
  const fleets = (await pool.query<{ id: string; codigo: string; placa: string | null }>("SELECT id,codigo,placa FROM frotas WHERE status='ATIVO' ORDER BY codigo LIMIT 3")).rows;
  const obras = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE status='ATIVA' ORDER BY codigo LIMIT 2")).rows;
  assert.equal(fleets.length, 3); assert.equal(obras.length, 2);
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`; let importId: string | undefined;
  try {
    const rows = [['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Bico', 'Frentista'], ['992001', '21/09/2026 07:00', fleets[0]!.placa || 'SEMPLACA', fleets[0]!.codigo, '10', '100', '0', '9 - OLEO DIESEL S500', 'Teste'], ['992002', '21/09/2026 08:00', fleets[1]!.placa || 'SEMPLACA', fleets[1]!.codigo, '11', '110', '0', '9 - OLEO DIESEL S500', 'Teste'], ['992003', '21/09/2026 09:00', fleets[2]!.placa || 'SEMPLACA', fleets[2]!.codigo, '12', '120', '0', '9 - OLEO DIESEL S500', 'Teste']];
    const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Relatorio'); const form = new FormData(); form.append('arquivo', new Blob([XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })]), 'fase10-2-regressao.xlsx');
    const analyzed = await fetch(`${base}/abastecimento/importacoes/polifrota/analisar`, { method: 'POST', body: form }); const body = await analyzed.json() as { id: string; items: Array<{ id: string; obra_id: string | null }> }; assert.equal(analyzed.status, 201); importId = body.id; assert.equal(body.items.length, 3);
    const single = await fetch(`${base}/abastecimento/importacoes/${importId}/itens/${body.items[0]!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ obra_id: obras[0]!.id }) }); const singleBody = await single.json() as { id: string; obra_id: string | null; status_preview: string; pendencias: unknown }; assert.equal(single.status, 200); assert.equal(singleBody.id, body.items[0]!.id); assert.equal(singleBody.obra_id, obras[0]!.id); assert.ok(singleBody.status_preview); assert.ok(singleBody.pendencias);
    const batch = await fetch(`${base}/abastecimento/importacoes/${importId}/resolver-lote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item_ids: [body.items[1]!.id, body.items[2]!.id], obra_id: obras[1]!.id }) }); const batchBody = await batch.json() as Array<{ id: string; obra_id: string | null }>; assert.equal(batch.status, 200); assert.deepEqual(batchBody.map(item => item.id), [body.items[1]!.id, body.items[2]!.id]); assert.deepEqual(batchBody.map(item => item.obra_id), [obras[1]!.id, obras[1]!.id]);
  } finally { if (importId) await pool.query('DELETE FROM abastecimento_importacoes WHERE id=$1', [importId]); await new Promise<void>(resolve => server.close(() => resolve())); }
});
