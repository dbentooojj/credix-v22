# Credix - Sistema de Controle de Emprestimos

Aplicacao full-stack com autenticacao, PostgreSQL e deploy via Docker para VPS Ubuntu.

## Stack
- Frontend (base nova): Next.js (App Router) + TypeScript + Tailwind (`frontend/`)
- Backend (base atual): Node.js + Express + TypeScript (`backend/`) + Prisma
- Frontend legado em producao: EJS reaproveitando os HTMLs originais, servidos pelo backend
- Banco: PostgreSQL
- Migrations: Prisma
- Auth: email/senha com bcrypt + JWT em cookie httpOnly
- Validacao: Zod

## Funcionalidades MVP
- Login de admin
- Cadastro de clientes
- Cadastro e controle de emprestimos
- Controle de parcelas e registro de pagamentos
- Dashboard e relatorios com totais principais
- Envio de notificacoes WhatsApp via Cloud API (Meta)
- Resumo diario por e-mail com parcelas que vencem no dia seguinte
- Backup semanal por e-mail com PDF resumido + CSV de emprestimos, parcelas e contas

## Estrutura principal
- `backend/src/server.ts`: inicializacao do backend Express
- `backend/src/routes/*.ts`: paginas, auth, tabelas e pagamentos
- `backend/src/services/table-sync.service.ts`: adaptacao de dados entre frontend e banco
- `backend/src/views/*.ejs`: telas atuais reaproveitadas do prototipo
- `backend/prisma/schema.prisma`: modelos e indices
- `backend/prisma/migrations/*`: migrations
- `backend/prisma/seed.ts`: cria admin
- `frontend/app/*`: base do novo frontend Next.js (rota inicial em `/app`)
- `docker-compose.yml`: ambiente Docker local (backend + frontend + postgres)
- `docker-compose.production.yml`: infraestrutura de produção com Caddy, backend, frontend e PostgreSQL interno
- `ops/Caddyfile`: proxy reverso HTTPS de produção

## Modelos do banco
- `User` (admin)
- `Client`
- `Loan`
- `Installment` (suporte ao layout atual)
- `Payment`

Com integridade referencial por FK e cascatas.

## Rodando localmente (sem Docker)
1. Copie o arquivo de ambiente:
```bash
cp .env.example .env
```
2. Ajuste `DATABASE_URL` para seu PostgreSQL local.
3. Instale dependencias do backend:
```bash
cd backend
npm install
```
4. Gere cliente Prisma e aplique migrations:
```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```
5. Crie usuario admin:
```bash
npm run db:seed
```
6. Suba a aplicacao:
```bash
npm run dev
```

Acesse: `http://localhost:4000/login`

Opcional (frontend Next base em paralelo):
```bash
cd ../frontend
npm install
npm run dev
```
Acesse: `http://localhost:3000/app` (ou configure outra porta local).

## Configurar WhatsApp Cloud API
Defina no `.env`:

```bash
WHATSAPP_GRAPH_BASE_URL=https://graph.facebook.com
WHATSAPP_API_VERSION=v22.0
WHATSAPP_PHONE_NUMBER_ID=<seu_phone_number_id>
WHATSAPP_ACCESS_TOKEN=<seu_access_token>
PIX_KEY=<sua_chave_pix>
PAYMENT_LINK=<link_pagamento_opcional>
```

Sem esses campos, o envio server-side de notificacoes retorna erro de configuracao.
`PIX_KEY` e `PAYMENT_LINK` sao usados na mensagem padrao de cobranca do dashboard.

## Configurar notificacoes por e-mail
Defina no `.env`:

```bash
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<usuario_smtp>
SMTP_PASS=<senha_smtp>
SMTP_FROM="Credix <no-reply@seudominio.com>"

EMAIL_NOTIFY_ENABLED=true
EMAIL_NOTIFY_TO=seu-email@dominio.com,financeiro@dominio.com
EMAIL_NOTIFY_TZ=America/Sao_Paulo
EMAIL_NOTIFY_TIME=08:00
EMAIL_NOTIFY_DAYS_AHEAD=1
EMAIL_NOTIFY_RUN_ON_START=false

EMAIL_WEEKLY_BACKUP_ENABLED=true
EMAIL_WEEKLY_BACKUP_TO=
EMAIL_WEEKLY_BACKUP_TZ=America/Sao_Paulo
EMAIL_WEEKLY_BACKUP_TIME=00:00
EMAIL_WEEKLY_BACKUP_RUN_ON_START=false
```

Com isso, o app envia:
- 1 e-mail por dia no horario configurado com a lista de parcelas em aberto.
- 1 e-mail semanal no domingo, no horario configurado, com PDF resumido e CSVs de backup.

Se `EMAIL_WEEKLY_BACKUP_TO` estiver vazio, o backup semanal vai para o e-mail do proprio usuario dono dos dados.

Para testar manualmente o lembrete diario sem esperar o horario:

```bash
curl -X POST http://localhost:4000/api/notifications/email/due-tomorrow \
  -H "Content-Type: application/json" \
  -b "credix_token=<SEU_COOKIE_DE_LOGIN>"
```

Para testar uma data especifica:

```bash
curl -X POST http://localhost:4000/api/notifications/email/due-tomorrow \
  -H "Content-Type: application/json" \
  -H "Cookie: credix_token=<SEU_COOKIE_DE_LOGIN>" \
  -d '{"targetDate":"2026-02-15"}'
```

Para testar manualmente o backup semanal (gera e envia PDF + CSVs anexados):

```bash
curl -X POST http://localhost:4000/api/notifications/email/weekly-backup \
  -H "Content-Type: application/json" \
  -H "Cookie: credix_token=<SEU_COOKIE_DE_LOGIN>"
```

Opcional via script local do backend:

```bash
cd backend
npm run notify:weekly-backup:once
```

## Deploy no VPS Ubuntu (Serverspace)

### Esteira de produção pelo GitHub Actions

O repositório possui duas esteiras:

- `Validar aplicação`: executa testes e builds em todo pull request e push na `main`.
- `Publicar em produção`: execução manual, confirmada com `PRODUCAO`, que prepara uma VPS Ubuntu 24.04, publica imagens versionadas, cria backup, atualiza os containers, aguarda saúde e executa rollback da aplicação se necessário.

Crie o environment `production` no GitHub e cadastre estes secrets:

- `DOCKERHUB_USERNAME`: usuário do Docker Hub.
- `DOCKERHUB_TOKEN`: token de acesso do Docker Hub.
- `PROD_HOST`: IP ou domínio da VPS.
- `PROD_USER`: usuário SSH com `sudo` sem senha.
- `PROD_PORT`: porta SSH, normalmente `22`.
- `PROD_SSH_KEY`: chave SSH privada exclusiva para o deploy.
- `PROD_KNOWN_HOSTS`: resultado de `ssh-keyscan -H SEU_HOST`.
- `PROD_ENV_FILE`: conteúdo completo do ambiente de produção; use [ops/production.env.example](ops/production.env.example) como modelo.

Opcionalmente, crie a variável `PRODUCTION_URL` no environment para exibir o link da aplicação no resumo do deploy.

Não é necessário criar arquivos ou clonar o repositório na VPS. A esteira instala o Docker Engine e o plugin `docker compose` quando necessário, cria `/opt/credix`, `backups` e `releases`, grava `/opt/credix/.env` de forma atômica a partir de `PROD_ENV_FILE` e envia o Compose e o Caddyfile candidatos.

O primeiro administrador é criado automaticamente apenas se o banco não possuir nenhum dado da aplicação. Caso o seed precise ser executado manualmente, use:

```bash
cd /opt/credix
docker compose --env-file .env --env-file .deploy.env exec -T backend npm run db:seed:production
```

Para publicar, abra **Actions → Publicar em produção → Run workflow**, selecione a branch `main` e digite `PRODUCAO`. Os backups e arquivos de rollback são preservados por 30 dias.

### 2) DNS e HTTPS
No provedor DNS, crie:
- `A` para `credix.app.br` apontando para o IP público da VPS
- `A` para `www.credix.app.br` apontando para o mesmo IP

Libere as portas TCP `80` e `443` no firewall/provedor da VPS. O Caddy usa esses domínios para emitir e renovar os certificados HTTPS automaticamente. O valor de `CADDY_EMAIL` em `PROD_ENV_FILE` recebe avisos relacionados aos certificados.

Confirme propagacao:
```bash
dig +short credix.app.br
dig +short www.credix.app.br
```

### Topologia final na VPS

Na VPS, somente o Caddy publica as portas `80` e `443` (incluindo `443/udp` para HTTP/3). PostgreSQL, backend e frontend não têm portas expostas publicamente.

- `credix.app.br` redireciona permanentemente para `https://www.credix.app.br`.
- `www.credix.app.br` atende o frontend.
- `/api/*` e `/auth/*` são encaminhadas ao backend Express.
- O Caddy mantém certificados e configuração nos volumes Docker `credix_caddy_data` e `credix_caddy_config`.

## Backup e restore PostgreSQL

### Backup
```bash
docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql
```

### Restore
```bash
cat backup.sql | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB
```

## Rotas principais
- Login: `/login`
- Area protegida: `/admin/*`
- Dashboard consolidado: `/api/dashboard?period=6m&metric=recebido`
- Tabelas frontend: `/api/tables/:tableName`
- Pagamentos: `/api/payments`
- Notificacoes WhatsApp: `/api/notifications/whatsapp/batch`
- Notificacao e-mail (teste manual): `/api/notifications/email/due-tomorrow`
- Backup semanal e-mail (teste manual): `/api/notifications/email/weekly-backup`
- Healthcheck: `/health`

## API Dashboard
Endpoint unico para renderizacao da dashboard:

`GET /api/dashboard?period=3m|6m|12m&metric=recebido|emprestado|lucro&tz=America/Sao_Paulo`

Exemplo de resposta:

```json
{
  "meta": {
    "generatedAt": "2026-02-13T03:15:14.912Z",
    "timezone": "America/Sao_Paulo",
    "period": "6m",
    "metric": "recebido"
  },
  "kpis": {
    "totalLoaned": 25000,
    "totalToReceive": 9850,
    "totalReceived": 19580,
    "receivedThisMonth": 3260,
    "totalOverdue": 2140,
    "profitTotal": 4580,
    "roiRate": 18.32,
    "delinquencyRate": 21.72
  },
  "dailySummary": {
    "dueToday": {
      "count": 2,
      "totalValue": 780,
      "href": "/admin/installments.html?status=pending&due=today"
    },
    "overdue": {
      "count": 4,
      "totalValue": 2140,
      "href": "/admin/installments.html?status=overdue"
    },
    "next7Days": {
      "count": 5,
      "totalValue": 1960,
      "href": "/admin/installments.html?status=pending&due=next7"
    }
  },
  "chart": {
    "metric": "recebido",
    "period": "6m",
    "points": [
      { "month": "2025-09", "label": "set. de 2025", "value": 2500 },
      { "month": "2025-10", "label": "out. de 2025", "value": 3150 }
    ],
    "hasData": true,
    "emptyMessage": "Sem dados no periodo."
  },
  "upcomingDue": [
    {
      "installmentId": 17,
      "loanId": 4,
      "debtorId": 2,
      "debtorName": "Maria Souza",
      "phone": "47999990000",
      "amount": 390,
      "dueDate": "2026-02-13",
      "dueRelative": "hoje",
      "status": "VENCE_HOJE",
      "statusLabel": "Vence hoje",
      "statusColor": "yellow",
      "pixKey": null,
      "paymentLink": null
    }
  ],
  "ranking": [
    {
      "debtorId": 2,
      "debtorName": "Maria Souza",
      "totalOverdue": 1140,
      "installmentsCount": 2,
      "href": "/admin/debtors.html?debtorId=2"
    }
  ]
}
```

## Observacoes
- `.env` real nao deve ser commitado.
- Os HTMLs originais foram reaproveitados em `EJS` mantendo o visual base.
