import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { abastecimentoDestinatarioTipos, abastecimentoPontoTipos, abastecimentoPreviewStatuses } from '../src/types/abastecimentos.js';

test('migration 010 define a fundação do módulo sem campo de diferença', async () => {
  const sql = await readFile(new URL('../database/migrations/010_create_abastecimentos_schema.sql', import.meta.url), 'utf8');
  for (const table of ['abastecimento_produtos', 'abastecimento_pontos', 'abastecimento_pontos_produtos', 'abastecimento_bicos', 'abastecimento_terceiros', 'abastecimento_destinacoes_especiais', 'abastecimento_entradas', 'abastecimento_entrada_destinos', 'abastecimento_importacoes', 'abastecimento_importacao_itens', 'abastecimentos']) assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`));
  assert.match(sql, /valor_total NUMERIC\(14,4\)/);
  assert.match(sql, /valor_total_nf NUMERIC\(14,2\)/);
  assert.match(sql, /litros NUMERIC\(14,3\)/);
  assert.match(sql, /obra_id UUID NOT NULL REFERENCES obras/);
  assert.match(sql, /UNIQUE \(origem_sistema, identificador_externo\)/);
  assert.doesNotMatch(sql, /diferenca/i);
});

test('contratos fechados representam produtos, pontos, destinatários e preview', () => {
  assert.deepEqual(abastecimentoPontoTipos, ['COMBOIO', 'POSTO', 'CAMINHAO_TANQUE', 'OUTRO']);
  assert.deepEqual(abastecimentoDestinatarioTipos, ['FROTA', 'TERCEIRO', 'EXTERNA', 'ESPECIAL']);
  assert.ok(abastecimentoPreviewStatuses.includes('PENDENTE_OBRA'));
  assert.ok(abastecimentoPreviewStatuses.includes('FORA_ESCOPO'));
});

test('seeds não associam bicos observados a ponto operacional e não configuram CTC01', async () => {
  const sql = await readFile(new URL('../database/migrations/010_create_abastecimentos_schema.sql', import.meta.url), 'utf8');
  assert.match(sql, /INSERT INTO abastecimento_bicos \(codigo, descricao, produto_id\)/);
  const bicoSeed = /INSERT INTO abastecimento_bicos[\s\S]*?;/.exec(sql)?.[0] ?? '';
  assert.doesNotMatch(bicoSeed, /ponto_id/i);
  const compatibilitySeed = /INSERT INTO abastecimento_pontos_produtos[\s\S]*?;/.exec(sql)?.[0] ?? '';
  assert.doesNotMatch(compatibilitySeed, /CTC01.*DIESEL_S(?:500|10)/s);
});
