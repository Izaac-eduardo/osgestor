BEGIN;

CREATE TABLE obra_identificadores_externos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  origem VARCHAR(50) NOT NULL,
  identificador VARCHAR(255) NOT NULL,
  identificador_normalizado VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origem, identificador_normalizado)
);

CREATE INDEX idx_obra_identificadores_externos_obra
  ON obra_identificadores_externos(obra_id);

CREATE TRIGGER trg_obra_identificadores_externos_updated
BEFORE UPDATE ON obra_identificadores_externos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
