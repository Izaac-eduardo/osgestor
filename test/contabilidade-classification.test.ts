import assert from 'node:assert/strict';
import test from 'node:test';
import { applyContabilSharedDecision, canDecideContabilSharedExpense, classifyContabilSpecialStatus } from '../src/imports/contabilidade.js';

test('somente as quatro descrições autorizadas ficam fora do escopo', () => {
  for (const produto of ['OLEO DIESEL S10 - COMUM', 'OLEO DIESEL S500 - COMUM', 'GASOLINA COMUM VARIAS DISTRIBUIDORAS', 'ETANOL HIDRATADO COMUM']) assert.equal(classifyContabilSpecialStatus(produto, 'CP01').despesaCompartilhadaStatus, 'FORA_ESCOPO_COMBUSTIVEL');
  assert.equal(classifyContabilSpecialStatus('ARLA 32', 'CP01').despesaCompartilhadaStatus, 'NAO_COMPARTILHADA');
  assert.equal(classifyContabilSpecialStatus('FILTRO DE COMBUSTIVEL', 'CP01').despesaCompartilhadaStatus, 'NAO_COMPARTILHADA');
  assert.equal(classifyContabilSpecialStatus('BOMBA DE COMBUSTIVEL', 'CP01').despesaCompartilhadaStatus, 'NAO_COMPARTILHADA');
});

test('FROTAS DIVERSAS aguarda decisão e não recebe frota artificial', () => {
  assert.equal(classifyContabilSpecialStatus('ROLAMENTO', 'FROTAS DIVERSAS').despesaCompartilhadaStatus, 'AGUARDANDO_DECISAO');
  assert.equal(classifyContabilSpecialStatus('ROLAMENTO', 'CP01').despesaCompartilhadaStatus, 'NAO_COMPARTILHADA');
});

test('decisões compartilhadas têm transições explícitas e somente ADMIN decide', () => {
  assert.equal(applyContabilSharedDecision('APROVAR'), 'APROVADA');
  assert.equal(applyContabilSharedDecision('DESCONSIDERAR'), 'DESCONSIDERADA');
  assert.equal(applyContabilSharedDecision('AGUARDAR'), 'AGUARDANDO_DECISAO');
  assert.equal(canDecideContabilSharedExpense('ADMIN'), true);
  assert.equal(canDecideContabilSharedExpense('GESTOR'), false);
  assert.equal(canDecideContabilSharedExpense('OPERADOR'), false);
});
