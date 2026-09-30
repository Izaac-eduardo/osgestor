BEGIN;

ALTER TABLE ordens_servico
  ADD COLUMN status_original VARCHAR(255) NULL,
  ADD COLUMN status_origem VARCHAR(20) NULL,
  ADD CONSTRAINT ordens_servico_status_origem_check
    CHECK (status_origem IS NULL OR status_origem IN ('AUTOMATICO', 'MANUAL'));

COMMIT;
