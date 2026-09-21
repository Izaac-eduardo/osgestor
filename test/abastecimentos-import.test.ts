import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { buildPreviewItem, type ImportacaoContext } from '../src/services/abastecimentos-import.service.js';
import type { PoliFrotaAbastecimentoNormalizado } from '../src/imports/polifrota.js';

const row = (overrides: Partial<PoliFrotaAbastecimentoNormalizado> = {}): PoliFrotaAbastecimentoNormalizado => ({
  origemSistema: 'POLIFROTA', identificadorExterno: '900001', dataHora: '2026-09-21T07:00:00', dataHoraOriginal: '21/09/2026 07:00', placaOriginal: 'ABC1D23', placaNormalizada: 'ABC1D23', frotaOriginal: 'EH16', frotaNormalizada: 'EH16', litros: 10, litrosOriginal: '10', valorTotal: 123.4567, valorTotalOriginal: '123.4567', kmHr: 0, kmHrOriginal: '0', kmHrStatus: 'ZERO_INFORMADO', horimetro: null, horimetroOriginal: null, horimetroStatus: 'AUSENTE', bicoCodigoOriginal: '9', bicoDescricaoOriginal: 'OLEO DIESEL S500 - COMUM', produtoDetectado: 'DIESEL_S500', frentistaOriginal: 'Teste', linhaOriginal: 2, planilhaOriginal: 'Relatorio', payloadOriginal: { original: true }, diagnosticos: [], ...overrides,
});
const context = (overrides: Partial<ImportacaoContext> = {}): ImportacaoContext => ({ frotas: [{ id: '11111111-1111-4111-8111-111111111111', codigo: 'EH16', placa: 'ABC1D23', status: 'ATIVO' }], produtoIds: { DIESEL_S500: '22222222-2222-4222-8222-222222222222', DIESEL_S10: '33333333-3333-4333-8333-333333333333' }, especialId: '44444444-4444-4444-8444-444444444444', importedIds: new Set(), duplicateIds: new Set(), ...overrides });

test('matching PoliFrota é conservador e preserva dados opcionais/originais', () => {
  const fleet = buildPreviewItem(row(), context());
  assert.equal(fleet.tipo_destinatario, 'FROTA');
  assert.equal(fleet.frota_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(fleet.km_hr, 0);
  assert.equal(fleet.horimetro, null);
  assert.equal(fleet.valor_total, 123.4567);
  assert.equal(fleet.bico_codigo_original, '9');
  assert.equal(fleet.destinacao_especial_id, null);
  assert.equal(fleet.pendencias.obra, true);
  assert.equal(fleet.status_preview, 'PENDENTE_OBRA');

  const conflict = buildPreviewItem(row({ placaNormalizada: 'XYZ9A99', placaOriginal: 'XYZ9A99' }), context({ frotas: [{ id: '11111111-1111-4111-8111-111111111111', codigo: 'EH16', placa: 'ABC1D23', status: 'ATIVO' }, { id: '55555555-5555-4555-8555-555555555555', codigo: 'EH17', placa: 'XYZ9A99', status: 'ATIVO' }] }));
  assert.equal(conflict.tipo_destinatario, null);
  assert.ok(conflict.pendencias.motivos.includes('CONFLITO_FROTA_PLACA'));

  const special = buildPreviewItem(row({ placaOriginal: 'PIRULITO', placaNormalizada: 'PIRULITO', frotaOriginal: 'PIRULITO', frotaNormalizada: 'PIRULITO' }), context());
  assert.equal(special.tipo_destinatario, 'ESPECIAL');
  assert.equal(special.frota_id, null);
  assert.equal(special.destinacao_especial_id, '44444444-4444-4444-8444-444444444444');

  const thirdLike = buildPreviewItem(row({ placaOriginal: 'PLANURB', placaNormalizada: 'PLANURB', frotaOriginal: null, frotaNormalizada: null }), context());
  assert.equal(thirdLike.tipo_destinatario, null);
  assert.ok(thirdLike.pendencias.motivos.includes('DESTINATARIO_NAO_ENCONTRADO'));
});

test('preview e confirmação sintética não duplicam e não confirmam dados reais', async () => {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const identifier = `990${Date.now()}`;
  let importId: string | undefined;
  let itemId: string | undefined;
  let inserted = false;
  try {
    const [fleetResult, obraResult] = await Promise.all([pool.query<{ id: string; codigo: string; placa: string | null }>("SELECT id,codigo,placa FROM frotas WHERE status='ATIVO' ORDER BY codigo LIMIT 1"), pool.query<{ id: string }>("SELECT id FROM obras WHERE status='ATIVA' ORDER BY codigo LIMIT 1")]);
    assert.ok(fleetResult.rows[0] && obraResult.rows[0]);
    const sheet = XLSX.utils.aoa_to_sheet([['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Horímetro', 'Bico', 'Frentista'], [identifier, '21/09/2026 07:00', fleetResult.rows[0].placa || 'SEMPLACA', fleetResult.rows[0].codigo, '10', '123.4567', '0', '', '9 - OLEO DIESEL S500 - COMUM', 'Teste']]);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Relatorio');
    const form = new FormData(); form.append('arquivo', new Blob([XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'fase6-sintetico.xlsx');
    const analyzed = await fetch(`${base}/abastecimento/importacoes/polifrota/analisar`, { method: 'POST', body: form });
    assert.equal(analyzed.status, 201); const analyzedBody = await analyzed.json() as { id: string; counts: Record<string, number>; items: Array<{ id: string; status_preview: string }> }; importId = analyzedBody.id; itemId = analyzedBody.items[0]?.id; assert.ok(importId && itemId); assert.equal(analyzedBody.counts.total, 1); assert.equal(analyzedBody.items[0]?.status_preview, 'PENDENTE_OBRA');

    const resolved = await fetch(`${base}/abastecimento/importacoes/${importId}/itens/${itemId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ obra_id: obraResult.rows[0].id }) });
    assert.equal(resolved.status, 200); const resolvedBody = await resolved.json() as { status_preview: string; pendencias: { destinatario: boolean } }; assert.equal(resolvedBody.status_preview, 'PRONTO'); assert.equal(resolvedBody.pendencias.destinatario, false);

    const confirmed = await fetch(`${base}/abastecimento/importacoes/${importId}/confirmar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(confirmed.status, 200); const confirmedBody = await confirmed.json() as { importadas: number; falhas: unknown[] }; assert.equal(confirmedBody.importadas, 1, JSON.stringify(confirmedBody)); inserted = true;
    const second = await fetch(`${base}/abastecimento/importacoes/${importId}/confirmar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(second.status, 200); const secondBody = await second.json() as { importadas: number }; assert.equal(secondBody.importadas, 0);
    const count = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM abastecimentos WHERE origem_sistema='POLIFROTA' AND identificador_externo=$1", [identifier]); assert.equal(count.rows[0]?.count, '1');
  } finally {
    if (inserted) await pool.query('DELETE FROM abastecimentos WHERE origem_sistema=\'POLIFROTA\' AND identificador_externo=$1', [identifier]);
    if (importId) await pool.query('DELETE FROM abastecimento_importacoes WHERE id=$1', [importId]);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
