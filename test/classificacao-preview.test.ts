import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  importedServiceOrigin,
  refreshServiceClassificationPending,
  unresolvedServiceCount,
  validateServiceClassificationsForConfirmation,
  type ParsedItem,
} from '../src/imports/poli-os.js';

const service = (classification: ParsedItem['classificacao_servico'], original = classification, descricao = 'SERVICO TESTE'): ParsedItem => ({ descricao, quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN', tipo: 'SERVICO', classificacao_servico: classification, classificacao_servico_original: original, classificacao_origem: 'IMPORTACAO' });
const product: ParsedItem = { descricao: 'PRODUTO', quantidade: 1, valorUnitario: 10, total: 10, unidade: 'UN', tipo: 'PRODUTO' };

test('automático INTERNO sem alteração permanece IMPORTACAO', () => assert.equal(importedServiceOrigin(service('INTERNO')), 'IMPORTACAO'));
test('automático TERCEIRO sem alteração permanece IMPORTACAO', () => assert.equal(importedServiceOrigin(service('TERCEIRO')), 'IMPORTACAO'));
test('INDETERMINADO não resolvido é rejeitado na confirmação', () => assert.throws(() => validateServiceClassificationsForConfirmation([service('INDETERMINADO')])));
test('INDETERMINADO alterado para INTERNO resulta em REVISAO', () => assert.equal(importedServiceOrigin(service('INTERNO', 'INDETERMINADO')), 'REVISAO'));
test('INDETERMINADO alterado para TERCEIRO resulta em REVISAO', () => assert.equal(importedServiceOrigin(service('TERCEIRO', 'INDETERMINADO')), 'REVISAO'));
test('INTERNO alterado para TERCEIRO resulta em REVISAO', () => assert.equal(importedServiceOrigin(service('TERCEIRO', 'INTERNO')), 'REVISAO'));
test('TERCEIRO alterado para INTERNO resulta em REVISAO', () => assert.equal(importedServiceOrigin(service('INTERNO', 'TERCEIRO')), 'REVISAO'));
test('INTERNO alterado e retornado ao original volta para IMPORTACAO', () => assert.equal(importedServiceOrigin(service('INTERNO', 'INTERNO')), 'IMPORTACAO'));
test('valor inválido não é aceito como classificação resolvida', () => assert.throws(() => validateServiceClassificationsForConfirmation([service('EXTERNO' as ParsedItem['classificacao_servico'])])));
test('origem forjada não controla a origem calculada', () => assert.equal(importedServiceOrigin({ ...service('TERCEIRO', 'INTERNO'), classificacao_origem: 'IMPORTACAO' }), 'REVISAO'));
test('O.S. sem serviços não é bloqueada', () => assert.doesNotThrow(() => validateServiceClassificationsForConfirmation([product])));
test('O.S. com dois serviços resolvidos é permitida', () => assert.doesNotThrow(() => validateServiceClassificationsForConfirmation([service('INTERNO'), service('TERCEIRO')])));
test('O.S. com um serviço resolvido e um indeterminado é bloqueada', () => assert.throws(() => validateServiceClassificationsForConfirmation([service('INTERNO'), service('INDETERMINADO')])));
test('serviços com mesma descrição e valor mantêm decisões independentes por índice', () => {
  const items = [service('INTERNO', 'INTERNO', 'MESMA DESCRICAO'), service('TERCEIRO', 'TERCEIRO', 'MESMA DESCRICAO')];
  assert.notEqual(items[0]!.classificacao_servico, items[1]!.classificacao_servico);
  assert.doesNotThrow(() => validateServiceClassificationsForConfirmation(items));
});
test('natureza INTERNA permanece independente de serviço TERCEIRO', () => {
  const order = { natureza: 'INTERNA', itens: [service('TERCEIRO')] };
  assert.equal(order.natureza, 'INTERNA');
  assert.doesNotThrow(() => validateServiceClassificationsForConfirmation(order.itens));
});
test('natureza TERCEIRO permanece independente de serviço INTERNO', () => {
  const order = { natureza: 'TERCEIRO', itens: [service('INTERNO')] };
  assert.equal(order.natureza, 'TERCEIRO');
  assert.doesNotThrow(() => validateServiceClassificationsForConfirmation(order.itens));
});
test('contador e pendência refletem exatamente os indeterminados', () => {
  const pendencias = ['FROTA_PENDENTE', 'CLASSIFICACAO_SERVICO_PENDENTE (9 servicos)'];
  const items = [service('INDETERMINADO'), service('TERCEIRO')];
  assert.equal(unresolvedServiceCount(items), 1);
  refreshServiceClassificationPending(pendencias, items);
  assert.deepEqual(pendencias, ['FROTA_PENDENTE', 'CLASSIFICACAO_SERVICO_PENDENTE (1 servico)']);
  items[0]!.classificacao_servico = 'INTERNO';
  refreshServiceClassificationPending(pendencias, items);
  assert.deepEqual(pendencias, ['FROTA_PENDENTE']);
});
