BEGIN;

LOCK TABLE poli_item_categorias_gerenciais IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE poli_item_categorias_gerenciais_030 (
  codigo_poli VARCHAR(100) PRIMARY KEY,
  categoria_gerencial VARCHAR(80) NOT NULL,
  subcategoria_gerencial VARCHAR(120) NOT NULL
) ON COMMIT DROP;

INSERT INTO poli_item_categorias_gerenciais_030 (codigo_poli, categoria_gerencial, subcategoria_gerencial)
VALUES
  ('2226', 'MANUTENCAO_PREVENTIVA', 'MANUTENCAO PREVENTIVA'),
  ('23205', 'ALINHAMENTO_BALANCEAMENTO', 'ALINHAMENTO/BALANCEAMENTO'),
  ('2604', 'TAPEÇARIA', 'TAPEÇARIA'),
  ('3336', 'FRETE', 'FRETE'),
  ('16352', 'MANUTENCAO_PREVENTIVA', 'MANUTENCAO PREVENTIVA 1000 HOR'),
  ('22568', 'MANUTENCAO_PREVENTIVA', 'MANUTENCAO PREVENTIVA 2000 HOR'),
  ('9379', 'MANUTENCAO_PREVENTIVA', 'MANUTENCAO PREVENTIVA 6000 HOR'),
  ('2929', 'MANUTENCAO_PREVENTIVA', 'MANUTENCAO PREVENTIVA 4000 HOR'),
  ('25779', 'MANUTENCAO_PREVENTIVA', 'MANUTENCAO PREVENTIVA 9000 HOR'),
  ('5953', 'ALINHAMENTO_BALANCEAMENTO', 'ALINHAMENTO DIANTEIRO'),
  ('2229', 'GUINCHO', 'SERVICO DE GUINCHO'),
  ('12898', 'TORNO_USINAGEM', 'SERVICO DE TORNO TERCEIROS'),
  ('21888', 'ELETRICA', 'SOCORRO ELETRICO'),
  ('22385', 'BORRACHARIA', 'RECAPAGEM DE PNEUS'),
  ('3750', 'MECANICA', 'SUSPENSAO'),
  ('8240', 'SOLDA', 'MAO DE OBRA SOLDADOR'),
  ('20580', 'TACOGRAFO', 'AFERICAO'),
  ('16612', 'MECANICA', 'REPAROS GERAIS'),
  ('8139', 'MECANICA', 'REPAROS GERAIS'),
  ('8335', 'MECANICA', 'REPAROS GERAIS'),
  ('2472', 'MECANICA', 'SUSPENSAO'),
  ('3659', 'MECANICA', 'REPAROS GERAIS'),
  ('23378', 'MECANICA', 'REPAROS GERAIS'),
  ('3800', 'ALINHAMENTO_BALANCEAMENTO', 'BALANCEAMENTO'),
  ('7331', 'CHAVEIRO', 'SERVICO DE CHAVEIRO');

DO $$
DECLARE
  expected RECORD;
  current_mapping RECORD;
  source_name CONSTANT VARCHAR(120) := 'POLI_OS_APROVACAO_GERENCIAL_2026-10';
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('1892', 'ELETRICA', 'MÃO DE OBRA ELETRICISTA'),
      ('4782', 'MECANICA', 'MÃO DE OBRA MECÂNICO TERCEIRO'),
      ('4103', 'BORRACHARIA', 'SERVIÇO DE BORRACHARIA'),
      ('3419', 'TAG_PEDAGIO', 'MENSALIDADE'),
      ('2034', 'TAG_PEDAGIO', 'PASSAGEM')
    ) AS preserved(codigo_poli, categoria_gerencial, subcategoria_gerencial)
  LOOP
    SELECT categoria_gerencial, subcategoria_gerencial, status_aprovacao
      INTO current_mapping
      FROM poli_item_categorias_gerenciais
     WHERE codigo_poli = expected.codigo_poli AND tipo_item = 'SERVICO';
    IF NOT FOUND
       OR current_mapping.categoria_gerencial <> expected.categoria_gerencial
       OR current_mapping.subcategoria_gerencial <> expected.subcategoria_gerencial
       OR current_mapping.status_aprovacao <> 'APROVADO' THEN
      RAISE EXCEPTION 'Mapeamento aprovado preservado divergente: %', expected.codigo_poli;
    END IF;
  END LOOP;

  FOR expected IN SELECT * FROM poli_item_categorias_gerenciais_030 ORDER BY codigo_poli
  LOOP
    SELECT categoria_gerencial, subcategoria_gerencial, status_aprovacao
      INTO current_mapping
      FROM poli_item_categorias_gerenciais
     WHERE codigo_poli = expected.codigo_poli AND tipo_item = 'SERVICO';

    IF NOT FOUND THEN
      INSERT INTO poli_item_categorias_gerenciais
        (codigo_poli, tipo_item, categoria_gerencial, subcategoria_gerencial, status_aprovacao, fonte)
      VALUES
        (expected.codigo_poli, 'SERVICO', expected.categoria_gerencial, expected.subcategoria_gerencial, 'APROVADO', source_name);
    ELSIF current_mapping.categoria_gerencial = expected.categoria_gerencial
      AND current_mapping.subcategoria_gerencial = expected.subcategoria_gerencial
      AND current_mapping.status_aprovacao = 'APROVADO' THEN
      NULL;
    ELSIF expected.codigo_poli = '2226'
      AND current_mapping.categoria_gerencial = 'MECANICA'
      AND current_mapping.subcategoria_gerencial = 'MANUTENÇÃO PREVENTIVA'
      AND current_mapping.status_aprovacao = 'PENDENTE_APROVACAO' THEN
      UPDATE poli_item_categorias_gerenciais
         SET status_aprovacao = 'APROVADO', fonte = source_name, updated_at = now()
       WHERE codigo_poli = '2226' AND tipo_item = 'SERVICO'
         AND categoria_gerencial = 'MECANICA'
         AND subcategoria_gerencial = 'MANUTENÇÃO PREVENTIVA'
         AND status_aprovacao = 'PENDENTE_APROVACAO';
    ELSIF expected.codigo_poli = '23205'
      AND current_mapping.categoria_gerencial = 'BORRACHARIA'
      AND current_mapping.subcategoria_gerencial = 'ALINHAMENTO/BALANCEAMENTO'
      AND current_mapping.status_aprovacao = 'PENDENTE_APROVACAO' THEN
      UPDATE poli_item_categorias_gerenciais
         SET categoria_gerencial = 'ALINHAMENTO_BALANCEAMENTO', status_aprovacao = 'APROVADO', fonte = source_name, updated_at = now()
       WHERE codigo_poli = '23205' AND tipo_item = 'SERVICO'
         AND categoria_gerencial = 'BORRACHARIA'
         AND subcategoria_gerencial = 'ALINHAMENTO/BALANCEAMENTO'
         AND status_aprovacao = 'PENDENTE_APROVACAO';
    ELSIF expected.codigo_poli = '2604'
      AND current_mapping.categoria_gerencial = 'FUNILARIA'
      AND current_mapping.subcategoria_gerencial = 'TAPEÇARIA'
      AND current_mapping.status_aprovacao = 'PENDENTE_APROVACAO' THEN
      UPDATE poli_item_categorias_gerenciais
         SET categoria_gerencial = 'TAPEÇARIA', status_aprovacao = 'APROVADO', fonte = source_name, updated_at = now()
       WHERE codigo_poli = '2604' AND tipo_item = 'SERVICO'
         AND categoria_gerencial = 'FUNILARIA'
         AND subcategoria_gerencial = 'TAPEÇARIA'
         AND status_aprovacao = 'PENDENTE_APROVACAO';
    ELSIF expected.codigo_poli = '3336'
      AND current_mapping.categoria_gerencial = 'LOGISTICA'
      AND current_mapping.subcategoria_gerencial = 'FRETE'
      AND current_mapping.status_aprovacao = 'PENDENTE_APROVACAO' THEN
      UPDATE poli_item_categorias_gerenciais
         SET categoria_gerencial = 'FRETE', status_aprovacao = 'APROVADO', fonte = source_name, updated_at = now()
       WHERE codigo_poli = '3336' AND tipo_item = 'SERVICO'
         AND categoria_gerencial = 'LOGISTICA'
         AND subcategoria_gerencial = 'FRETE'
         AND status_aprovacao = 'PENDENTE_APROVACAO';
    ELSE
      RAISE EXCEPTION 'Conflito inesperado no código Poli OS %', expected.codigo_poli;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  total_codes INTEGER;
  pending_codes INTEGER;
  empty_codes INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_codes
    FROM poli_item_categorias_gerenciais
   WHERE tipo_item = 'SERVICO'
     AND codigo_poli IN (SELECT codigo_poli FROM poli_item_categorias_gerenciais_030);
  SELECT COUNT(*) INTO pending_codes
    FROM poli_item_categorias_gerenciais
   WHERE tipo_item = 'SERVICO'
     AND codigo_poli IN (SELECT codigo_poli FROM poli_item_categorias_gerenciais_030)
     AND status_aprovacao <> 'APROVADO';
  SELECT COUNT(*) INTO empty_codes
    FROM poli_item_categorias_gerenciais
   WHERE tipo_item = 'SERVICO'
     AND codigo_poli IN (SELECT codigo_poli FROM poli_item_categorias_gerenciais_030)
     AND (categoria_gerencial = '' OR subcategoria_gerencial = '');
  IF total_codes <> 25 OR pending_codes <> 0 OR empty_codes <> 0 THEN
    RAISE EXCEPTION 'Estado final inválido da migration 030: códigos=%, pendentes=%, vazios=%', total_codes, pending_codes, empty_codes;
  END IF;
END $$;

COMMIT;
