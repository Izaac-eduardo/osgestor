BEGIN;

CREATE TABLE servicos_os_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_os_id UUID NOT NULL REFERENCES servicos_os ON DELETE CASCADE,
  funcionario_id UUID NOT NULL REFERENCES funcionarios ON DELETE RESTRICT,
  inicio TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  fim TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicos_os_execucoes_periodo_valido CHECK (fim > inicio),
  CONSTRAINT servicos_os_execucoes_mesmo_dia CHECK (inicio::date = fim::date)
);

CREATE INDEX idx_servicos_os_execucoes_servico ON servicos_os_execucoes(servico_os_id);
CREATE INDEX idx_servicos_os_execucoes_funcionario ON servicos_os_execucoes(funcionario_id);
CREATE INDEX idx_servicos_os_execucoes_inicio ON servicos_os_execucoes(inicio);

CREATE TRIGGER trg_servicos_os_execucoes_updated
BEFORE UPDATE ON servicos_os_execucoes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
