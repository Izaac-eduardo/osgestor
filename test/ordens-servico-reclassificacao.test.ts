import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { pool } from '../src/config/database.js';
import { reclassifyProdutoAsServico } from '../src/services/ordens-servico-reclassificacao.service.js';
import { loadExistingOsUsing, buildOsUpdateDiff } from '../src/services/sincronizacao-os.service.js';

assert.equal(process.env.DB_NAME, 'oficina_teste_fase051', 'este teste exige DB_NAME=oficina_teste_fase051');

const actor = { id: null, username: 'teste.reclassificacao', email: 'teste@example.invalid', role: 'ADMIN', status: 'ATIVO', must_change_password: false, sessionId: 'teste', tokenHash: 'teste' } as never;
const orderIds: string[] = [];
const productIds: string[] = [];
const serviceIds: string[] = [];
const importIds: string[] = [];

async function fixture(options: { withLink: boolean; withEquivalent: boolean; equivalentClassification?: 'TERCEIRO' | 'INTERNO' | 'INDETERMINADO' }) {
  const databaseCheck = await pool.query<{ current_database: string }>('SELECT current_database()');
  assert.equal(databaseCheck.rows[0]?.current_database, 'oficina_teste_fase051', 'a escrita de teste exige o banco isolado autorizado');
  const obra = (await pool.query<{ id: string }>(`SELECT id FROM obras WHERE codigo='TEST-OBRA-001' LIMIT 1`)).rows[0];
  const fleet = (await pool.query<{ id: string; prefixo_frota_id: string }>('SELECT id,prefixo_frota_id FROM frotas ORDER BY codigo LIMIT 1')).rows[0];
  assert.ok(obra && fleet);
  const orderId = randomUUID(); const orderNumber = 910000000 + Math.floor(Math.random() * 999999);
  await pool.query(`INSERT INTO ordens_servico(id,numero_os,obra_id,frota_id,prefixo_frota_id,frota_numero,natureza_os,categoria_servico,data_abertura,status) VALUES($1,$2,$3,$4,$5,1,'TERCEIRO','OUTROS','2026-10-23','FINALIZADA')`, [orderId, orderNumber, obra.id, fleet.id, fleet.prefixo_frota_id]);
  orderIds.push(orderId);
  const productId = randomUUID();
  await pool.query(`INSERT INTO produtos_os(id,ordem_servico_id,descricao,quantidade,unidade,valor_unitario,valor_total_original) VALUES($1,$2,'ITEM RECLASSIFICAR',2,'UN',30,60)`, [productId, orderId]);
  productIds.push(productId);
  let equivalentId: string | undefined;
  if (options.withEquivalent) {
    equivalentId = randomUUID();
    await pool.query(`INSERT INTO servicos_os(id,ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem) VALUES($1,$2,'ITEM RECLASSIFICAR',60,$3,'MANUAL')`, [equivalentId, orderId, options.equivalentClassification ?? 'TERCEIRO']);
    serviceIds.push(equivalentId);
  }
  if (options.withLink) {
    const importId = randomUUID(); importIds.push(importId);
    await pool.query(`INSERT INTO importacoes_os(id,arquivo_nome,status,expires_at) VALUES($1,'reclassificacao-teste.xlsx','CONCLUIDA',now()+interval '1 day')`, [importId]);
    await pool.query(`INSERT INTO ordens_servico_item_vinculos(importacao_id,ordem_servico_id,tipo_item,produto_os_id,fingerprint_contexto,metodo_vinculo,homologado_por,homologado_em,evidencia_snapshot) VALUES($1,$2,'PRODUTO',$3,$4,'MATCH_EXATO_HOMOLOGADO','teste',now(),'{}'::jsonb)`, [importId, orderId, productId, `fp-${productId}`]);
  }
  return { orderId, productId, equivalentId };
}

test('reclassifica produto importado, preserva vínculo histórico e evita reversão na sincronização', async () => {
  const f = await fixture({ withLink: true, withEquivalent: false });
  const result = await reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'Correção homologada pela revisão operacional.' }, actor);
  assert.equal(result.criouServico, true);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ordens_servico_item_reclassificacoes WHERE produto_os_id=$1', [f.productId])).rows[0].count, 1);
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM produtos_os p WHERE p.id=$1 AND NOT EXISTS (SELECT 1 FROM ordens_servico_item_reclassificacoes r WHERE r.produto_os_id=p.id)`, [f.productId])).rows[0].count, 0);
  assert.equal((await pool.query(`SELECT estado_vinculo FROM ordens_servico_item_vinculos WHERE produto_os_id=$1`, [f.productId])).rows[0].estado_vinculo, 'REVOGADO');
  assert.equal((await pool.query(`SELECT tipo_item,servico_os_id FROM ordens_servico_item_vinculos WHERE ordem_servico_id=$1 AND estado_vinculo='ATIVO'`, [f.orderId])).rows[0].tipo_item, 'SERVICO');
  const current = await loadExistingOsUsing(pool, Number((await pool.query('SELECT numero_os FROM ordens_servico WHERE id=$1', [f.orderId])).rows[0].numero_os));
  assert.ok(current);
  const diff = buildOsUpdateDiff({ numeroOs: current!.numeroOs, data: '2026-10-23', cliente: null, frotaOriginal: null, parecerOriginal: null, funcionarioAbertura: null, problema: null, status: 'FINALIZADA', statusOriginal: 'FINALIZADA', statusOrigem: 'AUTOMATICO', itens: [{ descricao: 'ITEM RECLASSIFICAR', quantidade: 2, unidade: 'UN', valorUnitario: 30, total: 60, tipo: 'PRODUTO', fingerprintContexto: `fp-${f.productId}` }], execucoes: [], statusPreview: 'JA_CADASTRADA', pendencias: [], origem: 'reclassificacao.xlsx' }, current!);
  assert.equal(diff.novosProdutos.length, 0);
  await assert.rejects(() => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'Tentativa repetida.' }, actor), /já foi reclassificado/);
});

test('associa serviço equivalente sem criar duplicata', async () => {
  const f = await fixture({ withLink: false, withEquivalent: true });
  const before = (await pool.query<{ count: string }>('SELECT count(*) count FROM servicos_os WHERE ordem_servico_id=$1', [f.orderId])).rows[0].count;
  const result = await reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'Produto duplicado do serviço já lançado.', servico_equivalente_id: f.equivalentId }, actor);
  assert.equal(result.criouServico, false);
  assert.equal((await pool.query<{ count: string }>('SELECT count(*) count FROM servicos_os WHERE ordem_servico_id=$1', [f.orderId])).rows[0].count, before);
  const totals = (await pool.query<{ total_produtos: string; total_servicos_terceiros: string; total_os: string }>('SELECT total_produtos,total_servicos_terceiros,total_os FROM vw_ordens_servico_resumo WHERE id=$1', [f.orderId])).rows[0];
  assert.deepEqual(totals, { total_produtos: '0', total_servicos_terceiros: '60.00', total_os: '60.00' });
});

test('bloqueia associação a serviço equivalente incompatível sem alterar dados', async () => {
  const f = await fixture({ withLink: true, withEquivalent: true, equivalentClassification: 'INDETERMINADO' });
  await assert.rejects(
    () => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'Tentativa de associacao incompatível.', servico_equivalente_id: f.equivalentId }, actor),
    error => error instanceof Error && error.message.includes('Confirme explicitamente'),
  );
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ordens_servico_item_reclassificacoes WHERE produto_os_id=$1', [f.productId])).rows[0].count, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ordens_servico_item_vinculos WHERE produto_os_id=$1', [f.productId])).rows[0].count, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM servicos_os WHERE ordem_servico_id=$1', [f.orderId])).rows[0].count, 1);
});

test('rejeita vínculo de reclassificação entre ordens diferentes', async () => {
  const left = await fixture({ withLink: false, withEquivalent: false });
  const right = await fixture({ withLink: false, withEquivalent: true });
  await assert.rejects(
    () => pool.query(
      `INSERT INTO ordens_servico_item_reclassificacoes(
         ordem_servico_id,produto_os_id,servico_os_id,descricao_original,quantidade_original,
         unidade_original,valor_unitario_original,valor_total_original,justificativa,usuario_nome
       ) VALUES($1,$2,$3,'ITEM RECLASSIFICAR',1,'UN',60,60,'Vinculo cruzado de teste.','teste')`,
      [left.orderId, left.productId, right.equivalentId],
    ),
    /foreign key|chave estrangeira/i,
  );
});

test('exige justificativa e desfaz a transação quando a auditoria fica inválida', async () => {
  const f = await fixture({ withLink: false, withEquivalent: false });
  await assert.rejects(() => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO' }, actor), /justificativa é obrigatória/);
  const invalidActor = { ...actor, id: randomUUID() } as never;
  await assert.rejects(() => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'Falha controlada para testar rollback.' }, invalidActor), /violates foreign key|chave estrangeira/i);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ordens_servico_item_reclassificacoes WHERE produto_os_id=$1', [f.productId])).rows[0].count, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM servicos_os WHERE ordem_servico_id=$1', [f.orderId])).rows[0].count, 0);
});

test('rejeita mão de obra interna sem criar serviço ou reclassificação', async () => {
  const f = await fixture({ withLink: false, withEquivalent: false });
  await assert.rejects(
    () => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'INTERNO', justificativa: 'Destino interno solicitado para teste.' }, actor),
    /mão de obra interna ainda não está disponível/,
  );
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ordens_servico_item_reclassificacoes WHERE produto_os_id=$1', [f.productId])).rows[0].count, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM servicos_os WHERE ordem_servico_id=$1', [f.orderId])).rows[0].count, 0);
});

test('regulariza serviÃ§o legado INDETERMINADO e reutiliza correspondÃªncia Ãºnica na mesma transaÃ§Ã£o', async () => {
  const f = await fixture({ withLink: true, withEquivalent: true, equivalentClassification: 'INDETERMINADO' });
  await assert.rejects(
    () => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'ConfirmaÃ§Ã£o pendente.' }, actor),
    error => error instanceof Error && error.message.includes('Confirme explicitamente'),
  );
  assert.equal((await pool.query<{ classificacao_servico: string }>('SELECT classificacao_servico FROM servicos_os WHERE id=$1', [f.equivalentId])).rows[0].classificacao_servico, 'INDETERMINADO');
  const result = await reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'ServiÃ§o confirmado como terceirizado.', confirmar_regularizacao_terceiro: true }, actor);
  assert.equal(result.criouServico, false);
  assert.equal(result.regularizouClassificacao, true);
  assert.deepEqual((await pool.query<{ classificacao_servico: string; classificacao_origem: string }>('SELECT classificacao_servico,classificacao_origem FROM servicos_os WHERE id=$1', [f.equivalentId])).rows[0], { classificacao_servico: 'TERCEIRO', classificacao_origem: 'REVISAO' });
  assert.deepEqual((await pool.query<{ total_produtos: string; total_servicos_terceiros: string; total_os: string }>('SELECT total_produtos,total_servicos_terceiros,total_os FROM vw_ordens_servico_resumo WHERE id=$1', [f.orderId])).rows[0], { total_produtos: '0', total_servicos_terceiros: '60.00', total_os: '60.00' });
  assert.ok((await pool.query(`SELECT count(*)::int AS count FROM auditoria WHERE entidade='servicos_os' AND entidade_id=$1`, [f.equivalentId])).rows[0].count >= 1);
});

test('mantÃ©m ambiguidade sem escolher serviÃ§o arbitrariamente', async () => {
  const f = await fixture({ withLink: false, withEquivalent: true, equivalentClassification: 'TERCEIRO' });
  const second = randomUUID();
  await pool.query(`INSERT INTO servicos_os(id,ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem) VALUES($1,$2,'ITEM RECLASSIFICAR',60,'TERCEIRO','MANUAL')`, [second, f.orderId]);
  serviceIds.push(second);
  await assert.rejects(
    () => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'Ambiguidade controlada.' }, actor),
    error => error instanceof Error && error.message.includes('Foram encontrados'),
  );
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ordens_servico_item_reclassificacoes WHERE produto_os_id=$1', [f.productId])).rows[0].count, 0);
});

test('bloqueia serviÃ§o equivalente INTERNO mesmo com confirmaÃ§Ã£o', async () => {
  const f = await fixture({ withLink: false, withEquivalent: true, equivalentClassification: 'INTERNO' });
  await assert.rejects(
    () => reclassifyProdutoAsServico(f.orderId, f.productId, { tipo_servico: 'TERCEIRO', justificativa: 'ServiÃ§o interno nÃ£o deve ser convertido.', confirmar_regularizacao_terceiro: true }, actor),
    error => error instanceof Error && error.message.includes('INTERNOS'),
  );
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ordens_servico_item_reclassificacoes WHERE produto_os_id=$1', [f.productId])).rows[0].count, 0);
  assert.equal((await pool.query('SELECT classificacao_servico FROM servicos_os WHERE id=$1', [f.equivalentId])).rows[0].classificacao_servico, 'INTERNO');
});

after(async () => {
  if (orderIds.length) {
    await pool.query('DELETE FROM ordens_servico_item_reclassificacoes WHERE ordem_servico_id=ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM ordens_servico_item_vinculos WHERE ordem_servico_id=ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM servicos_os WHERE ordem_servico_id=ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM produtos_os WHERE ordem_servico_id=ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM auditoria WHERE entidade_id=ANY($1::text[])', [productIds]);
    await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orderIds]);
  }
  if (importIds.length) await pool.query('DELETE FROM importacoes_os WHERE id=ANY($1::uuid[])', [importIds]);
  await pool.end();
});
