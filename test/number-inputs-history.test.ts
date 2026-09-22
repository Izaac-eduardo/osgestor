import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAbastecimentoValueInput, formatAbastecimentoValueInputText, formatLitersNumberInput, parseCurrencyInput, parseLitersInput } from '../frontend/src/utils/number-inputs.ts';

test('formulário preserva litros numéricos da API sem multiplicação', () => {
  for (const value of [6.8, 11.4, 35.3, 70.9, 85.9, 100.9, 157.7, 188.6, 189.9, 203.6, 0, 0.5, 1.25, 10.5, 1250.5]) assert.equal(parseLitersInput(formatLitersNumberInput(value)), value);
  assert.equal(parseLitersInput(formatLitersNumberInput(157.7)), 157.7);
});

test('valor do histórico preserva até quatro casas, separado da máscara de Entrada', () => {
  for (const value of [991.933, 1280.644, 71.706, 10.1234, 100, 100.5, 100.123]) assert.equal(parseCurrencyInput(formatAbastecimentoValueInput(value)), value);
  assert.equal(formatAbastecimentoValueInputText('100,1234'), '100,1234');
});
