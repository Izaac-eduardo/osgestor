BEGIN;
ALTER TABLE ordens_servico DROP CONSTRAINT IF EXISTS ordens_servico_categoria_servico_check;
ALTER TABLE ordens_servico ADD CONSTRAINT ordens_servico_categoria_servico_check
  CHECK (categoria_servico IS NULL OR categoria_servico IN ('LAVAGEM','MECANICA','AUTO_ELETRICA','ELETRICA','BORRACHARIA','LUBRIFICACAO','SOLDAGEM','FUNILARIA','HIDRAULICA','OUTROS'));
COMMIT;
