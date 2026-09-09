# Cadastro mestre de frotas — relatório de revisão

Data: 09/09/2026.

## Resultado

Cadastro mestre, API, tela, migrations e importador implementados.
Relação oficial importada: **294 frotas inseridas, 0 atualizadas e 16 prefixos criados**.
A reconferência encontrou 294 registros inalterados, sem novas inserções ou atualizações.
Os 294 registros gravados foram comparados campo a campo com o relatório validado.

Banco final: 45 O.S. preservadas, 44 prefixos e 294 frotas.
Não houve commit, push ou staging. Nenhum processamento de PDF foi implementado.
## Estado inicial

- Branch: `frontend`.
- Git status: limpo.
- Último commit: `13f6127` — `fix: layout e informações do relatório inclui o problema, corrigido textos na page de frota`.
- Backend: Express, TypeScript, PostgreSQL; ExcelJS já era uma dependência.
- Migrations existentes: 001_create_oficina_schema.sql e 002_create_servicos_os_execucoes.sql.
- Prefixos: UUID, código VARCHAR(10) único e normalizado, descrição, status e timestamps.
- O.S.: FK prefixo_frota_id e frota_numero INTEGER positivo; a view concatena prefixo e inteiro.
- Tela /frotas: gerenciava somente prefixos; foram preservados componentes e endpoints de prefixos.
- Endpoints existentes: GET, POST, PUT, PATCH status e DELETE em /prefixos-frota.
- Não foram encontradas instruções AGENTS.md aplicáveis.

## Análise do arquivo fornecido

Arquivo atual: `\\192.168.50.164\Oficina\LUIS\Relação Frota Itaipu Engenharia.xlsx`.
A nova leitura confirmou um XLSX válido, com a aba FROTA PEDREIRA,
390 linhas de layout e 294 registros, correspondentes ao totalizador da relação.

SHA-256: `c52ac92522f899b7ed54203943c455b0a279de95d6174ee34b7b5eaac5afa8b0`.

Como o arquivo estava aberto, a leitura usou uma cópia temporária com compartilhamento
de leitura. O hash do original foi conferido novamente antes da gravação.
O original não foi editado. O banco é a fonte do cadastro após a carga.

A leitura anterior encontrou conteúdo PDF; esse impedimento foi resolvido com o arquivo
Excel atual. Os resultados abaixo correspondem exclusivamente ao XLSX validado.
## Modelagem

Tabela `frotas`:

| Campo | Tipo e regra |
| --- | --- |
| id | UUID, PK, gen_random_uuid() |
| prefixo_frota_id | UUID, FK para prefixos_frota, ON DELETE RESTRICT |
| numero | VARCHAR(20), somente dígitos, mantém zeros |
| codigo | VARCHAR(30), único, derivado pelo banco de prefixo + numero |
| descricao | TEXT opcional |
| placa | TEXT opcional, normalizada, UNIQUE, formato brasileiro antigo/Mercosul |
| modelo | TEXT opcional, sem UNIQUE |
| ano | SMALLINT opcional, inteiro entre 1900 e 9999 |
| status | ATIVO ou INATIVO, padrão ATIVO |
| created_at / updated_at | TIMESTAMPTZ, atualização por trigger |

Constraints e índices:
- Código único e par (prefixo_frota_id, numero) único.
- Placa única; múltiplos NULL permitidos.
- Índice por status.
- Índice não único por upper(btrim(modelo)).
- O índice composto único também atende consultas por prefixo.
- Triggers normalizam os campos, derivam código e sincronizam alterações de prefixo.
- Prefixos vinculados ao cadastro mestre devem conter somente letras.
  Prefixos legados sem vínculo permanecem compatíveis com as regras anteriores.
- Erros de FK/RESTRICT são retornados como conflito; alterações de prefixo incompatíveis retornam 400.

## Normalização

- A-09, A09, a-09 e a09 tornam-se A09; prefixo A e número textual "09".
- CT-04 torna-se CT04 com número "04"; EH-03 torna-se EH03.
- A9 permanece diferente de A09.
- Placa é uppercase, sem espaços/hífens; ABC-1234 e abc1234 são comparáveis.
- Modelo é armazenado com trim, preservando espaços internos e caracteres.
  Comparação exata por modelo ignora caixa; "416 4" não é convertido para "4164".
- Utilitários reutilizáveis: src/utils/frotas.ts.

## Migrations

- `database/migrations/003_create_frotas.sql`: tabela, constraints, índices e triggers.
- `database/migrations/004_validate_frotas_prefixos.sql`: proteção contra prefixos ambíguos,
  por exemplo A1 + 09. Criada separadamente porque a migration 003 já havia sido aplicada.

As migrations 001 e 002 não foram modificadas. A 003 não foi editada após sua aplicação.
Antes e depois das migrations: 45 O.S. e 28 prefixos; tabela frotas com zero registros oficiais.

## Importação da relação oficial

Perfil explícito `--profile itaipu --year-policy fabricacao`, implementado em
`database/imports/itaipu-workbook.ts`. O perfil reconhece as categorias e o layout
da relação; o importador genérico permanece disponível para planilhas tabulares.

| Métrica | Resultado da carga |
| --- | ---: |
| Frotas encontradas e importadas | 294 |
| Inseridas | 294 |
| Atualizadas | 0 |
| Prefixos distintos na relação | 42 |
| Novos prefixos criados | 16 |
| Com placa | 156 |
| Sem placa | 138 |
| Com modelo | 126 |
| Grupos de modelos repetidos | 23 |
| Códigos duplicados | 0 |
| Placas duplicadas | 0 |
| Linhas com erro | 0 |
| Linhas de layout ignoradas | 96 |

Linhas ignoradas: 85 cabeçalhos de seção, 4 títulos, 4 linhas vazias e 3 totalizadores.
Nenhuma linha de frota foi descartada.

Foram registrados 58 ajustes auditáveis: 38 anos compostos e 20 identificações.
Os campos originais de código, descrição, ano e identificação constam do relatório,
com aba, linha e seção. RENAVAM, lugares, marca e chassi/série não foram importados.

Regras aplicadas:
- Anos compostos usam o primeiro valor (fabricação), preservando o original no relatório.
- CT31 consta como 2025/56 na origem: armazenado 2025; a inconsistência do segundo
  valor está registrada, sem presumir uma correção para 2026.
- VAN: 9 valores sob MODELO são placas, mapeadas para placa.
- COMPRESSOR DE AR: 4 valores sob PLACA são identificações de modelo.
- ROMPEDOR HIDRAULICO: EDT2000 foi para modelo, não para placa, mesmo tendo formato
  que poderia passar numa expressão regular de placa.
- GRADE ARADORA: 6 valores repetem o código da frota; placa e modelo ficaram vazios,
  sem inventar modelo a partir da descrição.
- Modelos numéricos (como 416) foram convertidos para texto sem alteração de significado.
- Zeros dos códigos foram preservados, incluindo A09, CT04, GE01 e VAN01.

A carga foi transacional e vinculada ao hash conferido. A segunda execução em dry-run
encontrou **0 inseridos, 0 atualizados, 0 prefixos novos e 294 inalterados**.
Campos vazios não apagam dados existentes; registros inativos não são reativados.
O servidor não lê a planilha durante seu funcionamento.

Relatórios completos:
- [Conferência antes da carga](conferencia-itaipu-20260909.json)
- [Importação confirmada](importacao-itaipu-20260909.json)
- [Reconferência de idempotência](reconferencia-itaipu-20260909.json)
- [Validação dos dados gravados](validacao-itaipu-20260909.json)

Amostras conferidas no banco:

| Frota | Descrição | Placa | Modelo | Ano |
| --- | --- | --- | --- | ---: |
| A09 | AUTOMOVEL - VOLKSWAGEN / GOL | BER7C25 | — | 2021 |
| CT04 | CAMINHAO - VOLKSWAGEN / 31.280 CRM 6X4 | LRE5F83 | — | 2014 |
| EH05 | ESCAVADEIRA HIDRAULICA - CAT 320GC | — | 320GC | 2021 |
| GE01 | GERADOR DE ENERGIA - DE125GC | — | DE125GC | 2022 |
| VAN01 | VOLKSWAGEN / KOMBI | APD1F21 | — | 2008 |
| RH01 | ROMPEDOR HIDRAULICO - EDT2000 | — | EDT2000 | — |
| GA01 | GRADE ARADORA - GACR | — | — | — |
| RE06 | RETROESCAVADEIRA - CAT 416E | — | 416 | 2023 |
| CT31 | CAMINHÃO - VOLKSWAGEN / 31.320 CRM 6X4 | UBP5I21 | — | 2025 |

A descrição e o modelo de RE06 foram mantidos como constam nas respectivas colunas,
mesmo com a descrição contendo 416E e o campo de modelo contendo 416.

Modelos repetidos: 292, 924K, 920, 320GC, 320, 336, HC110, CS54B, CS423E, CS11GC,
CB7, CW34, 416, 3CX, 140K, 120, 250, 226B3, VDA700-I, D5, VC66, IMB 700 e JP250.
A relação de códigos para cada modelo consta no JSON da importação.

Buscas reais confirmadas:
- placa ber-7c25 retorna somente A09;
- modelo " 320gc " retorna EH05, EH07, EH08, EH10 e EH17;
- modelo 416 retorna quatro frotas, sem escolher automaticamente uma delas.
## Frontend

- /frotas agora lista veículos/equipamentos individuais.
- Colunas: Frota, Descrição, Placa, Modelo, Ano, Status, Ações.
- Busca por código, descrição, placa e modelo; filtro por status.
- Visualizar/Editar, cadastrar, ativar/desativar e excluir com confirmação.
- Formulário com código textual, placa, modelo, ano e descrição.
- Aba Prefixos mantém o gerenciamento original e corrige textos inadequados da tela.
- Tabela desktop e cartões mobile com os breakpoints existentes;
  estilos adicionais são restritos ao módulo de Frotas.
- Formulário com foco inicial, contenção de Tab e fechamento por Escape.
- Responsividade verificada na implementação e no build; não houve inspeção visual
  em navegador automatizado nesta sessão.

## API

- GET /frotas e GET /frotas/:id.
- POST /frotas e PUT /frotas/:id.
- PATCH /frotas/:id/status.
- DELETE /frotas/:id.
- Busca geral: ?busca=.
- Busca exata normalizada: ?placa=ABC-1234 ou ?modelo=416%204.
- Filtro opcional: ?status=ATIVO ou INATIVO.
- Validação de UUID, payload, status, código, placa e ano; erros 400, 404 e 409.

## Compatibilidade e preparação Poli OS

Nenhum frota_id foi adicionado às O.S.; não houve backfill nem conversão destrutiva.
O.S., prefixos existentes e regras financeiras foram preservados.
Não foram alterados relatórios, PDF, Dashboard, Obras, Funcionários, serviços,
apontamentos, exclusão de O.S. ou regras MATERIAL/INTERNA/TERCEIRO.

A exclusão atual remove somente o cadastro mestre; desativação é preferível para
histórico. FKs futuras com RESTRICT impedirão exclusões de frotas referenciadas.

A futura importação poderá procurar placa normalizada com unicidade.
Consulta por modelo retorna todos os candidatos: associação automática somente
com exatamente um candidato; zero ou vários devem exigir revisão/seleção manual.
Não existe seleção automática ou processamento de PDF nesta entrega.
O vínculo futuro das O.S. deve revisar ambiguidades legadas, como A9 versus A09.

## Testes

Onze testes passaram (oito de normalização/leitura, um de banco, um HTTP e um do CLI):

- Oito testes de normalização/validação/planilha, incluindo três do perfil Itaipu:
  zeros, placas equivalentes, modelos, seções com colunas diferentes,
  duplicidades, linhas inválidas, ausência de cabeçalhos, categorias, células mescladas, anos compostos e exceções de identificação.
- Um teste PostgreSQL:
  migrations, preservação de O.S., importação idempotente, reuso de prefixos,
  atualização parcial, modelos duplicados, unicidade, renomeação de prefixo e FKs.
  Dados e schema revertidos por ROLLBACK.
- Um teste HTTP:
  CRUD completo, filtros, status, erros 400/404/409 e modelo com vários resultados.
  Executado em schema exclusivo e removido ao final.
- Um teste do CLI:
  XLSX temporário real, relatório de dry-run, preservação do zero e comprovação
  de que nenhuma frota ou prefixo de teste ficou no banco.

Também confirmadas a carga do XLSX oficial, sua idempotência e a correspondência de todos os 294 registros gravados.

Comandos aprovados:
- npm.cmd run test:frotas
- npm.cmd run test:frotas:db
- npm.cmd run test:frotas:http
- npm.cmd run test:frotas:cli
- npm.cmd run check:frotas

## Build e lint

- Backend npm.cmd run build: passou.
- Frontend npm.cmd run lint: passou, sem novos avisos.
- Frontend npm.cmd run build: passou.
- git diff --check: passou.

Avisos preexistentes confirmados construindo uma cópia com a tela original:
- OrdensServicoPage.tsx: react(set-state-in-effect).
- OrderFormModal.tsx: react-hooks(exhaustive-deps).
- Bundle frontend acima de 500 kB: original 755,66 kB; final 766,80 kB.
A cópia temporária de conferência foi removida.

## Git final

Branch e último commit permanecem os mesmos; nenhum commit, push ou staging.

Arquivos existentes alterados:
- frontend/src/pages/FrotasPage.tsx
- package.json
- src/routes/index.ts
- src/services/prefixos-frota.service.ts

Arquivos novos:
- database/migrations/003_create_frotas.sql
- database/migrations/004_validate_frotas_prefixos.sql
- database/imports/import-frotas.ts
- database/imports/frotas-workbook.ts
- database/imports/itaipu-workbook.ts
- database/imports/conferencia-itaipu-20260909.json
- database/imports/importacao-itaipu-20260909.json
- database/imports/reconferencia-itaipu-20260909.json
- database/imports/validacao-itaipu-20260909.json
- database/imports/README.md
- database/imports/RELATORIO_FROTAS.md
- database/tests/frotas.test.ts
- database/tests/itaipu.test.ts
- database/tests/frotas.database.test.ts
- database/tests/frotas.http.test.ts
- database/tests/frotas.cli.test.ts
- database/tsconfig.json
- frontend/src/components/fleets/FleetFormModal.tsx
- frontend/src/components/fleets/FleetsList.tsx
- frontend/src/pages/PrefixosFrotaPage.tsx
- frontend/src/services/fleets.ts
- frontend/src/styles/fleets.css
- frontend/src/types/fleets.ts
- src/controllers/frotas.controller.ts
- src/routes/frotas.routes.ts
- src/services/frotas.service.ts
- src/utils/frotas.ts

## Situação final

Carga concluída e conferida. CT31 conserva o ano de fabricação 2025; o segundo valor inconsistente da fonte (56) está documentado. Não há importação de PDF nesta entrega.
