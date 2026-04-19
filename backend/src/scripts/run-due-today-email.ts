import "dotenv/config";
import { env } from "../config/env";
import { normalizeTimeZone } from "../lib/date-time";
import { prisma } from "../lib/prisma";
import { sendDueTodayInstallmentsEmail } from "../services/email-reminder.service";

async function main() {
  const targetDateArg = process.argv[2]?.trim();

  const result = await sendDueTodayInstallmentsEmail({
    force: true,
    targetDateIso: targetDateArg || undefined,
    timeZone: normalizeTimeZone(env.EMAIL_NOTIFY_TZ),
  });

  const log = result.ok ? console.log : console.error;
  log(`[due-today-email-manual] ${result.message}`);
  console.log(
    `[due-today-email-manual] data=${result.targetDateIso || "-"} parcelas=${result.dueCount} receber=${result.receivableCount} pagar=${result.payableCount} itens=${result.totalEntries} totalReceber=${result.totalToReceiveAmount.toFixed(2)} totalPagar=${result.payableAmount.toFixed(2)} destinatarios=${result.recipients.length}`,
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[due-today-email-manual] Falha: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
