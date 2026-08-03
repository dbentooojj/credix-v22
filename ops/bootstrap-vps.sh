#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path="${1:-/opt/credix}"

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

if [[ ! -r /etc/os-release ]]; then
  fail "Não foi possível identificar o sistema operacional da VPS."
fi

# shellcheck disable=SC1091
source /etc/os-release

if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  fail "A esteira foi preparada para Ubuntu 24.04; sistema detectado: ${PRETTY_NAME:-desconhecido}."
fi

if [[ "$(id -u)" -eq 0 ]]; then
  run_root() { "$@"; }
else
  sudo -n true 2>/dev/null || fail "O usuário SSH precisa ter sudo sem senha para preparar uma VPS nova."
  run_root() { sudo -n "$@"; }
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Instalando Docker Engine e o plugin Docker Compose..."
  run_root apt-get update
  run_root apt-get install -y ca-certificates curl gnupg
  run_root install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | run_root gpg --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  run_root chmod a+r /etc/apt/keyrings/docker.gpg
  printf '%s\n' "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | run_root tee /etc/apt/sources.list.d/docker.list >/dev/null
  run_root apt-get update
  run_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  run_root systemctl enable --now docker
fi

run_root docker compose version >/dev/null

if ! id -nG "$(id -un)" | tr ' ' '\n' | grep -qx docker; then
  run_root usermod -aG docker "$(id -un)"
fi

run_root install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$deploy_path"
run_root install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$deploy_path/backups"
run_root install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$deploy_path/releases"

echo "VPS preparada com Docker Compose plugin em $deploy_path."
