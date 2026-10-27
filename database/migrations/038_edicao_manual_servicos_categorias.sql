BEGIN;

ALTER TABLE servicos_os
  ADD COLUMN IF NOT EXISTS descricao_editada_manualmente BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS categoria_gerencial_editada_manualmente BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
