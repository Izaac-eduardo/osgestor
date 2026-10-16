BEGIN;

CREATE TABLE ordens_servico_natureza_confirmacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE RESTRICT,
  natureza_banco VARCHAR(20) NOT NULL,
  natureza_confirmada VARCHAR(20) NOT NULL,
  natureza_xls VARCHAR(20) NOT NULL,
  origem_sistema VARCHAR(50) NOT NULL,
  importacao_id UUID NULL REFERENCES importacoes_os(id) ON DELETE SET NULL,
  arquivo_nome VARCHAR(255),
  hash_estado_banco CHAR(64) NOT NULL,
  hash_conteudo_xls CHAR(64) NOT NULL,
  assinatura_versao VARCHAR(40) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'ATIVA',
  motivo TEXT,
  confirmado_por UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  confirmado_username VARCHAR(80),
  confirmado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidada_em TIMESTAMPTZ,
  invalidada_por UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT os_natureza_confirmacoes_banco_chk CHECK (natureza_banco IN ('INTERNA', 'TERCEIRO', 'MATERIAL')),
  CONSTRAINT os_natureza_confirmacoes_confirmada_chk CHECK (natureza_confirmada IN ('INTERNA', 'TERCEIRO', 'MATERIAL')),
  CONSTRAINT os_natureza_confirmacoes_xls_chk CHECK (natureza_xls IN ('INTERNA', 'TERCEIRO', 'MATERIAL')),
  CONSTRAINT os_natureza_confirmacoes_origem_chk CHECK (btrim(origem_sistema) <> ''),
  CONSTRAINT os_natureza_confirmacoes_estado_chk CHECK (estado IN ('ATIVA', 'INVALIDADA', 'REVOGADA')),
  CONSTRAINT os_natureza_confirmacoes_hash_banco_chk CHECK (hash_estado_banco ~ '^[0-9a-f]{64}$'),
  CONSTRAINT os_natureza_confirmacoes_hash_xls_chk CHECK (hash_conteudo_xls ~ '^[0-9a-f]{64}$'),
  CONSTRAINT os_natureza_confirmacoes_decisao_chk CHECK (natureza_banco = natureza_confirmada),
  CONSTRAINT os_natureza_confirmacoes_invalidacao_chk CHECK ((estado = 'ATIVA' AND invalidada_em IS NULL) OR estado <> 'ATIVA')
);

CREATE INDEX os_natureza_confirmacoes_os_idx
  ON ordens_servico_natureza_confirmacoes(ordem_servico_id, confirmado_em DESC);

CREATE INDEX os_natureza_confirmacoes_contexto_idx
  ON ordens_servico_natureza_confirmacoes(ordem_servico_id, origem_sistema, natureza_xls, estado);

CREATE UNIQUE INDEX os_natureza_confirmacoes_ativa_uidx
  ON ordens_servico_natureza_confirmacoes(ordem_servico_id, origem_sistema, natureza_xls)
  WHERE estado = 'ATIVA';

CREATE INDEX os_natureza_confirmacoes_importacao_idx
  ON ordens_servico_natureza_confirmacoes(importacao_id)
  WHERE importacao_id IS NOT NULL;

COMMIT;
