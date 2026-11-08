import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from credix_backup import ZONE, BackupError, ensure_archives, main, managed_files, prune, retention_plan, send_email


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        for tier in ("daily", "monthly", "yearly"):
            (self.root / tier).mkdir()

    def tearDown(self):
        self.temporary.cleanup()

    def archive(self, tier: str, stamp: str) -> Path:
        path = self.root / tier / f"credix-auto-{stamp}.dump.age"
        path.write_bytes(b"encrypted full database")
        return path

    def test_archives_are_copied_before_daily_cleanup(self):
        now = dt.datetime(2026, 11, 7, 3, tzinfo=ZONE)
        daily = self.archive("daily", "20261107T060000Z")
        ensure_archives(self.root, daily, now)
        self.assertEqual(len(managed_files(self.root / "monthly")), 1)
        self.assertEqual(len(managed_files(self.root / "yearly")), 1)
        self.assertEqual((self.root / "monthly" / daily.name).read_bytes(), daily.read_bytes())
        self.assertEqual((self.root / "yearly" / daily.name).read_bytes(), daily.read_bytes())

    def test_retention_preserves_manual_unknown_and_last_valid(self):
        now = dt.datetime(2026, 11, 7, 3, tzinfo=ZONE)
        old_daily = self.archive("daily", "20260101T060000Z")
        manual = self.root / "credix_2026-11-07_22-31-14.dump"
        manual.write_bytes(b"manual")
        unknown = self.root / "daily" / "other.dump.age"
        unknown.write_bytes(b"unknown")
        self.assertEqual(retention_plan(self.root, now), [])
        current = self.archive("daily", "20261107T060000Z")
        self.assertEqual(retention_plan(self.root, now), [old_daily])
        self.assertTrue(manual.exists())
        self.assertTrue(unknown.exists())
        self.assertTrue(current.exists())

    def test_daily_monthly_and_yearly_windows(self):
        now = dt.datetime(2026, 11, 7, 3, tzinfo=ZONE)
        expired = [
            self.archive("daily", "20261008T060000Z"),
            self.archive("monthly", "20251101T060000Z"),
            self.archive("yearly", "20210101T060000Z"),
        ]
        kept = [
            self.archive("daily", "20261009T060000Z"),
            self.archive("monthly", "20251201T060000Z"),
            self.archive("yearly", "20220101T060000Z"),
        ]
        self.assertEqual(set(retention_plan(self.root, now)), set(expired))
        self.assertTrue(all(path.exists() for path in kept))

    def test_dry_run_does_not_remove_files(self):
        now = dt.datetime(2026, 11, 7, 3, tzinfo=ZONE)
        old = self.archive("daily", "20260101T060000Z")
        current = self.archive("daily", "20261107T060000Z")
        with patch("credix_backup.log") as logger:
            prune(self.root, now, True)
        self.assertTrue(old.exists())
        self.assertTrue(current.exists())
        logger.assert_called_once_with("retention_candidate", tier="daily", file=old.name)


class MailTests(unittest.TestCase):
    def test_only_encrypted_attachment_is_sent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "credix-auto-20261107T060000Z.dump.age"
            archive.write_bytes(b"age-encryption.org/v1\nTEST-CIPHERTEXT")
            config = root / "smtp.json"
            config.write_text(json.dumps({
                "host": "smtp.example.test", "port": 587, "security": "starttls",
                "from": "backup@example.test", "to": "owner@example.test",
                "max_message_bytes": 100000,
            }))
            config.chmod(0o600)
            sent = []

            class FakeSmtp:
                esmtp_features = {"size": "100000"}

                def __init__(self, *args, **kwargs):
                    pass

                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    pass

                def ehlo(self):
                    pass

                def starttls(self, **kwargs):
                    pass

                def send_message(self, message):
                    sent.append(message)

            with patch("credix_backup.read_restricted", return_value=config.read_text()), \
                 patch("credix_backup.smtplib.SMTP", FakeSmtp):
                send_email(archive, dt.datetime(2026, 11, 7, 3, tzinfo=ZONE), config)
            self.assertEqual(len(sent), 1)
            self.assertEqual(sent[0]["Subject"], "Credix | Backup diário | 07/11/2026")
            self.assertEqual(sent[0].iter_attachments().__next__().get_payload(decode=True), archive.read_bytes())

    def test_oversized_message_is_rejected_before_send(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "credix-auto-20261107T060000Z.dump.age"
            archive.write_bytes(b"x" * 10000)
            config = root / "smtp.json"
            config.write_text(json.dumps({
                "host": "smtp.example.test", "port": 587, "security": "starttls",
                "from": "backup@example.test", "to": "owner@example.test",
                "max_message_bytes": 5000,
            }))
            config.chmod(0o600)
            with patch("credix_backup.read_restricted", return_value=config.read_text()):
                with self.assertRaisesRegex(BackupError, "limite de e-mail"):
                    send_email(archive, dt.datetime(2026, 11, 7, 3, tzinfo=ZONE), config)


class BackupOnlyTests(unittest.TestCase):
    def test_backup_only_skips_email_and_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "daily" / "credix-auto-20261107T060000Z.dump.age"
            with patch("sys.argv", ["credix_backup.py", "--backup-only", "--root", directory]), \
                 patch("credix_backup.os.geteuid", return_value=0), \
                 patch("credix_backup.create_backup", return_value=archive), \
                 patch("credix_backup.prune") as prune_mock, \
                 patch("credix_backup.send_email") as send_mock:
                self.assertEqual(main(), 0)
            prune_mock.assert_not_called()
            send_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
