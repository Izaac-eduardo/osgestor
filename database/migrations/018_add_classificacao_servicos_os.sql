BEGIN;

ALTER TABLE servicos_os
  ADD COLUMN classificacao_servico VARCHAR(20) NOT NULL DEFAULT 'INDETERMINADO',
  ADD COLUMN classificacao_origem VARCHAR(20) NOT NULL DEFAULT 'LEGADO';

ALTER TABLE servicos_os
  ADD CONSTRAINT servicos_os_classificacao_servico_check
  CHECK (classificacao_servico IN ('INTERNO', 'TERCEIRO', 'INDETERMINADO')),
  ADD CONSTRAINT servicos_os_classificacao_origem_check
  CHECK (classificacao_origem IN ('LEGADO', 'IMPORTACAO', 'MANUAL', 'REVISAO'));

COMMIT;
