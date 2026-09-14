BEGIN;

ALTER TABLE servicos_os_execucoes
  ADD COLUMN ordem_servico_id UUID;

UPDATE servicos_os_execucoes e
SET ordem_servico_id = s.ordem_servico_id
FROM servicos_os s
WHERE s.id = e.servico_os_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM servicos_os_execucoes WHERE ordem_servico_id IS NULL) THEN
    RAISE EXCEPTION 'Não foi possível preencher ordem_servico_id de todas as execuções';
  END IF;
END $$;

ALTER TABLE servicos_os_execucoes
  ALTER COLUMN ordem_servico_id SET NOT NULL,
  ALTER COLUMN servico_os_id DROP NOT NULL;

ALTER TABLE servicos_os_execucoes
  DROP CONSTRAINT IF EXISTS servicos_os_execucoes_servico_os_id_fkey;

ALTER TABLE servicos_os
  ADD CONSTRAINT servicos_os_id_ordem_servico_id_key UNIQUE (id, ordem_servico_id);

ALTER TABLE servicos_os_execucoes
  ADD CONSTRAINT servicos_os_execucoes_ordem_fkey
    FOREIGN KEY (ordem_servico_id) REFERENCES ordens_servico(id) ON DELETE CASCADE,
  ADD CONSTRAINT servicos_os_execucoes_servico_ordem_fkey
    FOREIGN KEY (servico_os_id, ordem_servico_id)
    REFERENCES servicos_os(id, ordem_servico_id) ON DELETE CASCADE;

CREATE INDEX idx_servicos_os_execucoes_ordem ON servicos_os_execucoes(ordem_servico_id);
CREATE INDEX idx_servicos_os_execucoes_ordem_inicio
  ON servicos_os_execucoes(ordem_servico_id, inicio);

COMMIT;
