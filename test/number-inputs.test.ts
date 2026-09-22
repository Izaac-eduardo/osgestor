import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCurrencyCentsInput, formatCurrencyInput, formatCurrencyNumber, formatLitersInput, formatLitersNumber, parseCurrencyInput, parseLitersInput } from '../frontend/src/utils/number-inputs.ts';

test('máscara de litros aceita pt-BR, milhares e no máximo três casas', () => {
  assert.equal(formatLitersInput('0'), '0'); assert.equal(parseLitersInput('0'), 0);
  assert.equal(formatLitersInput('10,5'), '10,5'); assert.equal(formatLitersInput('10,500'), '10,500');
  assert.equal(formatLitersInput('1250,500'), '1.250,500'); assert.equal(parseLitersInput('1.250,500'), 1250.5);
  assert.equal(formatLitersInput('10,1239'), '10,123');
  assert.equal(formatLitersNumber(1250.5), '1.250,500');
});

test('máscara de moeda separa visual e payload numérico', () => {
  assert.equal(formatCurrencyInput('0', true), 'R$ 0,00'); assert.equal(parseCurrencyInput('R$ 0,00'), 0);
  assert.equal(formatCurrencyInput('10', true), 'R$ 10,00'); assert.equal(formatCurrencyInput('10,5', true), 'R$ 10,50');
  assert.equal(formatCurrencyInput('1250,90', true), 'R$ 1.250,90'); assert.equal(parseCurrencyInput('R$ 1.250,90'), 1250.9);
});

test('máscara monetária por centavos interpreta a digitação sem perder escala', () => {
  assert.equal(formatCurrencyCentsInput('1'), 'R$ 0,01');
  assert.equal(formatCurrencyCentsInput('10'), 'R$ 0,10');
  assert.equal(formatCurrencyCentsInput('100'), 'R$ 1,00');
  assert.equal(formatCurrencyCentsInput('1050'), 'R$ 10,50');
  assert.equal(formatCurrencyCentsInput('9177725'), 'R$ 91.777,25');
  assert.equal(parseCurrencyInput(formatCurrencyCentsInput('9177725')), 91777.25);
  assert.equal(formatCurrencyNumber(91777.25), 'R$ 91.777,25');
  assert.equal(formatCurrencyCentsInput(''), '');
});
