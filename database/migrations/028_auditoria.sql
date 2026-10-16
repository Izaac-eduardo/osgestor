BEGIN;

CREATE TABLE auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  username VARCHAR(80),
  role VARCHAR(20),
  acao VARCHAR(40) NOT NULL,
  modulo VARCHAR(80) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  entidade_id TEXT,
  dados_anteriores JSONB,
  dados_posteriores JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auditoria_role_chk CHECK (role IS NULL OR role IN ('ADMIN', 'OPERADOR', 'GESTOR'))
);

CREATE INDEX auditoria_created_at_idx ON auditoria (created_at DESC, id DESC);
CREATE INDEX auditoria_usuario_idx ON auditoria (usuario_id, created_at DESC);
CREATE INDEX auditoria_modulo_acao_idx ON auditoria (modulo, acao, created_at DESC);
CREATE INDEX auditoria_entidade_idx ON auditoria (entidade, entidade_id, created_at DESC);

COMMIT;
