BEGIN;

ALTER TABLE ordens_servico
  ADD COLUMN lancador_codigo_original VARCHAR(50),
  ADD COLUMN lancador_nome_original VARCHAR(255),
  ADD COLUMN lancador_funcionario_id UUID;

ALTER TABLE ordens_servico
  ADD CONSTRAINT ordens_servico_lancador_funcionario_fkey
  FOREIGN KEY (lancador_funcionario_id)
  REFERENCES funcionarios(id)
  ON DELETE SET NULL;

CREATE INDEX idx_ordens_servico_lancador_funcionario
  ON ordens_servico(lancador_funcionario_id);

COMMIT;
