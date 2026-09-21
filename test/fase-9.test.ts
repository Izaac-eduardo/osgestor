import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeTerceiroIdentificacao } from '../src/imports/terceiros.js';

test('migration 011 suporta identificação GERAL e protege a unicidade ativa', () => {
  const sql = fs.readFileSync('database/migrations/011_create_abastecimento_terceiro_identificacoes.sql', 'utf8');
  assert.match(sql, /tipo IN \('PLACA', 'FROTA_EXTERNA', 'GERAL', 'CODIGO', 'OUTRO'\)/);
  assert.match(sql, /uq_abastecimento_terceiro_identificacao_ativa/);
  assert.match(sql, /WHERE status = 'ATIVO'/);
});

test('identificações gerais e placas mantêm distinção sem fuzzy', () => {
  assert.equal(normalizeTerceiroIdentificacao('PLANURB'), 'PLANURB');
  assert.equal(normalizeTerceiroIdentificacao('2T01'), '2T01');
  assert.notEqual(normalizeTerceiroIdentificacao('JVD5J65'), normalizeTerceiroIdentificacao('JUD5J65'));
});
