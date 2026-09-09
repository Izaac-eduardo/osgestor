# Cadastro mestre de frotas

A migration `003_create_frotas.sql` é aditiva. As O.S. continuam usando
`prefixo_frota_id` e `frota_numero INTEGER`; não há conversão nem associação automática.
O cadastro mestre guarda `numero` como texto (A09 é diferente de A9).

## Instalação

Execute 003_create_frotas.sql e depois 004_validate_frotas_prefixos.sql uma única vez, após as migrations 001 e 002. A migration 004 impede prefixos ambíguos nas frotas vinculadas e foi criada separadamente porque a 003 já havia sido aplicada.
O projeto usa migrations SQL manuais; não reaplique as migrations antigas.
A nova API requer a tabela criada antes de disponibilizar a tela.

## Excel: conferir antes de gravar

Na raiz do projeto, com as variáveis de banco do ambiente ou do arquivo .env:

```powershell
npm.cmd run import:frotas -- "C:\caminho\relacao.xlsx" --report conferencia-frotas.json
npm.cmd run import:frotas -- "C:\caminho\relacao.xlsx" --apply --expected-sha256 HASH_DA_CONFERENCIA --report importacao-frotas.json
```

Em caminho UNC no Windows, execute em uma unidade de rede mapeada ou use
`cmd /c "pushd \\servidor\compartilhamento\projeto && npm.cmd run ..."`.
Não use o mesmo nome de relatório: o importador impede sobrescrever arquivos existentes.

O padrão é dry-run: executa as mesmas operações em transação e faz ROLLBACK.
O hash vincula a gravação ao arquivo conferido. Confira os cabeçalhos detectados,
todas as linhas, amostras de cada categoria e os contadores antes de usar --apply.
O script não é executado pelo servidor nem durante o build.

No perfil genérico, cabeçalhos reconhecidos sem diferenciar acentos, espaços ou caixa:
Frota/Código/Código da Frota, Descrição/Descrição do Equipamento/Descrição do Veículo,
Placa, Modelo, Ano/Ano de Fabricação. Cada seção deve repetir seu cabeçalho se mudar
a posição ou o significado das colunas. Não há inferência de modelo pela posição de placa.
Campos não solicitados (RENAVAM, marca, lugares e chassi) não são importados.
No perfil genérico, anos compostos (2020/2021), códigos inválidos, fórmulas sem resultado e dados sem
cabeçalho bloqueiam a importação inteira. Ajuste uma cópia do Excel e confira novamente.

Códigos e placas duplicados, inclusive após normalizar, bloqueiam a gravação.
Modelo duplicado é permitido e listado. Campos vazios não apagam dados existentes,
e uma reimportação não reativa registros inativos. Registros idênticos são contados
como inalterados; não recebem atualização artificial de timestamp.
Conflitos com placas já usadas no banco revertem toda a transação.
Trocas de placa entre dois códigos também exigem revisão manual.

O relatório contém a origem de cada registro (aba/linha), cabeçalhos, total,
inseridos, atualizados, inalterados, prefixos criados, com/sem placa, com modelo,
modelos repetidos, códigos/placas duplicados e linhas ignoradas com motivo.
No dry-run os contadores indicam o que seria gravado. A mensagem final confirma
COMMIT ou ROLLBACK.

Arquivos PDF renomeados para .xlsx são rejeitados antes de acessar o banco.
Não existe parser de PDF nem dependência nova.

## Perfil da relação Itaipu

Para a planilha oficial com categorias na coluna B:

```powershell
npm.cmd run import:frotas -- "C:\caminho\relacao.xlsx" --profile itaipu --year-policy fabricacao --report conferencia.json
npm.cmd run import:frotas -- "C:\caminho\relacao.xlsx" --profile itaipu --year-policy fabricacao --apply --expected-sha256 HASH_DA_CONFERENCIA --report importacao.json
```

O perfil Itaipu valida a seção, o prefixo esperado e os cabeçalhos. Usa B=código,
C=descrição, E=ano e F=identificação, conforme o layout conferido. Uma seção nova ou
incompatível bloqueia a carga; não há classificação automática pelo formato do valor.
Cabeçalhos mesclados/repetidos, títulos, vazios e totalizadores são relatados.
O totalizador deve corresponder à quantidade de registros válidos.

Exceções explícitas: VAN usa F como placa apesar do cabeçalho MODELO;
COMPRESSOR DE AR e ROMPEDOR HIDRAULICO usam F como modelo apesar do cabeçalho PLACA.
GRADE ARADORA repete o código em F: essa repetição não é importada como placa/modelo.
Todas as exceções ficam em `adjustments` no relatório.

`--year-policy fabricacao` (padrão do perfil) guarda o primeiro ano de 2019/20;
`--year-policy modelo` guarda o segundo. O original fica em `rows[].original`.
Um segundo ano inconsistente, como 2025/56, é registrado como divergência quando
se usa fabricação e bloqueia a carga quando se solicita ano do modelo.
O perfil genérico continua exigindo um ano simples de quatro dígitos.

Consulte [RELATORIO_FROTAS.md](RELATORIO_FROTAS.md) e os relatórios JSON da carga
de 09/09/2026 para a conferência de 294 registros e os ajustes da fonte.

## API

- GET /frotas: lista ordenada por código; filtros `busca`, `status`, `placa`, `modelo`.
- GET /frotas/:id: consulta individual.
- POST /frotas e PUT /frotas/:id: `codigo, descricao, placa, modelo, ano, status`.
  O PUT exige status. Prefixos faltantes são criados sem duplicar os existentes.
- PATCH /frotas/:id/status: `{ "status": "INATIVO" }` ou ATIVO.
- DELETE /frotas/:id: exclusão do cadastro mestre; eventuais FKs impedem exclusão.
  Prefira desativar registros históricos. O.S. legadas não têm FK para frotas.

O banco deriva código de prefixo + número e sincroniza alterações de prefixo.
Placa é única, normalizada, com formato brasileiro antigo ou Mercosul; vazia é NULL.
O modelo mantém seus caracteres internos e possui índice não único de upper(trim(modelo)).
GET /frotas?placa=ABC-1234 normaliza a placa; GET /frotas?modelo=416%204 retorna uma lista.
Um futuro importador deve associar por modelo somente quando a lista tiver exatamente
um candidato; zero ou múltiplos candidatos exigem revisão. Nenhum PDF é processado aqui.
As O.S. legadas perderam os zeros ao armazenar inteiros: uma futura ligação por frota_id
deve ser opcional e revisar ambiguidades como A9 versus A09, sem preenchimento automático.

## Verificação

```powershell
npm.cmd run test:frotas
npm.cmd run test:frotas:db
npm.cmd run test:frotas:http
npm.cmd run test:frotas:cli
npm.cmd run check:frotas
npm.cmd run build
# Em frontend:
npm.cmd run lint
npm.cmd run build
```

O teste de banco cria um schema aleatório dentro de uma transação, aplica as migrations,
verifica importação e constraints e faz ROLLBACK, sem persistir dados de teste.
O teste HTTP usa um schema exclusivo aleatório, confirma as requisições e remove esse schema ao terminar. Requer permissão para criar schemas no banco de teste/configurado.
