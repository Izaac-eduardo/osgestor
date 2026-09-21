BEGIN;

CREATE TABLE abastecimento_terceiro_identificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terceiro_id UUID NOT NULL REFERENCES abastecimento_terceiros(id) ON DELETE RESTRICT,
  identificacao VARCHAR(100) NOT NULL,
  identificacao_normalizada VARCHAR(100) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('PLACA', 'FROTA_EXTERNA', 'GERAL', 'CODIGO', 'OUTRO')),
  observacoes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abastecimento_terceiro_identificacao_valida CHECK (btrim(identificacao) <> '' AND btrim(identificacao_normalizada) <> '')
);

CREATE UNIQUE INDEX uq_abastecimento_terceiro_identificacao_ativa
  ON abastecimento_terceiro_identificacoes (identificacao_normalizada)
  WHERE status = 'ATIVO';
CREATE UNIQUE INDEX uq_abastecimento_terceiro_identificacao_no_terceiro
  ON abastecimento_terceiro_identificacoes (terceiro_id, identificacao_normalizada);
CREATE INDEX idx_abastecimento_terceiro_identificacoes_terceiro
  ON abastecimento_terceiro_identificacoes (terceiro_id);
CREATE INDEX idx_abastecimento_terceiro_identificacoes_status
  ON abastecimento_terceiro_identificacoes (status);

CREATE TRIGGER trg_abastecimento_terceiro_identificacoes_updated BEFORE UPDATE ON abastecimento_terceiro_identificacoes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Operational maçaricos use the fleet code itself as their plate-like identifier.
-- This extends the legacy plate check without changing migration 010.
ALTER TABLE frotas DROP CONSTRAINT IF EXISTS frotas_placa_check;
ALTER TABLE frotas ADD CONSTRAINT frotas_placa_check
  CHECK (placa IS NULL OR placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' OR placa = codigo);

COMMIT;
