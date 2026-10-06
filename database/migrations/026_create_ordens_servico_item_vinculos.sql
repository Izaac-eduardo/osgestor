BEGIN;

ALTER TABLE produtos_os
  ADD CONSTRAINT produtos_os_id_ordem_servico_id_key
  UNIQUE (id, ordem_servico_id);

CREATE TABLE ordens_servico_item_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID NOT NULL
    REFERENCES importacoes_os(id) ON DELETE RESTRICT,
  ordem_servico_id UUID NOT NULL
    REFERENCES ordens_servico(id) ON DELETE RESTRICT,
  tipo_item VARCHAR(10) NOT NULL
    CHECK (tipo_item IN ('PRODUTO', 'SERVICO')),
  produto_os_id UUID,
  servico_os_id UUID,
  fingerprint_contexto VARCHAR(128) NOT NULL
    CHECK (btrim(fingerprint_contexto) <> ''),
  origem_linha INTEGER CHECK (origem_linha IS NULL OR origem_linha > 0),
  sequencia_importacao INTEGER
    CHECK (sequencia_importacao IS NULL OR sequencia_importacao > 0),
  codigo_poli VARCHAR(100),
  hash_conteudo VARCHAR(64),
  metodo_vinculo VARCHAR(32) NOT NULL
    CHECK (metodo_vinculo IN (
      'IMPORTADO_DIRETO',
      'MATCH_EXATO_HOMOLOGADO',
      'MANUAL'
    )),
  estado_vinculo VARCHAR(16) NOT NULL DEFAULT 'ATIVO'
    CHECK (estado_vinculo IN ('ATIVO', 'REVOGADO')),
  homologado_por VARCHAR(150),
  homologado_em TIMESTAMPTZ,
  justificativa TEXT,
  evidencia_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidencia_snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ordens_servico_item_vinculos_one_item_chk
    CHECK (
      (tipo_item = 'PRODUTO' AND produto_os_id IS NOT NULL AND servico_os_id IS NULL)
      OR
      (tipo_item = 'SERVICO' AND servico_os_id IS NOT NULL AND produto_os_id IS NULL)
    ),
  CONSTRAINT ordens_servico_item_vinculos_item_method_audit_chk
    CHECK (
      (
        metodo_vinculo = 'IMPORTADO_DIRETO'
        AND homologado_por IS NULL
        AND homologado_em IS NULL
      )
      OR
      (
        metodo_vinculo IN ('MATCH_EXATO_HOMOLOGADO', 'MANUAL')
        AND homologado_por IS NOT NULL
        AND btrim(homologado_por) <> ''
        AND homologado_em IS NOT NULL
      )
    ),
  CONSTRAINT ordens_servico_item_vinculos_produto_fk
    FOREIGN KEY (produto_os_id, ordem_servico_id)
    REFERENCES produtos_os (id, ordem_servico_id) ON DELETE RESTRICT,
  CONSTRAINT ordens_servico_item_vinculos_servico_fk
    FOREIGN KEY (servico_os_id, ordem_servico_id)
    REFERENCES servicos_os (id, ordem_servico_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ordens_servico_item_vinculos_active_occurrence_uidx
  ON ordens_servico_item_vinculos (
    importacao_id,
    ordem_servico_id,
    tipo_item,
    fingerprint_contexto
  )
  WHERE estado_vinculo = 'ATIVO';

CREATE UNIQUE INDEX ordens_servico_item_vinculos_active_product_uidx
  ON ordens_servico_item_vinculos (importacao_id, produto_os_id)
  WHERE estado_vinculo = 'ATIVO' AND produto_os_id IS NOT NULL;

CREATE UNIQUE INDEX ordens_servico_item_vinculos_active_service_uidx
  ON ordens_servico_item_vinculos (importacao_id, servico_os_id)
  WHERE estado_vinculo = 'ATIVO' AND servico_os_id IS NOT NULL;

CREATE INDEX ordens_servico_item_vinculos_order_active_idx
  ON ordens_servico_item_vinculos (ordem_servico_id, estado_vinculo);

CREATE INDEX ordens_servico_item_vinculos_import_active_idx
  ON ordens_servico_item_vinculos (importacao_id, estado_vinculo);

CREATE TRIGGER trg_ordens_servico_item_vinculos_updated_at
  BEFORE UPDATE ON ordens_servico_item_vinculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
