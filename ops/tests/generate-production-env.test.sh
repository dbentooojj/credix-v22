#!/usr/bin/env bash
set -Eeuo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly generator="$repository_root/ops/generate-production-env.sh"
readonly test_root="$(mktemp -d)"
readonly generated_file="$test_root/production.env"

cleanup() {
  rm -rf "$test_root"
}

trap cleanup EXIT

fail() {
  echo "TEST FAILED: $*" >&2
  exit 1
}

env_value() {
  sed -n -E "s/^$1=//p" "$generated_file" | tail -n 1
}

"$generator" "$generated_file" >/dev/null

[[ -f "$generated_file" ]] || fail "Arquivo de ambiente não foi criado."
if [[ "$(uname -s)" == "Linux" ]]; then
  [[ "$(stat -c '%a' "$generated_file")" == "600" ]] || fail "Arquivo gerado precisa ter permissão 600."
fi
[[ "$(env_value APP_BASE_URL)" == "https://www.credix.app.br" ]] || fail "APP_BASE_URL incorreta."
[[ "$(env_value CADDY_EMAIL)" == "SEU_EMAIL_PARA_CERTIFICADOS@exemplo.com" ]] || fail "CADDY_EMAIL deve permanecer para edição manual."
[[ "$(env_value ADMIN_EMAIL)" == "SEU_EMAIL_DE_ACESSO@exemplo.com" ]] || fail "ADMIN_EMAIL deve permanecer para edição manual."
postgres_password="$(env_value POSTGRES_PASSWORD)"
jwt_secret="$(env_value JWT_SECRET)"
admin_password="$(env_value ADMIN_PASSWORD)"
[[ ${#postgres_password} -ge 16 ]] || fail "POSTGRES_PASSWORD fraca."
[[ ${#jwt_secret} -ge 32 ]] || fail "JWT_SECRET curto."
[[ ${#admin_password} -ge 12 ]] || fail "ADMIN_PASSWORD curta."

if "$generator" "$generated_file" >/dev/null 2>&1; then
  fail "O gerador não deve sobrescrever um arquivo existente."
fi

echo "generate-production-env.test.sh: ok"
