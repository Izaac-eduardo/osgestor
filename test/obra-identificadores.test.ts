import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve as resolvePreview } from '../src/controllers/importacoes-os.controller.js';
import { matchPreview, type ParsedOs } from '../src/imports/poli-os.js';
import { pool } from '../src/config/database.js';
import {
  createExternalObraIdentifier,
  normalizeExternalObraIdentifier,
  resolveExternalObraIdentifier,
  VEGA_OBRA_ORIGIN,
} from '../src/services/obra-identificadores.service.js';

const obraIds: string[] = [];
const identifiers = ['L4 ALIAS TESTE', 'L4 ORIGEM TESTE'];
const obraCodes = [`L4-ALIAS-${randomUUID().slice(0, 8)}`, `L4-ALIAS-${randomUUID().slice(0, 8)}`];

function responseCapture() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { response.statusCode = code; return response; },
    json(value: unknown) { response.body = value; return response; },
  };
  return response;
}

test('aliases de obra normalizam, respeitam origem, unicidade e não fazem fuzzy matching', async () => {
  assert.equal(normalizeExternalObraIdentifier('  Tripoloni   Engenheiro Beltrão '), 'TRIPOLONI ENGENHEIRO BELTRAO');
  const first = (await pool.query<{ id: string }>(
    `INSERT INTO obras(codigo,nome) VALUES($1,'L4 Obra Um') RETURNING id`, [obraCodes[0]],
  )).rows[0]!;
  const second = (await pool.query<{ id: string }>(
    `INSERT INTO obras(codigo,nome) VALUES($1,'L4 Obra Dois') RETURNING id`, [obraCodes[1]],
  )).rows[0]!;
  obraIds.push(first.id, second.id);

  const created = await createExternalObraIdentifier(first.id, VEGA_OBRA_ORIGIN, identifiers[0]!);
  const repeated = await createExternalObraIdentifier(first.id, VEGA_OBRA_ORIGIN, identifiers[0]!);
  assert.equal(repeated.id, created.id);
  await createExternalObraIdentifier(second.id, 'POLI', identifiers[0]!);

  const obras = [
    { id: first.id, codigo: obraCodes[0]!, nome: 'L4 Obra Um' },
    { id: second.id, codigo: obraCodes[1]!, nome: 'L4 Obra Dois' },
  ];
  const aliases = await (await import('../src/services/obra-identificadores.service.js')).listExternalObraIdentifiers();
  assert.equal(await resolveExternalObraIdentifier(identifiers[0]!.toLowerCase(), obras, aliases), first.id);
  assert.equal(await resolveExternalObraIdentifier('L4 ALIAS', obras, aliases), undefined);
  assert.equal(await resolveExternalObraIdentifier(obraCodes[1]!, obras, aliases), second.id);
  await assert.rejects(() => createExternalObraIdentifier(second.id, VEGA_OBRA_ORIGIN, identifiers[0]!), /outra obra/);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM obra_identificadores_externos WHERE origem=$1 AND identificador_normalizado=$2', [VEGA_OBRA_ORIGIN, 'L4 ALIAS TESTE'])).rows[0].count, 1);
});

test('resolução explícita da prévia cria alias e a próxima prévia reutiliza', async () => {
  const obra = (await pool.query<{ id: string; codigo: string; nome: string }>(
    `SELECT id,codigo,nome FROM obras WHERE codigo=$1`, [obraCodes[0]],
  )).rows[0]!;
  const token = randomUUID();
  const numeroOs = 990001101;
  const item: ParsedOs = {
    numeroOs,
    data: '2026-10-01',
    cliente: null,
    frotaOriginal: null,
    parecerOriginal: identifiers[1]!,
    funcionarioAbertura: null,
    problema: 'TESTE L4',
    status: 'ABERTA',
    statusOriginal: 'Aberta',
    statusOrigem: 'AUTOMATICO',
    itens: [],
    execucoes: [],
    statusPreview: 'REQUER_REVISAO',
    pendencias: ['OBRA_PENDENTE'],
    origem: 'l4-alias-test.xlsx',
  };
  try {
    await pool.query('INSERT INTO importacoes_os(id,arquivo_nome,expires_at) VALUES($1,$2,now()+interval \'1 hour\')', [token, 'l4-alias-test.xlsx']);
    await pool.query('INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES($1,$2,$3,$4,$5)', [token, numeroOs, JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias)]);
    const response = responseCapture();
    await resolvePreview({ params: { token, numeroOs: String(numeroOs) }, body: { obraId: obra.id } } as never, response as never);
    assert.equal(response.statusCode, 200);
    const alias = (await pool.query<{ obra_id: string }>('SELECT obra_id FROM obra_identificadores_externos WHERE origem=$1 AND identificador_normalizado=$2', [VEGA_OBRA_ORIGIN, 'L4 ORIGEM TESTE'])).rows[0];
    assert.equal(alias.obra_id, obra.id);

    const next: ParsedOs = { ...item, pendencias: [], statusPreview: 'REQUER_REVISAO' };
    await matchPreview([next]);
    assert.equal(next.obraId, obra.id);
    assert.equal(next.pendencias.includes('OBRA_PENDENTE'), false);
  } finally {
    await pool.query('DELETE FROM importacoes_os WHERE id=$1', [token]);
    await pool.query('DELETE FROM obra_identificadores_externos WHERE identificador_normalizado = ANY($1::text[])', [identifiers.map(normalizeExternalObraIdentifier)]);
  }
});

test('FK da obra remove aliases ao excluir a obra', async () => {
  const obra = (await pool.query<{ id: string }>(`INSERT INTO obras(codigo,nome) VALUES('L4-CASCADE','L4 Cascade') RETURNING id`)).rows[0]!;
  await pool.query('INSERT INTO obra_identificadores_externos(obra_id,origem,identificador,identificador_normalizado) VALUES($1,$2,$3,$4)', [obra.id, VEGA_OBRA_ORIGIN, 'L4 CASCADE', 'L4 CASCADE']);
  await pool.query('DELETE FROM obras WHERE id=$1', [obra.id]);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM obra_identificadores_externos WHERE obra_id=$1', [obra.id])).rows[0].count, 0);
});

after(async () => {
  await pool.query('DELETE FROM obra_identificadores_externos WHERE identificador_normalizado = ANY($1::text[])', [identifiers.map(normalizeExternalObraIdentifier)]);
  if (obraIds.length) await pool.query('DELETE FROM obras WHERE id=ANY($1::uuid[])', [obraIds]);
  await pool.end();
});
