BEGIN;

CREATE TABLE importacoes_os_resolucoes_manuais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_sistema VARCHAR(50) NOT NULL,
  hash_arquivo VARCHAR(64) NOT NULL,
  arquivo_nome VARCHAR(255) NOT NULL,
  numero_os BIGINT NOT NULL,
  campo VARCHAR(20) NOT NULL CHECK (campo IN ('frotaId', 'obraId')),
  identificador_original TEXT NOT NULL,
  identificador_normalizado TEXT NOT NULL,
  valor_selecionado UUID NOT NULL,
  decisao VARCHAR(20) NOT NULL DEFAULT 'APROVAR' CHECK (decisao = 'APROVAR'),
  decidido_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT importacoes_os_resolucoes_manuais_hash_chk
    CHECK (hash_arquivo ~ '^[0-9A-Fa-f]{64}$'),
  CONSTRAINT importacoes_os_resolucoes_manuais_identificador_chk
    CHECK (btrim(identificador_normalizado) <> '')
);

CREATE UNIQUE INDEX uq_importacoes_os_resolucoes_manuais_contexto
  ON importacoes_os_resolucoes_manuais
    (origem_sistema, hash_arquivo, numero_os, campo, identificador_normalizado);

CREATE INDEX idx_importacoes_os_resolucoes_manuais_hash
  ON importacoes_os_resolucoes_manuais(origem_sistema, hash_arquivo);

CREATE TRIGGER trg_importacoes_os_resolucoes_manuais_updated
  BEFORE UPDATE ON importacoes_os_resolucoes_manuais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
