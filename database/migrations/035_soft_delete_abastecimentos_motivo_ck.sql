BEGIN;

DROP INDEX IF EXISTS uq_abastecimentos_entrada_destino;

CREATE UNIQUE INDEX uq_abastecimentos_entrada_destino
  ON abastecimentos(entrada_destino_id)
  WHERE entrada_destino_id IS NOT NULL
    AND excluido_at IS NULL;

ALTER TABLE abastecimentos
  DROP CONSTRAINT IF EXISTS abastecimentos_motivo_exclusao_ck;

ALTER TABLE abastecimentos
  ADD CONSTRAINT abastecimentos_motivo_exclusao_ck
    CHECK (
      excluido_at IS NULL
      OR (
        motivo_exclusao IS NOT NULL
        AND length(btrim(motivo_exclusao)) BETWEEN 1 AND 500
      )
    );

COMMIT;
