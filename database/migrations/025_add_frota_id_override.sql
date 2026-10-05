BEGIN;

ALTER TABLE ordens_servico_overrides
  ADD COLUMN frota_id_override UUID NULL
    REFERENCES frotas(id) ON DELETE RESTRICT;

ALTER TABLE ordens_servico_overrides
  DROP CONSTRAINT IF EXISTS ordens_servico_overrides_campo_check;

ALTER TABLE ordens_servico_overrides
  ADD CONSTRAINT ordens_servico_overrides_campo_check
    CHECK (campo IN ('natureza_os', 'obra_id', 'status', 'frota_id'));

ALTER TABLE ordens_servico_overrides
  ADD CONSTRAINT ordens_servico_overrides_frota_id_check
    CHECK ((campo = 'frota_id' AND frota_id_override IS NOT NULL)
        OR (campo <> 'frota_id' AND frota_id_override IS NULL));

COMMIT;
