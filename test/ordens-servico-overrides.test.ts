import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { confirm } from '../src/controllers/importacoes-os.controller.js';
import { pool } from '../src/config/database.js';
import { createExternalObraIdentifier, VEGA_OBRA_ORIGIN } from '../src/services/obra-identificadores.service.js';
import { createOrdemServico, updateOrdemServico, updateOrdemServicoStatus } from '../src/services/ordens-servico.service.js';
import { listOverrides, removeOverride, upsertOverride } from '../src/services/ordens-servico-overrides.service.js';

const orderIds: string[] = [];
const extraObraIds: string[] = [];
const aliasIdentifiers = ['L5 ALIAS GLOBAL'];

async function refs() {
  const obra = (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001'`)).rows[0]!;
  const secondObra = (await pool.query<{ id: string }>(`INSERT INTO obras(codigo,nome) VALUES($1,$2) RETURNING id`, [`L5-${randomUUID().slice(0, 8)}`, 'L5 Obra Override'])).rows[0]!;
  extraObraIds.push(secondObra.id);
  const frota = (await pool.query<{ id: string }>(`SELECT id FROM frotas ORDER BY codigo LIMIT 1`)).rows[0]!;
  return { obraId: obra.id, secondObraId: secondObra.id, frotaId: frota.id };
}

const createOrder = async (natureza: 'INTERNA' | 'TERCEIRO' | 'MATERIAL' = 'INTERNA') => {
  const r = await refs();
  const created = await createOrdemServico({
    numero_os: 991000000 + Math.floor(Math.random() * 999999), obra_id: r.obraId, frota_id: r.frotaId,
    natureza_os: natureza, data_abertura: '2026-10-02', status: 'ABERTA', observacoes: 'L5 test',
  });
  orderIds.push(created.id);
  return { created, ...r };
};

test('migration, valores JSONB, FK, unicidade e NULL são seguros', async () => {
  const table = (await pool.query<{ exists: boolean }>(`SELECT to_regclass('public.ordens_servico_overrides') IS NOT NULL AS exists`)).rows[0]!;
  assert.equal(table.exists, true);
  const constraint = (await pool.query<{ definition: string }>(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='ordens_servico_overrides_ordem_servico_id_fkey'`)).rows[0]!;
  assert.match(constraint.definition, /REFERENCES ordens_servico\(id\) ON DELETE CASCADE/);
  const unique = (await pool.query<{ definition: string }>(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='ordens_servico_overrides_ordem_servico_id_campo_key'`)).rows[0]!;
  assert.match(unique.definition, /UNIQUE \(ordem_servico_id, campo\)/);
  const order = await createOrder('INTERNA');
  try {
    const saved = await upsertOverride(order.created.id, 'obra_id', order.obraId, null as never);
    assert.fail(`valor inválido aceito: ${saved.id}`);
  } catch (error) {
    assert.match(String(error), /UUID de obra válido/);
  }
  const nullable = await upsertOverride(order.created.id, 'status', 'ABERTA', 'CANCELADA');
  assert.equal(nullable.valor_origem, 'ABERTA');
  assert.equal(nullable.valor_override, 'CANCELADA');
});

test('override de frota usa coluna tipada, aceita frota existente e rejeita alvo inexistente', async () => {
  const order = await createOrder('INTERNA');
  const saved = await upsertOverride(order.created.id, 'frota_id', '242D3', order.frotaId);
  assert.equal(saved.campo, 'frota_id');
  assert.equal(saved.valor_origem, '242D3');
  assert.equal(saved.valor_override, order.frotaId);
  assert.equal(saved.frota_id_override, order.frotaId);
  await assert.rejects(() => upsertOverride(order.created.id, 'frota_id', '242D3', randomUUID()), /frota do override/);
  const column = (await pool.query<{ data_type: string; is_nullable: string }>(`SELECT data_type,is_nullable FROM information_schema.columns WHERE table_name='ordens_servico_overrides' AND column_name='frota_id_override'`)).rows[0]!;
  assert.deepEqual(column, { data_type: 'uuid', is_nullable: 'YES' });
});

test('constraints impedem coluna tipada de frota em outro campo e preservam FK RESTRICT', async () => {
  const order = await createOrder('INTERNA');
  await assert.rejects(() => pool.query(`INSERT INTO ordens_servico_overrides(ordem_servico_id,campo,valor_origem,valor_override,frota_id_override) VALUES($1,'obra_id','null','null',$2)`, [order.created.id, order.frotaId]));
  const fk = (await pool.query<{ definition: string }>(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='ordens_servico_overrides_frota_id_override_fkey'`)).rows[0]!;
  assert.match(fk.definition, /REFERENCES frotas\(id\) ON DELETE RESTRICT/);
});

test('edição humana cria e atualiza um único override de natureza atomicamente', async () => {
  const { created, obraId, frotaId } = await createOrder('INTERNA');
  await updateOrdemServico(created.id, { numero_os: Number(created.numero_os), obra_id: obraId, frota_id: frotaId, natureza_os: 'TERCEIRO', data_abertura: '2026-10-02', status: 'ABERTA', observacoes: 'L5 test' });
  await updateOrdemServico(created.id, { numero_os: Number(created.numero_os), obra_id: obraId, frota_id: frotaId, natureza_os: 'MATERIAL', data_abertura: '2026-10-02', status: 'ABERTA', observacoes: 'L5 test' });
  const overrides = await listOverrides(created.id);
  assert.equal(overrides.filter(item => item.campo === 'natureza_os').length, 1);
  assert.equal(overrides.find(item => item.campo === 'natureza_os')?.valor_origem, 'INTERNA');
  assert.equal(overrides.find(item => item.campo === 'natureza_os')?.valor_override, 'MATERIAL');
});

test('status usa a tabela de override sem duplicar status_original/status_origem', async () => {
  const { created } = await createOrder('INTERNA');
  await updateOrdemServicoStatus(created.id, { status: 'FINALIZADA' });
  const override = (await listOverrides(created.id)).find(item => item.campo === 'status');
  assert.equal(override?.valor_origem, 'ABERTA');
  assert.equal(override?.valor_override, 'FINALIZADA');
  const stored = (await pool.query<{ status_original: string | null; status_origem: string | null }>('SELECT status_original,status_origem FROM ordens_servico WHERE id=$1', [created.id])).rows[0]!;
  assert.deepEqual(stored, { status_original: null, status_origem: null });
});

test('importação e criação manual não criam override automaticamente', async () => {
  const { created, obraId, frotaId } = await createOrder('INTERNA');
  assert.deepEqual(await listOverrides(created.id), []);
  const token = randomUUID();
  const numeroOs = 992000000 + Math.floor(Math.random() * 999999);
  const item = { numeroOs, data: '2026-10-02', cliente: null, frotaOriginal: null, frotaId, parecerOriginal: 'L5 IMPORT', obraId, natureza: 'INTERNA', status: 'ABERTA', statusOriginal: 'Aberta', statusOrigem: 'AUTOMATICO', itens: [], execucoes: [], statusPreview: 'NOVA', pendencias: [], origem: 'l5-import.xlsx', importacaoId: token };
  try {
    await pool.query('INSERT INTO importacoes_os(id,arquivo_nome,expires_at) VALUES($1,$2,now()+interval \'1 hour\')', [token, 'l5-import.xlsx']);
    await pool.query('INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES($1,$2,$3,$4,$5)', [token, numeroOs, JSON.stringify(item), 'NOVA', '[]']);
    const response = { statusCode: 200, status(code: number) { response.statusCode = code; return response; }, json() { return response; } };
    await confirm({ params: { token } } as never, response as never);
    const imported = (await pool.query<{ id: string }>('SELECT id FROM ordens_servico WHERE numero_os=$1', [numeroOs])).rows[0]!;
    assert.ok(imported?.id);
    assert.deepEqual(await listOverrides(imported.id), []);
  } finally {
    await pool.query('DELETE FROM ordens_servico WHERE numero_os=$1', [numeroOs]);
    await pool.query('DELETE FROM importacoes_os WHERE id=$1', [token]);
  }
});

test('obra possui override próprio e não altera alias global', async () => {
  const { created, obraId, secondObraId, frotaId } = await createOrder('INTERNA');
  await createExternalObraIdentifier(obraId, VEGA_OBRA_ORIGIN, aliasIdentifiers[0]!);
  await updateOrdemServico(created.id, { numero_os: Number(created.numero_os), obra_id: secondObraId, frota_id: frotaId, natureza_os: 'INTERNA', data_abertura: '2026-10-02', status: 'ABERTA', observacoes: 'L5 test' });
  const override = (await listOverrides(created.id)).find(item => item.campo === 'obra_id');
  assert.equal(override?.valor_origem, obraId);
  assert.equal(override?.valor_override, secondObraId);
  const alias = (await pool.query<{ obra_id: string }>('SELECT obra_id FROM obra_identificadores_externos WHERE identificador_normalizado=$1', [aliasIdentifiers[0]])).rows[0]!;
  assert.equal(alias.obra_id, obraId);
});

test('remoção explícita remove proteção sem alterar valor da O.S.', async () => {
  const { created, obraId, secondObraId, frotaId } = await createOrder('INTERNA');
  await updateOrdemServico(created.id, { numero_os: Number(created.numero_os), obra_id: secondObraId, frota_id: frotaId, natureza_os: 'INTERNA', data_abertura: '2026-10-02', status: 'ABERTA', observacoes: 'L5 test' });
  assert.equal(await removeOverride(created.id, 'obra_id'), true);
  const stored = (await pool.query<{ obra_id: string }>('SELECT obra_id FROM ordens_servico WHERE id=$1', [created.id])).rows[0]!;
  assert.equal(stored.obra_id, secondObraId);
  assert.equal(await removeOverride(created.id, 'obra_id'), false);
  await upsertOverride(created.id, 'obra_id', obraId, secondObraId);
});

test('falha controlada no override faz rollback da alteração da O.S.', async () => {
  const { created, obraId, frotaId } = await createOrder('INTERNA');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE ordens_servico SET natureza_os=$1 WHERE id=$2', ['TERCEIRO', created.id]);
    await assert.rejects(() => upsertOverride(created.id, 'natureza_os', 'INTERNA', 'NAO_VALIDO', client), /valor_override/);
    await client.query('ROLLBACK');
    const stored = (await pool.query<{ natureza_os: string }>('SELECT natureza_os FROM ordens_servico WHERE id=$1', [created.id])).rows[0]!;
    assert.equal(stored.natureza_os, 'INTERNA');
    assert.equal((await listOverrides(created.id)).length, 0);
  } finally { client.release(); }
  assert.ok(obraId && frotaId);
});

after(async () => {
  await pool.query('DELETE FROM obra_identificadores_externos WHERE identificador_normalizado = ANY($1::text[])', [aliasIdentifiers]);
  if (orderIds.length) await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orderIds]);
  if (extraObraIds.length) await pool.query('DELETE FROM obras WHERE id=ANY($1::uuid[])', [extraObraIds]);
  await pool.end();
});
