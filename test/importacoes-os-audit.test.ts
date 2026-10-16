import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import { confirm, resolve } from '../src/controllers/importacoes-os.controller.js';
import { synchronizeOrder } from '../src/services/sincronizacao-os.service.js';
import { hashPassword } from '../src/services/password.service.js';
import type { ParsedOs } from '../src/imports/poli-os.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

const prefix = `m5714b1_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
let actor: { id: string; username: string; email: string; role: 'ADMIN'; status: 'ATIVO'; must_change_password: false; sessionId: string; tokenHash: string };

const responseOf = () => {
  const output = { statusCode: 200, body: undefined as unknown, status(code: number) { output.statusCode = code; return output; }, json(value: unknown) { output.body = value; return output; } };
  return output;
};

const parsed = (numeroOs: number, status = 'ABERTA'): ParsedOs => ({
  numeroOs, data: '2026-10-08', cliente: null, frotaOriginal: 'TST01', frotaId: undefined,
  parecerOriginal: null, obraId: undefined, funcionarioAbertura: null, problema: 'Auditoria de importação',
  natureza: 'MATERIAL', categoriaServico: null, status, statusOriginal: 'Teste', statusOrigem: 'AUTOMATICO',
  itens: [], execucoes: [], statusPreview: 'PRONTA', pendencias: [], origem: 'm5714b1.xlsx',
});

async function refs(): Promise<{ obraId: string; frotaId: string }> {
  const result = await pool.query<{ obra_id: string; frota_id: string }>(`SELECT o.id obra_id,f.id frota_id FROM obras o CROSS JOIN frotas f WHERE o.codigo='TEST-OBRA-001' AND f.codigo='TST01'`);
  assert.equal(result.rows.length, 1);
  return { obraId: result.rows[0]!.obra_id, frotaId: result.rows[0]!.frota_id };
}

async function preview(token: string, item: ParsedOs): Promise<void> {
  await pool.query(`INSERT INTO importacoes_os(id,arquivo_nome,origem_sistema,hash_arquivo,tamanho_arquivo,tipo_importacao,expires_at) VALUES($1,'m5714b1.xlsx','POLI',repeat('a',64),100,'DIARIA',now()+interval '1 hour')`, [token]);
  await pool.query('INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES($1,$2,$3,$4,$5)', [token, item.numeroOs, JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias)]);
}

async function cleanup(numbers: number[], tokens: string[]): Promise<void> {
  if (numbers.length) await pool.query('DELETE FROM ordens_servico WHERE numero_os=ANY($1::bigint[])', [numbers]);
  if (tokens.length) {
    await pool.query('DELETE FROM auditoria WHERE entidade_id=ANY($1::text[]) OR metadata->>\'importacao_id\'=ANY($1::text[])', [tokens]);
    await pool.query('DELETE FROM importacoes_os WHERE id=ANY($1::uuid[])', [tokens]);
  }
}

before(async () => {
  const database = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(database.rows[0]?.current_database, 'oficina_test');
  const passwordHash = await hashPassword('Senha de teste M5714B1 2026!');
  const row = (await pool.query<{ id: string }>(`INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,'ADMIN','ATIVO',FALSE) RETURNING id`, [prefix, `${prefix}@example.invalid`, passwordHash])).rows[0]!;
  actor = { id: row.id, username: prefix, email: `${prefix}@example.invalid`, role: 'ADMIN', status: 'ATIVO', must_change_password: false, sessionId: randomUUID(), tokenHash: 'test-token-hash' };
});

test('confirmação de criação grava IMPORTAR no mesmo commit e correlaciona lote', async () => {
  const reference = await refs(); const number = 571400001; const token = randomUUID(); const item = parsed(number); item.obraId = reference.obraId; item.frotaId = reference.frotaId;
  try {
    await preview(token, item);
    const response = responseOf();
    await confirm({ params: { token }, authUser: actor } as never, response as never);
    assert.equal(response.statusCode, 200);
    const audit = (await pool.query<{ username: string; acao: string; dados_posteriores: Record<string, unknown>; metadata: Record<string, unknown> }>('SELECT username,acao,dados_posteriores,metadata FROM auditoria WHERE entidade_id=(SELECT id::text FROM ordens_servico WHERE numero_os=$1)', [number])).rows[0];
    assert.equal(audit.username, prefix); assert.equal(audit.acao, 'IMPORTAR'); assert.equal(audit.metadata.importacao_id, token); assert.equal(audit.metadata.operacao, 'CRIACAO'); assert.equal(audit.dados_posteriores.numero_os, number); assert.equal(JSON.stringify(audit), JSON.stringify(audit).includes('base64') ? 'never' : JSON.stringify(audit));
  } finally { await cleanup([number], [token]); }
});

test('falha da auditoria reverte a O.S. e preserva a prévia', async () => {
  const reference = await refs(); const number = 571400002; const token = randomUUID(); const item = parsed(number); item.obraId = reference.obraId; item.frotaId = reference.frotaId;
  const invalidActor = { ...actor, role: 'INVALIDO' };
  try {
    await preview(token, item); const response = responseOf();
    await confirm({ params: { token }, authUser: invalidActor } as never, response as never);
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as { importadas: number; falhas: unknown[] }).importadas, 0);
    assert.equal(Number((await pool.query('SELECT count(*)::int n FROM ordens_servico WHERE numero_os=$1', [number])).rows[0]!.n), 0);
    assert.equal(Number((await pool.query('SELECT count(*)::int n FROM importacoes_os_itens WHERE importacao_id=$1', [token])).rows[0]!.n), 1);
  } finally { await cleanup([number], [token]); }
});

test('resolução persistida grava somente allowlist de campos e identidade da sessão', async () => {
  const token = randomUUID(); const number = 571400003; const item = parsed(number); item.pendencias = ['OBRA_PENDENTE']; item.statusPreview = 'REQUER_REVISAO';
  try {
    await preview(token, item); const response = responseOf();
    await resolve({ params: { token, numeroOs: String(number) }, body: { obraId: (await refs()).obraId, decisao: 'APROVAR' }, authUser: actor } as never, response as never);
    assert.equal(response.statusCode, 200);
    const audit = (await pool.query<{ username: string; acao: string; metadata: Record<string, unknown>; dados_anteriores: Record<string, unknown> }>('SELECT username,acao,metadata,dados_anteriores FROM auditoria WHERE entidade_id=$1 ORDER BY created_at DESC LIMIT 1', [`${token}:${number}`])).rows[0];
    assert.equal(audit.username, prefix); assert.equal(audit.acao, 'EDITAR'); assert.equal(audit.metadata.operacao, 'RESOLUCAO_PENDENCIA'); assert.deepEqual(Object.keys(audit.dados_anteriores).sort(), ['categoria_servico' in audit.dados_anteriores ? 'categoria_servico' : 'frota_id', 'manual_resolucoes', 'natureza', 'numero_os', 'obra_id', 'problema', 'prestador_terceiro', 'servicos', 'status'].sort()); assert.equal((audit.dados_anteriores.manual_resolucoes as unknown[]).length, 0);
  } finally { await cleanup([], [token]); }
});

test('atualização segura grava IMPORTAR com snapshots anterior/posterior', async () => {
  const reference = await refs(); const number = 571400004; const token = randomUUID(); const item = parsed(number, 'ABERTA'); item.obraId = reference.obraId; item.frotaId = reference.frotaId;
  try {
    const order = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status,observacoes) VALUES($1,$2,$3,'MATERIAL','2026-10-08','ABERTA','Auditoria de importação') RETURNING id`, [number, reference.obraId, reference.frotaId])).rows[0]!;
    await preview(token, item); item.importacaoId = token; item.status = 'FINALIZADA';
    await synchronizeOrder(item, actor);
    const audit = (await pool.query<{ acao: string; metadata: Record<string, unknown>; dados_anteriores: Record<string, unknown>; dados_posteriores: Record<string, unknown> }>('SELECT acao,metadata,dados_anteriores,dados_posteriores FROM auditoria WHERE entidade_id=$1 ORDER BY created_at DESC LIMIT 1', [order.id])).rows[0];
    assert.equal(audit.acao, 'IMPORTAR'); assert.equal(audit.metadata.operacao, 'ATUALIZACAO'); assert.equal(audit.dados_anteriores.status, 'ABERTA'); assert.equal(audit.dados_posteriores.status, 'FINALIZADA');
  } finally { await cleanup([number], [token]); }
});

test('resoluções individuais de frota e obra ficam vinculadas ao lote e à O.S.', async () => {
  const reference = await refs();
  const fleetNumber = 571400005; const fleetToken = randomUUID(); const fleetItem = parsed(fleetNumber);
  fleetItem.frotaOriginal = 'CANDIDATO-FROTA'; fleetItem.pendencias = ['FROTA_PENDENTE']; fleetItem.statusPreview = 'REQUER_REVISAO';
  const obraNumber = 571400006; const obraToken = randomUUID(); const obraItem = parsed(obraNumber);
  obraItem.parecerOriginal = 'CANDIDATO-OBRA'; obraItem.pendencias = ['OBRA_PENDENTE']; obraItem.statusPreview = 'REQUER_REVISAO';
  const aliasesBefore = Number((await pool.query<{ n: string }>(`SELECT count(*)::text n FROM frota_identificadores_externos WHERE origem='POLI'`)).rows[0]!.n);
  try {
    await preview(fleetToken, fleetItem); await preview(obraToken, obraItem);
    const fleetResponse = responseOf();
    await resolve({ params: { token: fleetToken, numeroOs: String(fleetNumber) }, body: { frotaId: reference.frotaId, decisao: 'APROVADA' }, authUser: actor } as never, fleetResponse as never);
    assert.equal(fleetResponse.statusCode, 200);
    const resolvedFleet = fleetResponse.body as ParsedOs;
    assert.equal(resolvedFleet.frotaId, reference.frotaId);
    assert.equal(resolvedFleet.manualResolucoes?.[0]?.campo, 'frotaId');
    assert.equal(resolvedFleet.manualResolucoes?.[0]?.identificadorOriginal, 'CANDIDATO-FROTA');
    assert.equal(resolvedFleet.manualResolucoes?.[0]?.arquivoOrigem, 'm5714b1.xlsx');
    assert.equal(resolvedFleet.manualResolucoes?.[0]?.importacaoId, fleetToken);
    assert.equal(resolvedFleet.manualResolucoes?.[0]?.decisao, 'APROVAR');

    const obraResponse = responseOf();
    await resolve({ params: { token: obraToken, numeroOs: String(obraNumber) }, body: { obraId: reference.obraId, decisao: 'APROVAR CANDIDATO' }, authUser: actor } as never, obraResponse as never);
    assert.equal(obraResponse.statusCode, 200);
    const resolvedObra = obraResponse.body as ParsedOs;
    assert.equal(resolvedObra.obraId, reference.obraId);
    assert.equal(resolvedObra.manualResolucoes?.[0]?.campo, 'obraId');
    assert.equal(resolvedObra.manualResolucoes?.[0]?.identificadorOriginal, 'CANDIDATO-OBRA');
    assert.equal(resolvedObra.manualResolucoes?.[0]?.importacaoId, obraToken);
    assert.equal(Number((await pool.query<{ n: string }>(`SELECT count(*)::text n FROM frota_identificadores_externos WHERE origem='POLI'`)).rows[0]!.n), aliasesBefore);
  } finally { await cleanup([], [fleetToken, obraToken]); }
});

test('valida no ambiente isolado as quatro decisões de frota da carga 0710OS', async () => {
  const createdFleetIds: string[] = [];
  const existing = (await pool.query<{ codigo: string; id: string }>(`SELECT codigo,id FROM frotas WHERE codigo = ANY($1::text[]) AND status='ATIVO'`, [['RCP03', 'RC08', 'RE05']])).rows;
  for (const code of ['RCP03', 'RC08', 'RE05']) if (!existing.some(value => value.codigo === code)) {
    const row = (await pool.query<{ id: string }>(`INSERT INTO frotas(codigo,descricao,status) VALUES($1,$2,'ATIVO') RETURNING id`, [code, `Fixture Fase 070 ${code}`])).rows[0]!;
    createdFleetIds.push(row.id);
  }
  const targets = (await pool.query<{ codigo: string; id: string }>(`SELECT codigo,id FROM frotas WHERE codigo = ANY($1::text[]) AND status='ATIVO'`, [['RCP03', 'RC08', 'RE05']])).rows;
  assert.equal(targets.length, 3);
  const byCode = new Map(targets.map(value => [value.codigo, value.id]));
  const decisions = [
    { numeroOs: 48056, original: 'CW34', destino: 'RCP03' },
    { numeroOs: 48157, original: 'CW34', destino: 'RCP03' },
    { numeroOs: 48165, original: 'CS54B', destino: 'RC08' },
    { numeroOs: 48170, original: '3CX', destino: 'RE05' },
  ];
  const tokens: string[] = [];
  try {
    for (const decision of decisions) {
      const token = randomUUID(); tokens.push(token);
      const item = parsed(decision.numeroOs); item.frotaOriginal = decision.original; item.pendencias = ['FROTA_PENDENTE']; item.statusPreview = 'REQUER_REVISAO';
      await preview(token, item);
      const response = responseOf();
      await resolve({ params: { token, numeroOs: String(decision.numeroOs) }, body: { frotaId: byCode.get(decision.destino), decisao: 'APROVAR' }, authUser: actor } as never, response as never);
      assert.equal(response.statusCode, 200);
      const resolved = response.body as ParsedOs;
      assert.equal(resolved.frotaId, byCode.get(decision.destino));
      assert.equal(resolved.manualResolucoes?.at(-1)?.identificadorOriginal, decision.original);
      assert.equal(resolved.manualResolucoes?.at(-1)?.arquivoOrigem, 'm5714b1.xlsx');
      assert.equal(resolved.manualResolucoes?.at(-1)?.numeroOs, decision.numeroOs);
    }
  } finally { await cleanup([], tokens); if (createdFleetIds.length) await pool.query('DELETE FROM frotas WHERE id=ANY($1::uuid[])', [createdFleetIds]); }
});

test('rejeita alvo inválido e decisão não aprovada sem alterar a prévia', async () => {
  const reference = await refs(); const number = 571400007; const token = randomUUID(); const item = parsed(number);
  item.pendencias = ['FROTA_PENDENTE']; item.statusPreview = 'REQUER_REVISAO';
  try {
    await preview(token, item);
    const invalid = responseOf();
    await resolve({ params: { token, numeroOs: String(number) }, body: { frotaId: randomUUID(), decisao: 'REJEITAR' }, authUser: actor } as never, invalid as never);
    assert.equal(invalid.statusCode, 409);
    const stored = (await pool.query<{ payload_json: ParsedOs }>('SELECT payload_json FROM importacoes_os_itens WHERE importacao_id=$1 AND numero_os=$2', [token, number])).rows[0]!;
    assert.equal(stored.payload_json.frotaId, undefined);
    assert.deepEqual(stored.payload_json.manualResolucoes ?? [], []);

    const wrongTarget = responseOf();
    await resolve({ params: { token, numeroOs: String(number) }, body: { frotaId: reference.frotaId, decisao: 'INVESTIGAR' }, authUser: actor } as never, wrongTarget as never);
    assert.equal(wrongTarget.statusCode, 409);
  } finally { await cleanup([], [token]); }
});

test('decisão de um arquivo não é reutilizada em outro e a natureza histórica permanece intacta', async () => {
  const reference = await refs(); const firstNumber = 571400008; const firstToken = randomUUID(); const secondToken = randomUUID();
  const first = parsed(firstNumber); first.frotaOriginal = 'ARQUIVO-A'; first.pendencias = ['FROTA_PENDENTE']; first.statusPreview = 'REQUER_REVISAO';
  const second = parsed(firstNumber); second.frotaOriginal = 'ARQUIVO-B'; second.pendencias = ['FROTA_PENDENTE']; second.statusPreview = 'REQUER_REVISAO';
  const controls = (await pool.query<{ numero_os: number; natureza_os: string }>('SELECT numero_os,natureza_os FROM ordens_servico WHERE numero_os=ANY($1::bigint[]) ORDER BY numero_os', [[47932, 47938, 47943, 47968, 48003]])).rows;
  try {
    await preview(firstToken, first); await preview(secondToken, second);
    const response = responseOf();
    await resolve({ params: { token: firstToken, numeroOs: String(firstNumber) }, body: { frotaId: reference.frotaId, decisao: 'APROVAR' }, authUser: actor } as never, response as never);
    assert.equal(response.statusCode, 200);
    const untouched = (await pool.query<{ payload_json: ParsedOs }>('SELECT payload_json FROM importacoes_os_itens WHERE importacao_id=$1 AND numero_os=$2', [secondToken, firstNumber])).rows[0]!;
    assert.equal(untouched.payload_json.frotaId, undefined);
    assert.deepEqual(untouched.payload_json.manualResolucoes ?? [], []);
    const after = (await pool.query<{ numero_os: number; natureza_os: string }>('SELECT numero_os,natureza_os FROM ordens_servico WHERE numero_os=ANY($1::bigint[]) ORDER BY numero_os', [[47932, 47938, 47943, 47968, 48003]])).rows;
    assert.deepEqual(after, controls);
  } finally { await cleanup([], [firstToken, secondToken]); }
});

after(async () => { await pool.query('DELETE FROM sessoes WHERE usuario_id=$1', [actor.id]); await pool.query('DELETE FROM auditoria WHERE usuario_id=$1', [actor.id]); await pool.query('DELETE FROM usuarios WHERE id=$1', [actor.id]); await pool.end(); });
