import assert from 'node:assert/strict';
import test from 'node:test';
import { responseArray, responseImport, responseObject } from '../frontend/src/services/response-shapes.ts';

test('normaliza listas retornadas diretamente e no envelope items', () => {
  assert.deepEqual(responseArray([1, 2], 'teste'), [1, 2]);
  assert.deepEqual(responseArray({ items: [1, 2] }, 'teste'), [1, 2]);
});

test('valida objetos de totais e desempenho sem aceitar arrays', () => {
  assert.deepEqual(responseObject({ total_efetivo: '10.00' }, 'totais'), { total_efetivo: '10.00' });
  assert.throws(() => responseObject([], 'totais'), /Resposta inválida/);
});

test('valida o contrato composto da consulta contábil', () => {
  const result = responseImport({ importacao: { id: '1' }, itens: [] });
  assert.equal(result.importacao.id, '1');
  assert.deepEqual(result.itens, []);
  assert.throws(() => responseImport({ importacao: {}, itens: {} }), /Resposta inválida/);
});
