BEGIN;

LOCK TABLE poli_item_categorias_gerenciais IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  current_mapping RECORD;
BEGIN
  SELECT codigo_poli, tipo_item, categoria_gerencial, subcategoria_gerencial,
         status_aprovacao, fonte
    INTO current_mapping
    FROM poli_item_categorias_gerenciais
   WHERE codigo_poli = '16612'
     AND tipo_item = 'SERVICO'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mapeamento esperado de 16612/SERVICO não encontrado';
  END IF;

  IF current_mapping.categoria_gerencial <> 'MECANICA'
     OR current_mapping.subcategoria_gerencial <> 'REPAROS GERAIS'
     OR current_mapping.fonte <> 'POLI_OS_APROVACAO_GERENCIAL_2026-10'
     OR current_mapping.status_aprovacao NOT IN ('APROVADO', 'PENDENTE_APROVACAO') THEN
    RAISE EXCEPTION 'Estado inesperado do mapeamento 16612/SERVICO';
  END IF;

  IF current_mapping.status_aprovacao = 'APROVADO' THEN
    UPDATE poli_item_categorias_gerenciais
       SET status_aprovacao = 'PENDENTE_APROVACAO', updated_at = now()
     WHERE codigo_poli = '16612'
       AND tipo_item = 'SERVICO'
       AND categoria_gerencial = 'MECANICA'
       AND subcategoria_gerencial = 'REPAROS GERAIS'
       AND fonte = 'POLI_OS_APROVACAO_GERENCIAL_2026-10'
       AND status_aprovacao = 'APROVADO';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Concorrência detectada ao suspender 16612/SERVICO';
    END IF;
  END IF;
END $$;

COMMIT;
