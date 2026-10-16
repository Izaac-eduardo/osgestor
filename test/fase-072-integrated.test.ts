import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';
import { pool } from '../src/config/database.js';
import { parsePoliOs, matchPreview, type ParsedOs } from '../src/imports/poli-os.js';
import { resolve } from '../src/controllers/importacoes-os.controller.js';

assert.equal(process.env.DB_NAME, 'oficina_teste_fase051', 'este teste exige o banco isolado da Fase 057');

const token = randomUUID();
const responseOf = () => {
  const output = { statusCode: 200, body: undefined as unknown, status(code: number) { output.statusCode = code; return output; }, json(value: unknown) { output.body = value; return output; } };
  return output;
};

test('homologa 0710OS.XLS com catálogo completo e quatro decisões individuais', async () => {
  const database = await pool.query<{ current_database: string; current_schema: string }>('SELECT current_database(),current_schema()');
  assert.equal(database.rows[0]?.current_database, 'oficina_teste_fase051');
  assert.equal(database.rows[0]?.current_schema, 'public');
  const source = readFileSync('C:/Users/User/Downloads/0710OS.XLS');
  const items = await matchPreview(parsePoliOs(source, '0710OS.XLS'));
  assert.equal(items.length, 155);
  assert.equal(items.filter(item => item.pendencias.some(value => value.startsWith('OBRA_PENDENTE'))).length, 8);
  assert.equal(items.filter(item => item.pendencias.some(value => value.startsWith('FROTA_PENDENTE'))).length, 0);

  const targetCodes = ['RCP03', 'RC08', 'RE05'];
  const targets = (await pool.query<{ codigo: string; id: string }>(`SELECT codigo,id FROM frotas WHERE codigo=ANY($1::text[]) AND status='ATIVO'`, [targetCodes])).rows;
  assert.equal(targets.length, 3);
  const targetByCode = new Map(targets.map(value => [value.codigo, value.id]));
  const decisions = new Map<number, { original: string; target: string }>([
    [48056, { original: 'CW34', target: 'RCP03' }],
    [48157, { original: 'CW34', target: 'RCP03' }],
    [48165, { original: 'CS54B', target: 'RC08' }],
    [48170, { original: '3CX', target: 'RE05' }],
  ]);
  const aliasesBefore = Number((await pool.query<{ n: string }>('SELECT count(*)::text n FROM frota_identificadores_externos')).rows[0]!.n);
  const controlsBefore = (await pool.query<{ numero_os: number; natureza_os: string }>('SELECT numero_os,natureza_os FROM ordens_servico WHERE numero_os=ANY($1::bigint[]) ORDER BY numero_os', [[47932, 47938, 47943, 47968, 48003]])).rows;
  try {
    for (const item of items) {
      item.importacaoId = token;
      const decision = decisions.get(item.numeroOs);
      if (decision) {
        item.frotaId = undefined;
        item.frotaOriginal = decision.original;
        item.pendencias = [...item.pendencias.filter(value => !value.startsWith('FROTA_PENDENTE')), 'FROTA_PENDENTE'];
        item.statusPreview = 'REQUER_REVISAO';
      }
    }
    const metadata = { arquivoNome: '0710OS.XLS', origemSistema: 'POLI', hashArquivo: createHash('sha256').update(source).digest('hex'), tamanhoArquivo: source.length, tipoImportacao: 'DIARIA' };
    await pool.query(`INSERT INTO importacoes_os(id,arquivo_nome,origem_sistema,hash_arquivo,tamanho_arquivo,tipo_importacao,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 hour')`, [token, metadata.arquivoNome, metadata.origemSistema, metadata.hashArquivo, metadata.tamanhoArquivo, metadata.tipoImportacao]);
    for (const item of items) await pool.query('INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES($1,$2,$3,$4,$5)', [token, item.numeroOs, JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias)]);

    for (const [numeroOs, decision] of decisions) {
      const response = responseOf();
      await resolve({ params: { token, numeroOs: String(numeroOs) }, body: { frotaId: targetByCode.get(decision.target), decisao: 'APROVAR' } } as never, response as never);
      assert.equal(response.statusCode, 200);
      const resolved = response.body as ParsedOs;
      assert.equal(resolved.frotaId, targetByCode.get(decision.target));
      assert.equal(resolved.manualResolucoes?.at(-1)?.identificadorOriginal, decision.original);
      assert.equal(resolved.manualResolucoes?.at(-1)?.arquivoOrigem, '0710OS.XLS');
      assert.equal(resolved.manualResolucoes?.at(-1)?.numeroOs, numeroOs);
    }

    const stored = (await pool.query<{ payload_json: ParsedOs }>('SELECT payload_json FROM importacoes_os_itens WHERE importacao_id=$1 AND numero_os=ANY($2::bigint[]) ORDER BY numero_os', [token, [...decisions.keys()]])).rows;
    assert.equal(stored.length, 4);
    assert.equal(stored.filter(row => row.payload_json.pendencias.some(value => value.startsWith('FROTA_PENDENTE'))).length, 0);
    assert.equal(Number((await pool.query<{ n: string }>('SELECT count(*)::text n FROM importacoes_os_itens WHERE importacao_id=$1 AND pendencias_json @> $2::jsonb', [token, JSON.stringify(['OBRA_PENDENTE'])])).rows[0]!.n), 8);
    assert.equal(Number((await pool.query<{ n: string }>('SELECT count(*)::text n FROM frota_identificadores_externos')).rows[0]!.n), aliasesBefore);
    const controlsAfter = (await pool.query<{ numero_os: number; natureza_os: string }>('SELECT numero_os,natureza_os FROM ordens_servico WHERE numero_os=ANY($1::bigint[]) ORDER BY numero_os', [[47932, 47938, 47943, 47968, 48003]])).rows;
    assert.deepEqual(controlsAfter, controlsBefore);
  } finally {
    await pool.query('DELETE FROM auditoria WHERE entidade_id=ANY($1::text[]) OR metadata->>\'importacao_id\'=ANY($1::text[])', [[token]]);
    await pool.query('DELETE FROM importacoes_os WHERE id=$1', [token]);
  }
});

after(async () => { await pool.end(); });
