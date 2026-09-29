BEGIN;

-- The original catalog already contains legacy bicos without a point. Keep
-- those rows for audit/history compatibility, but reject new unassigned rows.
ALTER TABLE abastecimento_bicos
  ADD CONSTRAINT abastecimento_bicos_ponto_obrigatorio
  CHECK (ponto_id IS NOT NULL) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_abastecimento_bicos_ponto_codigo
  ON abastecimento_bicos(ponto_id, codigo);

ALTER TABLE abastecimento_bicos
  DROP CONSTRAINT IF EXISTS abastecimento_bicos_codigo_key;

ALTER TABLE abastecimento_bicos
  ADD CONSTRAINT abastecimento_bicos_ponto_codigo_key UNIQUE (ponto_id, codigo);

COMMIT;
