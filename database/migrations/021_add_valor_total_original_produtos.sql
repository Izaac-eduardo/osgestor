BEGIN;

ALTER TABLE produtos_os
  ADD COLUMN valor_total_original NUMERIC(14,2) NULL;

CREATE OR REPLACE VIEW vw_ordens_servico_resumo AS
WITH s AS (
  SELECT ordem_servico_id, sum(valor) v FROM servicos_os GROUP BY 1
), p AS (
  SELECT ordem_servico_id, sum(COALESCE(valor_total_original, valor_total)) v
  FROM produtos_os GROUP BY 1
)
SELECT id,numero_os,obra_id,obra_codigo,obra_nome,prefixo_frota_id,frota_prefixo,frota_numero,frota_codigo,natureza_os,categoria_servico,prestador_terceiro,data_abertura,data_fechamento,status,
  CASE WHEN natureza_os='INTERNA' THEN sv ELSE 0 END total_mao_obra_interna,
  CASE WHEN natureza_os='TERCEIRO' THEN sv ELSE 0 END total_servicos_terceiros,
  pv total_produtos,(CASE WHEN natureza_os IN('INTERNA','TERCEIRO') THEN sv ELSE 0 END)+pv total_os,observacoes,created_at,updated_at
FROM (SELECT os.id,os.numero_os,os.obra_id,o.codigo obra_codigo,o.nome obra_nome,os.prefixo_frota_id,
  COALESCE(f.codigo,pf.codigo) frota_prefixo,os.frota_numero,COALESCE(f.codigo,pf.codigo||os.frota_numero) frota_codigo,
  os.natureza_os,os.categoria_servico,os.prestador_terceiro,os.data_abertura,os.data_fechamento,os.status,
  coalesce(s.v,0) sv,coalesce(p.v,0) pv,os.observacoes,os.created_at,os.updated_at
  FROM ordens_servico os JOIN obras o ON o.id=os.obra_id
  LEFT JOIN prefixos_frota pf ON pf.id=os.prefixo_frota_id LEFT JOIN frotas f ON f.id=os.frota_id
  LEFT JOIN s ON s.ordem_servico_id=os.id LEFT JOIN p ON p.ordem_servico_id=os.id)x;

CREATE OR REPLACE VIEW vw_gastos_obra_frota AS
SELECT obra_id,obra_codigo,obra_nome,prefixo_frota_id,frota_prefixo,frota_numero,frota_codigo,count(*) quantidade_os,sum(total_mao_obra_interna) total_mao_obra_interna,sum(total_servicos_terceiros) total_servicos_terceiros,sum(total_produtos) total_produtos,sum(total_os) total_gasto
FROM vw_ordens_servico_resumo WHERE status<>'CANCELADA'
GROUP BY 1,2,3,4,5,6,7;

CREATE OR REPLACE VIEW vw_gastos_obra AS
SELECT obra_id,obra_codigo,obra_nome,count(*) quantidade_os,sum(total_mao_obra_interna) total_mao_obra_interna,sum(total_servicos_terceiros) total_servicos_terceiros,sum(total_produtos) total_produtos,sum(total_os) total_gasto
FROM vw_ordens_servico_resumo WHERE status<>'CANCELADA'
GROUP BY 1,2,3;

COMMIT;
