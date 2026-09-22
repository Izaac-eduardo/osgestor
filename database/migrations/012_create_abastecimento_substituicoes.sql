BEGIN;

ALTER TABLE abastecimento_importacao_itens
  DROP CONSTRAINT IF EXISTS abastecimento_importacao_itens_status_preview_check;
ALTER TABLE abastecimento_importacao_itens
  ADD CONSTRAINT abastecimento_importacao_itens_status_preview_check
  CHECK (status_preview IN ('PRONTO','PENDENTE_OBRA','PENDENTE_DESTINATARIO','FORA_ESCOPO','JA_IMPORTADO','SUBSTITUICAO','SUBSTITUICAO_JA_REGISTRADA','ERRO','IMPORTADO'));

CREATE TABLE IF NOT EXISTS abastecimento_substituicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abastecimento_id UUID NOT NULL REFERENCES abastecimentos(id) ON DELETE RESTRICT,
  origem_sistema VARCHAR(30) NOT NULL,
  identificador_externo VARCHAR(100) NOT NULL,
  identificador_principal VARCHAR(100) NOT NULL,
  tipo_vinculo VARCHAR(30) NOT NULL DEFAULT 'SUBSTITUICAO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abastecimento_substituicoes_identidade_key UNIQUE (origem_sistema, identificador_externo),
  CONSTRAINT abastecimento_substituicoes_alvo_key UNIQUE (abastecimento_id, origem_sistema, identificador_externo),
  CONSTRAINT abastecimento_substituicoes_nao_auto CHECK (identificador_externo <> identificador_principal)
);

ALTER TABLE abastecimento_importacao_itens
  ADD COLUMN IF NOT EXISTS substituicao_abastecimento_id UUID REFERENCES abastecimentos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS substituicao_origem_sistema VARCHAR(30),
  ADD COLUMN IF NOT EXISTS substituicao_identificador_principal VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_abastecimento_substituicoes_alvo ON abastecimento_substituicoes(abastecimento_id);
CREATE INDEX IF NOT EXISTS idx_abastecimento_substituicoes_principal ON abastecimento_substituicoes(origem_sistema, identificador_principal);

COMMIT;
