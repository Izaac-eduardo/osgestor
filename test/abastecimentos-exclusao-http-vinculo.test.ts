import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';
import { deleteAbastecimentoHistorico } from '../src/services/abastecimentos-historico-delete.service.js';
import { assertEntradaSemDestinoVinculado, getAbastecimentoEntrada } from '../src/services/abastecimentos-base.service.js';
import { registerFrotaDiretaAbastecimento } from '../src/services/abastecimentos-entrada-frota-direta.service.js';
import { testCatalog } from './support/fixtures.js';
import type { AuthenticatedRequestUser } from '../src/types/auth.js';

assert.equal(process.env.DB_NAME, 'oficina_teste_fase051');

const password = 'Senha exclusao HTTP 2026!';

async function login(base: string, username: string) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!;
}

async function createUser(role: 'ADMIN' | 'OPERADOR') {
  const id = randomUUID();
  const username = `exclusao-http-${role.toLowerCase()}-${id}`;
  await pool.query(
    `INSERT INTO usuarios(id,username,email,password_hash,role,status,must_change_password)
     VALUES($1,$2,$3,$4,$5,'ATIVO',false)`,
    [id, username, `${id}@example.invalid`, await hashPassword(password), role],
  );
  return { id, username };
}

function actor(id: string, username: string, role: 'ADMIN' | 'OPERADOR'): AuthenticatedRequestUser {
  return { id, username, email: `${id}@example.invalid`, role, status: 'ATIVO', must_change_password: false, sessionId: `session-${id}`, tokenHash: `token-${id}` };
}

test('rota de exclusão retorna HTTP 400 e 403 conforme motivo e perfil', async () => {
  const catalog = await testCatalog();
  const admin = await createUser('ADMIN');
  const operator = await createUser('OPERADOR');
  const external = `EXCLUSAO-HTTP-${randomUUID()}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original)
     VALUES ('POLIFROTA',$1,'2026-10-08 07:00',$2,$3,'FROTA',$4,$5,10,25,'exclusao-http-fixture.xlsx','{}') RETURNING id`,
    [external, catalog.product.id, catalog.obra.id, catalog.fleet.id, catalog.fleet.codigo],
  )).rows[0]!.id;
  let server: Server | undefined;
  try {
    server = app.listen(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const adminCookie = await login(base, admin.username);
    const operatorCookie = await login(base, operator.username);
    const empty = await fetch(`${base}/abastecimento/historico/${id}`, {
      method: 'DELETE', headers: { origin: 'http://localhost:5173', cookie: adminCookie, 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).message, 'O motivo da exclusão é obrigatório.');
    const forbidden = await fetch(`${base}/abastecimento/historico/${id}`, {
      method: 'DELETE', headers: { origin: 'http://localhost:5173', cookie: operatorCookie, 'content-type': 'application/json' }, body: JSON.stringify({ motivo: 'Sem permissão' }),
    });
    assert.equal(forbidden.status, 403);
    const deleted = await fetch(`${base}/abastecimento/historico/${id}`, {
      method: 'DELETE', headers: { origin: 'http://localhost:5173', cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ motivo: '  Exclusão HTTP de teste  ' }),
    });
    assert.equal(deleted.status, 200);
    const stored = (await pool.query<{ excluido_por: string; motivo_exclusao: string }>('SELECT excluido_por,motivo_exclusao FROM abastecimentos WHERE id=$1', [id])).rows[0]!;
    assert.equal(stored.excluido_por, admin.id);
    assert.equal(stored.motivo_exclusao, 'Exclusão HTTP de teste');
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query("DELETE FROM auditoria WHERE entidade='abastecimentos' AND entidade_id=$1", [id]);
    await pool.query('DELETE FROM abastecimentos WHERE id=$1', [id]);
    await pool.query('DELETE FROM sessoes WHERE usuario_id=ANY($1::uuid[])', [[admin.id, operator.id]]);
    await pool.query('DELETE FROM usuarios WHERE id=ANY($1::uuid[])', [[admin.id, operator.id]]);
  }
});

test('destino fica disponível para novo vínculo depois da exclusão lógica', async () => {
  const catalog = await testCatalog();
  const user = await createUser('ADMIN');
  const admin = actor(user.id, user.username, 'ADMIN');
  const entry = (await pool.query<{ id: string }>(
    `INSERT INTO abastecimento_entradas(data_entrada,numero_nf,produto_id,litros_nf,valor_total_nf)
     VALUES('2026-10-08',$1,$2,20,50) RETURNING id`,
    [`EXCLUSAO-VINCULO-${randomUUID()}`, catalog.product.id],
  )).rows[0]!.id;
  const destination = (await pool.query<{ id: string }>(
    `INSERT INTO abastecimento_entrada_destinos(entrada_id,tipo_destino,frota_id,litros)
     VALUES($1,'FROTA_DIRETA',$2,20) RETURNING id`,
    [entry, catalog.fleet.id],
  )).rows[0]!.id;
  const abastecimentoIds: string[] = [];
  try {
    const first = await registerFrotaDiretaAbastecimento(destination, { data: '2026-10-08', hora: '08:00', obra_id: catalog.obra.id, valor_total: '50' }, admin);
    abastecimentoIds.push(first.id);
    await deleteAbastecimentoHistorico(first.id, { motivo: 'Liberar destino em teste' }, admin);
    const entryAfterDelete = await getAbastecimentoEntrada(entry);
    assert.equal(entryAfterDelete.destinos[0]?.abastecimento, null);
    await assert.doesNotReject(() => assertEntradaSemDestinoVinculado(entry));
    const second = await registerFrotaDiretaAbastecimento(destination, { data: '2026-10-08', hora: '09:00', obra_id: catalog.obra.id, valor_total: '50' }, admin);
    abastecimentoIds.push(second.id);
    assert.notEqual(second.id, first.id);
  } finally {
    if (abastecimentoIds.length) {
      await pool.query('DELETE FROM auditoria WHERE entidade_id=ANY($1::text[])', [abastecimentoIds]);
      await pool.query('DELETE FROM abastecimentos WHERE id=ANY($1::uuid[])', [abastecimentoIds]);
    }
    await pool.query('DELETE FROM abastecimento_entrada_destinos WHERE id=$1', [destination]);
    await pool.query('DELETE FROM abastecimento_entradas WHERE id=$1', [entry]);
    await pool.query('DELETE FROM sessoes WHERE usuario_id=$1', [user.id]);
    await pool.query('DELETE FROM usuarios WHERE id=$1', [user.id]);
  }
});

test('constraint do banco rejeita exclusão sem motivo e aceita registro ativo sem motivo', async () => {
  const catalog = await testCatalog();
  const external = `EXCLUSAO-CONSTRAINT-${randomUUID()}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO abastecimentos (origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,identificacao_original,litros,valor_total,arquivo_nome_original,payload_original)
     VALUES ('TEST',$1,'2026-10-08 10:00',$2,$3,'FROTA',$4,$5,1,2,'exclusao-constraint-fixture.xlsx','{}') RETURNING id`,
    [external, catalog.product.id, catalog.obra.id, catalog.fleet.id, catalog.fleet.codigo],
  )).rows[0]!.id;
  try {
    const active = await pool.query<{ motivo_exclusao: string | null }>('SELECT motivo_exclusao FROM abastecimentos WHERE id=$1', [id]);
    assert.equal(active.rows[0]?.motivo_exclusao, null);
    await assert.rejects(pool.query('UPDATE abastecimentos SET excluido_at=NOW(),motivo_exclusao=$1 WHERE id=$2', ['   ', id]));
    const unchanged = await pool.query<{ excluido_at: Date | null }>('SELECT excluido_at FROM abastecimentos WHERE id=$1', [id]);
    assert.equal(unchanged.rows[0]?.excluido_at, null);
  } finally {
    await pool.query('DELETE FROM abastecimentos WHERE id=$1', [id]);
  }
});
