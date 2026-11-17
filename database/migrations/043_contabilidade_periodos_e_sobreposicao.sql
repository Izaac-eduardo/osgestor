BEGIN;

ALTER TABLE importacoes_contabeis
  ADD COLUMN periodo_inicio DATE,
  ADD COLUMN periodo_fim DATE,
  ADD CONSTRAINT importacoes_contabeis_periodo_par_ck
    CHECK ((periodo_inicio IS NULL AND periodo_fim IS NULL)
      OR (periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL
        AND periodo_inicio >= DATE '2026-11-01'
        AND periodo_inicio <= periodo_fim));

ALTER TABLE importacoes_contabeis
  ADD CONSTRAINT importacoes_contabeis_periodo_sem_sobreposicao_excl
  EXCLUDE USING gist (
    daterange(periodo_inicio, periodo_fim, '[]') WITH &&
  )
  WHERE (status <> 'CANCELADA' AND periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL);

COMMIT;
