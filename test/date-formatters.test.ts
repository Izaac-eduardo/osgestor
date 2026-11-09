import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate } from '../frontend/src/utils/formatters.ts';

test('formatDate não desloca DATE SQL nem timestamp ISO de fechamento', () => {
  assert.equal(formatDate('2026-09-14'), '14/09/2026');
  assert.equal(formatDate('2026-09-14T03:00:00.000Z'), '14/09/2026');
  assert.equal(formatDate('2026-09-14T23:00:00-03:00'), '14/09/2026');
  assert.equal(formatDate(null), '—');
});
