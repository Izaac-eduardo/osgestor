import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findFleetMatchWithAliasPrecedence } from '../src/imports/poli-os.js';
import { POLIFROTA_ORIGIN, POLI_ORIGIN, VEGA_ORIGIN, type ExternalFleetIdentifier } from '../src/services/frota-identificadores.service.js';

const fleet = (id: string, codigo: string, status = 'ATIVO') => ({ id, codigo, placa: null, status });
const alias = (frota_id: string, origem: string, identificador_normalizado: string): ExternalFleetIdentifier => ({ frota_id, origem, identificador_normalizado });

test('POLI reutiliza alias POLIFROTA somente quando a origem compatível é inequívoca', () => {
  const fleets = [fleet('pc06', 'PC06'), fleet('other', 'OT01')];
  const result = findFleetMatchWithAliasPrecedence('924K', fleets, [alias('pc06', POLIFROTA_ORIGIN, '924K')], [POLI_ORIGIN, POLIFROTA_ORIGIN]);
  assert.deepEqual(result, { id: 'pc06', aliasOrigin: POLIFROTA_ORIGIN });
});
test('conflito entre origens mantém a frota pendente', () => {
  const fleets = [fleet('a', 'A01'), fleet('b', 'B01')];
  const result = findFleetMatchWithAliasPrecedence('MESMO', fleets, [alias('a', POLI_ORIGIN, 'MESMO'), alias('b', POLIFROTA_ORIGIN, 'MESMO')], [POLI_ORIGIN, POLIFROTA_ORIGIN]);
  assert.equal(result, undefined);
});
test('alias de frota inativa não resolve automaticamente', () => {
  const result = findFleetMatchWithAliasPrecedence('INATIVO', [fleet('inactive', 'IN01', 'INATIVO')], [alias('inactive', POLIFROTA_ORIGIN, 'INATIVO')], [POLI_ORIGIN, POLIFROTA_ORIGIN]);
  assert.equal(result, undefined);
});

test('alias VEGA continua restrito à origem VEGA', () => {
  const fleets = [fleet('vega', 'V01')];
  assert.deepEqual(findFleetMatchWithAliasPrecedence('EXT01', fleets, [alias('vega', VEGA_ORIGIN, 'EXT01')], [VEGA_ORIGIN]), { id: 'vega', aliasOrigin: VEGA_ORIGIN });
  assert.equal(findFleetMatchWithAliasPrecedence('EXT01', fleets, [alias('vega', VEGA_ORIGIN, 'EXT01')], [POLI_ORIGIN, POLIFROTA_ORIGIN]), undefined);
});

test('identificador historicamente ambíguo resolve quando há um único alias ativo', () => {
  const fleets = [fleet('a', 'RCP03')];
  assert.deepEqual(findFleetMatchWithAliasPrecedence('CW34', fleets, [alias('a', POLIFROTA_ORIGIN, 'CW34')], [POLI_ORIGIN, POLIFROTA_ORIGIN]), { id: 'a', aliasOrigin: POLIFROTA_ORIGIN });
});

test('identificador historicamente ambíguo permanece pendente quando há colisão', () => {
  const fleets = [fleet('a', 'RCP03'), fleet('b', 'RC08')];
  assert.equal(findFleetMatchWithAliasPrecedence('CW34', fleets, [alias('a', POLIFROTA_ORIGIN, 'CW34'), alias('b', POLI_ORIGIN, 'CW34')], [POLI_ORIGIN, POLIFROTA_ORIGIN]), undefined);
});
