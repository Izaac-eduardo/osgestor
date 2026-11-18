BEGIN;

ALTER TABLE lancamentos_contabeis
  ADD COLUMN IF NOT EXISTS natureza_revisao VARCHAR(40),
  ADD COLUMN IF NOT EXISTS destinacao_revisao VARCHAR(32),
  ADD COLUMN IF NOT EXISTS status_revisao VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS justificativa_revisao TEXT,
  ADD COLUMN IF NOT EXISTS revisado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origem_revisao VARCHAR(30);

ALTER TABLE lancamentos_contabeis
  ADD CONSTRAINT lancamentos_contabeis_natureza_revisao_ck CHECK (natureza_revisao IS NULL OR natureza_revisao IN ('PECAS_MATERIAIS_MANUTENCAO','SERVICOS_TERCEIRIZADOS','PNEUS','OLEOS_LUBRIFICANTES','MATERIAIS_ELETRICOS','FERRAGENS_PARAFUSOS','USO_E_CONSUMO','ESTOQUE_ALMOXARIFADO','FORA_ESCOPO','PENDENTE')),
  ADD CONSTRAINT lancamentos_contabeis_destinacao_revisao_ck CHECK (destinacao_revisao IS NULL OR destinacao_revisao IN ('APLICACAO_DIRETA_FROTA','ESTOQUE_ALMOXARIFADO','FORA_DO_ESCOPO','PENDENTE','NAO_APLICAVEL')),
  ADD CONSTRAINT lancamentos_contabeis_status_revisao_ck CHECK (status_revisao IN ('PENDENTE','RESOLVIDA'));

CREATE INDEX IF NOT EXISTS idx_lancamentos_contabeis_revisao ON lancamentos_contabeis(status_revisao, natureza_revisao, destinacao_revisao);

CREATE TABLE IF NOT EXISTS lancamentos_contabeis_revisoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES lancamentos_contabeis(id) ON DELETE RESTRICT,
  importacao_id UUID NOT NULL REFERENCES importacoes_contabeis(id) ON DELETE RESTRICT,
  natureza_anterior VARCHAR(40),
  natureza_nova VARCHAR(40) NOT NULL,
  destinacao_anterior VARCHAR(32),
  destinacao_nova VARCHAR(32) NOT NULL,
  classificacao_anterior VARCHAR(40),
  classificacao_nova VARCHAR(40) NOT NULL,
  frota_anterior UUID REFERENCES frotas(id) ON DELETE RESTRICT,
  frota_nova UUID REFERENCES frotas(id) ON DELETE RESTRICT,
  justificativa TEXT NOT NULL CHECK (length(btrim(justificativa)) >= 3),
  decidido_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  origem VARCHAR(30) NOT NULL DEFAULT 'REVISAO_MANUAL'
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_contabeis_revisoes_item ON lancamentos_contabeis_revisoes(lancamento_id, decidido_em);

COMMIT;
