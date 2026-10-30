# OS Gestor em produção com Docker e Caddy

Esta configuração é separada dos ambientes local e restaurado. Ela não foi executada nesta etapa e não acessa o banco Windows `oficina`.

## Arquitetura

- `caddy`: único serviço publicado, nas portas 80/443, responsável pelo HTTPS, na rede `edge`.
- `frontend`: Nginx interno, sem porta publicada; participa de `edge` e `frontend_backend`, serve o React e encaminha as rotas da API para `backend`.
- `backend`: Node.js em produção, somente nas redes `frontend_backend` e `backend_db`.
- `postgres`: PostgreSQL 18, somente na rede `backend_db`, com volume `postgres_prod_data`.
- `prod-env-guard`: valida `NODE_ENV`, `POSTGRES_DB` e `DB_NAME` antes dos serviços de aplicação.

O Caddy encaminha o domínio para `frontend:80` pela rede `edge`. O Nginx do frontend encaminha as rotas da API para `backend:3000` pela rede `frontend_backend`. O backend alcança o PostgreSQL somente pela rede `backend_db`; PostgreSQL e backend não ficam acessíveis diretamente pela internet.

## Preparação na VPS

1. Instale Docker Engine e Docker Compose pelo procedimento oficial do Ubuntu.
2. Crie `.env.prod` a partir de `.env.prod.example` e substitua todos os placeholders.
3. Aponte o DNS de `DOMAIN` para o IP público da VPS.
4. Confirme que `PUBLIC_ORIGIN` é exatamente `https://` seguido do mesmo domínio.
5. Mantenha `.env.prod` fora do Git e com permissões restritas.

Antes de iniciar, valide somente a configuração:

```bash
docker compose -f compose.prod.yaml --env-file .env.prod config --quiet
```

Quando houver domínio configurado e autorização de implantação:

```bash
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
docker compose -f compose.prod.yaml --env-file .env.prod ps
```

Migrations, restauração de backup, seeds e criação de usuários não são executadas pelo Compose. Devem ser ações manuais, revisadas e autorizadas separadamente.

## HTTPS e cookies

O backend recebe `NODE_ENV=production` e `AUTH_COOKIE_SECURE=true`. Os cookies continuam HttpOnly e SameSite=Lax. O CORS deve conter somente `PUBLIC_ORIGIN`; não use `*` com credenciais.

Sem um domínio DNS válido, não inicie o Caddy para emissão de certificados. O valor `example.invalid` no template é apenas um placeholder.

## Backup do PostgreSQL

Depois que a produção estiver autorizada e em funcionamento, faça backups fora do repositório, por exemplo:

```bash
mkdir -p /var/backups/osgestor
docker compose -f compose.prod.yaml --env-file .env.prod exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > /var/backups/osgestor/osgestor-$(date +%F-%H%M).dump
```

Proteja o diretório de backups, teste restaurações em ambiente separado e não envie os arquivos ao GitHub. A política de retenção e criptografia deve ser definida antes da entrada em produção.

## Validações operacionais posteriores

- `docker compose ... ps` deve mostrar todos os serviços saudáveis.
- O acesso externo deve ocorrer somente pelo domínio HTTPS.
- As portas 5432 e 3000 não devem aparecer publicadas.
- O volume `postgres_prod_data` deve estar presente.
- Deve existir backup recente e testado antes da migração dos dados reais.
