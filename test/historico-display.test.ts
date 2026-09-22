import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatOptionalQuantity } from '../frontend/src/utils/historico-display.ts';

test('histórico preserva horímetro e Km/Hr. ausente, zero e informado', () => {
  assert.equal(formatOptionalQuantity(null), '-');
  assert.equal(formatOptionalQuantity(undefined), '-');
  assert.equal(formatOptionalQuantity(0), '0');
  assert.equal(formatOptionalQuantity(142.6), '142,6');
});
