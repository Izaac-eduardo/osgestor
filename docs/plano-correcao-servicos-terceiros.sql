-- CORREÇÃO HISTÓRICA DE SERVIÇOS TERCEIROS
-- DRY RUN OPERACIONAL: este arquivo termina obrigatoriamente com ROLLBACK.
-- Não executar casualmente. A versão persistente deverá ser autorizada
-- separadamente, após a revisão do relatório do dry run.

BEGIN;

CREATE TEMP TABLE _st_audit (
  numero_os integer NOT NULL,
  ordem_id uuid NOT NULL,
  produto_id uuid PRIMARY KEY,
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO _st_audit (numero_os, ordem_id, produto_id, descricao, valor) VALUES
 (46846,'50d26fd6-291a-4717-a029-ecde81d65f73','e4806561-222c-462e-8314-feab2bc21ef8','FRETE',143.31)
,(46847,'6cdc9629-481b-48d3-898a-4fd9800b345e','0ea73671-e775-4c34-a140-dd0913fb6b33','FRETE',83.00)
,(46850,'bd28fb61-7fbc-432e-9719-4a6c6943bcb9','ac640a63-a7db-4fa5-9d3e-e1292a38b953','FRETE',92.00)
,(46855,'f9f21288-7170-4a83-b104-bf04ae17bae8','d29ec7a9-d9e5-447d-87ae-66bfadb14fd2','FRETE',65.00)
,(46857,'3fa3e801-d08c-4be9-bc33-05f015e6e701','a9199305-d2e8-43ab-9daa-b0dd9cda7b2f','FRETE',65.00)
,(46859,'3e47f037-0a61-427f-9e2b-2d09cb5f271a','fdbfe8d1-e664-4f4b-a852-0b610b8635a5','ALINHAR/BALANCEAR',425.00)
,(46862,'7e359393-b191-4c5b-870e-c64ab667a4d8','6b6b6320-61b1-4d2d-ad9d-f95ab9436cb8','FRETE',94.00)
,(46863,'3d83da9c-a43e-41ed-8f5c-f5313a3e9045','d330ada0-e306-4049-9824-89ea291692c1','FRETE',92.00)
,(46864,'0ff0f1c4-d251-497d-a4d4-9072ba95e5f6','7a978997-e775-4262-8bc9-c72deffd1edc','FRETE',186.19)
,(46866,'0d3fcbf4-bb3c-4f42-9563-8fd49621cb86','3bb7adb6-82db-4696-91c9-65b7b871ee46','FRETE',65.00)
,(46867,'7d767819-35b5-4f32-808e-c54b2392122e','933de685-11f0-4bda-a4da-73474f1826d9','ALINHAR/BALANCEAR',180.00)
,(46873,'7c4166eb-20e5-45c9-9b7d-ebf97b603ac1','3cb92c0b-9815-4ed4-8396-e4b5e1d2f0c4','FRETE',138.39)
,(46874,'85ac17c7-fdd8-449f-9ec7-92ba535bfd76','dde27432-ca02-4332-950c-5ed8d3d60159','FRETE',205.59)
,(46875,'04ff6f9f-2540-429e-9602-8249a8820a0f','ab1f6ead-e9e3-4a73-9bfa-901aad3b55bf','FRETE',198.05)
,(46878,'1137545e-3db5-44f6-bffb-9881459f4e3c','b154ffc8-fa62-4d4b-b088-01534ce25eac','SOCORRO PARTE ELETRICA',450.00)
,(46879,'49f3129a-f28d-43a5-970d-f87088863910','a7b83301-80bd-44ff-aa21-462a17bf0416','SOCORRO PARTE ELETRICA',120.00)
,(46880,'17a7231b-88a1-44d1-b609-3490381164da','45ba9504-a9f0-4e3b-9fe2-664d5cd09269','SOCORRO PARTE ELETRICA',180.00)
,(46881,'ab11e9ac-9cb6-4ead-9754-d60e2b0c88fc','3b1898f8-ca76-4a91-9531-e77ef934f010','SOCORRO PARTE ELETRICA',180.00)
,(46893,'bb72eee2-bdbb-4bc3-a87c-c044a662f7a9','0e8197ba-a8e0-42cd-8ab8-897d7b808441','SOCORRO PARTE ELETRICA',230.00)
,(46897,'0fe1fa74-aed7-4a63-82ca-23456c25946c','26dfc1c5-6001-4e21-9d4d-c18af5819f5a','MANUTENCAO PREVENTIVA 6000 HOR',2833.64)
,(46900,'93b76cfb-2053-48e0-af94-e97f5c2b48dd','e8d82520-71c5-457a-bea7-d55e06e2fec6','FRETE',286.73)
,(46901,'94553e7b-e509-44c5-91a8-fda1e6a044ab','0b40db25-8341-4307-b316-f38683704908','FRETE',119.00)
,(46902,'bb0b077d-0587-4248-8367-03c353ac4404','25f8df72-14bb-4771-820a-7b988a2b0836','FRETE',65.00)
,(46951,'d2d68b35-6c96-4538-bf3a-b3ba8b1efc8a','97707a00-df6d-411c-853c-072bceca1458','SOCORRO PARTE ELETRICA',1200.00)
,(46958,'d0e6856f-3626-4a09-a36c-694b479d6929','2d2012d9-c09d-48bc-9670-04105360ef4c','ALINHAR/BALANCEAR',1350.00)
,(47003,'8913f224-2ccc-4237-a871-f54c7f52a0c4','5fc81aef-65ae-44db-9119-f144969bffa2','MANUTENCAO PREVENTIVA 1000 HOR',4101.00)
,(47011,'0ea46f36-5a60-4ead-ba60-fc9bf24304cd','bfe76156-edd0-4480-9ee0-ea63d7b703ac','ALINHAMENTO DIANTEIRO',110.00)
,(47012,'6b221588-da76-4534-92b1-81448fdb8e9b','3e012125-a2fb-4794-8f2f-acfaecfb4ac6','ALINHAR/BALANCEAR',284.00)
,(47018,'0c3cdc6d-6cf3-45ff-af11-82f83152cd9b','ec046da8-3c31-4d20-8e69-c7fdc1629e44','SOCORRO PARTE ELETRICA',180.00)
,(47064,'9518ba27-d9df-4442-b9c1-5864b0eb66d4','bd1d226e-27bd-4ac0-a101-4525f315f70d','FRETE',95.00)
,(47085,'548e1e41-4ffd-4d9f-be00-c98525d68530','3a4fca1d-dbb2-4482-9826-25de287563d0','FRETE',151.00)
,(47086,'910fed01-14b3-4d97-a133-1edd53889f46','831f23a4-2250-40e6-8469-1c2d2da74649','FRETE',74.00)
,(47087,'59cfad86-07cf-4cdd-a92a-a204d4d263a2','7dd1e9e9-b18e-4afb-a031-f1b0987e0612','FRETE',65.00)
,(47088,'e19189f9-b4fa-4535-8297-53ebafdf7026','8eea83c9-7bd0-4f97-ab18-1aebdb05ce97','FRETE',65.00)
,(47092,'7ac3dc61-c60b-4c25-9473-a9937a88c940','af6431cb-d110-49c3-8b83-425372e5aab2','ALINHAMENTO DIANTEIRO',874.00)
,(47093,'65ff20d9-0a02-4609-b316-2e5438d7a1bc','0856a931-fa15-4176-9f38-f7ae1c3b357c','ALINHAR/BALANCEAR',220.00)
,(47094,'f4b05c84-17b5-4f5f-a1a1-122b0ee21457','52405265-70b7-47ff-a6b0-7737940622f8','ALINHAMENTO DIANTEIRO',244.00)
,(47096,'82974a07-1f59-4c7f-8f46-43ba35d5839b','9bd3146a-cdd5-4df9-9f2f-6ef7191c306c','ALINHAMENTO DIANTEIRO',794.00)
,(47099,'f8bb9b74-e942-4aac-9b50-02fe5b6522be','1368b5cb-c0fb-456c-96f2-39604751b71a','MANUTENCAO PREVENTIVA 4000 HOR',3466.17)
,(47100,'15fb9a18-4e8b-4cdd-94ab-afa9cb0b462d','c03efd5d-0be3-4bc3-b9c1-d7fc43231e97','MANUTENCAO PREVENTIVA 6000 HOR',2390.27)
,(47101,'28c40bd5-655b-44e6-bf0f-2a30ca46b3d6','e8618fd0-af6c-418b-a47c-ecc5ab5a04d4','ALINHAMENTO DIANTEIRO',2486.00);

DO $$
BEGIN
  IF (SELECT count(*) FROM _st_audit) <> 41
     OR (SELECT sum(valor) FROM _st_audit) <> 24646.34
     OR (SELECT count(DISTINCT produto_id) FROM _st_audit) <> 41
     OR EXISTS (SELECT 1 FROM _st_audit WHERE numero_os=46899)
  THEN RAISE EXCEPTION 'Lista fechada inválida'; END IF;
  IF EXISTS (
    SELECT 1 FROM _st_audit a
    LEFT JOIN produtos_os p ON p.id=a.produto_id
    LEFT JOIN ordens_servico o ON o.id=a.ordem_id
    WHERE p.id IS NULL OR p.ordem_servico_id IS DISTINCT FROM a.ordem_id
       OR p.descricao IS DISTINCT FROM a.descricao OR p.valor_total IS DISTINCT FROM a.valor
       OR p.quantidade IS DISTINCT FROM 1.000::numeric OR p.unidade IS DISTINCT FROM 'UN'
       OR o.id IS NULL OR o.numero_os IS DISTINCT FROM a.numero_os
       OR o.natureza_os IS DISTINCT FROM 'TERCEIRO'
  ) THEN RAISE EXCEPTION 'Pré-validação dos produtos falhou'; END IF;
  IF EXISTS (SELECT 1 FROM _st_audit WHERE numero_os=46899)
  THEN RAISE EXCEPTION '46899 entrou no lote'; END IF;
  IF EXISTS (SELECT 1 FROM _st_audit a JOIN servicos_os s
    ON s.ordem_servico_id=a.ordem_id AND s.descricao=a.descricao AND s.valor=a.valor)
  THEN RAISE EXCEPTION 'Correspondência de serviço já existente'; END IF;
END $$;

CREATE TEMP TABLE _st_before ON COMMIT DROP AS
SELECT v.id AS ordem_id,v.numero_os,v.total_produtos,v.total_servicos_terceiros,v.total_os,a.valor_migrado
FROM vw_ordens_servico_resumo v
JOIN (SELECT ordem_id,sum(valor) valor_migrado FROM _st_audit GROUP BY ordem_id) a ON a.ordem_id=v.id;

CREATE TEMP TABLE _st_inserted (id uuid PRIMARY KEY,ordem_servico_id uuid,descricao text,valor numeric(12,2)) ON COMMIT DROP;
WITH novos AS (
  INSERT INTO servicos_os(ordem_servico_id,descricao,valor)
  SELECT ordem_id,descricao,valor FROM _st_audit
  RETURNING id,ordem_servico_id,descricao,valor
)
INSERT INTO _st_inserted SELECT * FROM novos;

DO $$
BEGIN
  IF (SELECT count(*) FROM _st_inserted) <> 41 OR EXISTS (
    SELECT 1 FROM _st_audit a WHERE NOT EXISTS (SELECT 1 FROM _st_inserted i
      WHERE i.ordem_servico_id=a.ordem_id AND i.descricao=a.descricao AND i.valor=a.valor))
  THEN RAISE EXCEPTION 'INSERT temporário divergente'; END IF;
END $$;

CREATE TEMP TABLE _st_deleted (id uuid PRIMARY KEY) ON COMMIT DROP;
WITH removidos AS (
  DELETE FROM produtos_os p USING _st_audit a
  WHERE p.id=a.produto_id AND p.ordem_servico_id=a.ordem_id RETURNING p.id
)
INSERT INTO _st_deleted SELECT * FROM removidos;

DO $$
BEGIN
  IF (SELECT count(*) FROM _st_deleted) <> 41
     OR EXISTS (SELECT 1 FROM produtos_os p JOIN _st_audit a ON a.produto_id=p.id)
  THEN RAISE EXCEPTION 'DELETE temporário divergente'; END IF;
  IF EXISTS (SELECT 1 FROM _st_before b JOIN vw_ordens_servico_resumo v ON v.id=b.ordem_id
    WHERE v.total_produtos IS DISTINCT FROM b.total_produtos-b.valor_migrado
       OR v.total_servicos_terceiros IS DISTINCT FROM b.total_servicos_terceiros+b.valor_migrado
       OR v.total_os IS DISTINCT FROM b.total_os)
  THEN RAISE EXCEPTION 'Delta financeiro divergente'; END IF;
  IF (SELECT sum(b.total_produtos-v.total_produtos) FROM _st_before b JOIN vw_ordens_servico_resumo v ON v.id=b.ordem_id) <> 24646.34
     OR (SELECT sum(v.total_servicos_terceiros-b.total_servicos_terceiros) FROM _st_before b JOIN vw_ordens_servico_resumo v ON v.id=b.ordem_id) <> 24646.34
     OR (SELECT sum(v.total_os-b.total_os) FROM _st_before b JOIN vw_ordens_servico_resumo v ON v.id=b.ordem_id) <> 0
  THEN RAISE EXCEPTION 'Delta global divergente'; END IF;
END $$;

SELECT 'DRY_RUN' etapa,count(*) inseridos FROM _st_inserted;
SELECT 'DRY_RUN' etapa,count(*) removidos FROM _st_deleted;
SELECT v.numero_os,b.total_produtos produtos_antes,v.total_produtos produtos_depois,
 b.total_servicos_terceiros servicos_antes,v.total_servicos_terceiros servicos_depois,
 b.total_os total_antes,v.total_os total_depois
FROM _st_before b JOIN vw_ordens_servico_resumo v ON v.id=b.ordem_id
WHERE v.numero_os IN (46846,46859,46878,46897) ORDER BY v.numero_os;
SELECT p.id,o.numero_os,p.descricao,p.valor_total FROM produtos_os p JOIN ordens_servico o ON o.id=p.ordem_servico_id
WHERE o.numero_os=46899 AND p.descricao='MENSALIDADE / LICENCA DE USO' AND p.valor_total=900.00;

-- Dry run: substituir por COMMIT somente após autorização separada.
ROLLBACK;
