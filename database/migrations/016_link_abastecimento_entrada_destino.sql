BEGIN;

ALTER TABLE abastecimentos
  ADD COLUMN entrada_destino_id UUID NULL
    REFERENCES abastecimento_entrada_destinos(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_abastecimentos_entrada_destino
  ON abastecimentos(entrada_destino_id)
  WHERE entrada_destino_id IS NOT NULL;

COMMIT;
