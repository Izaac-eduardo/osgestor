import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';
import { analyzePoliFrota, cancelImportacao, confirmImportSafe, markSubstitution, removeSubstitution, resolveItem, type PreviewItem } from '../src/services/abastecimentos-import.service.js';
import type { AuthenticatedRequestUser } from '../src/types/auth.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

const prefix = `m5714b2_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
let actor: AuthenticatedRequestUser;
const importIds: string[] = [];
const abastecimentoIds: string[] = [];

async function catalog(): Promise<{ obra: string; obra2: string; fleet: string; product: string }> {
  const result = await pool.query<{ obra: string; obra2: string; fleet: string; product: string }>(`SELECT (SELECT id FROM obras WHERE codigo='TEST-OBRA-001') obra,(SELECT id FROM obras WHERE codigo='TEST-OBRA-002') obra2,(SELECT id FROM frotas WHERE codigo='TST01') fleet,(SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S500') product`);
  assert.ok(result.rows[0]?.obra && result.rows[0]?.obra2 && result.rows[0]?.fleet && result.rows[0]?.product);
  return result.rows[0]!;
}

function item(identifier: string, product: string, obra: string | null, status: PreviewItem['status_preview'] = 'PRONTO'): PreviewItem {
  return { id: undefined, identificador_externo: identifier, data_hora: '2026-10-08T07:00:00', data_hora_original: '08/10/2026 07:00', placa_original: 'TST0101', frota_original: 'TST01', litros: 10.125, valor_total: 123.4567, km_hr: 0, km_hr_status: 'ZERO_INFORMADO', horimetro: null, horimetro_status: 'AUSENTE', bico_codigo_original: '9', bico_descricao_original: 'OLEO DIESEL S500', frentista_original: 'Teste', linha_original: 2, planilha_original: 'Relatorio', produto_detectado: 'DIESEL_S500', produto_id: product, identificacao_original: 'TST01', payload_original: { fixture: 'm5714b2' }, status_preview: status, substituicao_abastecimento_id: null, substituicao_origem_sistema: null, substituicao_identificador_principal: null, pendencias: { obra: !obra, destinatario: false, motivos: obra ? [] : ['OBRA_PENDENTE'] }, obra_id: obra, tipo_destinatario: 'FROTA', frota_id: 'fleet-placeholder', terceiro_id: null, destinacao_especial_id: null };
}

async function savePreview(items: PreviewItem[]): Promise<{ id: string; itemIds: string[] }> {
  const id = randomUUID(); importIds.push(id);
  await pool.query(`INSERT INTO abastecimento_importacoes(id,arquivo_nome,arquivo_sha256,origem_sistema,status,parser_versao) VALUES($1,'m5714b2.xlsx',repeat('b',64),'POLIFROTA','PREVIA','test-m5714b2')`, [id]);
  const itemIds: string[] = [];
  for (const value of items) {
    const row = (await pool.query<{ id: string }>('INSERT INTO abastecimento_importacao_itens(importacao_id,identificador_externo,linha_original,planilha,payload_original,payload_normalizado,status_preview,pendencias) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [id, value.identificador_externo, value.linha_original, value.planilha_original, value.payload_original, JSON.stringify({ ...value, resolucao: { obra_id: value.obra_id, tipo_destinatario: value.tipo_destinatario, frota_id: value.frota_id, terceiro_id: value.terceiro_id, destinacao_especial_id: value.destinacao_especial_id } }), value.status_preview, value.pendencias])).rows[0]!;
    itemIds.push(row.id);
  }
  return { id, itemIds };
}

before(async () => {
  const database = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(database.rows[0]?.current_database, 'oficina_test');
  const passwordHash = await hashPassword('Senha de teste PoliFrota 2026!');
  const row = (await pool.query<{ id: string }>('INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,\'ADMIN\',\'ATIVO\',FALSE) RETURNING id', [prefix, `${prefix}@example.invalid`, passwordHash])).rows[0]!;
  actor = { id: row.id, username: prefix, email: `${prefix}@example.invalid`, role: 'ADMIN', status: 'ATIVO', must_change_password: false, sessionId: randomUUID(), tokenHash: 'test-token' };
});

test('confirmação PoliFrota audita abastecimento no mesmo lote e é idempotente', async () => {
  const refs = await catalog(); const identifier = `m5714b2_${Date.now()}`; const value = item(identifier, refs.product, refs.obra); value.frota_id = refs.fleet; const preview = await savePreview([value]);
  try {
    const first = await confirmImportSafe(preview.id, {}, actor); assert.equal(first.importadas, 1); assert.equal(first.status, 'CONCLUIDA');
    const second = await confirmImportSafe(preview.id, {}, actor); assert.equal(second.importadas, 0);
    const audits = await pool.query<{ acao: string; username: string; metadata: Record<string, unknown>; dados_posteriores: Record<string, unknown> }>(`SELECT acao,username,metadata,dados_posteriores FROM auditoria WHERE metadata->>'importacao_id'=$1 AND acao='IMPORTAR'`, [preview.id]);
    assert.equal(audits.rows.length, 1); assert.equal(audits.rows[0]!.username, prefix); assert.equal(audits.rows[0]!.metadata.item_id, preview.itemIds[0]); assert.equal(audits.rows[0]!.metadata.identificador_externo, identifier); assert.equal(audits.rows[0]!.dados_posteriores.litros, 10.125); assert.equal(audits.rows[0]!.dados_posteriores.valor_total, 123.4567);
  } finally { await pool.query("DELETE FROM abastecimentos WHERE identificador_externo=$1", [identifier]); }
});

test('prévia real e cancelamento registram eventos distintos do abastecimento confirmado', async () => {
  const identifier = `m5714b2_preview_${Date.now()}`;
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Nro. Abast.', 'Data', 'Placa', 'Frota', 'Abastecida', 'Valor Total($)', 'Km/Hr.', 'Horímetro', 'Bico', 'Frentista'],
    [identifier, '08/10/2026 07:00', 'TST0101', 'TST01', '10.125', '123.4567', '0', '', '9 - OLEO DIESEL S500', 'Teste'],
  ]);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Relatorio');
  const preview = await analyzePoliFrota(Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })), 'm5714b2-preview.xlsx', true, actor);
  importIds.push(preview.id);
  try {
    assert.equal(preview.status, 'PREVIA');
    const audits = await pool.query<{ operacao: string; username: string; metadata: Record<string, unknown> }>(`SELECT metadata->>'operacao' operacao,username,metadata FROM auditoria WHERE metadata->>'importacao_id'=$1 ORDER BY created_at`, [preview.id]);
    assert.equal(audits.rows.length, 1); assert.equal(audits.rows[0]!.operacao, 'PREVIA_GERADA'); assert.equal(audits.rows[0]!.username, prefix); assert.equal(audits.rows[0]!.metadata.hash_arquivo, preview.arquivo_sha256);
    await cancelImportacao(preview.id, actor);
    const cancelled = await pool.query<{ status: string }>('SELECT status FROM abastecimento_importacoes WHERE id=$1', [preview.id]); assert.equal(cancelled.rows[0]?.status, 'CANCELADA');
    const afterCancel = await pool.query<{ operacao: string }>(`SELECT metadata->>'operacao' operacao FROM auditoria WHERE metadata->>'importacao_id'=$1 ORDER BY created_at`, [preview.id]); assert.deepEqual(afterCancel.rows.map(row => row.operacao), ['PREVIA_GERADA', 'CANCELAMENTO']);
  } finally { await pool.query('DELETE FROM abastecimentos WHERE identificador_externo=$1', [identifier]); }
});

test('resolução de obra e substituição registram allowlist e identidade', async () => {
  const refs = await catalog(); const identifier = `m5714b2_res_${Date.now()}`; const value = item(identifier, refs.product, null); value.frota_id = refs.fleet; const preview = await savePreview([value]);
  const target = (await pool.query<{ id: string }>('INSERT INTO abastecimentos(origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original) VALUES(\'POLIFROTA\',$1,\'2026-10-08 07:00\',$2,$3,\'FROTA\',$4,\'TST01\',10,100,\'m5714b2-target.xlsx\',\'{}\') RETURNING id', [`${identifier}_target`, refs.product, refs.obra2, refs.fleet])).rows[0]!; abastecimentoIds.push(target.id);
  try {
    const resolved = await resolveItem(preview.id, preview.itemIds[0]!, { obra_id: refs.obra }, actor); assert.equal(resolved.status_preview, 'PRONTO');
    const marked = await markSubstitution(preview.id, preview.itemIds[0]!, target.id, actor); assert.equal(marked.status_preview, 'SUBSTITUICAO');
    await removeSubstitution(preview.id, preview.itemIds[0]!, actor);
    const audits = await pool.query<{ operacao: string; username: string }>(`SELECT metadata->>'operacao' operacao,username FROM auditoria WHERE metadata->>'importacao_id'=$1 ORDER BY created_at`, [preview.id]);
    assert.deepEqual(audits.rows.map(row => row.operacao), ['RESOLUCAO_PENDENCIA', 'SUBSTITUICAO_MARCADA', 'SUBSTITUICAO_REMOVIDA']); assert.ok(audits.rows.every(row => row.username === prefix));
  } finally { await pool.query("DELETE FROM abastecimentos WHERE identificador_externo=$1", [`${identifier}_target`]); }
});

test('falha da auditoria reverte o abastecimento e não cria IMPORTAR', async () => {
  const refs = await catalog(); const identifier = `m5714b2_fail_${Date.now()}`; const value = item(identifier, refs.product, refs.obra); value.frota_id = refs.fleet; const preview = await savePreview([value]);
  const invalidActor = { ...actor, role: 'INVALIDO' } as never;
  try {
    await assert.rejects(() => confirmImportSafe(preview.id, {}, invalidActor));
    assert.equal(Number((await pool.query('SELECT COUNT(*)::int count FROM abastecimentos WHERE identificador_externo=$1', [identifier])).rows[0]!.count), 0);
    assert.equal(Number((await pool.query("SELECT COUNT(*)::int count FROM auditoria WHERE metadata->>'importacao_id'=$1 AND acao='IMPORTAR'", [preview.id])).rows[0]!.count), 0);
    assert.equal((await pool.query<{ status_preview: string }>('SELECT status_preview FROM abastecimento_importacao_itens WHERE importacao_id=$1', [preview.id])).rows[0]?.status_preview, 'PRONTO');
  } finally { await pool.query("DELETE FROM abastecimentos WHERE identificador_externo=$1", [identifier]); }
});

test('confirmação parcial preserva o item falho e audita somente o item confirmado', async () => {
  const refs = await catalog(); const first = item(`m5714b2_partial_ok_${Date.now()}`, refs.product, refs.obra); first.frota_id = refs.fleet; const second = item(`m5714b2_partial_bad_${Date.now()}`, refs.product, refs.obra); second.frota_id = refs.fleet; second.produto_id = null;
  const preview = await savePreview([first, second]);
  try {
    const result = await confirmImportSafe(preview.id, {}, actor); assert.equal(result.importadas, 1); assert.equal(result.falhas.length, 1); assert.equal(result.status, 'PREVIA');
    assert.equal(Number((await pool.query("SELECT COUNT(*)::int count FROM auditoria WHERE metadata->>'importacao_id'=$1 AND acao='IMPORTAR'", [preview.id])).rows[0]!.count), 1);
    assert.equal(Number((await pool.query('SELECT COUNT(*)::int count FROM abastecimento_importacao_itens WHERE importacao_id=$1 AND status_preview=\'PRONTO\'', [preview.id])).rows[0]!.count), 1);
  } finally { await pool.query("DELETE FROM abastecimentos WHERE identificador_externo LIKE 'm5714b2_partial_%'"); }
});

after(async () => {
  if (importIds.length) { await pool.query('DELETE FROM abastecimento_importacoes WHERE id=ANY($1::uuid[])', [importIds]); await pool.query('DELETE FROM auditoria WHERE metadata->>\'importacao_id\'=ANY($1::text[])', [importIds]); }
  if (abastecimentoIds.length) await pool.query('DELETE FROM abastecimentos WHERE id=ANY($1::uuid[])', [abastecimentoIds]);
  await pool.query('DELETE FROM auditoria WHERE usuario_id=$1', [actor.id]); await pool.query('DELETE FROM sessoes WHERE usuario_id=$1', [actor.id]); await pool.query('DELETE FROM usuarios WHERE id=$1', [actor.id]); await pool.end();
});
