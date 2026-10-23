import type { PoolClient } from 'pg';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import { normalizeSearchText } from '../utils/text.js';
import { recordAudit } from './audit.service.js';
import { OrdemServicoServiceError } from './ordens-servico.service.js';
import { pool } from '../config/database.js';
import { hasReclassificacaoSchema } from './ordens-servico-reclassificacao-schema.service.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProductRow = {
  id: string;
  ordem_servico_id: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  valor_unitario: string;
  valor_total: string;
  valor_total_original: string | null;
  importacao_id: string | null;
  origem_linha: number | null;
  sequencia_importacao: number | null;
  codigo_poli: string | null;
  fingerprint_contexto: string | null;
  hash_conteudo: string | null;
};

type ServiceCandidate = { id: string; descricao: string; valor: string };
type ReclassificationDestination = 'TERCEIRO' | 'INTERNO';
type ProductLink = {
  id: string;
  importacao_id: string;
  fingerprint_contexto: string;
  origem_linha: number | null;
  sequencia_importacao: number | null;
  codigo_poli: string | null;
  hash_conteudo: string | null;
  evidencia_snapshot: Record<string, unknown>;
};

const requiredJustification = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length < 3) {
    throw new OrdemServicoServiceError(400, 'A justificativa é obrigatória e deve ter pelo menos 3 caracteres.');
  }
  if (value.trim().length > 2000) {
    throw new OrdemServicoServiceError(400, 'A justificativa não pode exceder 2000 caracteres.');
  }
  return value.trim();
};

const requestedServiceId = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new OrdemServicoServiceError(400, 'servico_equivalente_id deve ser um UUID válido.');
  }
  return value;
};

const requestedDestination = (value: unknown): ReclassificationDestination => {
  if (value !== 'TERCEIRO' && value !== 'INTERNO') {
    throw new OrdemServicoServiceError(400, 'tipo_servico deve ser TERCEIRO ou INTERNO.');
  }
  if (value === 'INTERNO') {
    throw new OrdemServicoServiceError(
      409,
      'A reclassificação para mão de obra interna ainda não está disponível: esta operação exigiria funcionário, execução e horas trabalhadas, além de suporte a composição financeira mista da O.S.',
      'RECLASSIFICACAO_INTERNA_INDISPONIVEL',
    );
  }
  return value;
};

const effectiveProductValue = (product: ProductRow): number => Number(product.valor_total_original ?? product.valor_total);
const sameItem = (product: ProductRow, service: ServiceCandidate): boolean =>
  normalizeSearchText(product.descricao) === normalizeSearchText(service.descricao)
  && effectiveProductValue(product).toFixed(2) === Number(service.valor).toFixed(2);

const rollbackAndThrow = async (client: PoolClient, error: unknown): Promise<never> => {
  await client.query('ROLLBACK');
  throw error;
};

export async function reclassifyProdutoAsServico(
  ordemServicoId: string,
  produtoId: string,
  body: unknown,
  actor: AuthenticatedRequestUser,
): Promise<{ servicoId: string; produtoId: string; criouServico: boolean; total: number; tipoServico: ReclassificationDestination }> {
  if (!await hasReclassificacaoSchema()) {
    throw new OrdemServicoServiceError(503, 'A reclassificação de produtos ainda não está disponível neste ambiente. A atualização estrutural necessária não foi aplicada.', 'RECLASSIFICACAO_INDISPONIVEL');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new OrdemServicoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  }
  const input = body as Record<string, unknown>;
  const destino = requestedDestination(input.tipo_servico);
  const justificativa = requiredJustification(input.justificativa);
  const servicoEquivalenteId = requestedServiceId(input.servico_equivalente_id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query<{ id: string }>('SELECT id FROM ordens_servico WHERE id=$1 FOR UPDATE', [ordemServicoId]);
    if (!order.rows[0]) throw new OrdemServicoServiceError(404, 'Ordem de Serviço não encontrada.');
    const productResult = await client.query<ProductRow>(
      `SELECT id,ordem_servico_id,descricao,quantidade,unidade,valor_unitario,valor_total,valor_total_original,
              importacao_id,origem_linha,sequencia_importacao,codigo_poli,fingerprint_contexto,hash_conteudo
         FROM produtos_os WHERE id=$1 AND ordem_servico_id=$2 FOR UPDATE`,
      [produtoId, ordemServicoId],
    );
    const product = productResult.rows[0];
    if (!product) throw new OrdemServicoServiceError(404, 'Produto não encontrado nesta Ordem de Serviço.');

    const previous = await client.query('SELECT id FROM ordens_servico_item_reclassificacoes WHERE produto_os_id=$1', [produtoId]);
    if (previous.rows[0]) throw new OrdemServicoServiceError(409, 'Este produto já foi reclassificado como serviço.');

    const services = (await client.query<ServiceCandidate>(
      'SELECT id,descricao,valor FROM servicos_os WHERE ordem_servico_id=$1 ORDER BY created_at,id',
      [ordemServicoId],
    )).rows;
    const candidates = services.filter(service => sameItem(product, service));
    if (candidates.length && !servicoEquivalenteId) {
      throw new OrdemServicoServiceError(
        409,
        `Existe serviço possivelmente equivalente (${candidates.map(value => value.descricao).join(', ')}). Selecione-o explicitamente para evitar duplicidade.`,
        'POSSIVEL_DUPLICIDADE',
      );
    }
    let serviceId = servicoEquivalenteId;
    let criouServico = false;
    if (serviceId) {
      if (!candidates.some(candidate => candidate.id === serviceId)) {
        throw new OrdemServicoServiceError(409, 'O serviço selecionado não corresponde exatamente ao produto.');
      }
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO servicos_os(
           ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem,
           importacao_id,origem_linha,sequencia_importacao,codigo_poli,fingerprint_contexto,hash_conteudo
         ) VALUES($1,$2,$3,'TERCEIRO','REVISAO',$4,$5,$6,$7,$8,$9) RETURNING id`,
        [ordemServicoId, product.descricao, effectiveProductValue(product), product.importacao_id, product.origem_linha,
          product.sequencia_importacao, product.codigo_poli, product.fingerprint_contexto, product.hash_conteudo],
      );
      serviceId = inserted.rows[0]!.id;
      criouServico = true;
    }

    const link = await client.query<ProductLink>(
      `SELECT id,importacao_id,fingerprint_contexto,origem_linha,sequencia_importacao,codigo_poli,hash_conteudo,evidencia_snapshot
         FROM ordens_servico_item_vinculos
        WHERE produto_os_id=$1 AND ordem_servico_id=$2 AND estado_vinculo='ATIVO'
        ORDER BY created_at,id LIMIT 1 FOR UPDATE`,
      [produtoId, ordemServicoId],
    );
    const sourceLink = link.rows[0];
    if (sourceLink) {
      await client.query(
        `UPDATE ordens_servico_item_vinculos
            SET estado_vinculo='REVOGADO', justificativa=$2, updated_at=now()
          WHERE id=$1`,
        [sourceLink.id, justificativa],
      );
      await client.query(
        `INSERT INTO ordens_servico_item_vinculos(
           importacao_id,ordem_servico_id,tipo_item,produto_os_id,servico_os_id,
           fingerprint_contexto,origem_linha,sequencia_importacao,codigo_poli,hash_conteudo,
           metodo_vinculo,homologado_por,homologado_em,justificativa,evidencia_snapshot
         ) VALUES($1,$2,'SERVICO',NULL,$3,$4,$5,$6,$7,$8,'MANUAL',$9,now(),$10,$11::jsonb)`,
        [sourceLink.importacao_id, ordemServicoId, serviceId, sourceLink.fingerprint_contexto, sourceLink.origem_linha,
          sourceLink.sequencia_importacao, sourceLink.codigo_poli, sourceLink.hash_conteudo, actor.username, justificativa,
          JSON.stringify({ ...sourceLink.evidencia_snapshot, reclassificacao: { produto_os_id: produtoId, produto_original_preservado: true } })],
      );
    }

    await client.query(
      `INSERT INTO ordens_servico_item_reclassificacoes(
         ordem_servico_id,produto_os_id,servico_os_id,importacao_id,fingerprint_contexto,codigo_poli,
         descricao_original,quantidade_original,unidade_original,valor_unitario_original,valor_total_original,
         justificativa,usuario_id,usuario_nome
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ordemServicoId, produtoId, serviceId, product.importacao_id, product.fingerprint_contexto, product.codigo_poli,
        product.descricao, product.quantidade, product.unidade, product.valor_unitario, effectiveProductValue(product),
        justificativa, actor.id, actor.username],
    );
    await recordAudit({
      actor,
      acao: 'EDITAR',
      modulo: 'ORDENS_SERVICO',
      entidade: 'ordens_servico_item_reclassificacoes',
      entidadeId: produtoId,
      dadosAnteriores: { classificacao: 'PRODUTO', produto_os_id: produtoId, ...product },
      dadosPosteriores: { classificacao: 'SERVICO_TERCEIRO', servico_os_id: serviceId, valor: effectiveProductValue(product), justificativa },
      metadata: { operacao: 'RECLASSIFICACAO_PRODUTO_SERVICO', criou_servico: criouServico },
    }, client);
    await client.query('COMMIT');
    return { servicoId: serviceId!, produtoId, criouServico, total: effectiveProductValue(product), tipoServico: destino };
  } catch (error) {
    return rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}
