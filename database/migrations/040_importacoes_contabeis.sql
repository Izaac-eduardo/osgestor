BEGIN;

CREATE TABLE importacoes_contabeis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_nome VARCHAR(255) NOT NULL,
  hash_arquivo CHAR(64) NOT NULL UNIQUE,
  tamanho_bytes BIGINT NOT NULL CHECK (tamanho_bytes >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ANALISADA' CHECK (status IN ('ANALISADA','CANCELADA')),
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lancamentos_contabeis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID NOT NULL REFERENCES importacoes_contabeis(id) ON DELETE RESTRICT,
  fingerprint CHAR(64) NOT NULL UNIQUE,
  planilha_original VARCHAR(255) NOT NULL,
  linha_original INTEGER NOT NULL CHECK (linha_original > 0),
  dados_originais JSONB NOT NULL,
  controle_original TEXT,
  data_lancamento DATE,
  data_conta DATE,
  nota_original TEXT,
  codigo_produto_original TEXT,
  produto_original TEXT,
  tipo_movimentacao_original TEXT,
  quantidade NUMERIC(18,6),
  valor_unitario NUMERIC(18,6),
  valor_total NUMERIC(18,2),
  subcentro_codigo_original TEXT,
  subcentro_original TEXT,
  plano_contas_codigo_original TEXT,
  plano_contas_original TEXT,
  categoria_contabil TEXT NOT NULL,
  classificacao VARCHAR(40) NOT NULL CHECK (classificacao IN ('PECAS_EXTERNAS','SERVICOS_TERCEIRIZADOS','PENDENTE')),
  frota_id UUID REFERENCES frotas(id) ON DELETE RESTRICT,
  identificacao_frota VARCHAR(30) NOT NULL CHECK (identificacao_frota IN ('EXATA','ALIAS','PENDENTE','MANUAL')),
  motivo_pendencia TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (importacao_id, linha_original)
);

CREATE INDEX lancamentos_contabeis_importacao_idx ON lancamentos_contabeis(importacao_id);
CREATE INDEX lancamentos_contabeis_frota_idx ON lancamentos_contabeis(frota_id);
CREATE INDEX lancamentos_contabeis_pendencias_idx ON lancamentos_contabeis(classificacao, identificacao_frota);
CREATE FUNCTION set_updated_at_contabilidade() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.atualizado_em=CURRENT_TIMESTAMP;RETURN NEW;END$$;
CREATE TRIGGER trg_lancamentos_contabeis_updated
BEFORE UPDATE ON lancamentos_contabeis FOR EACH ROW EXECUTE FUNCTION set_updated_at_contabilidade();

COMMIT;
