CREATE TABLE IF NOT EXISTS poli_item_categorias_gerenciais (
  codigo_poli VARCHAR(100) NOT NULL,
  tipo_item VARCHAR(20) NOT NULL CHECK (tipo_item IN ('SERVICO', 'PRODUTO')),
  categoria_gerencial VARCHAR(80) NOT NULL,
  subcategoria_gerencial VARCHAR(120) NOT NULL,
  status_aprovacao VARCHAR(30) NOT NULL CHECK (status_aprovacao IN ('APROVADO', 'PENDENTE_APROVACAO')),
  fonte VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_poli, tipo_item)
);

ALTER TABLE servicos_os ADD COLUMN IF NOT EXISTS categoria_gerencial VARCHAR(80);
ALTER TABLE servicos_os ADD COLUMN IF NOT EXISTS subcategoria_gerencial VARCHAR(120);
ALTER TABLE servicos_os ADD COLUMN IF NOT EXISTS origem_classificacao VARCHAR(40);
ALTER TABLE produtos_os ADD COLUMN IF NOT EXISTS categoria_gerencial VARCHAR(80);
ALTER TABLE produtos_os ADD COLUMN IF NOT EXISTS subcategoria_gerencial VARCHAR(120);
ALTER TABLE produtos_os ADD COLUMN IF NOT EXISTS origem_classificacao VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_servicos_os_categoria_gerencial ON servicos_os(categoria_gerencial);
CREATE INDEX IF NOT EXISTS idx_produtos_os_categoria_gerencial ON produtos_os(categoria_gerencial);
CREATE INDEX IF NOT EXISTS idx_poli_item_categorias_gerenciais_status ON poli_item_categorias_gerenciais(status_aprovacao);

INSERT INTO poli_item_categorias_gerenciais (codigo_poli, tipo_item, categoria_gerencial, subcategoria_gerencial, status_aprovacao, fonte)
VALUES
  ('1892', 'SERVICO', 'ELETRICA', 'MÃO DE OBRA ELETRICISTA', 'APROVADO', 'POLI_OS_AUDITORIA_2026-10'),
  ('4782', 'SERVICO', 'MECANICA', 'MÃO DE OBRA MECÂNICO TERCEIRO', 'APROVADO', 'POLI_OS_AUDITORIA_2026-10'),
  ('4103', 'SERVICO', 'BORRACHARIA', 'SERVIÇO DE BORRACHARIA', 'APROVADO', 'POLI_OS_AUDITORIA_2026-10'),
  ('3419', 'SERVICO', 'TAG_PEDAGIO', 'MENSALIDADE', 'APROVADO', 'POLI_OS_AUDITORIA_2026-10'),
  ('2034', 'SERVICO', 'TAG_PEDAGIO', 'PASSAGEM', 'APROVADO', 'POLI_OS_AUDITORIA_2026-10'),
  ('1916', 'SERVICO', 'LAVAGEM', 'MÃO DE OBRA LAVADOR', 'APROVADO', 'POLI_OS_AUDITORIA_2026-10'),
  ('1919', 'SERVICO', 'MECANICA', 'MÃO DE OBRA MECÂNICO INTERNO', 'APROVADO', 'POLI_OS_AUDITORIA_2026-10'),
  ('2226', 'SERVICO', 'MECANICA', 'MANUTENÇÃO PREVENTIVA', 'PENDENTE_APROVACAO', 'PROPOSTA_POLI_OS_2026-10'),
  ('23205', 'SERVICO', 'BORRACHARIA', 'ALINHAMENTO/BALANCEAMENTO', 'PENDENTE_APROVACAO', 'PROPOSTA_POLI_OS_2026-10'),
  ('2604', 'SERVICO', 'FUNILARIA', 'TAPEÇARIA', 'PENDENTE_APROVACAO', 'PROPOSTA_POLI_OS_2026-10'),
  ('3336', 'SERVICO', 'LOGISTICA', 'FRETE', 'PENDENTE_APROVACAO', 'PROPOSTA_POLI_OS_2026-10')
ON CONFLICT (codigo_poli, tipo_item) DO NOTHING;
