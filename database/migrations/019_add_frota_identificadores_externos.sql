BEGIN;

CREATE TABLE frota_identificadores_externos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frota_id UUID NOT NULL REFERENCES frotas(id) ON DELETE CASCADE,
  origem VARCHAR(50) NOT NULL,
  identificador VARCHAR(100) NOT NULL,
  identificador_normalizado VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origem, identificador_normalizado)
);

CREATE INDEX idx_frota_identificadores_externos_frota
  ON frota_identificadores_externos(frota_id);

CREATE TRIGGER trg_frota_identificadores_externos_updated
BEFORE UPDATE ON frota_identificadores_externos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
