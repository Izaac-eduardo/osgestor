import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import { createObra, deleteObra, updateObra, updateObraStatus } from '../src/services/obras.service.js';
import { createFuncionario, deleteFuncionario, updateFuncionario, updateFuncionarioStatus } from '../src/services/funcionarios.service.js';
import { saveFrota, deleteFrota, updateFrotaStatus } from '../src/services/frotas.service.js';
import { createPrefixoFrota, deletePrefixoFrota, updatePrefixoFrota, updatePrefixoFrotaStatus } from '../src/services/prefixos-frota.service.js';
import { hashPassword } from '../src/services/password.service.js';
import type { AuthenticatedRequestUser } from '../src/types/auth.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');
const prefix = `m5712_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
let actor: AuthenticatedRequestUser; const created = { obras: [] as string[], funcionarios: [] as string[], frotas: [] as string[], prefixos: [] as string[] };

before(async () => {
  const db = await pool.query<{ current_database: string }>('SELECT current_database()'); assert.equal(db.rows[0]?.current_database, 'oficina_test');
  const passwordHash = await hashPassword('Senha cadastros 2026!');
  const user = (await pool.query<{ id: string; username: string; role: 'ADMIN'; status: 'ATIVO'; must_change_password: boolean }>(`INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,'ADMIN','ATIVO',false) RETURNING id,username,role,status,must_change_password`, [`${prefix}admin`, `${prefix}@example.invalid`, passwordHash])).rows[0]!;
  actor = { ...user, sessionId: randomUUID(), tokenHash: 'cadastros-test-token' };
});

test('audita Obras, Funcionários, Prefixos e Frotas com snapshots e identidade', async () => {
  const obra = await createObra({ codigo: `${prefix}obra`, nome: `${prefix} obra`, descricao: 'teste', status: 'ATIVA', data_inicio: '2026-10-08', data_fim: null, observacoes: 'a' }, actor); created.obras.push(obra.id);
  await updateObra(obra.id, { codigo: obra.codigo, nome: `${prefix} obra editada`, descricao: 'teste', status: 'ATIVA', data_inicio: '2026-10-08', data_fim: null, observacoes: 'b' }, actor);
  await updateObraStatus(obra.id, { status: 'INATIVA' }, actor);
  const funcionario = await createFuncionario({ nome: `${prefix} funcionario`, matricula: `${prefix}-mat`, cargo: 'Teste', status: 'ATIVO' }, actor); created.funcionarios.push(funcionario.id);
  await updateFuncionario(funcionario.id, { nome: `${prefix} funcionario editado`, matricula: funcionario.matricula, cargo: funcionario.cargo, status: 'ATIVO' }, actor);
  await updateFuncionarioStatus(funcionario.id, { status: 'INATIVO' }, actor);
  const prefixo = await createPrefixoFrota({ codigo: `${prefix}P`.slice(0, 10), descricao: 'Teste', status: 'ATIVO' }, actor); created.prefixos.push(prefixo.id);
  await updatePrefixoFrota(prefixo.id, { codigo: prefixo.codigo, descricao: 'Editado', status: 'ATIVO' }, actor); await updatePrefixoFrotaStatus(prefixo.id, { status: 'INATIVO' }, actor);
  const frota = await saveFrota({ codigo: `${prefix}01`.slice(0, 10), descricao: 'Frota teste', placa: null, modelo: 'Teste', ano: 2026, status: 'ATIVO' }, undefined, actor); created.frotas.push(frota.id);
  await updateFrotaStatus(frota.id, { status: 'INATIVO' }, actor);
  const rows = (await pool.query<{ entidade: string; acao: string; username: string; role: string; dados_anteriores: any; dados_posteriores: any }>('SELECT entidade,acao,username,role,dados_anteriores,dados_posteriores FROM auditoria WHERE usuario_id=$1 AND entidade_id=ANY($2::text[])', [actor.id, [...created.obras, ...created.funcionarios, ...created.prefixos, ...created.frotas]])).rows;
  for (const entity of ['obras', 'funcionarios', 'prefixos_frota', 'frotas']) { assert.ok(rows.some((row) => row.entidade === entity && row.acao === 'CRIAR')); assert.ok(rows.some((row) => row.entidade === entity && row.acao === 'EDITAR' || row.entidade === entity && ['ATIVAR', 'DESATIVAR'].includes(row.acao))); }
  assert.ok(rows.every((row) => row.username === actor.username && row.role === actor.role)); assert.ok(rows.some((row) => row.dados_anteriores?.nome === `${prefix} obra`)); assert.ok(rows.some((row) => row.dados_posteriores?.nome === `${prefix} obra editada`));
  await deleteFrota(frota.id, actor); await deletePrefixoFrota(prefixo.id, actor); await deleteFuncionario(funcionario.id, actor); await deleteObra(obra.id, actor);
});

test('falha da auditoria faz rollback do cadastro e edição concorrente preserva estado final', async () => {
  const invalidActor = { ...actor, role: 'INVALIDO' } as unknown as AuthenticatedRequestUser;
  const code = `${prefix}rollback`;
  await assert.rejects(() => createObra({ codigo: code, nome: code, status: 'ATIVA' }, invalidActor));
  assert.equal((await pool.query('SELECT 1 FROM obras WHERE codigo=$1', [code])).rowCount, 0);
  const obra = await createObra({ codigo: `${prefix}conc`, nome: 'Concorrente', status: 'ATIVA' }, actor); created.obras.push(obra.id);
  await Promise.all([
    updateObra(obra.id, { codigo: obra.codigo, nome: 'Concorrente A', status: 'ATIVA' }, actor),
    updateObra(obra.id, { codigo: obra.codigo, nome: 'Concorrente B', status: 'ATIVA' }, actor),
  ]);
  const stored = (await pool.query<{ nome: string }>('SELECT nome FROM obras WHERE id=$1', [obra.id])).rows[0]!;
  assert.ok(['Concorrente A', 'Concorrente B'].includes(stored.nome));
});

after(async () => {
  if (created.frotas.length) await pool.query('DELETE FROM frotas WHERE id=ANY($1::uuid[])', [created.frotas]);
  if (created.prefixos.length) await pool.query('DELETE FROM prefixos_frota WHERE id=ANY($1::uuid[])', [created.prefixos]);
  if (created.funcionarios.length) await pool.query('DELETE FROM funcionarios WHERE id=ANY($1::uuid[])', [created.funcionarios]);
  if (created.obras.length) await pool.query('DELETE FROM obras WHERE id=ANY($1::uuid[])', [created.obras]);
  if (actor) { await pool.query('DELETE FROM auditoria WHERE usuario_id=$1', [actor.id]); await pool.query('DELETE FROM usuarios WHERE id=$1', [actor.id]); }
  await pool.end();
});
