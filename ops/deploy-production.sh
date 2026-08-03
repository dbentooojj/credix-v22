#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path="${1:?Diretório de produção não informado}"
image_tag="${2:?Versão da imagem não informada}"
image_namespace="${3:?Namespace das imagens não informado}"

if [[ ! "$image_tag" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Versão Docker inválida: $image_tag" >&2
  exit 1
fi

if [[ ! "$image_namespace" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "Namespace Docker inválido: $image_namespace" >&2
  exit 1
fi

cd "$deploy_path"

if [[ ! -f .env ]]; then
  echo "O arquivo $deploy_path/.env precisa existir antes do primeiro deploy." >&2
  exit 1
fi

mkdir -p backups

if docker compose --env-file .env ps --services --status running 2>/dev/null | grep -qx db; then
  backup_file="backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  echo "Criando backup em $backup_file"
  docker compose --env-file .env exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$backup_file"
  test -s "$backup_file"
fi

mv docker-compose.yml.next docker-compose.yml
printf 'IMAGE_NAMESPACE=%s\nIMAGE_TAG=%s\n' "$image_namespace" "$image_tag" > .deploy.env

compose=(docker compose --env-file .env --env-file .deploy.env)

"${compose[@]}" pull backend frontend
"${compose[@]}" up -d --force-recreate --remove-orphans backend frontend

backend_health=""
frontend_health=""

for _ in $(seq 1 30); do
  backend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' credix_backend 2>/dev/null || true)"
  frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' credix_frontend 2>/dev/null || true)"

  if [[ "$backend_health" == "healthy" && "$frontend_health" == "healthy" ]]; then
    break
  fi

  sleep 2
done

if [[ "$backend_health" != "healthy" || "$frontend_health" != "healthy" ]]; then
  echo "Deploy sem saúde: backend=$backend_health frontend=$frontend_health" >&2
  "${compose[@]}" ps
  "${compose[@]}" logs --tail=100 backend frontend
  exit 1
fi

docker exec credix_backend sh -c 'wget -qO- "http://localhost:${PORT:-4000}/health"' >/dev/null
docker exec credix_frontend wget -qO- http://localhost:3000/login >/dev/null

find backups -type f -name 'pre-deploy-*.sql.gz' -mtime +30 -delete
docker image prune -f >/dev/null

echo "Credix $image_tag publicado com sucesso."
