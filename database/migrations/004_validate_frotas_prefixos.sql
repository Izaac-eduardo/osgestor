BEGIN;

-- Legacy prefixes can have other formats, but master fleet codes require letters + digits.
-- Validate the actual prefix separately: A1 + 09 must not masquerade as A + 109.
CREATE OR REPLACE FUNCTION normalize_frota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefixo TEXT;
BEGIN
  SELECT codigo INTO STRICT prefixo FROM prefixos_frota WHERE id = NEW.prefixo_frota_id FOR SHARE;
  IF prefixo !~ '^[A-Z]{1,10}$' THEN
    RAISE EXCEPTION 'Prefixo de frota vinculado deve conter somente letras.'
      USING ERRCODE = '23514';
  END IF;
  NEW.codigo := prefixo || NEW.numero;
  NEW.placa := nullif(upper(regexp_replace(NEW.placa, '[[:space:]-]+', '', 'g')), '');
  NEW.modelo := nullif(btrim(NEW.modelo), '');
  NEW.descricao := nullif(btrim(NEW.descricao), '');
  RETURN NEW;
END;
$$;

COMMIT;