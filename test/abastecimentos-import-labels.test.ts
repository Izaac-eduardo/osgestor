import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDestinationLabel } from '../frontend/src/utils/abastecimentos-import-labels.ts';

test('labels de destinatário usam travessão Unicode sem mojibake', () => {
  assert.equal(formatDestinationLabel('PIRULITO', 'PIRULITO'), 'PIRULITO — PIRULITO');
  assert.equal(formatDestinationLabel('CE02C', 'CE02C'), 'CE02C — CE02C');
  assert.doesNotMatch(formatDestinationLabel('CE02C', 'CE02C'), /â€”|Ã/);
});
