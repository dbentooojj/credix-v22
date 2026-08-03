#!/usr/bin/env bash
set -Eeuo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly source_script="$repository_root/ops/deploy-production.sh"
readonly test_root="$(mktemp -d)"
readonly app_path="$test_root/credix"
readonly mock_bin="$test_root/bin"

cleanup() {
  rm -rf "$test_root"
}

trap cleanup EXIT

fail() {
  echo "TEST FAILED: $*" >&2
  exit 1
}

assert_file_contains() {
  local file="$1"
  local text="$2"
  grep -Fqx "$text" "$file" >/dev/null || fail "$file não contém '$text'."
}

create_environment_file() {
  mkdir -p "$app_path"
  cat > "$app_path/.env" <<'EOF'
POSTGRES_USER=credix
POSTGRES_PASSWORD=senha-forte-de-teste
POSTGRES_DB=credix
JWT_SECRET=uma-chave-de-teste-com-mais-de-trinta-e-dois-caracteres
JWT_EXPIRES_IN=7d
COOKIE_NAME=credix_token
COOKIE_SECURE=true
BIND_ADDRESS=127.0.0.1
APP_BASE_URL=https://www.credix.app.br
CADDY_EMAIL=admin@example.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=senha-administrador-segura
EOF
}

create_candidate_compose() {
  cat > "$app_path/docker-compose.yml.next" <<'EOF'
services:
  db:
    image: postgres:16-alpine
  backend:
    image: dbentooooojj/credix-backend:test
  frontend:
    image: dbentooooojj/credix-frontend:test
EOF
}

create_candidate_caddyfile() {
  cat > "$app_path/Caddyfile.next" <<'EOF'
{
  email {$CADDY_EMAIL}
}

credix.example.com {
  respond /healthz "ok" 200
}
EOF
}

create_mock_docker() {
  mkdir -p "$mock_bin"
  cat > "$mock_bin/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

args=" $* "

record() {
  printf '%s\n' "$1" >> "${MOCK_LOG:?}"
}

if [[ "${1:-}" == "inspect" ]]; then
  record "inspect"
  printf 'healthy\n'
  exit 0
fi

if [[ "${1:-}" == "exec" ]]; then
  record "health"
  exit 0
fi

if [[ "${1:-}" == "image" ]]; then
  exit 0
fi

if [[ "${1:-}" == "run" ]]; then
  record "caddy-validate"
  exit 0
fi

if [[ "${1:-}" != "compose" ]]; then
  echo "Comando Docker simulado não suportado: $*" >&2
  exit 1
fi

case "$args" in
  *" version "*)
    printf 'Docker Compose version v2.0.0\n'
    ;;
  *" config "*)
    ;;
  *" ps "*)
    ;;
  *" pull "*)
    record "pull"
    ;;
  *" up "*)
    record "up"
    attempt_file="${MOCK_STATE:?}/up-attempt"
    attempts=0
    if [[ -f "$attempt_file" ]]; then
      attempts="$(cat "$attempt_file")"
    fi
    attempts=$((attempts + 1))
    printf '%s' "$attempts" > "$attempt_file"
    if [[ "${MOCK_FAIL_FIRST_UP:-0}" == "1" && "$attempts" == "1" ]]; then
      exit 1
    fi
    ;;
  *" exec "*)
    if [[ "$args" == *" db "* ]]; then
      record "backup"
    else
      record "seed"
      printf 'SEED_ADMIN_CREATED admin@example.com\n'
    fi
    ;;
  *" rm "*)
    record "remove"
    ;;
  *" logs "*)
    ;;
  *)
    echo "Docker Compose simulado não suportado: $*" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$mock_bin/docker"
}

create_testable_deploy_script() {
  sed "s|readonly default_deploy_path=\"/opt/credix\"|readonly default_deploy_path=\"$app_path\"|" "$source_script" > "$test_root/deploy-production.sh"
  chmod +x "$test_root/deploy-production.sh"
}

run_script() {
  PATH="$mock_bin:$PATH" MOCK_LOG="$test_root/docker.log" MOCK_STATE="$test_root/state" "$test_root/deploy-production.sh" "$@"
}

mkdir -p "$test_root/state"
create_mock_docker
create_testable_deploy_script

if run_script preflight "$app_path" >/dev/null 2>&1; then
  fail "Pré-validação deveria falhar quando .env não existe."
fi

create_environment_file
create_candidate_compose
create_candidate_caddyfile
run_script preflight "$app_path" >/dev/null
run_script deploy "$app_path" 0123456789abcdef0123456789abcdef01234567 dbentooooojj >/dev/null

[[ -f "$app_path/docker-compose.yml" ]] || fail "Compose candidato não foi promovido."
[[ -f "$app_path/.deploy.env" ]] || fail ".deploy.env não foi criado."
[[ -f "$app_path/Caddyfile" ]] || fail "Caddyfile candidate was not promoted."
assert_file_contains "$app_path/.deploy.env" "IMAGE_TAG=0123456789abcdef0123456789abcdef01234567"
grep -Fqx "backup" "$test_root/docker.log" && fail "Primeiro deploy não deveria tentar backup de banco inexistente."
grep -Fqx "seed" "$test_root/docker.log" || fail "Primeiro deploy deveria executar o seed inicial."

printf 'services:\n  backend:\n    image: antiga\n' > "$app_path/docker-compose.yml"
printf 'credix.example.com {\n  respond "anterior"\n}\n' > "$app_path/Caddyfile"
printf 'IMAGE_NAMESPACE=dbentooooojj\nIMAGE_TAG=versao-antiga\n' > "$app_path/.deploy.env"
create_candidate_compose
create_candidate_caddyfile
rm -f "$test_root/state/up-attempt"

if PATH="$mock_bin:$PATH" MOCK_LOG="$test_root/docker.log" MOCK_STATE="$test_root/state" MOCK_FAIL_FIRST_UP=1 "$test_root/deploy-production.sh" deploy "$app_path" 0123456789abcdef0123456789abcdef01234567 dbentooooojj >/dev/null 2>&1; then
  fail "Deploy com falha de inicialização deveria retornar código diferente de zero."
fi

grep -Fqx '    image: antiga' "$app_path/docker-compose.yml" || fail "Rollback não restaurou o Compose anterior."
assert_file_contains "$app_path/.deploy.env" "IMAGE_TAG=versao-antiga"
grep -Fqx '  respond "anterior"' "$app_path/Caddyfile" || fail "Rollback did not restore the previous Caddyfile."

echo "deploy-production.test.sh: ok"
