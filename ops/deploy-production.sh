#!/usr/bin/env bash
set -Eeuo pipefail

readonly default_deploy_path="/opt/credix"
readonly health_timeout_seconds=180

mode="${1:-}"

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

docker_compose_available() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

env_value() {
  local key="$1"
  local value
  value="$(sed -n -E "s/^${key}=//p" .env | tail -n 1 | tr -d '\r')"
  printf '%s' "$value"
}

require_env_value() {
  local key="$1"
  local value
  value="$(env_value "$key")"

  [[ -n "$value" ]] || fail "A variável $key precisa estar preenchida em $deploy_path/.env."
}

validate_environment_file() {
  local key

  [[ -f .env && -r .env ]] || fail "O arquivo $deploy_path/.env precisa existir e ser legível antes do deploy."

  for key in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET JWT_EXPIRES_IN COOKIE_NAME COOKIE_SECURE APP_BASE_URL CADDY_EMAIL ADMIN_EMAIL ADMIN_PASSWORD; do
    require_env_value "$key"
  done

  local jwt_secret admin_password app_base_url caddy_email cookie_secure
  jwt_secret="$(env_value JWT_SECRET)"
  admin_password="$(env_value ADMIN_PASSWORD)"
  app_base_url="$(env_value APP_BASE_URL)"
  caddy_email="$(env_value CADDY_EMAIL)"
  cookie_secure="$(env_value COOKIE_SECURE)"

  [[ ${#jwt_secret} -ge 32 ]] || fail "JWT_SECRET precisa ter ao menos 32 caracteres."
  [[ ${#admin_password} -ge 12 ]] || fail "ADMIN_PASSWORD precisa ter ao menos 12 caracteres."
  [[ "$app_base_url" == "https://www.credix.app.br" ]] || fail "APP_BASE_URL precisa ser https://www.credix.app.br em produção."
  [[ "$caddy_email" == *"@"* ]] || fail "CADDY_EMAIL precisa conter um e-mail válido para os certificados HTTPS."
  [[ "${cookie_secure,,}" == "true" ]] || fail "COOKIE_SECURE precisa ser true em produção."
}

wait_for_healthy() {
  local backend_health=""
  local frontend_health=""
  local caddy_health=""
  local deadline=$((SECONDS + health_timeout_seconds))

  while (( SECONDS < deadline )); do
    backend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' credix_backend 2>/dev/null || true)"
    frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' credix_frontend 2>/dev/null || true)"
    caddy_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' credix_caddy 2>/dev/null || true)"

    if [[ "$backend_health" == "healthy" && "$frontend_health" == "healthy" && "$caddy_health" == "healthy" ]]; then
      return 0
    fi

    sleep 2
  done

  echo "Containers não ficaram saudáveis em ${health_timeout_seconds}s: backend=$backend_health frontend=$frontend_health caddy=$caddy_health" >&2
  return 1
}

run_initial_seed() {
  local seed_output

  if ! seed_output="$("${compose[@]}" exec -T backend npm run db:seed:production 2>&1)"; then
    printf '%s\n' "$seed_output" >&2
    echo "Seed automático falhou. Após corrigir o ambiente, execute:" >&2
    echo "cd $deploy_path && docker compose --env-file .env --env-file .deploy.env exec -T backend npm run db:seed:production" >&2
    return 1
  fi

  printf '%s\n' "$seed_output"
}

rollback() {
  local exit_code="$1"

  echo "Deploy falhou; iniciando rollback da aplicação..." >&2

  if [[ "$has_previous_release" == "true" ]]; then
    cp -p "$previous_compose_file" docker-compose.yml.rollback
    mv -f docker-compose.yml.rollback docker-compose.yml

    if [[ "$previous_deploy_env_exists" == "true" ]]; then
      cp -p "$previous_deploy_env_file" .deploy.env.rollback
      mv -f .deploy.env.rollback .deploy.env
      local rollback_compose=(docker compose --env-file .env --env-file .deploy.env)
    else
      rm -f .deploy.env
      local rollback_compose=(docker compose --env-file .env)
    fi

    if [[ "$previous_caddyfile_exists" == "true" ]]; then
      cp -p "$previous_caddy_file" Caddyfile.rollback
      mv -f Caddyfile.rollback Caddyfile
    else
      rm -f Caddyfile
    fi

    "${rollback_compose[@]}" pull caddy backend frontend || true
    "${rollback_compose[@]}" up -d --force-recreate caddy backend frontend || true
    echo "Rollback da aplicação concluído para a versão anterior. O backup do banco foi preservado em $deploy_path/backups." >&2
  else
    "${compose[@]}" rm -sf caddy backend frontend || true
    echo "Primeiro deploy falhou: os containers da aplicação foram removidos, mas o banco e os arquivos de diagnóstico foram preservados." >&2
  fi

  exit "$exit_code"
}

run_preflight() {
  deploy_path="${2:-$default_deploy_path}"
  [[ "$deploy_path" == "$default_deploy_path" ]] || fail "O caminho de produção precisa ser $default_deploy_path."
  [[ -d "$deploy_path" ]] || fail "O diretório $deploy_path não existe; a etapa de bootstrap da VPS precisa executá-lo primeiro."

  cd "$deploy_path"
  docker_compose_available || fail "Docker Compose plugin indisponível. Instale docker-compose-plugin; o binário docker-compose legado não é suportado."
  validate_environment_file
  echo "Pré-validação de produção concluída para $deploy_path."
}

run_deploy() {
  deploy_path="${2:-$default_deploy_path}"
  image_tag="${3:-}"
  image_namespace="${4:-}"

  [[ "$deploy_path" == "$default_deploy_path" ]] || fail "O caminho de produção precisa ser $default_deploy_path."
  [[ "$image_tag" =~ ^[0-9a-f]{40}$ ]] || fail "Versão Docker inválida: $image_tag"
  [[ "$image_namespace" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "Namespace Docker inválido: $image_namespace"

  cd "$deploy_path"
  docker_compose_available || fail "Docker Compose plugin indisponível. Instale docker-compose-plugin; o binário docker-compose legado não é suportado."
  validate_environment_file
  [[ -s docker-compose.yml.next ]] || fail "Arquivo candidato docker-compose.yml.next não foi enviado pelo workflow."

  [[ -s Caddyfile.next ]] || fail "O arquivo candidato Caddyfile.next não foi enviado pelo workflow."

  mkdir -p backups releases

  candidate_deploy_env=".deploy.env.next"
  printf 'IMAGE_NAMESPACE=%s\nIMAGE_TAG=%s\n' "$image_namespace" "$image_tag" > "$candidate_deploy_env"

  if ! docker compose --env-file .env --env-file "$candidate_deploy_env" -f docker-compose.yml.next config --quiet; then
    rm -f "$candidate_deploy_env"
    fail "O docker-compose.yml candidato é inválido; nenhum container foi alterado."
  fi

  if ! docker run --rm -e "CADDY_EMAIL=$(env_value CADDY_EMAIL)" -v "$PWD/Caddyfile.next:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
    rm -f "$candidate_deploy_env"
    fail "O Caddyfile candidato é inválido; nenhum container foi alterado."
  fi

  has_previous_release="false"
  previous_deploy_env_exists="false"
  previous_caddyfile_exists="false"
  release_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  previous_compose_file=""
  previous_deploy_env_file=""
  previous_caddy_file=""

  if [[ -f docker-compose.yml ]]; then
    has_previous_release="true"
    previous_compose_file="releases/${release_stamp}-docker-compose.yml"
    cp -p docker-compose.yml "$previous_compose_file"
    if [[ -f .deploy.env ]]; then
      previous_deploy_env_exists="true"
      previous_deploy_env_file="releases/${release_stamp}-deploy.env"
      cp -p .deploy.env "$previous_deploy_env_file"
    fi
  fi

  if [[ -f Caddyfile ]]; then
    previous_caddyfile_exists="true"
    previous_caddy_file="releases/${release_stamp}-Caddyfile"
    cp -p Caddyfile "$previous_caddy_file"
  fi

  if [[ -f docker-compose.yml && "$previous_deploy_env_exists" == "true" ]]; then
    previous_compose=(docker compose --env-file .env --env-file .deploy.env)
  else
    previous_compose=(docker compose --env-file .env)
  fi

  if [[ -f docker-compose.yml ]] && "${previous_compose[@]}" ps --services --status running 2>/dev/null | grep -qx db; then
    backup_file="backups/pre-deploy-${release_stamp}.sql.gz"
    backup_tmp="${backup_file}.tmp"
    echo "Criando backup do PostgreSQL em $backup_file"
    if ! "${previous_compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$backup_tmp"; then
      rm -f "$backup_tmp"
      fail "O backup do PostgreSQL falhou; o deploy foi interrompido antes de qualquer troca de container."
    fi
    test -s "$backup_tmp" || fail "O backup do PostgreSQL ficou vazio; o deploy foi interrompido."
    mv -f "$backup_tmp" "$backup_file"
  else
    echo "Nenhum banco existente encontrado; primeiro deploy seguirá sem backup prévio."
  fi

  mv -f docker-compose.yml.next docker-compose.yml
  mv -f Caddyfile.next Caddyfile
  mv -f "$candidate_deploy_env" .deploy.env

  compose=(docker compose --env-file .env --env-file .deploy.env)

  if ! "${compose[@]}" pull caddy backend frontend; then
    rollback 1
  fi

  if ! "${compose[@]}" up -d --force-recreate --remove-orphans caddy backend frontend; then
    rollback 1
  fi

  if ! wait_for_healthy; then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail=100 caddy backend frontend || true
    rollback 1
  fi

  if ! docker exec credix_backend sh -c 'wget -qO- "http://localhost:${PORT:-4000}/health"' >/dev/null; then
    rollback 1
  fi

  if ! docker exec credix_frontend wget -qO- http://localhost:3000/login >/dev/null; then
    rollback 1
  fi

  if ! docker exec credix_caddy wget -qO- http://localhost:2019/config/ >/dev/null; then
    rollback 1
  fi

  if ! run_initial_seed; then
    rollback 1
  fi

  find backups -type f -name 'pre-deploy-*.sql.gz' -mtime +30 -delete
  find releases -type f -mtime +30 -delete
  docker image prune -f >/dev/null

  echo "Credix $image_tag publicado com sucesso."
}

case "$mode" in
  preflight)
    run_preflight "$@"
    ;;
  deploy)
    run_deploy "$@"
    ;;
  *)
    fail "Uso: $0 preflight [/opt/credix] | deploy [/opt/credix] <sha-commit> <namespace-docker>"
    ;;
esac
