import assert from 'node:assert/strict';
import test from 'node:test';
import { contabilPreviewBlocksConfirmation, summarizeContabilPreviewItems } from '../src/imports/contabilidade-preview.js';

const item = (overrides: Record<string, unknown> = {}) => ({
  classificacao: 'PECAS_EXTERNAS' as const,
  valor_total: 100,
  combustivel_status: null,
  despesa_compartilhada_status: 'NAO_COMPARTILHADA' as const,
  valor_total_invalido: false,
  duplicado_no_arquivo: false,
  duplicidade_revisada: false,
  duplicado_em_importacao_anterior: false,
  ...overrides,
});

test('despesa compartilhada pendente não bloqueia a confirmação', () => {
  assert.equal(contabilPreviewBlocksConfirmation([
    item({ despesa_compartilhada_status: 'AGUARDANDO_DECISAO', valor_total: 110543.56 }),
  ], 0), false);
});

test('erros efetivos continuam bloqueando a confirmação', () => {
  assert.equal(contabilPreviewBlocksConfirmation([item({ valor_total_invalido: true })], 0), true);
  assert.equal(contabilPreviewBlocksConfirmation([item({ duplicado_em_importacao_anterior: true })], 0), true);
  assert.equal(contabilPreviewBlocksConfirmation([item({ duplicado_no_arquivo: true })], 0), true);
  assert.equal(contabilPreviewBlocksConfirmation([item({ duplicado_no_arquivo: true, duplicidade_revisada: true })], 0), false);
  assert.equal(contabilPreviewBlocksConfirmation([item({ combustivel_status: 'AMBIGUO' })], 0), true);
  assert.equal(contabilPreviewBlocksConfirmation([item()], 1), true);
  assert.equal(contabilPreviewBlocksConfirmation([item()], 0, true), true);
  assert.equal(contabilPreviewBlocksConfirmation([item()], 0, false, 1), true);
  assert.equal(contabilPreviewBlocksConfirmation([item()], 0, false, 0, true), true);
});

test('a prévia separa classificação pendente, compartilhada pendente e combustível excluído', () => {
  const summary = summarizeContabilPreviewItems([
    item({ classificacao: 'PENDENTE', valor_total: 42 }),
    item({ despesa_compartilhada_status: 'AGUARDANDO_DECISAO', valor_total: 58 }),
    item({ classificacao: 'PENDENTE', combustivel_status: 'FORA_ESCOPO_COMBUSTIVEL', valor_total: 70 }),
  ]);
  assert.deepEqual(summary, {
    valorPendenteClassificacao: 42,
    valorCompartilhadoAguardando: 58,
    valorExcluidoEscopo: 70,
  });
});
