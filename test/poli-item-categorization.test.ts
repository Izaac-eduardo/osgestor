import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePoliItemCategory } from '../src/services/poli-item-categorization.service.js';

test('classifica somente os códigos Poli aprovados', () => {
  assert.deepEqual(resolvePoliItemCategory({ codigo_poli: '1892', tipo: 'SERVICO' }), { categoria_gerencial: 'ELETRICA', subcategoria_gerencial: 'MÃO DE OBRA ELETRICISTA', origem_classificacao: 'CODIGO_POLI_APROVADO', aprovacao: 'APROVADO' });
  assert.deepEqual(resolvePoliItemCategory({ codigo_poli: '3419', tipo: 'SERVICO' }).categoria_gerencial, 'TAG_PEDAGIO');
  assert.equal(resolvePoliItemCategory({ codigo_poli: '142', tipo: 'PRODUTO' }).categoria_gerencial, null);
});

test('classifica os novos códigos aprovados sem misturar produtos', () => {
  const expected: Array<[string, string, string]> = [
    ['2226', 'MANUTENCAO_PREVENTIVA', 'MANUTENCAO PREVENTIVA'],
    ['23205', 'ALINHAMENTO_BALANCEAMENTO', 'ALINHAMENTO/BALANCEAMENTO'],
    ['2604', 'TAPEÇARIA', 'TAPEÇARIA'],
    ['3336', 'FRETE', 'FRETE'],
    ['3800', 'ALINHAMENTO_BALANCEAMENTO', 'BALANCEAMENTO'],
    ['7331', 'CHAVEIRO', 'SERVICO DE CHAVEIRO'],
    ['8240', 'SOLDA', 'MAO DE OBRA SOLDADOR'],
    ['20580', 'TACOGRAFO', 'AFERICAO'],
  ];
  for (const [codigo, categoria, subcategoria] of expected) {
    assert.deepEqual(resolvePoliItemCategory({ codigo_poli: codigo, tipo: 'SERVICO' }), { categoria_gerencial: categoria, subcategoria_gerencial: subcategoria, origem_classificacao: 'CODIGO_POLI_APROVADO', aprovacao: 'APROVADO' });
  }
  assert.equal(resolvePoliItemCategory({ codigo_poli: '142', tipo: 'PRODUTO' }).categoria_gerencial, null);
});

test('mantém código desconhecido sem classificação gerencial', () => {
  const result = resolvePoliItemCategory({ codigo_poli: '2226', tipo: 'SERVICO' });
  assert.equal(result.categoria_gerencial, 'MANUTENCAO_PREVENTIVA');
  assert.equal(resolvePoliItemCategory({ codigo_poli: '999999', tipo: 'SERVICO' }).categoria_gerencial, null);
});

test('distingue ausência de código de código não mapeado', () => {
  assert.equal(resolvePoliItemCategory({ tipo: 'SERVICO' }).origem_classificacao, 'SEM_CODIGO');
  assert.equal(resolvePoliItemCategory({ codigo_poli: '999999', tipo: 'SERVICO' }).origem_classificacao, 'CODIGO_NAO_MAPEADO');
});
