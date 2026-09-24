import assert from 'node:assert/strict';
import test from 'node:test';
import { polifrotaIdentificacao } from '../../frontend/src/utils/polifrota-labels.js';

test('identificação visual do PoliFrota prioriza placa, depois frota, e usa fallback amigável', () => {
  assert.equal(polifrotaIdentificacao('ABC1D23', 'CAMINHAO01'), 'ABC1D23');
  assert.equal(polifrotaIdentificacao(null, 'CAMINHAO01'), 'CAMINHAO01');
  assert.equal(polifrotaIdentificacao('', '  '), 'Sem frota/placa');
});
