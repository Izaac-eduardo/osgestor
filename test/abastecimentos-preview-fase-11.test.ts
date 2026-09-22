import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';

test('fase 11 persiste resolução, lista retomada e exige escolha para arquivo duplicado', async () => {
  const obra = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE status='ATIVA' ORDER BY codigo LIMIT 1")).rows[0];
  const fleet = (await pool.query<{ id: string; codigo: string; placa: string | null }>("SELECT id,codigo,placa FROM frotas WHERE status='ATIVO' ORDER BY codigo LIMIT 1")).rows[0];
  assert.ok(obra); assert.ok(fleet);
  const rows = [['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Bico', 'Frentista'], ['991101', '21/09/2026 07:00', fleet.placa || 'SEMPLACA', fleet.codigo, '10', '100', '0', '9 - OLEO DIESEL S500', 'Teste']];
  const sheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Relatorio');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`; const ids: string[] = [];
  try {
    const form = () => { const data = new FormData(); data.append('arquivo', new Blob([buffer]), 'fase11-retomada.xlsx'); return data; };
    const analyzed = await fetch(`${base}/abastecimento/importacoes/polifrota/analisar`, { method: 'POST', body: form() }); const body = await analyzed.json() as { id: string; items: Array<{ id: string }> }; assert.equal(analyzed.status, 201); ids.push(body.id);
    const saved = await fetch(`${base}/abastecimento/importacoes/${body.id}/itens/${body.items[0]!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ obra_id: obra.id }) }); assert.equal(saved.status, 200);
    const reopened = await fetch(`${base}/abastecimento/importacoes/${body.id}`); const reopenedBody = await reopened.json() as { items: Array<{ obra_id: string | null }> }; assert.equal(reopenedBody.items[0]?.obra_id, obra.id);
    const listed = await fetch(`${base}/abastecimento/importacoes/polifrota/em-andamento`); const listedBody = await listed.json() as Array<{ id: string; counts: { total: number } }>; assert.equal(listed.status, 200); assert.equal(listedBody.find(item => item.id === body.id)?.counts.total, 1);
    const duplicate = await fetch(`${base}/abastecimento/importacoes/polifrota/analisar`, { method: 'POST', body: form() }); assert.equal(duplicate.status, 409);
    const forced = await fetch(`${base}/abastecimento/importacoes/polifrota/analisar?nova_analise=true`, { method: 'POST', body: form() }); const forcedBody = await forced.json() as { id: string }; assert.equal(forced.status, 201); ids.push(forcedBody.id);
  } finally { if (ids.length) await pool.query('DELETE FROM abastecimento_importacoes WHERE id=ANY($1::uuid[])', [ids]); await new Promise<void>(resolve => server.close(() => resolve())); }
});
