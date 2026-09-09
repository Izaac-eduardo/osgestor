BEGIN;

CREATE TABLE frotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefixo_frota_id UUID NOT NULL REFERENCES prefixos_frota(id) ON DELETE RESTRICT,
  numero VARCHAR(20) NOT NULL CHECK (numero ~ '^[0-9]{1,20}$'),
  codigo VARCHAR(30) NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z]{1,10}[0-9]{1,20}$'),
  descricao TEXT,
  placa TEXT UNIQUE CHECK (placa IS NULL OR placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  modelo TEXT,
  ano SMALLINT CHECK (ano BETWEEN 1900 AND 9999),
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prefixo_frota_id, numero)
);

-- The database derives the code even for SQL imports and keeps it in sync on prefix edits.
CREATE FUNCTION normalize_frota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefixo TEXT;
BEGIN
  SELECT codigo INTO STRICT prefixo FROM prefixos_frota WHERE id = NEW.prefixo_frota_id FOR SHARE;
  NEW.codigo := prefixo || NEW.numero;
  NEW.placa := nullif(upper(regexp_replace(NEW.placa, '[[:space:]-]+', '', 'g')), '');
  NEW.modelo := nullif(btrim(NEW.modelo), '');
  NEW.descricao := nullif(btrim(NEW.descricao), '');
  RETURN NEW;
END;
$$;
CREATE TRIGGER frota_normalize BEFORE INSERT OR UPDATE ON frotas
FOR EACH ROW EXECUTE FUNCTION normalize_frota();

CREATE FUNCTION sync_frota_prefixo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    UPDATE frotas SET codigo = NEW.codigo || numero WHERE prefixo_frota_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER frota_prefixo_sync AFTER UPDATE OF codigo ON prefixos_frota
FOR EACH ROW EXECUTE FUNCTION sync_frota_prefixo();

CREATE TRIGGER trg_frotas_updated BEFORE UPDATE ON frotas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_frotas_status ON frotas(status);
CREATE INDEX idx_frotas_modelo_normalizado ON frotas(upper(btrim(modelo)));
-- The composite unique index also covers lookups by prefixo_frota_id.
COMMIT;