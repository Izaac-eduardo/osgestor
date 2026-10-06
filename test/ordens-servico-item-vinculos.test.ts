import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/config/database.js';
import { createImportedServicoOs } from '../src/services/ordens-servico-itens.service.js';
import { createOrdemServico } from '../src/services/ordens-servico.service.js';
import {
  createItemVinculo,
  getActiveItemVinculoByOccurrence,
  listActiveItemVinculos,
  revokeItemVinculo,
} from '../src/services/ordens-servico-item-vinculos.service.js';
import { classifyReconciliation, type ReconciliationSnapshot } from '../src/services/monthly-reconciliation.service.js';

const orderIds: string[] = [];
const importIds: string[] = [];
const itemIds: string[] = [];

async function fixture() {
  const obra = (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001'`)).rows[0]!;
  const frota = (await pool.query<{ id: string }>('SELECT id FROM frotas ORDER BY codigo LIMIT 1')).rows[0]!;
  const order = await createOrdemServico({ numero_os: 993000000 + Math.floor(Math.random() * 999999), obra_id: obra.id, frota_id: frota.id, natureza_os: 'INTERNA', data_abertura: '2026-10-05', status: 'ABERTA', observacoes: 'L10.2 test' });
  orderIds.push(order.id);
  const product = (await pool.query<{ id: string }>(`INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario) VALUES($1,$2,$3,$4,$5) RETURNING id`, [order.id, 'L10.2 product', 1, 'UN', 10])).rows[0]!;
  const service = await createImportedServicoOs(pool, order.id, { descricao: 'L10.2 service', valor: 20, classificacao_servico: 'INTERNO' });
  itemIds.push(product.id, service.id);
  const importacao = async () => {
    const id = randomUUID();
    importIds.push(id);
    await pool.query(`INSERT INTO importacoes_os(id,arquivo_nome,expires_at) VALUES($1,$2,now()+interval '1 hour')`, [id, `l10.2-${id}.xlsx`]);
    return id;
  };
  return { order, product, service, importacao };
}

test('migration 026 cria vínculos auditáveis para produto e serviço', async () => {
  const table = (await pool.query<{ exists: boolean }>(`SELECT to_regclass('public.ordens_servico_item_vinculos') IS NOT NULL AS exists`)).rows[0]!;
  assert.equal(table.exists, true);
  const f = await fixture();
  const importacao = await f.importacao();
  const direct = await createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, fingerprintContexto: `fp-${randomUUID()}`, metodoVinculo: 'IMPORTADO_DIRETO', evidenciaSnapshot: { origem: 'teste', regra: 'direto' } });
  assert.equal(direct.homologado_por, null);
  assert.deepEqual(direct.evidencia_snapshot, { origem: 'teste', regra: 'direto' });
  const homologated = await createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'SERVICO', servicoOsId: f.service.id, fingerprintContexto: `fp-${randomUUID()}`, metodoVinculo: 'MATCH_EXATO_HOMOLOGADO', homologadoPor: 'teste.l10.2', justificativa: 'candidato único', evidenciaSnapshot: { candidato: 'EXACT_SINGLE_CANDIDATE' } });
  assert.equal(homologated.homologado_por, 'teste.l10.2');
  assert.ok(homologated.homologado_em);
  assert.equal((await listActiveItemVinculos(f.order.id)).length, 2);
});

test('unicidade é por ocorrência e por instância dentro da importação', async () => {
  const f = await fixture();
  const importacao = await f.importacao();
  const fingerprint = `fp-${randomUUID()}`;
  await createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, fingerprintContexto: fingerprint, metodoVinculo: 'IMPORTADO_DIRETO' });
  await assert.rejects(() => createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, fingerprintContexto: fingerprint, metodoVinculo: 'IMPORTADO_DIRETO' }));
  await assert.rejects(() => createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, fingerprintContexto: `fp-${randomUUID()}`, metodoVinculo: 'IMPORTADO_DIRETO' }));
  const otherImport = await f.importacao();
  const second = await createItemVinculo({ importacaoId: otherImport, ordemServicoId: f.order.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, fingerprintContexto: fingerprint, metodoVinculo: 'IMPORTADO_DIRETO' });
  assert.equal(second.importacao_id, otherImport);
});

test('vínculo homologado exige auditoria, tipo correto e item da mesma O.S.', async () => {
  const f = await fixture();
  const importacao = await f.importacao();
  await assert.rejects(() => createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'SERVICO', servicoOsId: f.service.id, fingerprintContexto: 'fp-audit', metodoVinculo: 'MANUAL' }), /homologadoPor/);
  await assert.rejects(() => createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, servicoOsId: f.service.id, fingerprintContexto: 'fp-type', metodoVinculo: 'IMPORTADO_DIRETO' }), /tipo do vínculo/);
  const other = await createOrdemServico({ numero_os: 994000000 + Math.floor(Math.random() * 999999), obra_id: (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001'`)).rows[0]!.id, frota_id: (await pool.query<{ id: string }>('SELECT id FROM frotas ORDER BY codigo LIMIT 1')).rows[0]!.id, natureza_os: 'INTERNA', data_abertura: '2026-10-05', status: 'ABERTA', observacoes: 'L10.2 other' });
  orderIds.push(other.id);
  await assert.rejects(() => createItemVinculo({ importacaoId: importacao, ordemServicoId: other.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, fingerprintContexto: 'fp-wrong-os', metodoVinculo: 'IMPORTADO_DIRETO' }), /não pertence/);
  await assert.rejects(() => pool.query(`INSERT INTO ordens_servico_item_vinculos(importacao_id,ordem_servico_id,tipo_item,fingerprint_contexto,metodo_vinculo) VALUES($1,$2,'PRODUTO','fp-null','IMPORTADO_DIRETO')`, [importacao, f.order.id]));
});

test('revogação preserva histórico e libera somente o vínculo ativo', async () => {
  const f = await fixture();
  const importacao = await f.importacao();
  const fingerprint = `fp-${randomUUID()}`;
  const saved = await createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'SERVICO', servicoOsId: f.service.id, fingerprintContexto: fingerprint, metodoVinculo: 'IMPORTADO_DIRETO' });
  const revoked = await revokeItemVinculo(saved.id, 'correção homologada');
  assert.equal(revoked?.estado_vinculo, 'REVOGADO');
  assert.equal(await getActiveItemVinculoByOccurrence(importacao, f.order.id, 'SERVICO', fingerprint), undefined);
  const replacement = await createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'SERVICO', servicoOsId: f.service.id, fingerprintContexto: fingerprint, metodoVinculo: 'MANUAL', homologadoPor: 'teste.l10.2' });
  assert.equal(replacement.estado_vinculo, 'ATIVO');
  assert.equal((await pool.query<{ count: string }>('SELECT count(*) count FROM ordens_servico_item_vinculos WHERE id=$1 OR id=$2', [saved.id, replacement.id])).rows[0]!.count, '2');
});

test('FKs RESTRICT protegem importação, item e O.S.', async () => {
  const f = await fixture();
  const importacao = await f.importacao();
  await createItemVinculo({ importacaoId: importacao, ordemServicoId: f.order.id, tipoItem: 'PRODUTO', produtoOsId: f.product.id, fingerprintContexto: `fp-${randomUUID()}`, metodoVinculo: 'IMPORTADO_DIRETO' });
  await assert.rejects(() => pool.query('DELETE FROM importacoes_os WHERE id=$1', [importacao]));
  await assert.rejects(() => pool.query('DELETE FROM produtos_os WHERE id=$1', [f.product.id]));
  await assert.rejects(() => pool.query('DELETE FROM ordens_servico WHERE id=$1', [f.order.id]));
});

test('reconciliador prioriza vínculo persistido mesmo com conteúdo alterado', () => {
  const orderId = randomUUID();
  const itemId = randomUUID();
  const fingerprint = `fp-${randomUUID()}`;
  const snapshot: ReconciliationSnapshot = {
    order: { id: orderId, numero_os: '46526', obra_id: randomUUID(), frota_id: null, natureza_os: 'INTERNA', categoria_servico: null, status: 'ABERTA', status_original: null, status_origem: null, observacoes: null },
    services: [{ id: itemId, ordem_servico_id: orderId, descricao: 'borracharia', valor: '1258.98', classificacao_servico: 'INTERNO', classificacao_origem: 'IMPORTACAO', codigo_poli: null, fingerprint_contexto: null, hash_conteudo: null }],
    products: [], executions: [], overrides: [],
    vinculos: [{ ordem_servico_id: orderId, tipo_item: 'SERVICO', produto_os_id: null, servico_os_id: itemId, fingerprint_contexto: fingerprint, estado_vinculo: 'ATIVO' }],
  };
  const result = classifyReconciliation({ numeroOs: 46526, data: '2026-09-01', cliente: null, frotaOriginal: null, parecerOriginal: null, funcionarioAbertura: null, problema: null, statusOriginal: null, statusOrigem: null, itens: [{ tipo: 'SERVICO', descricao: 'borracharia', quantidade: 1, valorUnitario: 1258.97, total: 1258.97, unidade: 'UN', fingerprintContexto: fingerprint, hashConteudo: 'changed' }], execucoes: [], statusPreview: 'JA_CADASTRADA', pendencias: [], origem: 'test.xlsx' }, snapshot);
  assert.equal(result.classification, 'NO_CHANGE');
  assert.equal(result.differences.some(value => value.reasonCode === 'ITEM_MATCH_UNCERTAIN'), false);
  assert.equal(result.differences.some(value => value.reasonCode === 'POSSIBLE_NEW_ITEM' || value.reasonCode === 'POSSIBLE_ITEM_REMOVAL'), false);
});

after(async () => {
  if (importIds.length) await pool.query('DELETE FROM ordens_servico_item_vinculos WHERE importacao_id=ANY($1::uuid[])', [importIds]);
  if (orderIds.length) await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orderIds]);
  if (importIds.length) await pool.query('DELETE FROM importacoes_os WHERE id=ANY($1::uuid[])', [importIds]);
  await pool.end();
});
