import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReconciliation } from '../src/services/monthly-reconciliation.service.js';
import type { ParsedOs } from '../src/imports/poli-os.js';

const parsed = (overrides: Partial<ParsedOs> = {}): ParsedOs => ({ numeroOs: 46511, data: '2026-09-01', cliente: null, frotaOriginal: 'F01', parecerOriginal: 'OBRA', funcionarioAbertura: null, problema: 'Reparo', itens: [], execucoes: [], statusPreview: 'REQUER_REVISAO', pendencias: [], origem: 'fixture.xls', ...overrides });
const snapshot = (overrides: any = {}): any => ({ order: { id: 'os-1', numero_os: '46511', obra_id: 'obra-1', frota_id: 'frota-1', natureza_os: 'INTERNA', categoria_servico: null, status: 'ABERTA', status_original: 'Aberta', status_origem: 'AUTOMATICO', observacoes: null }, services: [], products: [], executions: [], overrides: [], ...overrides });

test('NEW para O.S. inexistente resolvida', () => assert.equal(classifyReconciliation(parsed(), undefined).classification, 'NEW'));
test('BLOCKED para O.S. nova sem obra ou frota', () => assert.equal(classifyReconciliation(parsed({ pendencias: ['OBRA_PENDENTE', 'FROTA_PENDENTE'] }), undefined).classification, 'BLOCKED'));
test('NO_CHANGE para O.S. idêntica', () => assert.equal(classifyReconciliation(parsed({ natureza: 'INTERNA', status: 'ABERTA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot()).classification, 'NO_CHANGE'));
test('SAFE_UPDATE para avanço de status', () => assert.equal(classifyReconciliation(parsed({ status: 'FINALIZADA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot()).classification, 'SAFE_UPDATE'));
test('PROTECTED_OVERRIDE preserva status humano', () => assert.equal(classifyReconciliation(parsed({ status: 'FINALIZADA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ order: { ...snapshot().order, status: 'CANCELADA' }, overrides: [{ campo: 'status', valor_origem: 'FINALIZADA', valor_override: 'CANCELADA' }] })).classification, 'PROTECTED_OVERRIDE'));
test('SOURCE_CHANGED_AFTER_OVERRIDE vira REVIEW', () => assert.equal(classifyReconciliation(parsed({ status: 'CANCELADA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ order: { ...snapshot().order, status: 'FINALIZADA' }, overrides: [{ campo: 'status', valor_origem: 'FINALIZADA', valor_override: 'CANCELADA' }] })).classification, 'REVIEW'));
test('divergência histórica de natureza vira REVIEW', () => assert.equal(classifyReconciliation(parsed({ natureza: 'TERCEIRO', status: 'ABERTA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot()).classification, 'REVIEW'));
test('obra não resolvida vira BLOCKED', () => assert.equal(classifyReconciliation(parsed({ status: 'ABERTA', natureza: 'INTERNA', pendencias: ['OBRA_PENDENTE'] }), snapshot()).classification, 'BLOCKED'));
test('frota não resolvida vira BLOCKED', () => assert.equal(classifyReconciliation(parsed({ status: 'ABERTA', natureza: 'INTERNA', pendencias: ['FROTA_PENDENTE'] }), snapshot()).classification, 'BLOCKED'));
test('frota divergente vira REVIEW por modelo dual', () => assert.equal(classifyReconciliation(parsed({ status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-2' }), snapshot()).classification, 'REVIEW'));
test('item sem identidade vira REVIEW', () => assert.equal(classifyReconciliation(parsed({ status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1', itens: [{ tipo: 'PRODUTO', descricao: 'Filtro', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN' }] }), snapshot()).classification, 'REVIEW'));
test('item ausente no consolidado vira REVIEW por possível remoção', () => assert.equal(classifyReconciliation(parsed({ status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ products: [{ id: 'p-1', ordem_servico_id: 'os-1', descricao: 'Filtro', quantidade: '1', unidade: 'UN', valor_unitario: '10', codigo_poli: null, fingerprint_contexto: null, hash_conteudo: null }] })).classification, 'REVIEW'));
test('override mais outro conflito permanece REVIEW', () => assert.equal(classifyReconciliation(parsed({ status: 'FINALIZADA', natureza: 'TERCEIRO', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ order: { ...snapshot().order, status: 'CANCELADA' }, overrides: [{ campo: 'status', valor_origem: 'FINALIZADA', valor_override: 'CANCELADA' }] })).classification, 'REVIEW'));
test('motor de classificação não executa persistência', () => assert.equal(classifyReconciliation(parsed(), snapshot()).classification, 'NO_CHANGE'));
test('codigo Poli repetido em dois serviços não cria identidade de instância', () => {
  const item = { tipo: 'SERVICO' as const, codigo_poli: '1919', descricao: 'Serviço A', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN' };
  const result = classifyReconciliation(parsed({ itens: [item], status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ services: [{ id: 's1', ordem_servico_id: 'os-1', descricao: 'Serviço A', valor: '10', codigo_poli: '1919', fingerprint_contexto: null, hash_conteudo: null }, { id: 's2', ordem_servico_id: 'os-1', descricao: 'Serviço B', valor: '10', codigo_poli: '1919', fingerprint_contexto: null, hash_conteudo: null }] }));
  assert.equal(result.classification, 'REVIEW');
  assert.ok(result.reviews.some(value => value.reasonCode === 'ITEM_MATCH_UNCERTAIN'));
  assert.equal(result.reviews.some(value => value.reasonCode === 'POSSIBLE_ITEM_REMOVAL'), false);
});
test('hash de conteúdo igual sem fingerprint exato não prova identidade', () => {
  const item = { tipo: 'PRODUTO' as const, codigo_poli: 'P1', descricao: 'Produto', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN', hashConteudo: 'same-hash', fingerprintContexto: 'source-fp' };
  const result = classifyReconciliation(parsed({ itens: [item], status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ products: [{ id: 'p1', ordem_servico_id: 'os-1', descricao: 'Produto', quantidade: '1', unidade: 'UN', valor_unitario: '10', codigo_poli: 'P1', fingerprint_contexto: 'other-fp', hash_conteudo: 'same-hash' }] }));
  assert.equal(result.classification, 'REVIEW');
  assert.equal(result.reviews.some(value => value.reasonCode === 'ITEM_MATCH_UNCERTAIN'), true);
});
test('fingerprint de outro arquivo não é identidade estável', () => {
  const result = classifyReconciliation(parsed({ itens: [{ tipo: 'SERVICO', descricao: 'Serviço', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN', fingerprintContexto: 'arquivo-novo' }], status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ services: [{ id: 's1', ordem_servico_id: 'os-1', descricao: 'Serviço', valor: '10', codigo_poli: null, fingerprint_contexto: 'arquivo-antigo', hash_conteudo: null }] }));
  assert.equal(result.classification, 'REVIEW');
  assert.equal(result.reviews.some(value => value.reasonCode === 'ITEM_MATCH_UNCERTAIN'), true);
});
test('histórico sem proveniência suficiente permanece REVIEW', () => {
  const result = classifyReconciliation(parsed({ itens: [{ tipo: 'PRODUTO', codigo_poli: 'P1', descricao: 'Produto', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN' }], status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ products: [{ id: 'p1', ordem_servico_id: 'os-1', descricao: 'Produto', quantidade: '1', unidade: 'UN', valor_unitario: '10', codigo_poli: 'P1', fingerprint_contexto: null, hash_conteudo: null }] }));
  assert.equal(result.classification, 'REVIEW');
});
test('incerteza de grupo não produz conclusões falsas de novo e remoção', () => {
  const result = classifyReconciliation(parsed({ itens: [{ tipo: 'SERVICO', descricao: 'Fonte', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN' }], status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ services: [{ id: 's1', ordem_servico_id: 'os-1', descricao: 'Atual', valor: '10', codigo_poli: null, fingerprint_contexto: null, hash_conteudo: null }] }));
  assert.equal(result.reviews.filter(value => value.reasonCode === 'ITEM_MATCH_UNCERTAIN').length, 1);
  assert.equal(result.reviews.some(value => value.reasonCode === 'POSSIBLE_NEW_ITEM' || value.reasonCode === 'POSSIBLE_ITEM_REMOVAL'), false);
});
test('remoção só aparece quando não há item externo sem par', () => {
  const result = classifyReconciliation(parsed({ status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot({ products: [{ id: 'p1', ordem_servico_id: 'os-1', descricao: 'Atual', quantidade: '1', unidade: 'UN', valor_unitario: '10', codigo_poli: null, fingerprint_contexto: null, hash_conteudo: null }] }));
  assert.equal(result.reviews.some(value => value.reasonCode === 'POSSIBLE_ITEM_REMOVAL'), true);
});
test('item novo só aparece quando não há item atual do tipo', () => {
  const result = classifyReconciliation(parsed({ itens: [{ tipo: 'SERVICO', descricao: 'Novo', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN' }], status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-1', frotaId: 'frota-1' }), snapshot());
  assert.equal(result.reviews.some(value => value.reasonCode === 'POSSIBLE_NEW_ITEM'), true);
});
test('safe update de obra com conflito de item permanece REVIEW', () => {
  const result = classifyReconciliation(parsed({ itens: [{ tipo: 'PRODUTO', descricao: 'Novo', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN' }], status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-2', frotaId: 'frota-1' }), snapshot());
  assert.equal(result.safeUpdates.some(value => value.field === 'obra_id'), true);
  assert.equal(result.classification, 'REVIEW');
});
test('obra unívoca sem outros conflitos pode produzir SAFE_UPDATE', () => {
  const result = classifyReconciliation(parsed({ status: 'ABERTA', natureza: 'INTERNA', obraId: 'obra-2', frotaId: 'frota-1' }), snapshot());
  assert.equal(result.classification, 'SAFE_UPDATE');
});

test('override de obra resolve TRIPOLONI sem alias global', () => {
  const result = classifyReconciliation(parsed({ pendencias: ['OBRA_PENDENTE'], parecerOriginal: 'TRIPOLONI', status: 'ABERTA', natureza: 'INTERNA', frotaId: 'frota-1' }), snapshot({ overrides: [{ campo: 'obra_id', valor_origem: 'obra-antiga', valor_override: 'obra-1' }] }));
  assert.equal(result.blockers.some(value => value.reasonCode === 'UNRESOLVED_WORK'), false);
  assert.equal(result.protectedOverrides.some(value => value.field === 'obra_id'), true);
  assert.equal(result.classification, 'PROTECTED_OVERRIDE');
});

test('override de obra resolve LOCADO sem alias global', () => {
  const result = classifyReconciliation(parsed({ pendencias: ['OBRA_PENDENTE'], parecerOriginal: 'LOCADO', status: 'ABERTA', natureza: 'INTERNA', frotaId: 'frota-1' }), snapshot({ overrides: [{ campo: 'obra_id', valor_origem: 'obra-antiga', valor_override: 'obra-1' }] }));
  assert.equal(result.blockers.some(value => value.reasonCode === 'UNRESOLVED_WORK'), false);
});

test('identificador desconhecido sem alias e sem override continua BLOCKED', () => {
  const result = classifyReconciliation(parsed({ pendencias: ['OBRA_PENDENTE'], parecerOriginal: 'DESCONHECIDO', status: 'ABERTA', natureza: 'INTERNA', frotaId: 'frota-1' }), snapshot());
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.blockers.some(value => value.reasonCode === 'UNRESOLVED_WORK'), true);
});

test('alias determinístico sem override continua resolvido normalmente', () => {
  const result = classifyReconciliation(parsed({ obraId: 'obra-1', status: 'ABERTA', natureza: 'INTERNA', frotaId: 'frota-1' }), snapshot());
  assert.equal(result.blockers.some(value => value.reasonCode === 'UNRESOLVED_WORK'), false);
});

test('alias igual ao override preserva a decisão humana', () => {
  const result = classifyReconciliation(parsed({ obraId: 'obra-1', status: 'ABERTA', natureza: 'INTERNA', frotaId: 'frota-1' }), snapshot({ overrides: [{ campo: 'obra_id', valor_origem: 'obra-antiga', valor_override: 'obra-1' }] }));
  assert.equal(result.protectedOverrides.some(value => value.field === 'obra_id'), true);
});

test('alias divergente não substitui override humano', () => {
  const result = classifyReconciliation(parsed({ obraId: 'obra-2', status: 'ABERTA', natureza: 'INTERNA', frotaId: 'frota-1' }), snapshot({ overrides: [{ campo: 'obra_id', valor_origem: 'obra-antiga', valor_override: 'obra-1' }] }));
  assert.equal(result.blockers.some(value => value.reasonCode === 'UNRESOLVED_WORK'), false);
  assert.equal(result.protectedOverrides.some(value => value.field === 'obra_id'), true);
  assert.equal(result.differences.some(value => value.reasonCode === 'PROTECTED_OVERRIDE'), true);
});

test('overrides de natureza e status não resolvem obra', () => {
  const result = classifyReconciliation(parsed({ pendencias: ['OBRA_PENDENTE'], status: 'FINALIZADA', natureza: 'TERCEIRO', frotaId: 'frota-1' }), snapshot({ overrides: [{ campo: 'natureza_os', valor_origem: 'INTERNA', valor_override: 'TERCEIRO' }, { campo: 'status', valor_origem: 'ABERTA', valor_override: 'FINALIZADA' }] }));
  assert.equal(result.blockers.some(value => value.reasonCode === 'UNRESOLVED_WORK'), true);
});
