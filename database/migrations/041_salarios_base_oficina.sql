BEGIN;

CREATE TABLE salarios_base_oficina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL CHECK (ano BETWEEN 1900 AND 9999),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_consolidado NUMERIC(14,2) NOT NULL CHECK (valor_consolidado >= 0),
  observacoes TEXT,
  atualizado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ano, mes)
);

CREATE INDEX salarios_base_oficina_competencia_idx ON salarios_base_oficina(ano, mes);

COMMIT;
