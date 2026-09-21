BEGIN;

CREATE TABLE abastecimento_produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('DIESEL', 'ARLA')),
  permite_entrada BOOLEAN NOT NULL DEFAULT TRUE,
  permite_distribuicao BOOLEAN NOT NULL DEFAULT FALSE,
  permite_abastecimento BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_pontos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nome VARCHAR(120) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('COMBOIO', 'POSTO', 'CAMINHAO_TANQUE', 'OUTRO')),
  frota_id UUID NULL REFERENCES frotas(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  observacoes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_pontos_produtos (
  ponto_id UUID NOT NULL REFERENCES abastecimento_pontos(id) ON DELETE RESTRICT,
  produto_id UUID NOT NULL REFERENCES abastecimento_produtos(id) ON DELETE RESTRICT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ponto_id, produto_id)
);

CREATE TABLE abastecimento_bicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(30) NOT NULL UNIQUE,
  descricao TEXT NULL,
  produto_id UUID NOT NULL REFERENCES abastecimento_produtos(id) ON DELETE RESTRICT,
  ponto_id UUID NULL REFERENCES abastecimento_pontos(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_terceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) NULL UNIQUE,
  nome VARCHAR(255) NOT NULL,
  documento VARCHAR(30) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  observacoes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_destinacoes_especiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_entrada DATE NOT NULL,
  numero_nf VARCHAR(80) NOT NULL,
  produto_id UUID NOT NULL REFERENCES abastecimento_produtos(id) ON DELETE RESTRICT,
  litros_nf NUMERIC(14,3) NOT NULL CHECK (litros_nf > 0),
  valor_total_nf NUMERIC(14,2) NOT NULL CHECK (valor_total_nf >= 0),
  observacoes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_entrada_destinos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id UUID NOT NULL REFERENCES abastecimento_entradas(id) ON DELETE RESTRICT,
  ponto_id UUID NOT NULL REFERENCES abastecimento_pontos(id) ON DELETE RESTRICT,
  litros NUMERIC(14,3) NOT NULL CHECK (litros > 0),
  observacoes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_nome VARCHAR(255) NOT NULL,
  arquivo_sha256 CHAR(64) NOT NULL,
  origem_sistema VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('ANALISANDO', 'PREVIA', 'CONCLUIDA', 'CANCELADA', 'ERRO')),
  parser_versao VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizada_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abastecimento_importacao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID NOT NULL REFERENCES abastecimento_importacoes(id) ON DELETE CASCADE,
  identificador_externo VARCHAR(100) NULL,
  linha_original INTEGER NOT NULL CHECK (linha_original > 0),
  planilha VARCHAR(120) NOT NULL,
  payload_original JSONB NOT NULL,
  payload_normalizado JSONB NOT NULL,
  status_preview VARCHAR(30) NOT NULL CHECK (status_preview IN ('PRONTO', 'PENDENTE_OBRA', 'PENDENTE_DESTINATARIO', 'FORA_ESCOPO', 'JA_IMPORTADO', 'ERRO', 'IMPORTADO')),
  pendencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (importacao_id, identificador_externo)
);

CREATE TABLE abastecimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_sistema VARCHAR(30) NOT NULL,
  identificador_externo VARCHAR(100) NOT NULL,
  data_hora TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  produto_id UUID NOT NULL REFERENCES abastecimento_produtos(id) ON DELETE RESTRICT,
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE RESTRICT,
  tipo_destinatario VARCHAR(20) NOT NULL CHECK (tipo_destinatario IN ('FROTA', 'TERCEIRO', 'EXTERNA', 'ESPECIAL')),
  frota_id UUID NULL REFERENCES frotas(id) ON DELETE RESTRICT,
  terceiro_id UUID NULL REFERENCES abastecimento_terceiros(id) ON DELETE RESTRICT,
  destinacao_especial_id UUID NULL REFERENCES abastecimento_destinacoes_especiais(id) ON DELETE RESTRICT,
  identificacao_original TEXT NOT NULL,
  placa_original TEXT NULL,
  frota_original TEXT NULL,
  litros NUMERIC(14,3) NOT NULL CHECK (litros > 0),
  valor_total NUMERIC(14,4) NOT NULL CHECK (valor_total >= 0),
  km_hr NUMERIC(14,3) NULL,
  horimetro NUMERIC(14,3) NULL,
  bico_codigo_original VARCHAR(30) NULL,
  bico_descricao_original TEXT NULL,
  frentista_original TEXT NULL,
  arquivo_nome_original VARCHAR(255) NOT NULL,
  planilha_original VARCHAR(120) NULL,
  linha_original INTEGER NULL CHECK (linha_original IS NULL OR linha_original > 0),
  payload_original JSONB NOT NULL,
  importacao_id UUID NULL REFERENCES abastecimento_importacoes(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abastecimentos_origem_identificador_key UNIQUE (origem_sistema, identificador_externo),
  CONSTRAINT abastecimentos_destinatario_consistente CHECK (
    (tipo_destinatario = 'FROTA' AND frota_id IS NOT NULL AND terceiro_id IS NULL AND destinacao_especial_id IS NULL)
    OR (tipo_destinatario = 'TERCEIRO' AND frota_id IS NULL AND terceiro_id IS NOT NULL AND destinacao_especial_id IS NULL)
    OR (tipo_destinatario = 'ESPECIAL' AND frota_id IS NULL AND terceiro_id IS NULL AND destinacao_especial_id IS NOT NULL)
    OR (tipo_destinatario = 'EXTERNA' AND frota_id IS NULL AND terceiro_id IS NULL AND destinacao_especial_id IS NULL)
  )
);

CREATE INDEX idx_abastecimento_pontos_produtos_produto ON abastecimento_pontos_produtos(produto_id);
CREATE INDEX idx_abastecimento_bicos_produto ON abastecimento_bicos(produto_id);
CREATE INDEX idx_abastecimento_bicos_ponto ON abastecimento_bicos(ponto_id);
CREATE INDEX idx_abastecimento_entradas_data ON abastecimento_entradas(data_entrada);
CREATE INDEX idx_abastecimento_entradas_produto_data ON abastecimento_entradas(produto_id, data_entrada);
CREATE INDEX idx_abastecimento_entrada_destinos_entrada ON abastecimento_entrada_destinos(entrada_id);
CREATE INDEX idx_abastecimento_entrada_destinos_ponto ON abastecimento_entrada_destinos(ponto_id);
CREATE INDEX idx_abastecimento_importacoes_sha256 ON abastecimento_importacoes(arquivo_sha256);
CREATE INDEX idx_abastecimento_importacao_itens_importacao ON abastecimento_importacao_itens(importacao_id);
CREATE INDEX idx_abastecimentos_data ON abastecimentos(data_hora);
CREATE INDEX idx_abastecimentos_obra_data ON abastecimentos(obra_id, data_hora);
CREATE INDEX idx_abastecimentos_frota_data ON abastecimentos(frota_id, data_hora);
CREATE INDEX idx_abastecimentos_terceiro_data ON abastecimentos(terceiro_id, data_hora);
CREATE INDEX idx_abastecimentos_especial_data ON abastecimentos(destinacao_especial_id, data_hora);
CREATE INDEX idx_abastecimentos_produto_data ON abastecimentos(produto_id, data_hora);

CREATE TRIGGER trg_abastecimento_produtos_updated BEFORE UPDATE ON abastecimento_produtos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_pontos_updated BEFORE UPDATE ON abastecimento_pontos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_bicos_updated BEFORE UPDATE ON abastecimento_bicos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_terceiros_updated BEFORE UPDATE ON abastecimento_terceiros
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_especiais_updated BEFORE UPDATE ON abastecimento_destinacoes_especiais
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_entradas_updated BEFORE UPDATE ON abastecimento_entradas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_entrada_destinos_updated BEFORE UPDATE ON abastecimento_entrada_destinos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_importacoes_updated BEFORE UPDATE ON abastecimento_importacoes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimento_importacao_itens_updated BEFORE UPDATE ON abastecimento_importacao_itens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_abastecimentos_updated BEFORE UPDATE ON abastecimentos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO abastecimento_produtos (codigo, nome, tipo, permite_entrada, permite_distribuicao, permite_abastecimento)
VALUES
  ('DIESEL_S500', 'Diesel S500', 'DIESEL', TRUE, TRUE, TRUE),
  ('DIESEL_S10', 'Diesel S10', 'DIESEL', TRUE, TRUE, TRUE),
  ('ARLA_32', 'ARLA 32', 'ARLA', TRUE, FALSE, FALSE);

INSERT INTO abastecimento_pontos (codigo, nome, tipo)
VALUES
  ('CC01', 'CC01', 'COMBOIO'),
  ('CC02', 'CC02', 'COMBOIO'),
  ('CC03', 'CC03', 'COMBOIO'),
  ('CC04', 'CC04', 'COMBOIO'),
  ('POSTO', 'Posto', 'POSTO'),
  ('CTC01', 'CTC01', 'CAMINHAO_TANQUE');

INSERT INTO abastecimento_pontos_produtos (ponto_id, produto_id)
SELECT p.id, pr.id
FROM abastecimento_pontos p
JOIN abastecimento_produtos pr ON pr.codigo = 'DIESEL_S500'
WHERE p.codigo IN ('CC01', 'CC02', 'CC03', 'CC04', 'POSTO');

INSERT INTO abastecimento_pontos_produtos (ponto_id, produto_id)
SELECT p.id, pr.id
FROM abastecimento_pontos p
JOIN abastecimento_produtos pr ON pr.codigo = 'DIESEL_S10'
WHERE p.codigo IN ('CC04', 'POSTO');

INSERT INTO abastecimento_bicos (codigo, descricao, produto_id)
SELECT b.codigo, 'OLEO DIESEL S500 - COMUM', pr.id
FROM (VALUES ('9'), ('19'), ('22')) AS b(codigo)
JOIN abastecimento_produtos pr ON pr.codigo = 'DIESEL_S500';

INSERT INTO abastecimento_destinacoes_especiais (codigo, nome, descricao)
VALUES ('PIRULITO', 'PIRULITO', 'Destinação especial de combustível');

-- A regra ARLA 32 é representada por permite_distribuicao = FALSE.
-- A camada de serviço deve rejeitar destinos para entradas de produtos sem essa permissão.
-- Não há comparação entre litros_nf e a soma dos destinos, nem coluna de diferença.

COMMIT;
