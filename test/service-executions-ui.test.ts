import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateWorkDurationMinutes } from '../frontend/src/utils/work-duration';

const source = readFileSync(new URL('../frontend/src/components/orders/ServiceExecutions.tsx', import.meta.url), 'utf8');

test('período de 08:10 a 09:30 calcula 1h20min', () => {
  assert.equal(calculateWorkDurationMinutes('2026-11-06', '08:10', '09:30'), 80);
});

test('duração inválida ou incompleta não permite submissão', () => {
  assert.equal(calculateWorkDurationMinutes('2026-11-06', '09:30', '08:10'), -80);
  assert.equal(calculateWorkDurationMinutes('2026-11-06', '', '09:30'), 0);
});

test('formulário de período não é aninhado e não navega', () => {
  assert.doesNotMatch(source, /<form className="item-form"/);
  assert.match(source, /className="item-form" role="dialog"/);
  assert.match(source, /type="button" onClick=\{submit\}/);
  assert.match(source, /const submit = \(\) => \{/);
});

test('ações de editar e excluir período não submetem o formulário da O.S.', () => {
  assert.match(source, /type="button" aria-label="Editar período"/);
  assert.match(source, /type="button" aria-label="Excluir período"/);
});

test('o fluxo mantém atualização, modal e mensagem de erro no estado React', () => {
  assert.match(source, /setEditing\(undefined\)/);
  assert.match(source, /await onRefresh\(false/);
  assert.match(source, /setError\(message\(caught\)\)/);
  assert.match(source, /role="alert"/);
});
