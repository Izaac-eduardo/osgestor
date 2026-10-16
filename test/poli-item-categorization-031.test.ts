import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePoliItemCategory } from '../src/services/poli-item-categorization.service.js';

test('16612 fica sem categoria enquanto a aprovação de serviço está suspensa', () => {
  assert.deepEqual(resolvePoliItemCategory({ codigo_poli: '16612', tipo: 'SERVICO' }), {
    categoria_gerencial: null,
    subcategoria_gerencial: null,
    origem_classificacao: 'PENDENTE_APROVACAO',
    aprovacao: 'PENDENTE_APROVACAO',
  });
  assert.equal(resolvePoliItemCategory({ codigo_poli: '16612', tipo: 'PRODUTO' }).categoria_gerencial, null);
});

test('a suspensão de 16612 não altera serviços legítimos aprovados', () => {
  assert.equal(resolvePoliItemCategory({ codigo_poli: '1892', tipo: 'SERVICO' }).categoria_gerencial, 'ELETRICA');
  assert.equal(resolvePoliItemCategory({ codigo_poli: '3419', tipo: 'SERVICO' }).categoria_gerencial, 'TAG_PEDAGIO');
});
