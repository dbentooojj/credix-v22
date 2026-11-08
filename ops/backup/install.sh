#!/usr/bin/env bash
set -Eeuo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "Execute como root." >&2; exit 1; }
[[ "$(. /etc/os-release; printf '%s' "$ID:$VERSION_ID")" == "ubuntu:24.04" ]] || {
  echo "Instalador preparado para Ubuntu 24.04." >&2
  exit 1
}

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v age >/dev/null || ! command -v python3 >/dev/null; then
  apt-get update
  apt-get install -y age python3
fi
command -v docker >/dev/null || { echo "Docker indisponível." >&2; exit 1; }

install -d -m 0700 /etc/credix-backup /root/backups/credix
install -d -m 0700 /root/backups/credix/daily /root/backups/credix/monthly /root/backups/credix/yearly /root/backups/credix/.work
install -d -m 0755 /usr/local/libexec/credix-backup
install -m 0755 "$source_dir/credix_backup.py" /usr/local/libexec/credix-backup/credix_backup.py
install -m 0644 "$source_dir/credix-backup.service" /etc/systemd/system/credix-backup.service
install -m 0644 "$source_dir/credix-backup.timer" /etc/systemd/system/credix-backup.timer
systemctl daemon-reload

echo "Arquivos instalados. O timer permanece desativado."
echo "Configure /etc/credix-backup/recipient.txt e smtp.json com permissões 0600. Teste o restore e o e-mail antes de ativar."
