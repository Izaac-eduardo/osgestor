BEGIN;

CREATE TABLE ordens_servico_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  campo VARCHAR(30) NOT NULL CHECK (campo IN ('natureza_os', 'obra_id', 'status')),
  valor_origem JSONB NOT NULL,
  valor_override JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ordem_servico_id, campo)
);

CREATE INDEX idx_ordens_servico_overrides_ordem
  ON ordens_servico_overrides(ordem_servico_id);

CREATE TRIGGER trg_ordens_servico_overrides_updated
BEFORE UPDATE ON ordens_servico_overrides
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
