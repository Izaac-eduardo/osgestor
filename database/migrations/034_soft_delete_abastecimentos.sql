BEGIN;

ALTER TABLE abastecimentos
  ADD COLUMN excluido_at TIMESTAMPTZ NULL,
  ADD COLUMN excluido_por UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN motivo_exclusao TEXT NULL;

ALTER TABLE abastecimentos
  ADD CONSTRAINT abastecimentos_motivo_exclusao_ck
    CHECK (motivo_exclusao IS NULL OR length(btrim(motivo_exclusao)) BETWEEN 1 AND 500);

CREATE INDEX idx_abastecimentos_ativos_data
  ON abastecimentos(data_hora DESC, id DESC)
  WHERE excluido_at IS NULL;

CREATE INDEX idx_abastecimentos_excluidos_data
  ON abastecimentos(excluido_at DESC, id DESC)
  WHERE excluido_at IS NOT NULL;

COMMIT;
