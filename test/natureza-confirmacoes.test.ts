import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOsUpdateDiff, type ExistingOsSnapshot } from '../src/services/sincronizacao-os.service.js';
import { buildNaturezaConfirmationSignature, naturezaConfirmacaoVersao } from '../src/services/natureza-confirmacoes.service.js';
import type { ParsedOs } from '../src/imports/poli-os.js';

const current = (overrides: Partial<ExistingOsSnapshot> = {}): ExistingOsSnapshot => ({
  id: 'os-1', numeroOs: 47932, obraId: 'obra-1', obra: 'Obra', frotaId: 'frota-1', frota: 'CM18', natureza: 'MATERIAL', categoria: null, status: 'ABERTA', problema: 'RETIRAR MATERIAL', dataAbertura: '2026-10-05', dataFechamento: null, updatedAt: '2026-10-14T00:00:00.000Z', servicos: [], produtos: [{ id: 'p-1', descricao: 'OLEO', quantidade: 4, unidade: 'L', valorUnitario: 46.42 }], execucoes: [], ...overrides,
});
const parsed = (overrides: Partial<ParsedOs> = {}): ParsedOs => ({
  numeroOs: 47932, data: '2026-10-05', cliente: null, frotaOriginal: 'SFN9B60', frotaId: 'frota-1', parecerOriginal: null, obraId: 'obra-1', funcionarioAbertura: null, problema: 'RETIRAR MATERIAL', natureza: 'INTERNA', status: 'ABERTA', statusOriginal: 'ABERTA', statusOrigem: 'AUTOMATICO', itens: [{ codigo: '12448', codigo_poli: '12448', descricao: 'OLEO', quantidade: 4, valorUnitario: 46.42, total: 185.68, unidade: 'L', tipo: 'PRODUTO' }], execucoes: [], statusPreview: 'REQUER_REVISAO', pendencias: [], origem: '0310OS.XLS', ...overrides,
});
test('assinatura é igual para conteúdo equivalente e ordem diferente', () => {
  const a = buildNaturezaConfirmationSignature(parsed(), current());
  const b = buildNaturezaConfirmationSignature(parsed({ itens: [...parsed().itens].reverse(), origem: '0510OS.XLS' }), current());
  assert.equal(a.hashEstadoBanco, b.hashEstadoBanco);
  assert.equal(a.hashConteudoXls, b.hashConteudoXls);
  assert.equal(a.versao, naturezaConfirmacaoVersao);
});
test('alterações relevantes mudam a assinatura', () => {
  const base = buildNaturezaConfirmationSignature(parsed(), current());
  assert.notEqual(base.hashConteudoXls, buildNaturezaConfirmationSignature(parsed({ itens: [{ ...parsed().itens[0]!, quantidade: 5, total: 232.10 }] }), current()).hashConteudoXls);
  assert.notEqual(base.hashEstadoBanco, buildNaturezaConfirmationSignature(parsed(), current({ frotaId: 'frota-2' })).hashEstadoBanco);
  assert.notEqual(base.hashEstadoBanco, buildNaturezaConfirmationSignature(parsed(), current({ obraId: 'obra-2' })).hashEstadoBanco);
  assert.notEqual(base.hashEstadoBanco, buildNaturezaConfirmationSignature(parsed(), current({ status: 'FINALIZADA' })).hashEstadoBanco);
  assert.notEqual(base.hashEstadoBanco, buildNaturezaConfirmationSignature(parsed(), current({ natureza: 'INTERNA' })).hashEstadoBanco);
});

test('confirmação remove somente a divergência de natureza', () => {
  const natureDiff = buildOsUpdateDiff(parsed(), current());
  assert.deepEqual(natureDiff.divergencias, ['NATUREZA_SEM_EVIDENCIA_FORTE']);
  const confirmedDiff = buildOsUpdateDiff(parsed(), current(), { naturezaConfirmada: true });
  assert.equal(confirmedDiff.estado, 'SEM_ALTERACOES');
  assert.deepEqual(confirmedDiff.divergencias, []);
});

test('confirmação não ignora alteração de produto', () => {
  const changed = parsed({ itens: [{ ...parsed().itens[0]!, quantidade: 5, total: 232.10 }] });
  const diff = buildOsUpdateDiff(changed, current(), { naturezaConfirmada: true });
  assert.equal(diff.estado, 'REQUER_REVISAO');
  assert.ok(diff.divergencias.includes('PRODUTO_ALTERADO'));
});
