BEGIN;

-- A sessao existente de importacao tambem representa a fonte persistida.
-- Os campos sao opcionais para preservar previews/importacoes legadas.
ALTER TABLE importacoes_os
  ADD COLUMN origem_sistema VARCHAR(50),
  ADD COLUMN hash_arquivo VARCHAR(64),
  ADD COLUMN tamanho_arquivo BIGINT,
  ADD COLUMN tipo_importacao VARCHAR(30);

ALTER TABLE importacoes_os
  ADD CONSTRAINT importacoes_os_hash_arquivo_check
    CHECK (hash_arquivo IS NULL OR hash_arquivo ~ '^[0-9A-Fa-f]{64}$'),
  ADD CONSTRAINT importacoes_os_tamanho_arquivo_check
    CHECK (tamanho_arquivo IS NULL OR tamanho_arquivo >= 0);

-- Nao ha UNIQUE no hash: uma sessao de preview pode ser repetida sem
-- bloquear nova tentativa. A camada de aplicacao decidira quando um hash
-- concluido deve ser considerado reprocessamento.
CREATE INDEX idx_importacoes_os_hash_arquivo
  ON importacoes_os(hash_arquivo);

-- Estes campos registram proveniencia e contexto de importacao, nao um ID
-- oficial do Poli. Todos aceitam NULL para dados historicos/manuais.
ALTER TABLE produtos_os
  ADD COLUMN importacao_id UUID,
  ADD COLUMN origem_linha INTEGER,
  ADD COLUMN sequencia_importacao INTEGER,
  ADD COLUMN codigo_poli VARCHAR(50),
  ADD COLUMN fingerprint_contexto VARCHAR(128),
  ADD COLUMN hash_conteudo VARCHAR(64);

ALTER TABLE servicos_os
  ADD COLUMN importacao_id UUID,
  ADD COLUMN origem_linha INTEGER,
  ADD COLUMN sequencia_importacao INTEGER,
  ADD COLUMN codigo_poli VARCHAR(50),
  ADD COLUMN fingerprint_contexto VARCHAR(128),
  ADD COLUMN hash_conteudo VARCHAR(64);

ALTER TABLE servicos_os_execucoes
  ADD COLUMN importacao_id UUID,
  ADD COLUMN origem_linha INTEGER,
  ADD COLUMN sequencia_importacao INTEGER,
  ADD COLUMN servico_sequencia_importacao INTEGER,
  ADD COLUMN fingerprint_contexto VARCHAR(128),
  ADD COLUMN hash_conteudo VARCHAR(64);

ALTER TABLE produtos_os
  ADD CONSTRAINT produtos_os_importacao_fkey
    FOREIGN KEY (importacao_id) REFERENCES importacoes_os(id) ON DELETE SET NULL,
  ADD CONSTRAINT produtos_os_origem_linha_check
    CHECK (origem_linha IS NULL OR origem_linha > 0),
  ADD CONSTRAINT produtos_os_sequencia_importacao_check
    CHECK (sequencia_importacao IS NULL OR sequencia_importacao > 0),
  ADD CONSTRAINT produtos_os_hash_conteudo_check
    CHECK (hash_conteudo IS NULL OR hash_conteudo ~ '^[0-9A-Fa-f]{64}$');

ALTER TABLE servicos_os
  ADD CONSTRAINT servicos_os_importacao_fkey
    FOREIGN KEY (importacao_id) REFERENCES importacoes_os(id) ON DELETE SET NULL,
  ADD CONSTRAINT servicos_os_origem_linha_check
    CHECK (origem_linha IS NULL OR origem_linha > 0),
  ADD CONSTRAINT servicos_os_sequencia_importacao_check
    CHECK (sequencia_importacao IS NULL OR sequencia_importacao > 0),
  ADD CONSTRAINT servicos_os_hash_conteudo_check
    CHECK (hash_conteudo IS NULL OR hash_conteudo ~ '^[0-9A-Fa-f]{64}$');

ALTER TABLE servicos_os_execucoes
  ADD CONSTRAINT servicos_os_execucoes_importacao_fkey
    FOREIGN KEY (importacao_id) REFERENCES importacoes_os(id) ON DELETE SET NULL,
  ADD CONSTRAINT servicos_os_execucoes_origem_linha_check
    CHECK (origem_linha IS NULL OR origem_linha > 0),
  ADD CONSTRAINT servicos_os_execucoes_sequencia_importacao_check
    CHECK (sequencia_importacao IS NULL OR sequencia_importacao > 0),
  ADD CONSTRAINT servicos_os_execucoes_servico_sequencia_check
    CHECK (servico_sequencia_importacao IS NULL OR servico_sequencia_importacao > 0),
  ADD CONSTRAINT servicos_os_execucoes_hash_conteudo_check
    CHECK (hash_conteudo IS NULL OR hash_conteudo ~ '^[0-9A-Fa-f]{64}$');

-- Consultas futuras de reconciliacao partem da importacao e da O.S.; a
-- sequencia e apenas evidencia contextual, sem unicidade imposta.
CREATE INDEX idx_produtos_os_importacao_contexto
  ON produtos_os(importacao_id, ordem_servico_id, sequencia_importacao);
CREATE INDEX idx_servicos_os_importacao_contexto
  ON servicos_os(importacao_id, ordem_servico_id, sequencia_importacao);
CREATE INDEX idx_execucoes_os_importacao_contexto
  ON servicos_os_execucoes(importacao_id, ordem_servico_id, sequencia_importacao);

CREATE INDEX idx_produtos_os_fingerprint_contexto
  ON produtos_os(fingerprint_contexto);
CREATE INDEX idx_servicos_os_codigo_poli
  ON servicos_os(codigo_poli);
CREATE INDEX idx_servicos_os_fingerprint_contexto
  ON servicos_os(fingerprint_contexto);
CREATE INDEX idx_execucoes_os_fingerprint_contexto
  ON servicos_os_execucoes(fingerprint_contexto);

COMMIT;
