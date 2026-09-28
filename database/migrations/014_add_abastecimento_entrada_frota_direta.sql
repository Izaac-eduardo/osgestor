BEGIN;

ALTER TABLE abastecimento_entrada_destinos
  ADD COLUMN tipo_destino VARCHAR(20) NOT NULL DEFAULT 'PONTO',
  ADD COLUMN frota_id UUID NULL REFERENCES frotas(id) ON DELETE RESTRICT;

ALTER TABLE abastecimento_entrada_destinos
  ALTER COLUMN ponto_id DROP NOT NULL;

ALTER TABLE abastecimento_entrada_destinos
  ADD CONSTRAINT abastecimento_entrada_destino_tipo_ck
    CHECK (tipo_destino IN ('PONTO', 'FROTA_DIRETA')),
  ADD CONSTRAINT abastecimento_entrada_destino_referencia_ck
    CHECK (
      (tipo_destino = 'PONTO' AND ponto_id IS NOT NULL AND frota_id IS NULL)
      OR
      (tipo_destino = 'FROTA_DIRETA' AND ponto_id IS NULL AND frota_id IS NOT NULL)
    );

CREATE INDEX idx_abastecimento_entrada_destinos_frota
  ON abastecimento_entrada_destinos(frota_id);

COMMIT;
