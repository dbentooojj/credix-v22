import { DailyReceivablesEmailStatus, InstallmentStatus, Prisma } from "@prisma/client";
import { env } from "../config/env";
import { addDays, getIsoTodayInTimeZone, normalizeTimeZone } from "../lib/date-time";
import { toSafeNumber } from "../lib/numbers";
import { prisma } from "../lib/prisma";
import { getSmtpConfigError, sendEmail } from "./email.service";

export type DueInstallment = {
  ownerUserId: number;
  installmentId: number;
  installmentNumber: number;
  installmentTotal: number;
  clientId: number;
  clientName: string;
  clientPhone: string | null;
  amount: number;
};

export type DueInstallmentGroup = {
  clientId: number;
  clientName: string;
  clientPhone: string | null;
  installments: DueInstallment[];
  totalAmount: number;
};

type SendDueTodayEmailOptions = {
  /** Permite o teste manual mesmo com EMAIL_NOTIFY_ENABLED=false. */
  force?: boolean;
  targetDateIso?: string;
  recipients?: string[];
  timeZone?: string;
  daysAhead?: number;
  ownerUserId?: number;
  /** Uso exclusivo de testes manuais: nao grava a trava diaria. */
  skipDeliveryDeduplication?: boolean;
};

export type SendDueTodayEmailResult = {
  ok: boolean;
  skipped: boolean;
  message: string;
  targetDateIso: string;
  recipients: string[];
  dueCount: number;
  clientCount: number;
  totalAmount: number;
  daysAhead: number;
  sentEmailCount: number;
  duplicateOwnerCount: number;
};

type DeliveryClaim = {
  acquired: boolean;
  status?: DailyReceivablesEmailStatus;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateIso(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function parseRecipients(raw?: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();

  raw
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .forEach((value) => seen.add(value));

  return [...seen];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBrazilPhoneDigits(rawPhone: string | null | undefined): string | null {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits.slice(2);
  return null;
}

function formatPhone(rawPhone: string | null | undefined): string {
  const digits = getBrazilPhoneDigits(rawPhone);
  if (!digits) return String(rawPhone || "").trim() || "-";

  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length === 9) return `(${areaCode}) ${number.slice(0, 5)}-${number.slice(5)}`;
  return `(${areaCode}) ${number.slice(0, 4)}-${number.slice(4)}`;
}

function normalizeWhatsAppPhone(rawPhone: string | null | undefined): string | null {
  const localPhone = getBrazilPhoneDigits(rawPhone);
  return localPhone ? `55${localPhone}` : null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeDaysAhead(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}

function getIsoDateDiff(baseIso: string, targetIso: string): number {
  const baseDate = new Date(`${baseIso}T00:00:00Z`);
  const targetDate = new Date(`${targetIso}T00:00:00Z`);
  if (Number.isNaN(baseDate.getTime()) || Number.isNaN(targetDate.getTime())) return 0;
  return Math.round((targetDate.getTime() - baseDate.getTime()) / 86_400_000);
}

function emptyResult(message: string, targetDateIso = "", daysAhead = 0): SendDueTodayEmailResult {
  return {
    ok: true,
    skipped: true,
    message,
    targetDateIso,
    recipients: [],
    dueCount: 0,
    clientCount: 0,
    totalAmount: 0,
    daysAhead,
    sentEmailCount: 0,
    duplicateOwnerCount: 0,
  };
}

async function fetchDueInstallments(targetDateIso: string, ownerUserId?: number): Promise<DueInstallment[]> {
  const dueDate = new Date(`${targetDateIso}T00:00:00Z`);
  const rows = await prisma.installment.findMany({
    where: {
      dueDate,
      status: { not: InstallmentStatus.PAGO },
      ...(ownerUserId ? { ownerUserId } : {}),
    },
    orderBy: [
      { client: { name: "asc" } },
      { loanId: "asc" },
      { installmentNumber: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      ownerUserId: true,
      installmentNumber: true,
      amount: true,
      client: { select: { id: true, name: true, phone: true } },
      loan: { select: { installmentsCount: true } },
    },
  });

  return rows.map((row) => ({
    ownerUserId: row.ownerUserId,
    installmentId: row.id,
    installmentNumber: row.installmentNumber,
    installmentTotal: Math.max(1, Math.trunc(row.loan.installmentsCount || 1)),
    clientId: row.client.id,
    clientName: row.client.name,
    clientPhone: row.client.phone,
    amount: toSafeNumber(row.amount),
  }));
}

function groupByClient(items: DueInstallment[]): DueInstallmentGroup[] {
  const groups = new Map<number, DueInstallmentGroup>();

  for (const item of items) {
    const current = groups.get(item.clientId);
    if (current) {
      current.installments.push(item);
      current.totalAmount += item.amount;
      continue;
    }

    groups.set(item.clientId, {
      clientId: item.clientId,
      clientName: item.clientName,
      clientPhone: item.clientPhone,
      installments: [item],
      totalAmount: item.amount,
    });
  }

  return [...groups.values()];
}

function groupByOwner(items: DueInstallment[]): Map<number, DueInstallment[]> {
  const groups = new Map<number, DueInstallment[]>();
  for (const item of items) {
    const current = groups.get(item.ownerUserId);
    if (current) current.push(item);
    else groups.set(item.ownerUserId, [item]);
  }
  return groups;
}

async function getOwnerEmails(ownerUserIds: number[]): Promise<Map<number, string>> {
  const users = await prisma.user.findMany({
    where: { id: { in: ownerUserIds } },
    select: { id: true, email: true },
  });
  return new Map(users.map((user) => [user.id, user.email]));
}

export function buildDueReceivablesEmailText(
  groups: DueInstallmentGroup[],
  targetDateIso: string,
  totalAmount: number,
): string {
  const clientBlocks = groups.map((group) => {
    const phone = formatPhone(group.clientPhone);
    const items = group.installments.map((item) => (
      `Parcela ${item.installmentNumber}/${item.installmentTotal} — ${formatCurrency(item.amount)}`
    ));
    return [
      `${group.clientName} — ${phone} — Total: ${formatCurrency(group.totalAmount)}`,
      ...items,
    ].join("\n");
  });

  return [
    `Recebimentos previstos para ${formatDateIso(targetDateIso)}`,
    "",
    ...clientBlocks,
    "",
    `Total previsto para hoje: ${formatCurrency(totalAmount)}`,
    "",
    "Mensagem automatica do Credix.",
  ].join("\n");
}

export function buildDueReceivablesEmailHtml(
  groups: DueInstallmentGroup[],
  targetDateIso: string,
  totalAmount: number,
): string {
  const clientBlocks = groups.map((group) => {
    const phoneDisplay = escapeHtml(formatPhone(group.clientPhone));
    const whatsAppPhone = normalizeWhatsAppPhone(group.clientPhone);
    const phone = whatsAppPhone
      ? `<a href="https://wa.me/${whatsAppPhone}" target="_blank" rel="noopener noreferrer" style="color:#111827;text-decoration:underline;">${phoneDisplay}</a>`
      : phoneDisplay;
    const installments = group.installments.map((item) => (
      `<div style="margin:2px 0 0 12px;font-size:14px;">Parcela ${item.installmentNumber}/${item.installmentTotal} &mdash; ${formatCurrency(item.amount)}</div>`
    )).join("");

    return `
      <section style="margin:0 0 14px;">
        <p style="margin:0 0 4px;font-size:14px;white-space:nowrap;">
          <strong>${escapeHtml(group.clientName)}</strong> &mdash; ${phone} &mdash; Total: <strong>${formatCurrency(group.totalAmount)}</strong>
        </p>
        ${installments}
      </section>
    `;
  }).join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.4;max-width:680px;">
      <h1 style="margin:0 0 14px;font-size:20px;">Recebimentos previstos para ${formatDateIso(targetDateIso)}</h1>
      ${clientBlocks}
      <p style="margin:18px 0 0;font-size:15px;"><strong>Total previsto para hoje: ${formatCurrency(totalAmount)}</strong></p>
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Mensagem automatica do Credix.</p>
    </div>
  `;
}

async function claimDelivery(ownerUserId: number, targetDateIso: string): Promise<DeliveryClaim> {
  const referenceDate = new Date(`${targetDateIso}T00:00:00Z`);

  try {
    await prisma.dailyReceivablesEmailDelivery.create({
      data: { ownerUserId, referenceDate, status: DailyReceivablesEmailStatus.SENDING },
    });
    return { acquired: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }

  const retry = await prisma.dailyReceivablesEmailDelivery.updateMany({
    where: { ownerUserId, referenceDate, status: DailyReceivablesEmailStatus.FAILED },
    data: { status: DailyReceivablesEmailStatus.SENDING, failureReason: null },
  });
  if (retry.count > 0) return { acquired: true };

  const existing = await prisma.dailyReceivablesEmailDelivery.findUnique({
    where: { ownerUserId_referenceDate: { ownerUserId, referenceDate } },
    select: { status: true },
  });
  return { acquired: false, status: existing?.status };
}

async function markDeliverySent(ownerUserId: number, targetDateIso: string): Promise<void> {
  await prisma.dailyReceivablesEmailDelivery.update({
    where: {
      ownerUserId_referenceDate: {
        ownerUserId,
        referenceDate: new Date(`${targetDateIso}T00:00:00Z`),
      },
    },
    data: { status: DailyReceivablesEmailStatus.SENT, sentAt: new Date(), failureReason: null },
  });
}

async function markDeliveryFailed(ownerUserId: number, targetDateIso: string, reason: string): Promise<void> {
  await prisma.dailyReceivablesEmailDelivery.updateMany({
    where: {
      ownerUserId,
      referenceDate: new Date(`${targetDateIso}T00:00:00Z`),
      status: DailyReceivablesEmailStatus.SENDING,
    },
    data: { status: DailyReceivablesEmailStatus.FAILED, failureReason: reason.slice(0, 2_000) },
  });
}

export async function sendDueTodayInstallmentsEmail(
  options: SendDueTodayEmailOptions = {},
): Promise<SendDueTodayEmailResult> {
  const configuredDaysAhead = normalizeDaysAhead(options.daysAhead ?? env.EMAIL_NOTIFY_DAYS_AHEAD);
  if (!env.EMAIL_NOTIFY_ENABLED && !options.force) {
    return emptyResult("Notificacao por e-mail desativada no .env", "", configuredDaysAhead);
  }

  const timeZone = normalizeTimeZone(options.timeZone ?? env.EMAIL_NOTIFY_TZ);
  const todayIso = getIsoTodayInTimeZone(timeZone);
  const explicitTargetDate = options.targetDateIso?.trim();
  const targetDateIso = explicitTargetDate || addDays(todayIso, configuredDaysAhead);
  const effectiveDaysAhead = explicitTargetDate ? getIsoDateDiff(todayIso, targetDateIso) : configuredDaysAhead;

  if (!isIsoDate(targetDateIso)) {
    return { ...emptyResult("Data alvo invalida. Use YYYY-MM-DD", "", configuredDaysAhead), ok: false };
  }

  const ownerUserId = Number(options.ownerUserId);
  const dueItems = await fetchDueInstallments(
    targetDateIso,
    Number.isFinite(ownerUserId) && ownerUserId > 0 ? Math.trunc(ownerUserId) : undefined,
  );
  if (dueItems.length === 0) {
    const message = `Nenhum recebimento previsto para ${formatDateIso(targetDateIso)}. E-mail nao enviado`;
    console.log(`[due-today-email] ${message}`);
    return emptyResult(message, targetDateIso, effectiveDaysAhead);
  }

  const smtpError = getSmtpConfigError();
  if (smtpError) {
    console.error(`[due-today-email] ${smtpError}`);
    return { ...emptyResult(smtpError, targetDateIso, effectiveDaysAhead), ok: false };
  }

  const dueItemsByOwner = groupByOwner(dueItems);
  const ownerIds = [...dueItemsByOwner.keys()];
  const ownerEmails = await getOwnerEmails(ownerIds);
  const configuredRecipients = options.recipients ?? parseRecipients(env.EMAIL_NOTIFY_TO);
  const recipientsSet = new Set<string>();
  const failures: string[] = [];
  const skippedOwners: string[] = [];
  let sentEmailCount = 0;
  let duplicateOwnerCount = 0;

  for (const currentOwnerId of ownerIds) {
    const ownerItems = dueItemsByOwner.get(currentOwnerId) ?? [];
    const groups = groupByClient(ownerItems);
    const totalAmount = ownerItems.reduce((sum, item) => sum + item.amount, 0);
    const recipients = configuredRecipients.length > 0
      ? configuredRecipients
      : parseRecipients(ownerEmails.get(currentOwnerId));

    if (recipients.length === 0) {
      const message = `Usuario ${currentOwnerId} sem destinatario valido`;
      skippedOwners.push(message);
      console.warn(`[due-today-email] ${message}`);
      continue;
    }

    if (!options.skipDeliveryDeduplication) {
      const claim = await claimDelivery(currentOwnerId, targetDateIso);
      if (!claim.acquired) {
        duplicateOwnerCount += 1;
        console.log(`[due-today-email] Envio ignorado para usuario ${currentOwnerId}: ja esta ${claim.status ?? "registrado"} em ${targetDateIso}.`);
        continue;
      }
    }

    try {
      await sendEmail({
        to: recipients,
        subject: `[Credix] Recebimentos previstos hoje (${formatDateIso(targetDateIso)}): ${ownerItems.length} parcela(s) | Total ${formatCurrency(totalAmount)}`,
        text: buildDueReceivablesEmailText(groups, targetDateIso, totalAmount),
        html: buildDueReceivablesEmailHtml(groups, targetDateIso, totalAmount),
      });
      sentEmailCount += 1;
      recipients.forEach((recipient) => recipientsSet.add(recipient));
      console.log(`[due-today-email] Envio bem-sucedido para usuario ${currentOwnerId}: ${ownerItems.length} parcela(s), total ${formatCurrency(totalAmount)}.`);

      if (!options.skipDeliveryDeduplication) {
        try {
          await markDeliverySent(currentOwnerId, targetDateIso);
        } catch (error) {
          console.error(`[due-today-email] E-mail enviado para usuario ${currentOwnerId}, mas nao foi possivel registrar a entrega: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`Usuario ${currentOwnerId}: ${message}`);
      console.error(`[due-today-email] Falha no envio para usuario ${currentOwnerId}: ${message}`);
      if (!options.skipDeliveryDeduplication) {
        try {
          await markDeliveryFailed(currentOwnerId, targetDateIso, message);
        } catch (persistenceError) {
          console.error(`[due-today-email] Nao foi possivel registrar a falha do usuario ${currentOwnerId}: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`);
        }
      }
    }
  }

  const clientCount = groupByClient(dueItems).length;
  const totalAmount = dueItems.reduce((sum, item) => sum + item.amount, 0);
  const recipients = [...recipientsSet];
  const detailParts = [
    sentEmailCount > 0 ? `${sentEmailCount} e-mail(s) enviado(s)` : "Nenhum e-mail enviado",
    duplicateOwnerCount > 0 ? `${duplicateOwnerCount} envio(s) duplicado(s) ignorado(s)` : "",
    skippedOwners.length > 0 ? `Sem destinatario: ${skippedOwners.join(" | ")}` : "",
    failures.length > 0 ? `Falhas: ${failures.join(" | ")}` : "",
  ].filter(Boolean);

  return {
    ok: failures.length === 0,
    skipped: sentEmailCount === 0,
    message: detailParts.join(" | "),
    targetDateIso,
    recipients,
    dueCount: dueItems.length,
    clientCount,
    totalAmount,
    daysAhead: effectiveDaysAhead,
    sentEmailCount,
    duplicateOwnerCount,
  };
}

// Mantido por compatibilidade com integracoes anteriores.
export type SendDueTomorrowEmailResult = SendDueTodayEmailResult;

// Mantido por compatibilidade com integracoes anteriores.
export async function sendDueTomorrowInstallmentsEmail(
  options: SendDueTodayEmailOptions = {},
): Promise<SendDueTodayEmailResult> {
  return sendDueTodayInstallmentsEmail(options);
}
