# Execução Docker local

Esta configuração é exclusiva para um ambiente de teste local. Ela não acessa o banco `oficina`, não usa `oficina_teste_fase051` e não executa migrations automaticamente.

## Preparação

Copie `.env.docker.example` para `.env.docker`, escolha uma senha de teste e confira se `POSTGRES_DB` permanece com um nome novo. O arquivo `.env.docker` não deve ser versionado.

## Arquitetura

- `frontend`: compila o React e serve os arquivos estáticos com Nginx.
- `backend`: executa `dist/server.js` em Node.js 22, como usuário não-root.
- `postgres`: PostgreSQL 18 com volume `postgres_data` persistente.
- A única porta publicada é a do frontend (`8080` por padrão). O frontend participa das redes `public` e `private`; backend e PostgreSQL ficam exclusivamente na rede privada interna Docker.

O Nginx encaminha as rotas da API para o backend e usa fallback para `index.html`, preservando as rotas do React Router. Com `AUTH_COOKIE_SECURE=false`, o ambiente local funciona em HTTP; em HTTPS, defina `AUTH_COOKIE_SECURE=true`.

## Migrations

Nenhuma migration é chamada pelo Compose ou pelos entrypoints. A aplicação pode iniciar com o banco vazio e informar que faltam estruturas. A execução controlada das migrations deve ser uma ação manual posterior, após autorização explícita.

## Rotinas manuais de banco

Os serviços `docker-migrations` e `docker-admin-bootstrap` pertencem ao perfil Compose `manual` e não são iniciados pelo fluxo normal. O primeiro aplica 001–038 com checksum, registro compatível com `schema_migrations`, transação por migration, validação de `current_database()` e lock advisory. O segundo chama o bootstrap transacional existente, gera hash Argon2id, cria somente uma identidade fictícia e exige troca de senha.

Com os contêineres normais já disponíveis, a execução futura, após autorização separada, será:

```powershell
$env:DOCKER_MIGRATIONS_CONFIRM='APPLY_OSGESTOR_DOCKER_TEST'
docker compose --env-file .env.docker.example --profile manual run --rm docker-migrations
```

Para o administrador, forneça `DOCKER_ADMIN_CONFIRM=CREATE_OSGESTOR_DOCKER_ADMIN`, um username iniciado por `docker_`, um e-mail terminado em `.invalid` e uma senha temporária por variáveis de ambiente. Nunca grave esses valores em arquivos versionados ou logs. Execute o serviço separadamente somente depois que as migrations terminarem.

## Migration 038 no banco restaurado

O serviço `docker-restore-migration-038` é exclusivo para `osgestor_restore_test` e inicia em modo `--preview`. Ele valida `DB_HOST=postgres`, `DB_PORT=5432`, `current_database()`, os checksums de 036 e 037 e o registro existente de 038. Não modifica dados no modo de pré-visualização.

Após autorização explícita, o preview pode ser executado com `DOCKER_RESTORE_038_CONFIRM=PREVIEW_OSGESTOR_RESTORE_038`. Para aplicar, use confirmação diferente e substitua o comando do serviço para `--apply`, mantendo `DB_NAME` e `POSTGRES_DB` como `osgestor_restore_test`. A aplicação remove os delimitadores transacionais do arquivo original, executa a alteração e o registro de 038 na mesma transação e usa lock advisory.

## Ambiente com dados restaurados

`compose.restore.yaml` é uma configuração complementar. Ela não declara PostgreSQL nem volume: reutiliza o serviço PostgreSQL existente pela rede externa `osgestor_private` e conecta o backend exclusivamente ao banco `osgestor_restore_test`.

O frontend restaurado é publicado somente em `127.0.0.1:8081`. O backend restaurado possui uma guarda de ambiente e confirma `current_database()` antes de iniciar a API. Ele também usa o cookie `osgestor_restore_session`, separado do cookie do ambiente de testes, evitando reutilização de sessões copiadas.

Para iniciar futuramente, com o PostgreSQL existente saudável:

```powershell
docker compose -f compose.restore.yaml --env-file .env.docker.example up -d
```

O comando acima não deve ser executado sem autorização específica. O ambiente restaurado não executa migrations, seeds ou bootstrap automaticamente.

## Comandos (após autorização)

```powershell
Copy-Item .env.docker.example .env.docker
docker compose --env-file .env.docker config
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker ps
```

Para parar sem remover o volume:

```powershell
docker compose --env-file .env.docker down
```

Não use `down -v` neste ambiente sem confirmar que o banco de teste pode ser apagado.
