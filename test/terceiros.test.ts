import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarTerceiros, findExactThirdParty, normalizeTerceiroIdentificacao, parseTerceiros } from '../src/imports/terceiros.js';
import { resolveThirdPartyExact } from '../src/services/abastecimentos-terceiros-matching.service.js';

const row = (nome: string, placa: string, frota = placa) => ({ linhaOriginal: 1, nomeOriginal: nome, nomeNormalizado: nome, placaOriginal: placa, placaNormalizada: normalizeTerceiroIdentificacao(placa), frotaOriginal: frota, frotaNormalizada: normalizeTerceiroIdentificacao(frota), identificacoes: [{ valorOriginal: placa, valorNormalizado: normalizeTerceiroIdentificacao(placa)!, tipo: 'PLACA' as const }], completa: true });

test('normaliza pontuação sem confundir JVD5J65 com JUD5J65', () => {
  assert.equal(normalizeTerceiroIdentificacao(' JVD-5J65 '), 'JVD5J65');
  assert.notEqual(normalizeTerceiroIdentificacao('JVD5J65'), normalizeTerceiroIdentificacao('JUD5J65'));
});

test('encontra terceiro por identificação exata e permite várias identificações', () => {
  const rows = [row('ALVES TRANSPORTE', 'AZT5H05'), row('ALVES TRANSPORTE', 'AWT7G89'), row('CATARINA', 'JVD5J65')];
  assert.equal(findExactThirdParty(rows, 'AZT5H05')[0]?.nomeOriginal, 'ALVES TRANSPORTE');
  assert.equal(findExactThirdParty(rows, 'JVD5J65')[0]?.nomeOriginal, 'CATARINA');
});

test('detecta conflito ativo da mesma identificação para terceiros diferentes', () => {
  const rows = [row('A', 'X1'), row('B', 'X1')];
  assert.equal(diagnosticarTerceiros(rows, 'x', 's').conflitosEntreTerceiros.length, 1);
});

test('não cria terceiro para identificação sem cadastro e preserva regras especiais/frota', () => {
  const rows = [row('ALVES TRANSPORTE', 'AZT5H05'), row('CATARINA', 'JVD5J65')];
  assert.equal(resolveThirdPartyExact(rows, 'UNKNOWN', 'UNKNOWN', new Set()).tipo, 'PENDENTE');
  assert.deepEqual(resolveThirdPartyExact(rows, 'PIRULITO', 'PIRULITO', new Set()), { tipo: 'ESPECIAL', codigo: 'PIRULITO' });
  assert.deepEqual(resolveThirdPartyExact(rows, 'CE02C', 'CE02C', new Set(['CE02C'])), { tipo: 'FROTA_PROPRIA', codigo: 'CE02C' });
});

test('não mapeia CE02C/CE04C para terceiros e mantém matching sem fuzzy', () => {
  const rows = [row('ALVES TRANSPORTE', 'AZT5H05'), row('CATARINA', 'JVD5J65'), row('2T TERRAPLANAGEM', 'JUD5J65')];
  assert.equal(findExactThirdParty(rows, 'CE02C').length, 0);
  assert.equal(findExactThirdParty(rows, 'CE04C').length, 0);
  assert.equal(findExactThirdParty(rows, 'JVD5J65')[0]?.nomeOriginal, 'CATARINA');
  assert.equal(findExactThirdParty(rows, 'JUD5J65')[0]?.nomeOriginal, '2T TERRAPLANAGEM');
});
