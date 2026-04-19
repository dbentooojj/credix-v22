import "dotenv/config";
import { env } from "../config/env";
import { normalizeTimeZone } from "../lib/date-time";
import { prisma } from "../lib/prisma";
import { sendWeeklyBackupEmail } from "../services/weekly-backup-email.service";

async function main() {
  const ownerUserIdArg = process.argv[2]?.trim();
  const targetDateArg = process.argv[3]?.trim();
  const parsedOwnerUserId = ownerUserIdArg ? Number(ownerUserIdArg) : Number.NaN;
  const ownerUserId = Number.isFinite(parsedOwnerUserId) && parsedOwnerUserId > 0
    ? Math.trunc(parsedOwnerUserId)
    : undefined;

  const result = await sendWeeklyBackupEmail({
    force: true,
    ownerUserId,
    referenceDateIso: targetDateArg || undefined,
    timeZone: normalizeTimeZone(env.EMAIL_WEEKLY_BACKUP_TZ),
  });

  const log = result.ok ? console.log : console.error;
  log(`[weekly-backup-email-manual] ${result.message}`);
  console.log(
    `[weekly-backup-email-manual] data=${result.referenceDateIso || "-"} enviados=${result.sentEmails} emprestimos=${result.loansCount} parcelas=${result.installmentsCount} receber=${result.receivablesCount} pagar=${result.payablesCount} destinatarios=${result.recipients.length}`,
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[weekly-backup-email-manual] Falha: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
