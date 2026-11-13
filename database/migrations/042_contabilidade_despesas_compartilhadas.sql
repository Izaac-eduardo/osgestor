-- Etapa 8: classificação explícita de combustíveis e despesas compartilhadas.
-- Esta migration é apenas preparatória e não deve ser executada nesta etapa.
ALTER TABLE lancamentos_contabeis
  ADD COLUMN IF NOT EXISTS despesa_compartilhada_status VARCHAR(32) NOT NULL DEFAULT 'NAO_COMPARTILHADA',
  ADD COLUMN IF NOT EXISTS decidido_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decidido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_decisao TEXT;

ALTER TABLE lancamentos_contabeis
  DROP CONSTRAINT IF EXISTS lancamentos_contabeis_despesa_compartilhada_status_check;

ALTER TABLE lancamentos_contabeis
  ADD CONSTRAINT lancamentos_contabeis_despesa_compartilhada_status_check
  CHECK (despesa_compartilhada_status IN ('NAO_COMPARTILHADA', 'AGUARDANDO_DECISAO', 'APROVADA', 'DESCONSIDERADA', 'FORA_ESCOPO_COMBUSTIVEL'));

CREATE INDEX IF NOT EXISTS idx_lancamentos_contabeis_despesa_compartilhada_status
  ON lancamentos_contabeis (despesa_compartilhada_status);
