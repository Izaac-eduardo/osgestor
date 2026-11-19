import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fleetCodesEquivalent, resolveFleetByPrefixAndNumber, resolveUniqueFleetId } from '../src/services/frota-resolver.service.js';
import { findFleetMatchWithAliasPrecedence } from '../src/imports/poli-os.js';

function fakeDb(ids: string[]) {
  return { query: async () => ({ rows: ids.map(id => ({ id })) }) } as never;
}

test('resolve códigos equivalentes por prefixo e número', () => {
  assert.equal(fleetCodesEquivalent('CC-4', 'CC04'), true);
  assert.equal(fleetCodesEquivalent('EP-3', 'EP03'), true);
  assert.equal(fleetCodesEquivalent('FA-7', 'FA07'), true);
  assert.equal(fleetCodesEquivalent('CC-4', 'CT04'), false);
});
test('não escolhe frota ausente ou ambígua', () => {
  assert.deepEqual(resolveUniqueFleetId([]), { status: 'MISSING' });
  assert.deepEqual(resolveUniqueFleetId(['a', 'a']), { status: 'UNIQUE', frotaId: 'a' });
  assert.deepEqual(resolveUniqueFleetId(['a', 'b']), { status: 'AMBIGUOUS', frotaIds: ['a', 'b'] });
});
test('consulta por prefixo e número retorna somente correspondência única', async () => {
  assert.deepEqual(await resolveFleetByPrefixAndNumber(fakeDb(['fleet-1']), 'prefix-1', 4), { status: 'UNIQUE', frotaId: 'fleet-1' });
  assert.deepEqual(await resolveFleetByPrefixAndNumber(fakeDb([]), 'prefix-1', 4), { status: 'MISSING' });
  assert.deepEqual(await resolveFleetByPrefixAndNumber(fakeDb(['fleet-1', 'fleet-2']), 'prefix-1', 4), { status: 'AMBIGUOUS', frotaIds: ['fleet-1', 'fleet-2'] });
});

test('matching da importação aceita zeros à esquerda sem aceitar conflito', () => {
  const fleets = [
    { id: 'pa07', codigo: 'PA07', placa: null, status: 'ATIVO' },
    { id: 'pa08', codigo: 'PA08', placa: null, status: 'ATIVO' },
  ];
  assert.deepEqual(findFleetMatchWithAliasPrecedence('PA-7', fleets, [], []), { id: 'pa07', aliasOrigin: undefined });
  assert.equal(findFleetMatchWithAliasPrecedence('PA-9', fleets, [], []), undefined);
  assert.equal(findFleetMatchWithAliasPrecedence('PA-7', [...fleets, { id: 'pa07b', codigo: 'PA7', placa: null, status: 'ATIVO' }], [], []), undefined);
});
