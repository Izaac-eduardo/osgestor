BEGIN;

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(80) NOT NULL
    CHECK (btrim(username) <> ''),
  email VARCHAR(320) NOT NULL
    CHECK (btrim(email) <> ''),
  password_hash TEXT NOT NULL
    CHECK (btrim(password_hash) <> ''),
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('ADMIN', 'OPERADOR', 'GESTOR')),
  status VARCHAR(10) NOT NULL DEFAULT 'ATIVO'
    CHECK (status IN ('ATIVO', 'INATIVO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX usuarios_username_ci_uidx
  ON usuarios (lower(btrim(username)));

CREATE UNIQUE INDEX usuarios_email_ci_uidx
  ON usuarios (lower(btrim(email)));

CREATE INDEX usuarios_status_role_idx
  ON usuarios (status, role);

CREATE INDEX usuarios_last_login_idx
  ON usuarios (last_login_at);

CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL
    REFERENCES usuarios(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL
    CHECK (btrim(token_hash) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT sessoes_expiration_chk
    CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX sessoes_token_hash_uidx
  ON sessoes (token_hash);

CREATE INDEX sessoes_usuario_idx
  ON sessoes (usuario_id);

CREATE INDEX sessoes_active_expiry_idx
  ON sessoes (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX sessoes_active_usuario_idx
  ON sessoes (usuario_id)
  WHERE revoked_at IS NULL;

COMMIT;
