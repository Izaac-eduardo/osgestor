import assert from 'node:assert/strict';
import test from 'node:test';
import { persistManualResolutions } from '../src/services/importacoes-os-resolucoes.service.js';
import type { ParsedOs } from '../src/imports/poli-os.js';

test('resolução manual da obra continua na prévia quando a migration 033 não existe', async () => {
  const queries: unknown[][] = [];
  const client = {
    async query(...args: unknown[]) {
      queries.push(args);
      if (args[0] === 'ROLLBACK' || args[0] === 'BEGIN') return { rows: [] };
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    },
  };
  const item = {
    numeroOs: 48110,
    origem: '0710OS.XLS',
    parecerOriginal: 'OBRA-ORIGINAL',
    manualResolucoes: [{
      campo: 'obraId', valorOrigem: null, identificadorOriginal: 'OBRA-ORIGINAL',
      valorSelecionado: '00000000-0000-4000-8000-000000000001', arquivoOrigem: '0710OS.XLS',
      importacaoId: '00000000-0000-4000-8000-000000000002', numeroOs: 48110,
      decisao: 'APROVAR', decididoEm: new Date().toISOString(), decididoPor: null,
    }],
  } as unknown as ParsedOs;
  await assert.doesNotReject(() => persistManualResolutions(
    client as never,
    { arquivoNome: '0710OS.XLS', origemSistema: 'POLI', hashArquivo: 'a'.repeat(64), tamanhoArquivo: 1, tipoImportacao: 'DIARIA' },
    item,
  ));
  assert.deepEqual(queries.map(([sql]) => sql), [
    queries[0]?.[0],
    'ROLLBACK',
    'BEGIN',
  ]);
});
