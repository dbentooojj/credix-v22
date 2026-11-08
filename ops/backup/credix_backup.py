#!/usr/bin/env python3
"""Backup PostgreSQL criptografado, independente dos processos da aplicação."""

import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import smtplib
import ssl
import stat
import subprocess
import sys
import tempfile
from email.message import EmailMessage
from email.utils import format_datetime, parseaddr
from zoneinfo import ZoneInfo


ZONE = ZoneInfo("America/Sao_Paulo")
NAME = re.compile(r"^credix-auto-(\d{8}T\d{6}Z)\.dump\.age$")
TIERS = ("daily", "monthly", "yearly")
DEFAULT_ROOT = Path("/root/backups/credix")
DEFAULT_RECIPIENT = Path("/etc/credix-backup/recipient.txt")
DEFAULT_SMTP = Path("/etc/credix-backup/smtp.json")
CONTAINER = "credix_db"


class BackupError(Exception):
    pass


def log(event: str, **fields: object) -> None:
    print(json.dumps({"event": event, **fields}, ensure_ascii=False), flush=True)


def run(command: list[str], *, stdout=subprocess.PIPE, timeout=1800) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(command, stdout=stdout, stderr=subprocess.PIPE, check=True, timeout=timeout)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        # O stderr das ferramentas externas não é publicado para evitar vazamento de configuração.
        raise BackupError(f"Falha em {command[0]} ({type(exc).__name__})") from None


def managed_files(directory: Path) -> list[tuple[Path, dt.datetime]]:
    if not directory.exists():
        return []
    result = []
    for path in directory.iterdir():
        match = NAME.fullmatch(path.name)
        if not match or not path.is_file() or path.is_symlink():
            continue
        try:
            instant = dt.datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
        except ValueError:
            continue
        result.append((path, instant.astimezone(ZONE)))
    return sorted(result, key=lambda item: item[1])


def month_index(day: dt.date) -> int:
    return day.year * 12 + day.month


def sync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def retention_plan(root: Path, now: dt.datetime) -> list[Path]:
    today = now.astimezone(ZONE).date()
    all_files = [(tier, path, stamp) for tier in TIERS for path, stamp in managed_files(root / tier)]
    if not all_files:
        return []
    newest = max(all_files, key=lambda item: item[2])[1]
    remove = []
    for tier, path, stamp in all_files:
        day = stamp.date()
        if tier == "daily":
            expired = day < today - dt.timedelta(days=29)
        elif tier == "monthly":
            expired = month_index(day) < month_index(today) - 11
        else:
            expired = day.year < today.year - 4
        if expired and path != newest:
            remove.append(path)
    return remove


def promote(source: Path, destination: Path) -> None:
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if destination.resolve() == source.parent.resolve():
        return
    fd, temporary = tempfile.mkstemp(prefix=".credix-copy-", suffix=".tmp", dir=destination)
    try:
        with os.fdopen(fd, "wb") as output, source.open("rb") as incoming:
            shutil.copyfileobj(incoming, output)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, destination / source.name)
        sync_directory(destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def ensure_archives(root: Path, source: Path, now: dt.datetime) -> None:
    local = now.astimezone(ZONE)
    for tier, matches in (
        ("monthly", lambda stamp: (stamp.year, stamp.month) == (local.year, local.month)),
        ("yearly", lambda stamp: stamp.year == local.year),
    ):
        if not any(matches(stamp) for _, stamp in managed_files(root / tier)):
            promote(source, root / tier)
            log("archive_created", tier=tier, file=source.name)


def read_restricted(path: Path) -> str:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != 0:
        raise BackupError(f"Permissões ou proprietário inseguros: {path}")
    return path.read_text(encoding="utf-8")


def load_recipient(path: Path) -> str:
    recipient = read_restricted(path).strip()
    if not recipient.startswith("age1") or "\n" in recipient:
        raise BackupError("Chave pública age inválida")
    return recipient


def load_smtp(path: Path) -> dict:
    try:
        config = json.loads(read_restricted(path))
    except (OSError, ValueError, TypeError) as exc:
        raise BackupError(f"Configuração SMTP indisponível ({type(exc).__name__})") from None
    required = ("host", "port", "security", "from", "to")
    if any(not config.get(key) for key in required) or config["security"] not in ("starttls", "ssl"):
        raise BackupError("Configuração SMTP incompleta ou sem TLS")
    if bool(config.get("user")) != bool(config.get("password")):
        raise BackupError("Usuário e senha SMTP devem ser informados juntos")
    try:
        port = int(config["port"])
        message_limit = int(config.get("max_message_bytes", 18_000_000))
    except (ValueError, TypeError):
        raise BackupError("Porta ou limite SMTP inválido") from None
    if not 1 <= port <= 65535 or message_limit <= 0:
        raise BackupError("Porta ou limite SMTP inválido")
    if not isinstance(config["to"], str) or not isinstance(config["from"], str):
        raise BackupError("Endereço SMTP inválido")
    if not parseaddr(config["to"])[1] or not parseaddr(config["from"])[1]:
        raise BackupError("Endereço SMTP inválido")
    return config


def send_email(archive: Path, when: dt.datetime, smtp_path: Path) -> None:
    config = load_smtp(smtp_path)
    limit = int(config.get("max_message_bytes", 18_000_000))
    size = archive.stat().st_size
    if size * 4 // 3 + 4096 > limit:
        raise BackupError("Anexo acima do limite de e-mail; configurar armazenamento externo privado")
    message = EmailMessage()
    message["From"] = config["from"]
    message["To"] = config["to"]
    message["Date"] = format_datetime(when)
    message["Subject"] = f"Credix | Backup diário | {when:%d/%m/%Y}"
    message.set_content(
        f"Execução: {when:%d/%m/%Y %H:%M:%S %Z}\n"
        "Resultado do backup: concluído\n"
        f"Tamanho do arquivo: {size} bytes\n"
        "Validação: pg_restore concluiu a leitura integral do dump\n"
        f"Arquivo criptografado: {archive.name}\n"
    )
    message.add_attachment(archive.read_bytes(), maintype="application", subtype="octet-stream", filename=archive.name)
    payload = message.as_bytes()
    if len(payload) > limit:
        raise BackupError("Anexo acima do limite de e-mail; configurar armazenamento externo privado")
    try:
        tls_context = ssl.create_default_context()
        if config["security"] == "ssl":
            client = smtplib.SMTP_SSL(config["host"], int(config["port"]), timeout=60, context=tls_context)
        else:
            client = smtplib.SMTP(config["host"], int(config["port"]), timeout=60)
        with client:
            client.ehlo()
            if config["security"] == "starttls":
                client.starttls(context=tls_context)
                client.ehlo()
            if config.get("user"):
                client.login(config["user"], config["password"])
            advertised = client.esmtp_features.get("size")
            if advertised and len(payload) > int(advertised):
                raise BackupError("Mensagem acima do limite anunciado pelo servidor SMTP")
            client.send_message(message)
    except BackupError:
        raise
    except (OSError, smtplib.SMTPException) as exc:
        raise BackupError(f"Falha no envio SMTP ({type(exc).__name__})") from None
    log("email_sent", file=archive.name)


def database_size() -> int:
    command = ["docker", "exec", CONTAINER, "sh", "-c",
               'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_database_size(current_database())"']
    result = run(command, timeout=30)
    try:
        return int(result.stdout.strip())
    except (ValueError, AttributeError):
        raise BackupError("Não foi possível medir o banco") from None


def create_backup(root: Path, recipient_file: Path, now: dt.datetime) -> Path:
    recipient = load_recipient(recipient_file)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    for tier in TIERS:
        (root / tier).mkdir(mode=0o700, exist_ok=True)
    work = root / ".work"
    work.mkdir(mode=0o700, exist_ok=True)
    db_bytes = database_size()
    free_bytes = shutil.disk_usage(root).free
    required = max(4 * db_bytes, 256_000_000)
    if free_bytes < required:
        raise BackupError(f"Espaço insuficiente: livre={free_bytes}, necessário={required}")
    name = f"credix-auto-{now.astimezone(dt.timezone.utc):%Y%m%dT%H%M%SZ}.dump.age"
    destination = root / "daily" / name
    if destination.exists():
        raise BackupError("Backup deste horário já existe")
    with tempfile.TemporaryDirectory(prefix="credix-", dir=work) as temporary:
        os.chmod(temporary, 0o700)
        dump = Path(temporary) / "backup.dump"
        encrypted = Path(temporary) / "backup.dump.age"
        with dump.open("wb") as output:
            run(["docker", "exec", CONTAINER, "sh", "-c",
                 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], stdout=output)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(dump, 0o600)
        if dump.stat().st_size == 0:
            raise BackupError("pg_dump gerou arquivo vazio")
        run(["docker", "run", "--rm", "--network", "none", "--read-only",
             "--mount", f"type=bind,source={dump},target=/backup/input.dump,readonly",
             "postgres:16-alpine", "pg_restore", "--file=/dev/null", "/backup/input.dump"])
        log("dump_validated", bytes=dump.stat().st_size)
        run(["age", "-r", recipient, "-o", str(encrypted), str(dump)])
        with encrypted.open("rb") as candidate:
            valid_header = candidate.read(32).startswith(b"age-encryption.org/v1")
        if encrypted.stat().st_size < 64 or not valid_header:
            raise BackupError("Arquivo age inválido")
        os.chmod(encrypted, 0o600)
        with encrypted.open("rb") as output:
            os.fsync(output.fileno())
        os.replace(encrypted, destination)
        sync_directory(destination.parent)
    log("backup_created", file=name, bytes=destination.stat().st_size)
    ensure_archives(root, destination, now)
    return destination


def prune(root: Path, now: dt.datetime, dry_run: bool) -> None:
    for path in retention_plan(root, now):
        if not dry_run:
            path.unlink()
        log("retention_candidate" if dry_run else "retention_removed", tier=path.parent.name, file=path.name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--run", action="store_true")
    mode.add_argument("--backup-only", action="store_true")
    mode.add_argument("--retention-dry-run", action="store_true")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--recipient-file", type=Path, default=DEFAULT_RECIPIENT)
    parser.add_argument("--smtp-config", type=Path, default=DEFAULT_SMTP)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise BackupError("Execute como root")
    now = dt.datetime.now(ZONE)
    if args.retention_dry_run:
        prune(args.root, now, True)
        return 0
    args.root.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = args.root / ".backup.lock"
    with lock.open("a+") as handle:
        os.chmod(lock, 0o600)
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BackupError("Outra execução de backup está em andamento") from None
        archive = create_backup(args.root, args.recipient_file, now)
        if args.backup_only:
            log("backup_local_complete", file=archive.name)
            return 0
        prune(args.root, now, False)
        send_email(archive, now, args.smtp_config)
    log("backup_complete", file=archive.name)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (BackupError, OSError) as error:
        log("backup_failed", reason=str(error))
        sys.exit(1)
