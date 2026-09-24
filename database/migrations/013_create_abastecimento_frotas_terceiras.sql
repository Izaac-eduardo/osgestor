BEGIN;

CREATE TABLE abastecimento_frotas_terceiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identificacao VARCHAR(100) NOT NULL,
  identificacao_normalizada VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('PLACA', 'EQUIPAMENTO', 'OUTRO')),
  terceiro_id UUID NULL REFERENCES abastecimento_terceiros(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  observacoes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abastecimento_frota_terceira_identificacao_valida CHECK (btrim(identificacao) <> '' AND btrim(identificacao_normalizada) <> '')
);

CREATE UNIQUE INDEX uq_abastecimento_frota_terceira_identificacao
  ON abastecimento_frotas_terceiras (identificacao_normalizada);
CREATE INDEX idx_abastecimento_frotas_terceiras_tipo
  ON abastecimento_frotas_terceiras (tipo);
CREATE INDEX idx_abastecimento_frotas_terceiras_status
  ON abastecimento_frotas_terceiras (status);
CREATE INDEX idx_abastecimento_frotas_terceiras_terceiro
  ON abastecimento_frotas_terceiras (terceiro_id);

CREATE TRIGGER trg_abastecimento_frotas_terceiras_updated BEFORE UPDATE ON abastecimento_frotas_terceiras
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
