import { FinanceTransactionStatus, FinanceTransactionType, InstallmentStatus } from "@prisma/client";
import { env } from "../config/env";
import { addDays, getIsoTodayInTimeZone, normalizeTimeZone } from "../lib/date-time";
import { toSafeNumber } from "../lib/numbers";
import { prisma } from "../lib/prisma";
import { getSmtpConfigError, sendEmail } from "./email.service";

type DueInstallment = {
  ownerUserId: number;
  installmentId: number;
  installmentNumber: number;
  loanId: number;
  dueDateIso: string;
  status: InstallmentStatus;
  clientId: number;
  clientName: string;
  clientPhone: string | null;
  amount: number;
};

type DueInstallmentGroup = {
  clientId: number;
  clientName: string;
  clientPhone: string | null;
  installments: DueInstallment[];
  dueCount: number;
  totalAmount: number;
};

type DueFinanceTransaction = {
  id: number;
  ownerUserId: number;
  type: FinanceTransactionType;
  status: FinanceTransactionStatus;
  description: string;
  category: string;
  dueDateIso: string;
  amount: number;
};

type SendDueTodayEmailOptions = {
  force?: boolean;
  targetDateIso?: string;
  recipients?: string[];
  timeZone?: string;
  daysAhead?: number;
  ownerUserId?: number;
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
  receivableCount: number;
  receivableAmount: number;
  payableCount: number;
  payableAmount: number;
  totalEntries: number;
  totalToReceiveAmount: number;
  daysAhead: number;
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

function normalizeWhatsAppPhone(rawPhone: string | null | undefined): string | null {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length > 11) return digits;
  return null;
}

function getPhoneDisplay(rawPhone: string | null | undefined): string {
  const normalized = String(rawPhone || "").trim();
  return normalized || "-";
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeDaysAhead(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const integer = Math.trunc(raw);
  return integer >= 0 ? integer : 0;
}

function getIsoDateDiff(baseIso: string, targetIso: string): number {
  const baseDate = new Date(`${baseIso}T00:00:00Z`);
  const targetDate = new Date(`${targetIso}T00:00:00Z`);
  if (Number.isNaN(baseDate.getTime()) || Number.isNaN(targetDate.getTime())) return 0;
  return Math.round((targetDate.getTime() - baseDate.getTime()) / 86_400_000);
}

function getDueReference(daysAhead: number): { title: string; sentence: string } {
  if (daysAhead === 0) return { title: "hoje", sentence: "hoje" };
  if (daysAhead === 1) return { title: "amanha", sentence: "amanha" };
  if (daysAhead > 1) return { title: `em ${daysAhead} dia(s)`, sentence: `em ${daysAhead} dia(s)` };
  return { title: "na data selecionada", sentence: "na data selecionada" };
}

type RecipientSource = "override" | "owner-user";

type RecipientResolution = {
  recipients: string[];
  source: RecipientSource;
  message?: string;
};

async function getOwnerEmailsById(ownerUserIds: number[]): Promise<Map<number, string>> {
  if (ownerUserIds.length === 0) return new Map<number, string>();

  const rows = await prisma.user.findMany({
    where: { id: { in: ownerUserIds } },
    select: { id: true, email: true },
  });

  const map = new Map<number, string>();
  for (const row of rows) {
    map.set(row.id, String(row.email || "").trim().toLowerCase());
  }
  return map;
}

function resolveRecipientsForOwner(
  ownerUserId: number,
  ownerEmailsById: Map<number, string>,
  override?: string[],
): RecipientResolution {
  if (override && override.length > 0) {
    return {
      recipients: parseRecipients(override.join(",")),
      source: "override",
    };
  }

  const ownerEmail = ownerEmailsById.get(ownerUserId) ?? "";
  const recipients = parseRecipients(ownerEmail);
  if (recipients.length > 0) {
    return {
      recipients,
      source: "owner-user",
    };
  }

  return {
    recipients: [],
    source: "owner-user",
    message: `Usuario ${ownerUserId} sem e-mail valido para notificacao`,
  };
}

async function fetchDueInstallments(targetDateIso: string, ownerUserId?: number): Promise<DueInstallment[]> {
  const dueDate = new Date(`${targetDateIso}T00:00:00Z`);

  const rows = await prisma.installment.findMany({
    where: {
      dueDate,
      status: { not: InstallmentStatus.PAGO },
      ...(Number.isFinite(ownerUserId) ? { ownerUserId } : {}),
    },
    orderBy: [
      { client: { name: "asc" } },
      { installmentNumber: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      ownerUserId: true,
      loanId: true,
      installmentNumber: true,
      dueDate: true,
      amount: true,
      status: true,
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    ownerUserId: row.ownerUserId,
    installmentId: row.id,
    installmentNumber: row.installmentNumber,
    loanId: row.loanId,
    dueDateIso: row.dueDate.toISOString().slice(0, 10),
    status: row.status,
    clientId: row.client.id,
    clientName: row.client.name,
    clientPhone: row.client.phone,
    amount: toSafeNumber(row.amount),
  }));
}

function groupByClient(items: DueInstallment[]): DueInstallmentGroup[] {
  const map = new Map<number, DueInstallmentGroup>();

  for (const item of items) {
    const current = map.get(item.clientId);
    if (!current) {
      map.set(item.clientId, {
        clientId: item.clientId,
        clientName: item.clientName,
        clientPhone: item.clientPhone,
        installments: [item],
        dueCount: 1,
        totalAmount: item.amount,
      });
      continue;
    }

    current.installments.push(item);
    current.dueCount += 1;
    current.totalAmount += item.amount;
  }

  return [...map.values()];
}

type DueEmailSummary = {
  installmentItems: DueInstallment[];
  installmentGroups: DueInstallmentGroup[];
  dueCount: number;
  clientCount: number;
  totalAmount: number;
  receivableItems: DueFinanceTransaction[];
  receivableCount: number;
  receivableAmount: number;
  payableItems: DueFinanceTransaction[];
  payableCount: number;
  payableAmount: number;
  totalEntries: number;
  totalToReceiveAmount: number;
};

async function fetchDueFinanceTransactions(targetDateIso: string, ownerUserId?: number): Promise<DueFinanceTransaction[]> {
  const dueDate = new Date(`${targetDateIso}T00:00:00Z`);

  const rows = await prisma.financeTransaction.findMany({
    where: {
      date: dueDate,
      status: {
        in: [FinanceTransactionStatus.PENDING, FinanceTransactionStatus.SCHEDULED],
      },
      ...(Number.isFinite(ownerUserId) ? { ownerUserId } : {}),
    },
    orderBy: [
      { type: "asc" },
      { description: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      ownerUserId: true,
      type: true,
      status: true,
      description: true,
      category: true,
      date: true,
      amount: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    ownerUserId: row.ownerUserId,
    type: row.type,
    status: row.status,
    description: row.description,
    category: row.category,
    dueDateIso: row.date.toISOString().slice(0, 10),
    amount: toSafeNumber(row.amount),
  }));
}

function groupInstallmentsByOwner(items: DueInstallment[]): Map<number, DueInstallment[]> {
  const map = new Map<number, DueInstallment[]>();
  for (const item of items) {
    const current = map.get(item.ownerUserId);
    if (!current) {
      map.set(item.ownerUserId, [item]);
      continue;
    }
    current.push(item);
  }
  return map;
}

function groupFinanceByOwner(items: DueFinanceTransaction[]): Map<number, DueFinanceTransaction[]> {
  const map = new Map<number, DueFinanceTransaction[]>();
  for (const item of items) {
    const current = map.get(item.ownerUserId);
    if (!current) {
      map.set(item.ownerUserId, [item]);
      continue;
    }
    current.push(item);
  }
  return map;
}

function getOwnerIds(
  installmentsByOwner: Map<number, DueInstallment[]>,
  financeByOwner: Map<number, DueFinanceTransaction[]>,
): number[] {
  const ids = new Set<number>();
  installmentsByOwner.forEach((_, ownerId) => ids.add(ownerId));
  financeByOwner.forEach((_, ownerId) => ids.add(ownerId));
  return [...ids];
}

function summarizeDueData(
  installments: DueInstallment[],
  financeItems: DueFinanceTransaction[],
): DueEmailSummary {
  const installmentGroups = groupByClient(installments);
  const dueCount = installments.length;
  const clientCount = installmentGroups.length;
  const totalAmount = installments.reduce((sum, item) => sum + item.amount, 0);

  const receivableItems = financeItems.filter((item) => item.type === FinanceTransactionType.INCOME);
  const payableItems = financeItems.filter((item) => item.type === FinanceTransactionType.EXPENSE);
  const receivableCount = receivableItems.length;
  const payableCount = payableItems.length;
  const receivableAmount = receivableItems.reduce((sum, item) => sum + item.amount, 0);
  const payableAmount = payableItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    installmentItems: installments,
    installmentGroups,
    dueCount,
    clientCount,
    totalAmount,
    receivableItems,
    receivableCount,
    receivableAmount,
    payableItems,
    payableCount,
    payableAmount,
    totalEntries: dueCount + receivableCount + payableCount,
    totalToReceiveAmount: totalAmount + receivableAmount,
  };
}

function formatFinanceStatusLabel(status: FinanceTransactionStatus): string {
  if (status === FinanceTransactionStatus.SCHEDULED) return "Agendado";
  if (status === FinanceTransactionStatus.PENDING) return "Pendente";
  return "Pago";
}

function buildSubject(targetDateIso: string, summary: DueEmailSummary): string {
  const dateLabel = formatDateIso(targetDateIso);
  return `[Credix] Vencimentos (${dateLabel}): ${summary.totalEntries} item(ns) | Receber ${formatCurrency(summary.totalToReceiveAmount)} | Pagar ${formatCurrency(summary.payableAmount)}`;
}

function buildFinanceTextSection(title: string, items: DueFinanceTransaction[], emptyMessage: string): string {
  if (items.length === 0) {
    return `${title}\n${emptyMessage}`;
  }

  const rows = items.map((item) => {
    return `${item.description} | ${item.category} | ${formatDateIso(item.dueDateIso)} | ${formatFinanceStatusLabel(item.status)} | ${formatCurrency(item.amount)}`;
  });

  return [
    title,
    "Descricao | Categoria | Vencimento | Status | Valor",
    ...rows,
  ].join("\n");
}

function buildTextBody(
  summary: DueEmailSummary,
  targetDateIso: string,
  daysAhead: number,
): string {
  const dateLabel = formatDateIso(targetDateIso);
  const reference = getDueReference(daysAhead);

  const loansSection = (() => {
    if (summary.dueCount === 0) {
      return "Parcelas de emprestimo\nNenhuma parcela de emprestimo vence nesta data.";
    }

    const rows = summary.installmentItems.map((item) => {
      const phoneLabel = getPhoneDisplay(item.clientPhone);
      return `#${item.installmentNumber} | ${item.clientName} | ${formatDateIso(item.dueDateIso)} | ${formatCurrency(item.amount)} | ${phoneLabel}`;
    });

    return [
      "Parcelas de emprestimo",
      "Parcela | Nome | Vencimento | Valor | Telefone (WhatsApp)",
      ...rows,
    ].join("\n");
  })();

  const receivableSection = buildFinanceTextSection(
    "Contas a receber",
    summary.receivableItems,
    "Nenhuma conta a receber vence nesta data.",
  );

  const payableSection = buildFinanceTextSection(
    "Contas a pagar",
    summary.payableItems,
    "Nenhuma conta a pagar vence nesta data.",
  );

  return [
    `Agenda financeira (${dateLabel})`,
    `Parcelas de emprestimo: ${summary.dueCount} | ${formatCurrency(summary.totalAmount)}`,
    `Contas a receber: ${summary.receivableCount} | ${formatCurrency(summary.receivableAmount)}`,
    `Contas a pagar: ${summary.payableCount} | ${formatCurrency(summary.payableAmount)}`,
    `Total a receber: ${formatCurrency(summary.totalToReceiveAmount)} | Total a pagar: ${formatCurrency(summary.payableAmount)}`,
    "",
    loansSection,
    "",
    receivableSection,
    "",
    payableSection,
    "",
    "Mensagem automatica do Credix.",
  ].join("\n");
}

function buildFinanceHtmlSection(title: string, items: DueFinanceTransaction[], emptyMessage: string): string {
  if (items.length === 0) {
    return `
      <section style="margin-top:20px;">
        <h2 style="margin:0 0 8px;font-size:17px;color:#111827;">${escapeHtml(title)}</h2>
        <p style="margin:0;font-size:14px;color:#4b5563;">${escapeHtml(emptyMessage)}</p>
      </section>
    `;
  }

  const rows = items.map((item) => `
      <tr>
        <td style="padding:10px;border:1px solid #e5e7eb;">${escapeHtml(item.description)}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;">${escapeHtml(item.category)}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;text-align:center;">${formatDateIso(item.dueDateIso)}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;text-align:center;">${escapeHtml(formatFinanceStatusLabel(item.status))}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;">${formatCurrency(item.amount)}</td>
      </tr>
    `).join("");

  return `
    <section style="margin-top:20px;">
      <h2 style="margin:0 0 8px;font-size:17px;color:#111827;">${escapeHtml(title)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;background:#f8fafc;">Descricao</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;background:#f8fafc;">Categoria</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:center;background:#f8fafc;">Vencimento</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:center;background:#f8fafc;">Status</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:right;background:#f8fafc;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  `;
}

function buildHtmlBody(
  summary: DueEmailSummary,
  targetDateIso: string,
  daysAhead: number,
): string {
  const dateLabel = formatDateIso(targetDateIso);
  const reference = getDueReference(daysAhead);

  const loanRows = summary.installmentItems
    .map((item) => {
      const rowPhoneDisplay = escapeHtml(getPhoneDisplay(item.clientPhone));
      const rowWhatsappPhone = normalizeWhatsAppPhone(item.clientPhone);
      const rowPhoneCell = rowWhatsappPhone
        ? `<a href="https://wa.me/${rowWhatsappPhone}" target="_blank" rel="noopener noreferrer">${rowPhoneDisplay}</a>`
        : rowPhoneDisplay;

      return `
        <tr>
          <td style="padding:10px;border:1px solid #e5e7eb;text-align:center;">#${item.installmentNumber}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;">${escapeHtml(item.clientName)}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;text-align:center;">${formatDateIso(item.dueDateIso)}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;">${formatCurrency(item.amount)}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;">${rowPhoneCell}</td>
        </tr>
      `;
    })
    .join("");

  const loansSection = `
    <section style="margin-top:20px;">
      <h2 style="margin:0 0 8px;font-size:17px;color:#111827;">Parcelas de emprestimo</h2>
      ${summary.dueCount === 0
    ? `<p style="margin:0;font-size:14px;color:#4b5563;">Nenhuma parcela de emprestimo vence nesta data.</p>`
    : `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:center;background:#f8fafc;">Parcela</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;background:#f8fafc;">Nome</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:center;background:#f8fafc;">Vencimento</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:right;background:#f8fafc;">Valor</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;background:#f8fafc;">Telefone (WhatsApp)</th>
            </tr>
          </thead>
          <tbody>
            ${loanRows}
          </tbody>
        </table>
      `}
    </section>
  `;

  const receivableSection = buildFinanceHtmlSection(
    "Contas a receber",
    summary.receivableItems,
    "Nenhuma conta a receber vence nesta data.",
  );

  const payableSection = buildFinanceHtmlSection(
    "Contas a pagar",
    summary.payableItems,
    "Nenhuma conta a pagar vence nesta data.",
  );

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.45;">
      <h1 style="margin:0 0 10px;font-size:22px;">Agenda financeira (${dateLabel})</h1>
      <p style="margin:0 0 6px;font-size:14px;">
        Parcelas de emprestimo: <strong>${summary.dueCount}</strong> | <strong>${formatCurrency(summary.totalAmount)}</strong>
      </p>
      <p style="margin:0 0 6px;font-size:14px;">
        Contas a receber: <strong>${summary.receivableCount}</strong> | <strong>${formatCurrency(summary.receivableAmount)}</strong>
      </p>
      <p style="margin:0 0 6px;font-size:14px;">
        Contas a pagar: <strong>${summary.payableCount}</strong> | <strong>${formatCurrency(summary.payableAmount)}</strong>
      </p>
      <p style="margin:0 0 14px;font-size:14px;">
        Total a receber: <strong>${formatCurrency(summary.totalToReceiveAmount)}</strong> | Total a pagar: <strong>${formatCurrency(summary.payableAmount)}</strong>
      </p>
      ${loansSection}
      ${receivableSection}
      ${payableSection}
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Mensagem automatica do Credix.</p>
    </div>
  `;
}

export async function sendDueTodayInstallmentsEmail(
  options: SendDueTodayEmailOptions = {},
): Promise<SendDueTodayEmailResult> {
  const configuredDaysAhead = normalizeDaysAhead(options.daysAhead ?? env.EMAIL_NOTIFY_DAYS_AHEAD);
  const force = Boolean(options.force);

  if (!env.EMAIL_NOTIFY_ENABLED && !force) {
    return {
      ok: true,
      skipped: true,
      message: "Notificacao por e-mail desativada no .env",
      targetDateIso: "",
      recipients: [],
      dueCount: 0,
      clientCount: 0,
      totalAmount: 0,
      receivableCount: 0,
      receivableAmount: 0,
      payableCount: 0,
      payableAmount: 0,
      totalEntries: 0,
      totalToReceiveAmount: 0,
      daysAhead: configuredDaysAhead,
    };
  }

  const timeZone = normalizeTimeZone(options.timeZone ?? env.EMAIL_NOTIFY_TZ);
  const todayIso = getIsoTodayInTimeZone(timeZone);
  const defaultTargetDateIso = addDays(todayIso, configuredDaysAhead);
  const explicitTargetDateIso = options.targetDateIso?.trim();

  const targetDateIso = (() => {
    if (!explicitTargetDateIso) return defaultTargetDateIso;
    return isIsoDate(explicitTargetDateIso) ? explicitTargetDateIso : "";
  })();

  if (!targetDateIso) {
    return {
      ok: false,
      skipped: true,
      message: "Data alvo invalida. Use YYYY-MM-DD",
      targetDateIso: "",
      recipients: [],
      dueCount: 0,
      clientCount: 0,
      totalAmount: 0,
      receivableCount: 0,
      receivableAmount: 0,
      payableCount: 0,
      payableAmount: 0,
      totalEntries: 0,
      totalToReceiveAmount: 0,
      daysAhead: configuredDaysAhead,
    };
  }

  const effectiveDaysAhead = explicitTargetDateIso
    ? getIsoDateDiff(todayIso, targetDateIso)
    : configuredDaysAhead;

  const parsedOwnerUserId = Number(options.ownerUserId);
  const scopeOwnerUserId = Number.isFinite(parsedOwnerUserId) && parsedOwnerUserId > 0
    ? Math.trunc(parsedOwnerUserId)
    : undefined;

  const dueItems = await fetchDueInstallments(targetDateIso, scopeOwnerUserId);
  const dueFinanceItems = await fetchDueFinanceTransactions(targetDateIso, scopeOwnerUserId);
  const summary = summarizeDueData(dueItems, dueFinanceItems);

  if (summary.totalEntries === 0) {
    return {
      ok: true,
      skipped: true,
      message: `Nenhum vencimento encontrado para ${formatDateIso(targetDateIso)}. E-mail nao enviado`,
      targetDateIso,
      recipients: [],
      dueCount: summary.dueCount,
      clientCount: summary.clientCount,
      totalAmount: summary.totalAmount,
      receivableCount: summary.receivableCount,
      receivableAmount: summary.receivableAmount,
      payableCount: summary.payableCount,
      payableAmount: summary.payableAmount,
      totalEntries: summary.totalEntries,
      totalToReceiveAmount: summary.totalToReceiveAmount,
      daysAhead: effectiveDaysAhead,
    };
  }

  const smtpError = getSmtpConfigError();
  if (smtpError) {
    return {
      ok: false,
      skipped: true,
      message: smtpError,
      targetDateIso,
      recipients: [],
      dueCount: summary.dueCount,
      clientCount: summary.clientCount,
      totalAmount: summary.totalAmount,
      receivableCount: summary.receivableCount,
      receivableAmount: summary.receivableAmount,
      payableCount: summary.payableCount,
      payableAmount: summary.payableAmount,
      totalEntries: summary.totalEntries,
      totalToReceiveAmount: summary.totalToReceiveAmount,
      daysAhead: effectiveDaysAhead,
    };
  }

  const installmentItemsByOwner = groupInstallmentsByOwner(dueItems);
  const financeItemsByOwner = groupFinanceByOwner(dueFinanceItems);
  const ownerIds = getOwnerIds(installmentItemsByOwner, financeItemsByOwner);
  const ownerEmailsById = await getOwnerEmailsById(ownerIds);
  const recipientsSet = new Set<string>();
  let sentEmails = 0;
  const skippedOwners: string[] = [];
  const failedOwners: string[] = [];

  for (const ownerId of ownerIds) {
    const ownerInstallments = installmentItemsByOwner.get(ownerId) ?? [];
    const ownerFinanceItems = financeItemsByOwner.get(ownerId) ?? [];
    const ownerSummary = summarizeDueData(ownerInstallments, ownerFinanceItems);

    if (ownerSummary.totalEntries === 0) continue;

    const recipientResolution = resolveRecipientsForOwner(ownerId, ownerEmailsById, options.recipients);
    const recipients = recipientResolution.recipients;

    if (recipients.length === 0) {
      skippedOwners.push(
        recipientResolution.message
          || `Usuario ${ownerId} sem destinatarios validos (${recipientResolution.source})`,
      );
      continue;
    }

    try {
      await sendEmail({
        to: recipients,
        subject: buildSubject(targetDateIso, ownerSummary),
        text: buildTextBody(ownerSummary, targetDateIso, effectiveDaysAhead),
        html: buildHtmlBody(ownerSummary, targetDateIso, effectiveDaysAhead),
      });
      sentEmails += 1;
      recipients.forEach((recipient) => recipientsSet.add(recipient));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failedOwners.push(`Usuario ${ownerId}: ${message}`);
    }
  }

  const recipients = [...recipientsSet];

  if (sentEmails === 0) {
    const reasonParts: string[] = [];
    if (skippedOwners.length > 0) {
      reasonParts.push(`Sem destinatario: ${skippedOwners.join(" | ")}`);
    }
    if (failedOwners.length > 0) {
      reasonParts.push(`Falha no envio: ${failedOwners.join(" | ")}`);
    }

    return {
      ok: false,
      skipped: true,
      message: reasonParts.join(" | ") || "Nenhum e-mail enviado para os usuarios com vencimentos na data",
      targetDateIso,
      recipients,
      dueCount: summary.dueCount,
      clientCount: summary.clientCount,
      totalAmount: summary.totalAmount,
      receivableCount: summary.receivableCount,
      receivableAmount: summary.receivableAmount,
      payableCount: summary.payableCount,
      payableAmount: summary.payableAmount,
      totalEntries: summary.totalEntries,
      totalToReceiveAmount: summary.totalToReceiveAmount,
      daysAhead: effectiveDaysAhead,
    };
  }

  if (skippedOwners.length > 0 || failedOwners.length > 0) {
    const details: string[] = [`Envio parcial: ${sentEmails} e-mail(s) enviado(s)`];
    if (skippedOwners.length > 0) details.push(`Ignorados: ${skippedOwners.join(" | ")}`);
    if (failedOwners.length > 0) details.push(`Erros: ${failedOwners.join(" | ")}`);

    return {
      ok: true,
      skipped: false,
      message: details.join(" | "),
      targetDateIso,
      recipients,
      dueCount: summary.dueCount,
      clientCount: summary.clientCount,
      totalAmount: summary.totalAmount,
      receivableCount: summary.receivableCount,
      receivableAmount: summary.receivableAmount,
      payableCount: summary.payableCount,
      payableAmount: summary.payableAmount,
      totalEntries: summary.totalEntries,
      totalToReceiveAmount: summary.totalToReceiveAmount,
      daysAhead: effectiveDaysAhead,
    };
  }

  return {
    ok: true,
    skipped: false,
    message: `E-mail enviado para ${sentEmails} usuario(s) com ${summary.dueCount} parcela(s), ${summary.receivableCount} conta(s) a receber e ${summary.payableCount} conta(s) a pagar`,
    targetDateIso,
    recipients,
    dueCount: summary.dueCount,
    clientCount: summary.clientCount,
    totalAmount: summary.totalAmount,
    receivableCount: summary.receivableCount,
    receivableAmount: summary.receivableAmount,
    payableCount: summary.payableCount,
    payableAmount: summary.payableAmount,
    totalEntries: summary.totalEntries,
    totalToReceiveAmount: summary.totalToReceiveAmount,
    daysAhead: effectiveDaysAhead,
  };
}

// Mantido por compatibilidade com imports antigos.
export type SendDueTomorrowEmailResult = SendDueTodayEmailResult;

// Mantido por compatibilidade com imports antigos.
export async function sendDueTomorrowInstallmentsEmail(
  options: SendDueTodayEmailOptions = {},
): Promise<SendDueTodayEmailResult> {
  return sendDueTodayInstallmentsEmail(options);
}
