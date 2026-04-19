import { env } from "../config/env";
import { getHourMinuteInTimeZone, getIsoTodayInTimeZone, normalizeTimeZone } from "../lib/date-time";
import { sendWeeklyBackupEmail } from "../services/weekly-backup-email.service";

const JOB_TICK_MS = 30_000;
const WEEKDAY_SUNDAY = 0;

let jobTimer: NodeJS.Timeout | null = null;
let jobBusy = false;
let jobLastRunDate: string | null = null;

function getWeekdayInTimeZone(timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date());

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[label] ?? -1;
}

export function startWeeklyBackupEmailJob(): void {
  if (jobTimer) return;

  if (!env.EMAIL_WEEKLY_BACKUP_ENABLED) {
    console.log("[weekly-backup-email-job] Job desativado (EMAIL_WEEKLY_BACKUP_ENABLED=false).");
    return;
  }

  const timeZone = normalizeTimeZone(env.EMAIL_WEEKLY_BACKUP_TZ);
  const scheduleTime = env.EMAIL_WEEKLY_BACKUP_TIME;

  console.log(
    `[weekly-backup-email-job] Job iniciado. Execucao semanal aos domingos as ${scheduleTime} (${timeZone}).`,
  );

  const run = async (label: string) => {
    const referenceDateIso = getIsoTodayInTimeZone(timeZone);

    try {
      const result = await sendWeeklyBackupEmail({
        force: true,
        referenceDateIso,
        timeZone,
      });

      console.log(`[weekly-backup-email-job] (${label}) Data referencia: ${result.referenceDateIso}`);
      console.log(`[weekly-backup-email-job] (${label}) E-mails enviados: ${result.sentEmails}`);
      console.log(`[weekly-backup-email-job] (${label}) Emprestimos: ${result.loansCount}`);
      console.log(`[weekly-backup-email-job] (${label}) Parcelas: ${result.installmentsCount}`);
      console.log(`[weekly-backup-email-job] (${label}) Contas a receber: ${result.receivablesCount}`);
      console.log(`[weekly-backup-email-job] (${label}) Contas a pagar: ${result.payablesCount}`);

      if (result.skipped) {
        console.log(`[weekly-backup-email-job] (${label}) Envio pulado: ${result.message}`);
      } else if (!result.ok) {
        console.error(`[weekly-backup-email-job] (${label}) Erro no envio do backup: ${result.message}`);
      } else {
        console.log(`[weekly-backup-email-job] (${label}) Sucesso no envio do backup semanal.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[weekly-backup-email-job] (${label}) Erro no envio do backup: ${message}`);
    }
  };

  const tick = async () => {
    if (jobBusy) return;

    const todayIso = getIsoTodayInTimeZone(timeZone);
    const hourMinute = getHourMinuteInTimeZone(timeZone);
    const weekday = getWeekdayInTimeZone(timeZone);

    if (weekday !== WEEKDAY_SUNDAY) return;
    if (hourMinute !== scheduleTime) return;
    if (jobLastRunDate === todayIso) return;

    jobBusy = true;
    try {
      await run("agendado");
      jobLastRunDate = todayIso;
    } finally {
      jobBusy = false;
    }
  };

  jobTimer = setInterval(() => {
    void tick();
  }, JOB_TICK_MS);

  if (env.EMAIL_WEEKLY_BACKUP_RUN_ON_START) {
    void (async () => {
      if (jobBusy) return;
      jobBusy = true;
      try {
        await run("startup");
        jobLastRunDate = getIsoTodayInTimeZone(timeZone);
      } finally {
        jobBusy = false;
      }
    })();
  }
}
