BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM ordens_servico_item_reclassificacoes r
      LEFT JOIN produtos_os p
        ON p.id = r.produto_os_id
       AND p.ordem_servico_id = r.ordem_servico_id
      LEFT JOIN servicos_os s
        ON s.id = r.servico_os_id
       AND s.ordem_servico_id = r.ordem_servico_id
     WHERE p.id IS NULL OR s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Existem reclassificacoes com produto ou servico pertencente a outra O.S.; migration 037 abortada';
  END IF;
END $$;

DO $$
DECLARE
  existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO existing_definition
    FROM pg_constraint
   WHERE conrelid = 'servicos_os'::regclass
     AND conname = 'servicos_os_id_ordem_servico_id_key';
  IF existing_definition IS NULL THEN
    ALTER TABLE servicos_os
      ADD CONSTRAINT servicos_os_id_ordem_servico_id_key
      UNIQUE (id, ordem_servico_id);
  ELSIF existing_definition <> 'UNIQUE (id, ordem_servico_id)' THEN
    RAISE EXCEPTION 'A constraint servicos_os_id_ordem_servico_id_key possui definição incompatível: %', existing_definition;
  END IF;
END $$;

ALTER TABLE ordens_servico_item_reclassificacoes
  DROP CONSTRAINT ordens_servico_item_reclassificacoes_produto_os_id_fkey,
  DROP CONSTRAINT ordens_servico_item_reclassificacoes_servico_os_id_fkey;

ALTER TABLE ordens_servico_item_reclassificacoes
  ADD CONSTRAINT ordens_servico_item_reclassificacoes_produto_os_ordem_fkey
    FOREIGN KEY (produto_os_id, ordem_servico_id)
    REFERENCES produtos_os (id, ordem_servico_id) ON DELETE RESTRICT,
  ADD CONSTRAINT ordens_servico_item_reclassificacoes_servico_os_ordem_fkey
    FOREIGN KEY (servico_os_id, ordem_servico_id)
    REFERENCES servicos_os (id, ordem_servico_id) ON DELETE RESTRICT;

COMMIT;
