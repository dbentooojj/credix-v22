#!/usr/bin/env bash
set -Eeuo pipefail

output_file="${1:-production.env}"
output_dir="$(dirname "$output_file")"
output_name="$(basename "$output_file")"

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || fail "openssl é necessário para gerar os segredos de produção."
[[ -d "$output_dir" ]] || fail "O diretório de destino não existe: $output_dir"
[[ ! -e "$output_file" ]] || fail "O arquivo já existe: $output_file. Escolha outro destino para não sobrescrever segredos."

generate_hex() {
  openssl rand -hex "$1"
}

postgres_password="$(generate_hex 32)"
jwt_secret="$(generate_hex 48)"
admin_password="$(generate_hex 24)"
temporary_file="$(mktemp "$output_dir/.${output_name}.XXXXXX")"

cleanup() {
  rm -f "$temporary_file"
}

trap cleanup EXIT
umask 077

cat > "$temporary_file" <<EOF
# Gerado por ops/generate-production-env.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Revise somente APP_BASE_URL, CADDY_EMAIL e ADMIN_EMAIL antes de salvar como PROD_ENV_FILE.
PORT=4000
APP_BASE_URL=https://www.credix.app.br
CADDY_EMAIL=SEU_EMAIL_PARA_CERTIFICADOS@exemplo.com

POSTGRES_USER=credix
POSTGRES_PASSWORD=$postgres_password
POSTGRES_DB=credix

JWT_SECRET=$jwt_secret
JWT_EXPIRES_IN=7d
SESSION_IDLE_MINUTES=30
COOKIE_NAME=credix_token
COOKIE_SECURE=true

ADMIN_NAME=Administrador
ADMIN_EMAIL=SEU_EMAIL_DE_ACESSO@exemplo.com
ADMIN_PASSWORD=$admin_password
EOF

chmod 600 "$temporary_file"
mv "$temporary_file" "$output_file"
trap - EXIT

echo "Arquivo criado: $output_file"
echo "Edite somente APP_BASE_URL, CADDY_EMAIL e ADMIN_EMAIL antes de usar o conteúdo no secret PROD_ENV_FILE."
