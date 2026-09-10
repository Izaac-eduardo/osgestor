BEGIN;

CREATE TABLE importacoes_os (
  id UUID PRIMARY KEY,
  arquivo_nome VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'CONCLUIDA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE importacoes_os_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID NOT NULL REFERENCES importacoes_os(id) ON DELETE CASCADE,
  numero_os BIGINT NOT NULL,
  payload_json JSONB NOT NULL,
  status_preview VARCHAR(30) NOT NULL,
  pendencias_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (importacao_id, numero_os)
);

CREATE TRIGGER trg_importacoes_os_updated BEFORE UPDATE ON importacoes_os
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_importacoes_os_itens_updated BEFORE UPDATE ON importacoes_os_itens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_importacoes_os_expiration ON importacoes_os(expires_at);
CREATE INDEX idx_importacoes_os_itens_importacao ON importacoes_os_itens(importacao_id);

COMMIT;
