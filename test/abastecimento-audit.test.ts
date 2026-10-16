import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';
import { createAbastecimentoEntrada, createAbastecimentoPonto, deleteAbastecimentoEntrada, deleteAbastecimentoPonto, replacePontoProdutos, updateAbastecimentoEntrada, updateAbastecimentoPonto, updateAbastecimentoPontoStatus } from '../src/services/abastecimentos-base.service.js';
import { createAbastecimentoManual } from '../src/services/abastecimentos-manual.service.js';
import { updateAbastecimentoHistorico } from '../src/services/abastecimentos-historico-edit.service.js';
import { createAbastecimentoBico, updateAbastecimentoBico, updateAbastecimentoBicoStatus } from '../src/services/abastecimentos-bicos.service.js';
import { createTerceiroIdentificacao, deleteTerceiroIdentificacao, updateTerceiroIdentificacao } from '../src/services/abastecimentos-terceiro-identificacoes.service.js';
import { createFrotaTerceira, updateFrotaTerceira } from '../src/services/abastecimentos-frotas-terceiras.service.js';
import type { AuthenticatedRequestUser } from '../src/types/auth.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'esta suíte exige DB_NAME=oficina_test');
const prefix = `m5713b_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
let actor: AuthenticatedRequestUser;
let produtoId: string;
let pontoId: string;
let obraId: string;
let terceiroId: string;
let entradaId: string;
let identificacaoId: string;
let frotaTerceiraId: string;

before(async () => {
  const current = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(current.rows[0]?.current_database, 'oficina_test');
  const passwordHash = await hashPassword('teste abastecimento 2026!');
  const user = (await pool.query(`INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,'ADMIN','ATIVO',false) RETURNING id,username,email,role,status,must_change_password`, [`${prefix}admin`, `${prefix}@example.invalid`, passwordHash])).rows[0] as any;
  actor = { ...user, sessionId: randomUUID(), tokenHash: 'test-token' };
  produtoId = (await pool.query(`INSERT INTO abastecimento_produtos(codigo,nome,tipo,permite_entrada,permite_distribuicao,permite_abastecimento) VALUES($1,$2,'DIESEL',true,true,true) RETURNING id`, [`${prefix}p`, `${prefix} produto`])).rows[0].id;
  pontoId = (await pool.query(`INSERT INTO abastecimento_pontos(codigo,nome,tipo) VALUES($1,$2,'POSTO') RETURNING id`, [`${prefix}pt`, `${prefix} ponto`])).rows[0].id;
  await pool.query('INSERT INTO abastecimento_pontos_produtos(ponto_id,produto_id) VALUES($1,$2)', [pontoId, produtoId]);
  obraId = (await pool.query(`INSERT INTO obras(codigo,nome,status) VALUES($1,$2,'ATIVA') RETURNING id`, [`${prefix}obra`, `${prefix} obra`])).rows[0].id;
  terceiroId = (await pool.query(`INSERT INTO abastecimento_terceiros(codigo,nome,status) VALUES($1,$2,'ATIVO') RETURNING id`, [`${prefix}t`, `${prefix} terceiro`])).rows[0].id;
});

test('audita CRUD de entradas, preserva valores e não audita no-op', async () => {
  const body = { data_entrada: '2026-10-08', numero_nf: `${prefix}-nf`, produto_id: produtoId, litros_nf: '123.456', valor_total_nf: '987.65', observacoes: 'fixture', destinos: [{ tipo_destino: 'PONTO', ponto_id: pontoId, litros: '123.456', observacoes: null }] };
  const created = await createAbastecimentoEntrada(body, actor); entradaId = created.id;
  const beforeCount = Number((await pool.query(`SELECT COUNT(*)::int count FROM auditoria WHERE entidade='abastecimento_entradas' AND entidade_id=$1`, [entradaId])).rows[0].count);
  assert.equal(beforeCount, 1);
  await updateAbastecimentoEntrada(entradaId, { ...body, observacoes: 'editado' }, actor);
  const afterEdit = await pool.query(`SELECT litros_nf::text,valor_total_nf::text,observacoes FROM abastecimento_entradas WHERE id=$1`, [entradaId]);
  assert.deepEqual(afterEdit.rows[0], { litros_nf: '123.456', valor_total_nf: '987.65', observacoes: 'editado' });
  const editCount = Number((await pool.query(`SELECT COUNT(*)::int count FROM auditoria WHERE entidade='abastecimento_entradas' AND entidade_id=$1 AND acao='EDITAR'`, [entradaId])).rows[0].count);
  await updateAbastecimentoEntrada(entradaId, { ...body, observacoes: 'editado' }, actor);
  assert.equal(Number((await pool.query(`SELECT COUNT(*)::int count FROM auditoria WHERE entidade='abastecimento_entradas' AND entidade_id=$1 AND acao='EDITAR'`, [entradaId])).rows[0].count), editCount);
  await deleteAbastecimentoEntrada(entradaId, actor);
  assert.equal((await pool.query('SELECT 1 FROM abastecimento_entradas WHERE id=$1', [entradaId])).rowCount, 0);
  assert.equal((await pool.query(`SELECT 1 FROM auditoria WHERE entidade='abastecimento_entradas' AND entidade_id=$1 AND acao='EXCLUIR'`, [entradaId])).rowCount, 1);
});

test('audita identificação de terceiro e frotas terceiras com identidade autenticada', async () => {
  const created = await createTerceiroIdentificacao(terceiroId, { identificacao: `${prefix}-id`, tipo: 'PLACA', status: 'ATIVO' }, actor); identificacaoId = created.id;
  await updateTerceiroIdentificacao(terceiroId, identificacaoId, { identificacao: `${prefix}-id2`, tipo: 'PLACA', status: 'INATIVO' }, actor);
  await deleteTerceiroIdentificacao(terceiroId, identificacaoId, actor);
  assert.equal((await pool.query(`SELECT COUNT(*)::int count FROM auditoria WHERE entidade='abastecimento_terceiro_identificacoes' AND entidade_id=$1`, [identificacaoId])).rows[0].count, 3);
  const fleet = await createFrotaTerceira({ identificacao: `${prefix}-fleet`, tipo: 'EQUIPAMENTO', terceiro_id: terceiroId, status: 'ATIVO' }, actor); frotaTerceiraId = fleet.id;
  await updateFrotaTerceira(frotaTerceiraId, { identificacao: `${prefix}-fleet2`, tipo: 'EQUIPAMENTO', terceiro_id: terceiroId, status: 'ATIVO' }, actor);
  const audit = (await pool.query(`SELECT username,role,dados_anteriores,dados_posteriores FROM auditoria WHERE entidade='abastecimento_frotas_terceiras' AND entidade_id=$1 ORDER BY id`, [frotaTerceiraId])).rows;
  assert.equal(audit.length, 2); assert.ok(audit.every((row: any) => row.username === actor.username && row.role === actor.role));
});

test('audita compatibilidade ponto/produto e falha de auditoria faz rollback', async () => {
  await replacePontoProdutos(pontoId, [produtoId], actor);
  assert.equal((await pool.query('SELECT 1 FROM abastecimento_pontos_produtos WHERE ponto_id=$1 AND produto_id=$2', [pontoId, produtoId])).rowCount, 1);
  const invalidActor = { ...actor, role: 'INVALIDO' } as unknown as AuthenticatedRequestUser;
  const code = `${prefix}rollback`;
  await assert.rejects(() => createFrotaTerceira({ identificacao: code, tipo: 'OUTRO', status: 'ATIVO' }, invalidActor));
  assert.equal((await pool.query('SELECT 1 FROM abastecimento_frotas_terceiras WHERE identificacao=$1', [code])).rowCount, 0);
});

test('audita abastecimento manual e CRUD/status de ponto e bico', async () => {
  const manual = await createAbastecimentoManual({ data: '2026-10-08', hora: '10:00', obra_id: obraId, produto_id: produtoId, tipo_destinatario: 'EXTERNA', identificacao: `${prefix}-externa`, litros: '12.345', valor_total: '67.8900' }, actor);
  const stored = (await pool.query('SELECT litros::text,valor_total::text,origem_sistema FROM abastecimentos WHERE id=$1', [manual.id])).rows[0];
  assert.deepEqual(stored, { litros: '12.345', valor_total: '67.8900', origem_sistema: 'MANUAL' });
  assert.equal((await pool.query(`SELECT 1 FROM auditoria WHERE entidade='abastecimentos' AND entidade_id=$1 AND acao='CRIAR'`, [manual.id])).rowCount, 1);
  await updateAbastecimentoHistorico(manual.id, { data_hora: '2026-10-08T10:00', produto_id: produtoId, obra_id: obraId, tipo_destinatario: 'EXTERNA', identificacao_original: `${prefix}-externa`, litros: '12.345', valor_total: '67.8900', km_hr: null, horimetro: null, bico_codigo_original: null, bico_descricao_original: null, frentista_original: null }, actor);
  assert.equal((await pool.query(`SELECT 1 FROM auditoria WHERE entidade='abastecimentos' AND entidade_id=$1 AND acao='EDITAR'`, [manual.id])).rowCount, 1);
  const point = await createAbastecimentoPonto({ codigo: `${prefix}p2`, nome: `${prefix} ponto 2`, tipo: 'POSTO', status: 'ATIVO' }, actor);
  await updateAbastecimentoPonto(point.id, { codigo: point.codigo, nome: `${prefix} ponto editado`, tipo: 'POSTO', status: 'ATIVO' }, actor);
  await updateAbastecimentoPontoStatus(point.id, { status: 'INATIVO' }, actor);
  await updateAbastecimentoPontoStatus(point.id, { status: 'ATIVO' }, actor);
  const bico = await createAbastecimentoBico(point.id, { codigo: `${prefix}b`, descricao: 'fixture', produto_id: produtoId, status: 'ATIVO' }, actor);
  await updateAbastecimentoBico(point.id, bico.id, { codigo: bico.codigo, descricao: 'editado', produto_id: produtoId, status: 'ATIVO' }, actor);
  await updateAbastecimentoBicoStatus(point.id, bico.id, { status: 'INATIVO' }, actor);
  assert.ok((await pool.query(`SELECT 1 FROM auditoria WHERE entidade IN ('abastecimento_pontos','abastecimento_bicos') AND usuario_id=$1`, [actor.id])).rowCount);
  await pool.query('DELETE FROM abastecimento_bicos WHERE id=$1', [bico.id]);
  await deleteAbastecimentoPonto(point.id, actor);
  await pool.query('DELETE FROM abastecimentos WHERE id=$1', [manual.id]);
  await pool.query(`DELETE FROM auditoria WHERE entidade='abastecimentos' AND entidade_id=$1`, [manual.id]);
});

test('concorrência de duas edições da mesma entrada mantém snapshots e valores íntegros', async () => {
  const body = { data_entrada: '2026-10-08', numero_nf: `${prefix}-conc`, produto_id: produtoId, litros_nf: '10.000', valor_total_nf: '20.00', observacoes: 'base', destinos: [{ tipo_destino: 'PONTO', ponto_id: pontoId, litros: '10.000', observacoes: null }] };
  const entry = await createAbastecimentoEntrada(body, actor);
  await Promise.all([
    updateAbastecimentoEntrada(entry.id, { ...body, observacoes: 'A' }, actor),
    updateAbastecimentoEntrada(entry.id, { ...body, observacoes: 'B' }, actor),
  ]);
  const stored = (await pool.query('SELECT litros_nf::text,valor_total_nf::text,observacoes FROM abastecimento_entradas WHERE id=$1', [entry.id])).rows[0];
  assert.ok(['A', 'B'].includes(stored.observacoes)); assert.equal(stored.litros_nf, '10.000'); assert.equal(stored.valor_total_nf, '20.00');
  assert.equal(Number((await pool.query(`SELECT COUNT(*)::int count FROM auditoria WHERE entidade='abastecimento_entradas' AND entidade_id=$1 AND acao='EDITAR'`, [entry.id])).rows[0].count), 2);
  await deleteAbastecimentoEntrada(entry.id, actor);
});

after(async () => {
  if (frotaTerceiraId) await pool.query('DELETE FROM abastecimento_frotas_terceiras WHERE id=$1', [frotaTerceiraId]);
  if (terceiroId) await pool.query('DELETE FROM abastecimento_terceiro_identificacoes WHERE terceiro_id=$1', [terceiroId]);
  if (terceiroId) await pool.query('DELETE FROM abastecimento_terceiros WHERE id=$1', [terceiroId]);
  if (pontoId) await pool.query('DELETE FROM abastecimento_pontos_produtos WHERE ponto_id=$1', [pontoId]);
  if (pontoId) await pool.query('DELETE FROM abastecimento_pontos WHERE id=$1', [pontoId]);
  if (produtoId) await pool.query('DELETE FROM abastecimento_produtos WHERE id=$1', [produtoId]);
  if (obraId) await pool.query('DELETE FROM obras WHERE id=$1', [obraId]);
  if (actor) { await pool.query('DELETE FROM auditoria WHERE usuario_id=$1', [actor.id]); await pool.query('DELETE FROM usuarios WHERE id=$1', [actor.id]); }
  await pool.end();
});
