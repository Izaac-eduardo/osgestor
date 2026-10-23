BEGIN;

CREATE TABLE ordens_servico_item_reclassificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE RESTRICT,
  produto_os_id UUID NOT NULL REFERENCES produtos_os(id) ON DELETE RESTRICT,
  servico_os_id UUID NOT NULL REFERENCES servicos_os(id) ON DELETE RESTRICT,
  importacao_id UUID REFERENCES importacoes_os(id) ON DELETE SET NULL,
  fingerprint_contexto VARCHAR(128),
  codigo_poli VARCHAR(100),
  descricao_original TEXT NOT NULL,
  quantidade_original NUMERIC(12,3) NOT NULL,
  unidade_original VARCHAR(20) NOT NULL,
  valor_unitario_original NUMERIC(12,2) NOT NULL,
  valor_total_original NUMERIC(14,2) NOT NULL,
  classificacao_anterior VARCHAR(20) NOT NULL DEFAULT 'PRODUTO'
    CHECK (classificacao_anterior = 'PRODUTO'),
  classificacao_nova VARCHAR(20) NOT NULL DEFAULT 'TERCEIRO'
    CHECK (classificacao_nova = 'TERCEIRO'),
  justificativa TEXT NOT NULL CHECK (btrim(justificativa) <> ''),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome VARCHAR(150) NOT NULL CHECK (btrim(usuario_nome) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ordens_servico_item_reclassificacoes_produto_uq UNIQUE (produto_os_id),
  CONSTRAINT ordens_servico_item_reclassificacoes_servico_uq UNIQUE (servico_os_id)
);

CREATE INDEX ordens_servico_item_reclassificacoes_order_idx
  ON ordens_servico_item_reclassificacoes(ordem_servico_id, created_at);
CREATE INDEX ordens_servico_item_reclassificacoes_fingerprint_idx
  ON ordens_servico_item_reclassificacoes(fingerprint_contexto);

CREATE OR REPLACE VIEW vw_ordens_servico_resumo AS
WITH s AS (
  SELECT ordem_servico_id, sum(valor) v FROM servicos_os GROUP BY 1
), p AS (
  SELECT p.ordem_servico_id, sum(COALESCE(p.valor_total_original, p.valor_total)) v
    FROM produtos_os p
   WHERE NOT EXISTS (
     SELECT 1 FROM ordens_servico_item_reclassificacoes r
      WHERE r.produto_os_id = p.id
   )
   GROUP BY 1
)
SELECT id,numero_os,obra_id,obra_codigo,obra_nome,prefixo_frota_id,frota_prefixo,frota_numero,frota_codigo,natureza_os,categoria_servico,prestador_terceiro,data_abertura,data_fechamento,status,
  CASE WHEN natureza_os='INTERNA' THEN sv ELSE 0 END total_mao_obra_interna,
  CASE WHEN natureza_os='TERCEIRO' THEN sv ELSE 0 END total_servicos_terceiros,
  pv total_produtos,(CASE WHEN natureza_os IN('INTERNA','TERCEIRO') THEN sv ELSE 0 END)+pv total_os,observacoes,created_at,updated_at
FROM (SELECT os.id,os.numero_os,os.obra_id,o.codigo obra_codigo,o.nome obra_nome,os.prefixo_frota_id,
  COALESCE(f.codigo,pf.codigo) frota_prefixo,os.frota_numero,COALESCE(f.codigo,pf.codigo||os.frota_numero) frota_codigo,
  os.natureza_os,os.categoria_servico,os.prestador_terceiro,os.data_abertura,os.data_fechamento,os.status,
  coalesce(s.v,0) sv,coalesce(p.v,0) pv,os.observacoes,os.created_at,os.updated_at
  FROM ordens_servico os JOIN obras o ON o.id=os.obra_id
  LEFT JOIN prefixos_frota pf ON pf.id=os.prefixo_frota_id LEFT JOIN frotas f ON f.id=os.frota_id
  LEFT JOIN s ON s.ordem_servico_id=os.id LEFT JOIN p ON p.ordem_servico_id=os.id)x;

COMMIT;
