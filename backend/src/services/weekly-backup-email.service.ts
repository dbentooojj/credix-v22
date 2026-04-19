import { FinanceTransactionType } from "@prisma/client";
import PDFDocument from "pdfkit";
import { env } from "../config/env";
import { getIsoTodayInTimeZone, normalizeTimeZone } from "../lib/date-time";
import { CASH_ADJUSTMENT_CATEGORY, INSTALLMENT_PAYMENT_CATEGORY, LOAN_DISBURSEMENT_CATEGORY } from "../lib/installment-income-transaction";
import { toSafeNumber } from "../lib/numbers";
import { prisma } from "../lib/prisma";
import { getSmtpConfigError, sendEmail } from "./email.service";

type EmailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType: string;
};

type WeeklyBackupEmailOptions = {
  force?: boolean;
  referenceDateIso?: string;
  recipients?: string[];
  timeZone?: string;
  ownerUserId?: number;
};

export type SendWeeklyBackupEmailResult = {
  ok: boolean;
  skipped: boolean;
  message: string;
  referenceDateIso: string;
  recipients: string[];
  sentEmails: number;
  ownersProcessed: number;
  ownersSkipped: number;
  loansCount: number;
  installmentsCount: number;
  receivablesCount: number;
  payablesCount: number;
};

type OwnerRecord = {
  id: number;
  name: string;
  email: string;
};

type LoanBackupRow = {
  id: number;
  status: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  principalAmount: number;
  totalAmount: number;
  installmentsCount: number;
  paymentMethod: string;
  startDateIso: string;
  firstDueDateIso: string;
  dueDateIso: string;
  observations: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

type InstallmentBackupRow = {
  id: number;
  loanId: number;
  installmentNumber: number;
  status: string;
  clientName: string;
  amount: number;
  principalAmount: number | null;
  interestAmount: number | null;
  dueDateIso: string;
  paymentDateIso: string | null;
  notes: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

type FinanceBackupRow = {
  id: number;
  type: "INCOME" | "EXPENSE";
  status: string;
  amount: number;
  categoryId: number | null;
  category: string;
  dateIso: string;
  description: string;
  notes: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

type WeeklyBackupAttachmentsInput = {
  ownerUserId: number;
  referenceDateIso: string;
  loans: LoanBackupRow[];
  installments: InstallmentBackupRow[];
  receivables: FinanceBackupRow[];
  payables: FinanceBackupRow[];
};

const AUTOMATIC_FINANCE_CATEGORIES = [
  INSTALLMENT_PAYMENT_CATEGORY,
  LOAN_DISBURSEMENT_CATEGORY,
  CASH_ADJUSTMENT_CATEGORY,
] as const;

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
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

function formatMoneyPtBr(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toSafeNumber(value));
}

function dateOnlyToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDateOnlyPtBr(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTimePtBr(isoDateTime: string, timeZone: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;

  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);

  return formatted.replace(",", "");
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toCsvLineSemicolon(values: Array<string | number | null | undefined>): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) return "\"\"";
      return escapeCsvCell(String(value));
    })
    .join(";");
}

function buildCsvContentPtBr(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  return `\uFEFF${[toCsvLineSemicolon(headers), ...rows.map((row) => toCsvLineSemicolon(row))].join("\n")}`;
}

type PdfV2BadgeTone = "green" | "amber" | "red" | "blue" | "slate";

type PdfV2StatusBadge = {
  label: string;
  tone: PdfV2BadgeTone;
};

type PdfV2Section = {
  index: number;
  title: string;
  subtitle?: string;
};

type PdfV2FinanceInstallmentMeta = {
  baseDescription: string;
  installmentNumber: number;
  installmentTotal: number;
};

type PdfV2FinanceDecoratedRow = {
  row: FinanceBackupRow;
  status: PdfV2StatusBadge;
  installmentMeta: PdfV2FinanceInstallmentMeta | null;
};

type PdfV2FinanceInstallmentDetail = {
  installmentNumber: number;
  installmentTotal: number;
  amount: number;
  dueDateIso: string;
  paymentDateIso: string | null;
  status: PdfV2StatusBadge;
};

type PdfV2FinanceItem = {
  kind: "single" | "recurring" | "installment";
  name: string;
  category: string;
  amount: number;
  dueDateIso: string;
  status: PdfV2StatusBadge;
  recurrenceCount?: number;
  totalAmount?: number;
  installments?: PdfV2FinanceInstallmentDetail[];
  paidCount?: number;
  pendingCount?: number;
  overdueCount?: number;
};

const PDF_V2_THEME = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#dce5ef",
  borderStrong: "#c3d3e6",
  cardBg: "#f8fbff",
  tableHeaderBg: "#eef4fb",
  tableRowAlt: "#fafcff",
  accent: "#1d4ed8",
};

const PDF_V2_BADGE_THEME: Record<PdfV2BadgeTone, { bg: string; text: string }> = {
  green: { bg: "#dcfce7", text: "#166534" },
  amber: { bg: "#fef3c7", text: "#92400e" },
  red: { bg: "#fee2e2", text: "#991b1b" },
  blue: { bg: "#dbeafe", text: "#1e40af" },
  slate: { bg: "#e2e8f0", text: "#334155" },
};

function pdfV2Clip(value: string, maxLength = 48): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  if (maxLength <= 3) return clean.slice(0, maxLength);
  return `${clean.slice(0, maxLength - 3)}...`;
}

function pdfV2NormalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function pdfV2ContentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pdfV2DrawCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    fill?: string;
    stroke?: string;
    radius?: number;
  },
): void {
  const fill = options?.fill ?? PDF_V2_THEME.cardBg;
  const stroke = options?.stroke ?? PDF_V2_THEME.border;
  const radius = options?.radius ?? 8;
  doc.save();
  doc.roundedRect(x, y, width, height, radius).fillAndStroke(fill, stroke);
  doc.restore();
}

function pdfV2DrawBadge(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  status: PdfV2StatusBadge,
  fontSize = 8.2,
): number {
  const palette = PDF_V2_BADGE_THEME[status.tone];
  const horizontalPadding = 6;
  const verticalPadding = 2.2;

  doc.font("Helvetica-Bold").fontSize(fontSize);
  const textWidth = doc.widthOfString(status.label);
  const badgeWidth = textWidth + (horizontalPadding * 2);
  const badgeHeight = fontSize + (verticalPadding * 2);

  doc.save();
  doc.roundedRect(x, y, badgeWidth, badgeHeight, 7).fill(palette.bg);
  doc.restore();

  doc.fillColor(palette.text).text(status.label, x + horizontalPadding, y + verticalPadding - 0.4, {
    lineBreak: false,
  });
  doc.fillColor(PDF_V2_THEME.text);

  return badgeWidth;
}

function pdfV2DrawSectionHeader(
  doc: PDFKit.PDFDocument,
  section: PdfV2Section,
  continuation = false,
): void {
  const x = doc.page.margins.left;
  const width = pdfV2ContentWidth(doc);
  const title = `${section.index}. ${section.title}${continuation ? " (continuacao)" : ""}`;

  doc.font("Helvetica-Bold").fontSize(12.5).fillColor(PDF_V2_THEME.text).text(title, x, doc.y, { width });
  if (section.subtitle) {
    doc.moveDown(0.1);
    doc.font("Helvetica").fontSize(9.2).fillColor(PDF_V2_THEME.muted).text(section.subtitle, x, doc.y, { width });
  }

  const dividerY = doc.y + 4;
  doc.save();
  doc.moveTo(x, dividerY).lineTo(x + width, dividerY).lineWidth(1).strokeColor(PDF_V2_THEME.borderStrong).stroke();
  doc.restore();
  doc.y = dividerY + 7;
}

function pdfV2EnsureSpace(
  doc: PDFKit.PDFDocument,
  requiredHeight: number,
  section?: PdfV2Section,
): boolean {
  const maxY = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight <= maxY) return false;

  doc.addPage();
  doc.y = doc.page.margins.top;
  if (section) {
    pdfV2DrawSectionHeader(doc, section, true);
  }
  return true;
}

function pdfV2AddMonthsIsoDate(isoDate: string, monthsToAdd = 1): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const firstTargetMonth = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  const targetYear = firstTargetMonth.getUTCFullYear();
  const targetMonth = firstTargetMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  const date = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
  return date.toISOString().slice(0, 10);
}

function pdfV2IsMonthlyCadence(datesIso: string[]): boolean {
  if (datesIso.length < 2) return false;
  let monthlyPairs = 0;
  for (let index = 1; index < datesIso.length; index += 1) {
    const expected = pdfV2AddMonthsIsoDate(datesIso[index - 1] as string, 1);
    if (datesIso[index] === expected) {
      monthlyPairs += 1;
    }
  }
  const totalPairs = datesIso.length - 1;
  return monthlyPairs >= Math.max(1, Math.floor(totalPairs * 0.7));
}

function pdfV2ParseFinanceInstallmentMeta(description: string): PdfV2FinanceInstallmentMeta | null {
  const match = description.match(/\s*\((\d{1,3})\s*\/\s*(\d{1,3})\)\s*$/);
  if (!match) return null;

  const installmentNumber = Number(match[1]);
  const installmentTotal = Number(match[2]);
  if (
    !Number.isFinite(installmentNumber)
    || !Number.isFinite(installmentTotal)
    || installmentNumber < 1
    || installmentTotal < 2
    || installmentNumber > installmentTotal
  ) {
    return null;
  }

  const baseDescription = description.replace(/\s*\(\d{1,3}\s*\/\s*\d{1,3}\)\s*$/, "").trim();
  return {
    baseDescription: baseDescription || description.trim(),
    installmentNumber,
    installmentTotal,
  };
}

function pdfV2LoanStatus(status: string): PdfV2StatusBadge {
  const normalized = status.trim().toUpperCase();
  if (normalized === "QUITADO") return { label: "Quitado", tone: "green" };
  if (normalized === "ATRASADO") return { label: "Atrasado", tone: "red" };
  if (normalized === "EM_DIA") return { label: "Em dia", tone: "blue" };
  return { label: "Pendente", tone: "amber" };
}

function pdfV2InstallmentStatus(status: string): PdfV2StatusBadge {
  const normalized = status.trim().toUpperCase();
  if (normalized === "PAGO") return { label: "Pago", tone: "green" };
  if (normalized === "ATRASADO") return { label: "Atrasado", tone: "red" };
  return { label: "Pendente", tone: "amber" };
}

function pdfV2FinanceStatus(status: string, dueDateIso: string, referenceDateIso: string): PdfV2StatusBadge {
  const normalized = status.trim().toUpperCase();
  if (normalized === "COMPLETED") return { label: "Pago", tone: "green" };
  if (dueDateIso < referenceDateIso) return { label: "Atrasado", tone: "red" };
  return { label: "Pendente", tone: normalized === "SCHEDULED" ? "blue" : "amber" };
}

function pdfV2BuildFinanceItems(rows: FinanceBackupRow[], referenceDateIso: string): PdfV2FinanceItem[] {
  const decoratedRows: PdfV2FinanceDecoratedRow[] = rows.map((row) => ({
    row,
    status: pdfV2FinanceStatus(row.status, row.dateIso, referenceDateIso),
    installmentMeta: pdfV2ParseFinanceInstallmentMeta(row.description),
  }));

  const installmentGroups = new Map<string, PdfV2FinanceDecoratedRow[]>();
  const nonInstallmentRows: PdfV2FinanceDecoratedRow[] = [];

  for (const decorated of decoratedRows) {
    if (!decorated.installmentMeta) {
      nonInstallmentRows.push(decorated);
      continue;
    }

    const key = [
      pdfV2NormalizeKeyPart(decorated.installmentMeta.baseDescription),
      decorated.row.categoryId ?? decorated.row.category,
      decorated.installmentMeta.installmentTotal,
      decorated.row.createdAtIso.slice(0, 10),
    ].join("|");
    const current = installmentGroups.get(key) ?? [];
    current.push(decorated);
    installmentGroups.set(key, current);
  }

  const items: PdfV2FinanceItem[] = [];

  for (const groupRows of installmentGroups.values()) {
    const sorted = [...groupRows].sort((left, right) => {
      const leftMeta = left.installmentMeta!;
      const rightMeta = right.installmentMeta!;
      if (leftMeta.installmentNumber !== rightMeta.installmentNumber) {
        return leftMeta.installmentNumber - rightMeta.installmentNumber;
      }
      if (left.row.dateIso !== right.row.dateIso) {
        return left.row.dateIso.localeCompare(right.row.dateIso, "pt-BR");
      }
      return left.row.id - right.row.id;
    });

    const first = sorted[0]!;
    const installments = sorted.map((item) => ({
      installmentNumber: item.installmentMeta!.installmentNumber,
      installmentTotal: item.installmentMeta!.installmentTotal,
      amount: item.row.amount,
      dueDateIso: item.row.dateIso,
      paymentDateIso: item.row.status.toUpperCase() === "COMPLETED" ? item.row.dateIso : null,
      status: item.status,
    }));

    const totalAmount = installments.reduce((sum, installment) => sum + installment.amount, 0);
    const paidCount = installments.filter((installment) => installment.status.label === "Pago").length;
    const overdueCount = installments.filter((installment) => installment.status.label === "Atrasado").length;
    const pendingCount = installments.length - paidCount - overdueCount;
    const mainStatus: PdfV2StatusBadge = paidCount === installments.length
      ? { label: "Pago", tone: "green" }
      : overdueCount > 0
        ? { label: "Atrasado", tone: "red" }
        : { label: "Pendente", tone: "amber" };
    const dueDateIso = installments.find((installment) => installment.status.label !== "Pago")?.dueDateIso
      ?? installments[installments.length - 1]!.dueDateIso;

    items.push({
      kind: "installment",
      name: first.installmentMeta!.baseDescription,
      category: first.row.category,
      amount: installments[0]!.amount,
      totalAmount,
      dueDateIso,
      status: mainStatus,
      installments,
      paidCount,
      pendingCount,
      overdueCount,
    });
  }

  const recurringCandidates = new Map<string, PdfV2FinanceDecoratedRow[]>();
  for (const row of nonInstallmentRows) {
    const key = [
      pdfV2NormalizeKeyPart(row.row.description),
      row.row.categoryId ?? row.row.category,
      row.row.amount.toFixed(2),
    ].join("|");
    const current = recurringCandidates.get(key) ?? [];
    current.push(row);
    recurringCandidates.set(key, current);
  }

  for (const groupRows of recurringCandidates.values()) {
    const sorted = [...groupRows].sort((left, right) => {
      if (left.row.dateIso !== right.row.dateIso) {
        return left.row.dateIso.localeCompare(right.row.dateIso, "pt-BR");
      }
      return left.row.id - right.row.id;
    });

    const dates = sorted.map((item) => item.row.dateIso);
    const isRecurring = sorted.length >= 2 && pdfV2IsMonthlyCadence(dates);
    if (!isRecurring) {
      sorted.forEach((item) => {
        items.push({
          kind: "single",
          name: item.row.description,
          category: item.row.category,
          amount: item.row.amount,
          dueDateIso: item.row.dateIso,
          status: item.status,
        });
      });
      continue;
    }

    const openRows = sorted.filter((item) => item.row.status.toUpperCase() !== "COMPLETED");
    const overdueOpenRows = openRows.filter((item) => item.row.dateIso < referenceDateIso);
    const dueDateIso = openRows[0]?.row.dateIso ?? sorted[sorted.length - 1]!.row.dateIso;
    const status: PdfV2StatusBadge = openRows.length === 0
      ? { label: "Pago", tone: "green" }
      : overdueOpenRows.length > 0
        ? { label: "Atrasado", tone: "red" }
        : { label: "Pendente", tone: "blue" };

    items.push({
      kind: "recurring",
      name: sorted[0]!.row.description,
      category: sorted[0]!.row.category,
      amount: sorted[0]!.row.amount,
      dueDateIso,
      status,
      recurrenceCount: sorted.length,
    });
  }

  return items.sort((left, right) => {
    if (left.dueDateIso !== right.dueDateIso) {
      return left.dueDateIso.localeCompare(right.dueDateIso, "pt-BR");
    }
    return left.name.localeCompare(right.name, "pt-BR");
  });
}

function pdfV2DrawHeader(
  doc: PDFKit.PDFDocument,
  params: {
    ownerName: string;
    ownerUserId: number;
    referenceDateIso: string;
    generatedAtIso: string;
    timeZone: string;
  },
): void {
  const x = doc.page.margins.left;
  const width = pdfV2ContentWidth(doc);
  const y = doc.y;
  const height = 84;

  pdfV2DrawCard(doc, x, y, width, height, {
    fill: "#f3f8ff",
    stroke: "#c8daf2",
    radius: 10,
  });

  doc.fillColor(PDF_V2_THEME.text).font("Helvetica-Bold").fontSize(17).text("Credix - Backup semanal", x + 14, y + 12, {
    width: width - 28,
  });
  doc.fillColor(PDF_V2_THEME.muted).font("Helvetica").fontSize(9.5);
  doc.text(`Data de referencia: ${formatDateIso(params.referenceDateIso)}`, x + 14, y + 40, { width: width - 28 });
  doc.text(`Usuario: ${params.ownerName} (#${params.ownerUserId})`, x + 14, y + 54, { width: width - 28 });
  doc.text(`Gerado em: ${formatDateTimePtBr(params.generatedAtIso, params.timeZone)} (${params.timeZone})`, x + 14, y + 67, {
    width: width - 28,
  });

  doc.fillColor(PDF_V2_THEME.text);
  doc.y = y + height + 12;
}

function pdfV2DrawSummaryCards(
  doc: PDFKit.PDFDocument,
  summary: Array<{ label: string; value: number }>,
): void {
  const x = doc.page.margins.left;
  const width = pdfV2ContentWidth(doc);
  const gap = 10;
  const columns = 2;
  const cardWidth = (width - gap) / columns;
  const cardHeight = 56;
  const rows = Math.ceil(summary.length / columns);
  const startY = doc.y;

  doc.font("Helvetica-Bold").fontSize(11).fillColor(PDF_V2_THEME.text).text("Resumo geral", x, startY, { width });
  const cardsStartY = doc.y + 6;

  summary.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const cardX = x + ((cardWidth + gap) * col);
    const cardY = cardsStartY + ((cardHeight + gap) * row);

    pdfV2DrawCard(doc, cardX, cardY, cardWidth, cardHeight, {
      fill: "#f8fbff",
      stroke: "#d7e5f4",
      radius: 9,
    });

    doc.fillColor(PDF_V2_THEME.muted).font("Helvetica-Bold").fontSize(8.3).text(item.label.toUpperCase(), cardX + 10, cardY + 10, {
      width: cardWidth - 20,
      align: "left",
      lineBreak: false,
    });
    doc.fillColor(PDF_V2_THEME.accent).font("Helvetica-Bold").fontSize(19).text(String(item.value), cardX + 10, cardY + 24, {
      width: cardWidth - 20,
      align: "left",
      lineBreak: false,
    });
  });

  doc.fillColor(PDF_V2_THEME.text);
  doc.y = cardsStartY + (rows * cardHeight) + ((rows - 1) * gap) + 12;
}

function pdfV2DrawLoanInstallmentsTable(
  doc: PDFKit.PDFDocument,
  installments: InstallmentBackupRow[],
  section: PdfV2Section,
  loanId: number,
): void {
  const x = doc.page.margins.left + 8;
  const width = pdfV2ContentWidth(doc) - 16;
  const headerHeight = 17;
  const rowHeight = 17;
  const columns = {
    installment: width * 0.17,
    status: width * 0.2,
    amount: width * 0.2,
    dueDate: width * 0.2,
    paymentDate: width * 0.23,
  };

  const renderHeader = () => {
    pdfV2EnsureSpace(doc, headerHeight + 4, section);
    const y = doc.y;
    pdfV2DrawCard(doc, x, y, width, headerHeight, {
      fill: PDF_V2_THEME.tableHeaderBg,
      stroke: PDF_V2_THEME.border,
      radius: 6,
    });

    doc.font("Helvetica-Bold").fontSize(8).fillColor(PDF_V2_THEME.muted);
    doc.text("Parcela", x + 6, y + 5, { width: columns.installment - 10, lineBreak: false });
    doc.text("Status", x + columns.installment + 4, y + 5, { width: columns.status - 8, lineBreak: false });
    doc.text("Valor", x + columns.installment + columns.status + 4, y + 5, { width: columns.amount - 8, lineBreak: false });
    doc.text("Vencimento", x + columns.installment + columns.status + columns.amount + 4, y + 5, {
      width: columns.dueDate - 8,
      lineBreak: false,
    });
    doc.text("Pagamento", x + columns.installment + columns.status + columns.amount + columns.dueDate + 4, y + 5, {
      width: columns.paymentDate - 8,
      lineBreak: false,
    });

    doc.fillColor(PDF_V2_THEME.text);
    doc.y = y + headerHeight + 3;
  };

  renderHeader();

  const totalInstallments = Math.max(
    installments.reduce((max, item) => Math.max(max, item.installmentNumber), 1),
    1,
  );

  installments.forEach((installment, index) => {
    const pageBreak = pdfV2EnsureSpace(doc, rowHeight + 2, section);
    if (pageBreak) {
      doc.font("Helvetica-Bold").fontSize(9.2).fillColor(PDF_V2_THEME.muted).text(`Emprestimo #${loanId} - parcelas`, x, doc.y, {
        width,
      });
      doc.moveDown(0.2);
      renderHeader();
    }

    const y = doc.y;
    if (index % 2 === 1) {
      pdfV2DrawCard(doc, x, y, width, rowHeight, {
        fill: PDF_V2_THEME.tableRowAlt,
        stroke: "#f1f5f9",
        radius: 5,
      });
    }

    doc.font("Helvetica").fontSize(8.4).fillColor(PDF_V2_THEME.text).text(`${installment.installmentNumber}/${totalInstallments}`, x + 6, y + 4.8, {
      width: columns.installment - 10,
      lineBreak: false,
    });
    pdfV2DrawBadge(doc, x + columns.installment + 4, y + 3.1, pdfV2InstallmentStatus(installment.status), 7.6);
    doc.font("Helvetica-Bold").fontSize(8.5).text(`R$ ${formatMoneyPtBr(installment.amount)}`, x + columns.installment + columns.status + 4, y + 4.8, {
      width: columns.amount - 8,
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(8.3).text(formatDateOnlyPtBr(installment.dueDateIso), x + columns.installment + columns.status + columns.amount + 4, y + 4.8, {
      width: columns.dueDate - 8,
      lineBreak: false,
    });
    doc.text(installment.paymentDateIso ? formatDateOnlyPtBr(installment.paymentDateIso) : "-", x + columns.installment + columns.status + columns.amount + columns.dueDate + 4, y + 4.8, {
      width: columns.paymentDate - 8,
      lineBreak: false,
    });

    doc.y = y + rowHeight + 1.5;
  });

  doc.fillColor(PDF_V2_THEME.text);
}

function pdfV2DrawLoanSection(
  doc: PDFKit.PDFDocument,
  params: {
    loans: LoanBackupRow[];
    installmentsByLoan: Map<number, InstallmentBackupRow[]>;
  },
): void {
  const section: PdfV2Section = {
    index: 1,
    title: "Emprestimos",
    subtitle: "Organizados por cliente, com parcelas subordinadas a cada contrato.",
  };

  pdfV2EnsureSpace(doc, 42);
  pdfV2DrawSectionHeader(doc, section);

  if (params.loans.length === 0) {
    pdfV2DrawCard(doc, doc.page.margins.left, doc.y, pdfV2ContentWidth(doc), 48, { fill: "#fafcff", stroke: "#dbe6f2" });
    doc.font("Helvetica").fontSize(10).fillColor(PDF_V2_THEME.muted).text("Nenhum emprestimo encontrado no periodo do backup.", doc.page.margins.left + 12, doc.y + 16, {
      width: pdfV2ContentWidth(doc) - 24,
    });
    doc.fillColor(PDF_V2_THEME.text);
    doc.moveDown(2.7);
    return;
  }

  const groupedByClient = new Map<string, LoanBackupRow[]>();
  for (const loan of params.loans) {
    const key = loan.clientName.trim() || "Cliente sem nome";
    const current = groupedByClient.get(key) ?? [];
    current.push(loan);
    groupedByClient.set(key, current);
  }

  const clients = [...groupedByClient.entries()].sort((left, right) => left[0].localeCompare(right[0], "pt-BR"));

  for (const [clientName, loans] of clients) {
    pdfV2EnsureSpace(doc, 26, section);
    doc.font("Helvetica-Bold").fontSize(11.2).fillColor(PDF_V2_THEME.text).text(clientName, doc.page.margins.left, doc.y, {
      width: pdfV2ContentWidth(doc),
    });
    doc.font("Helvetica").fontSize(8.8).fillColor(PDF_V2_THEME.muted).text(`${loans.length} emprestimo(s)`, doc.page.margins.left, doc.y + 1, {
      width: pdfV2ContentWidth(doc),
    });
    doc.fillColor(PDF_V2_THEME.text);
    doc.moveDown(0.35);

    for (const loan of loans.sort((left, right) => left.id - right.id)) {
      const loanInstallments = [...(params.installmentsByLoan.get(loan.id) ?? [])]
        .sort((left, right) => left.installmentNumber - right.installmentNumber);

      pdfV2EnsureSpace(doc, 74, section);
      const cardX = doc.page.margins.left;
      const cardY = doc.y;
      const cardWidth = pdfV2ContentWidth(doc);
      const cardHeight = 70;

      pdfV2DrawCard(doc, cardX, cardY, cardWidth, cardHeight, {
        fill: "#f8fbff",
        stroke: "#d6e4f3",
        radius: 9,
      });

      doc.font("Helvetica-Bold").fontSize(10.4).fillColor(PDF_V2_THEME.text).text(`Emprestimo #${loan.id}`, cardX + 12, cardY + 10, {
        width: cardWidth - 160,
        lineBreak: false,
      });
      pdfV2DrawBadge(doc, cardX + cardWidth - 96, cardY + 10, pdfV2LoanStatus(loan.status), 8.1);

      doc.font("Helvetica").fontSize(8.3).fillColor(PDF_V2_THEME.muted).text("Valor principal", cardX + 12, cardY + 29, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(11).fillColor(PDF_V2_THEME.text).text(`R$ ${formatMoneyPtBr(loan.principalAmount)}`, cardX + 12, cardY + 40, {
        lineBreak: false,
      });

      const rightX = cardX + (cardWidth * 0.42);
      doc.font("Helvetica").fontSize(8.3).fillColor(PDF_V2_THEME.muted).text("Inicio", rightX, cardY + 29, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(PDF_V2_THEME.text).text(formatDateOnlyPtBr(loan.startDateIso), rightX, cardY + 40, {
        lineBreak: false,
      });
      doc.font("Helvetica").fontSize(8.3).fillColor(PDF_V2_THEME.muted).text("Vencimento final", rightX + 112, cardY + 29, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(PDF_V2_THEME.text).text(formatDateOnlyPtBr(loan.dueDateIso), rightX + 112, cardY + 40, {
        lineBreak: false,
      });

      doc.font("Helvetica").fontSize(8.2).fillColor(PDF_V2_THEME.muted).text(`${loanInstallments.length} parcela(s)`, cardX + 12, cardY + 56, {
        width: cardWidth - 24,
      });

      doc.fillColor(PDF_V2_THEME.text);
      doc.y = cardY + cardHeight + 5;
      pdfV2DrawLoanInstallmentsTable(doc, loanInstallments, section, loan.id);
      doc.moveDown(0.45);
    }
  }
}

function pdfV2DrawFinanceInstallmentsTable(
  doc: PDFKit.PDFDocument,
  installments: PdfV2FinanceInstallmentDetail[],
  section: PdfV2Section,
  title: string,
): void {
  const x = doc.page.margins.left + 8;
  const width = pdfV2ContentWidth(doc) - 16;
  const headerHeight = 17;
  const rowHeight = 17;
  const columns = {
    installment: width * 0.17,
    status: width * 0.2,
    amount: width * 0.2,
    dueDate: width * 0.2,
    paymentDate: width * 0.23,
  };

  const renderHeader = () => {
    pdfV2EnsureSpace(doc, headerHeight + 4, section);
    const y = doc.y;
    pdfV2DrawCard(doc, x, y, width, headerHeight, {
      fill: PDF_V2_THEME.tableHeaderBg,
      stroke: PDF_V2_THEME.border,
      radius: 6,
    });

    doc.font("Helvetica-Bold").fontSize(8).fillColor(PDF_V2_THEME.muted);
    doc.text("Parcela", x + 6, y + 5, { width: columns.installment - 10, lineBreak: false });
    doc.text("Status", x + columns.installment + 4, y + 5, { width: columns.status - 8, lineBreak: false });
    doc.text("Valor", x + columns.installment + columns.status + 4, y + 5, { width: columns.amount - 8, lineBreak: false });
    doc.text("Vencimento", x + columns.installment + columns.status + columns.amount + 4, y + 5, {
      width: columns.dueDate - 8,
      lineBreak: false,
    });
    doc.text("Pagamento", x + columns.installment + columns.status + columns.amount + columns.dueDate + 4, y + 5, {
      width: columns.paymentDate - 8,
      lineBreak: false,
    });

    doc.fillColor(PDF_V2_THEME.text);
    doc.y = y + headerHeight + 3;
  };

  renderHeader();

  installments.forEach((installment, index) => {
    const pageBreak = pdfV2EnsureSpace(doc, rowHeight + 2, section);
    if (pageBreak) {
      doc.font("Helvetica-Bold").fontSize(9.2).fillColor(PDF_V2_THEME.muted).text(`${pdfV2Clip(title, 64)} - parcelas`, x, doc.y, {
        width,
      });
      doc.moveDown(0.2);
      renderHeader();
    }

    const y = doc.y;
    if (index % 2 === 1) {
      pdfV2DrawCard(doc, x, y, width, rowHeight, {
        fill: PDF_V2_THEME.tableRowAlt,
        stroke: "#f1f5f9",
        radius: 5,
      });
    }

    doc.font("Helvetica").fontSize(8.4).fillColor(PDF_V2_THEME.text).text(`${installment.installmentNumber}/${installment.installmentTotal}`, x + 6, y + 4.8, {
      width: columns.installment - 10,
      lineBreak: false,
    });
    pdfV2DrawBadge(doc, x + columns.installment + 4, y + 3.1, installment.status, 7.6);
    doc.font("Helvetica-Bold").fontSize(8.5).text(`R$ ${formatMoneyPtBr(installment.amount)}`, x + columns.installment + columns.status + 4, y + 4.8, {
      width: columns.amount - 8,
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(8.3).text(formatDateOnlyPtBr(installment.dueDateIso), x + columns.installment + columns.status + columns.amount + 4, y + 4.8, {
      width: columns.dueDate - 8,
      lineBreak: false,
    });
    doc.text(installment.paymentDateIso ? formatDateOnlyPtBr(installment.paymentDateIso) : "-", x + columns.installment + columns.status + columns.amount + columns.dueDate + 4, y + 4.8, {
      width: columns.paymentDate - 8,
      lineBreak: false,
    });

    doc.y = y + rowHeight + 1.5;
  });

  doc.fillColor(PDF_V2_THEME.text);
}

function pdfV2DrawFinanceSection(
  doc: PDFKit.PDFDocument,
  params: {
    title: string;
    subtitle: string;
    sectionIndex: number;
    items: PdfV2FinanceItem[];
  },
): void {
  const section: PdfV2Section = {
    index: params.sectionIndex,
    title: params.title,
    subtitle: params.subtitle,
  };

  pdfV2EnsureSpace(doc, 42);
  pdfV2DrawSectionHeader(doc, section);

  if (params.items.length === 0) {
    pdfV2DrawCard(doc, doc.page.margins.left, doc.y, pdfV2ContentWidth(doc), 48, { fill: "#fafcff", stroke: "#dbe6f2" });
    doc.font("Helvetica").fontSize(10).fillColor(PDF_V2_THEME.muted).text("Nenhum lancamento para exibir nesta secao.", doc.page.margins.left + 12, doc.y + 16, {
      width: pdfV2ContentWidth(doc) - 24,
    });
    doc.fillColor(PDF_V2_THEME.text);
    doc.moveDown(2.7);
    return;
  }

  for (const item of params.items) {
    const baseHeight = item.kind === "installment" ? 102 : (item.kind === "recurring" ? 92 : 78);
    pdfV2EnsureSpace(doc, baseHeight, section);

    const x = doc.page.margins.left;
    const y = doc.y;
    const width = pdfV2ContentWidth(doc);
    pdfV2DrawCard(doc, x, y, width, baseHeight, {
      fill: "#f8fbff",
      stroke: "#d6e4f3",
      radius: 9,
    });

    doc.font("Helvetica-Bold").fontSize(10.4).fillColor(PDF_V2_THEME.text).text(pdfV2Clip(item.name, 78), x + 12, y + 10, {
      width: width - 140,
      lineBreak: false,
    });
    pdfV2DrawBadge(doc, x + width - 96, y + 10, item.status, 8.1);

    doc.font("Helvetica").fontSize(8.2).fillColor(PDF_V2_THEME.muted).text(item.category, x + 12, y + 24, {
      width: width - 160,
      lineBreak: false,
    });

    doc.font("Helvetica").fontSize(8.3).fillColor(PDF_V2_THEME.muted).text("Valor", x + 12, y + 39, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(PDF_V2_THEME.text).text(
      `R$ ${formatMoneyPtBr(item.kind === "installment" ? (item.totalAmount ?? item.amount) : item.amount)}`,
      x + 12,
      y + 50,
      { lineBreak: false },
    );

    const rightX = x + (width * 0.48);
    doc.font("Helvetica").fontSize(8.3).fillColor(PDF_V2_THEME.muted).text("Vencimento", rightX, y + 39, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(PDF_V2_THEME.text).text(formatDateOnlyPtBr(item.dueDateIso), rightX, y + 50, {
      lineBreak: false,
    });

    if (item.kind === "recurring") {
      pdfV2DrawBadge(doc, x + 12, y + 68, { label: "Recorrente mensal", tone: "blue" }, 7.8);
      doc.font("Helvetica").fontSize(8.2).fillColor(PDF_V2_THEME.muted).text(
        `${item.recurrenceCount ?? 0} ocorrencia(s) no backup`,
        x + 112,
        y + 69.5,
        { width: width - 124 },
      );
    }

    if (item.kind === "installment") {
      doc.font("Helvetica").fontSize(8.2).fillColor(PDF_V2_THEME.muted).text(
        `Parcelado: ${item.installments?.length ?? 0} parcela(s) | Pagas: ${item.paidCount ?? 0} | Pendentes: ${item.pendingCount ?? 0} | Atrasadas: ${item.overdueCount ?? 0}`,
        x + 12,
        y + 69.5,
        { width: width - 24 },
      );
    }

    doc.fillColor(PDF_V2_THEME.text);
    doc.y = y + baseHeight + 5;

    if (item.kind === "installment" && item.installments && item.installments.length > 0) {
      pdfV2DrawFinanceInstallmentsTable(doc, item.installments, section, item.name);
      doc.moveDown(0.45);
    } else {
      doc.moveDown(0.5);
    }
  }
}

async function buildWeeklyBackupPdfBuffer(params: {
  ownerName: string;
  ownerUserId: number;
  referenceDateIso: string;
  timeZone: string;
  loans: LoanBackupRow[];
  installments: InstallmentBackupRow[];
  receivables: FinanceBackupRow[];
  payables: FinanceBackupRow[];
}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 34, right: 28, bottom: 34, left: 28 },
    info: {
      Title: `Backup semanal Credix - ${params.referenceDateIso}`,
      Author: "Credix",
      Subject: "Backup semanal com relatorio visual",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const generatedAtIso = new Date().toISOString();
  const installmentsByLoan = new Map<number, InstallmentBackupRow[]>();
  params.installments.forEach((installment) => {
    const current = installmentsByLoan.get(installment.loanId) ?? [];
    current.push(installment);
    installmentsByLoan.set(installment.loanId, current);
  });

  pdfV2DrawHeader(doc, {
    ownerName: params.ownerName,
    ownerUserId: params.ownerUserId,
    referenceDateIso: params.referenceDateIso,
    generatedAtIso,
    timeZone: params.timeZone,
  });

  pdfV2DrawSummaryCards(doc, [
    { label: "Emprestimos", value: params.loans.length },
    { label: "Parcelas", value: params.installments.length },
    { label: "Contas a receber", value: params.receivables.length },
    { label: "Contas a pagar", value: params.payables.length },
  ]);
  pdfV2DrawLoanSection(doc, {
    loans: params.loans,
    installmentsByLoan,
  });

  const payablesItems = pdfV2BuildFinanceItems(params.payables, params.referenceDateIso);
  pdfV2DrawFinanceSection(doc, {
    sectionIndex: 2,
    title: "Contas a pagar",
    subtitle: "Lancamentos resumidos e agrupados por recorrencia/parcelamento.",
    items: payablesItems,
  });

  const receivablesItems = pdfV2BuildFinanceItems(params.receivables, params.referenceDateIso);
  pdfV2DrawFinanceSection(doc, {
    sectionIndex: 3,
    title: "Contas a receber",
    subtitle: "Lancamentos resumidos e agrupados por recorrencia/parcelamento.",
    items: receivablesItems,
  });

  doc.end();
  return done;
}

function resolveRecipients(owner: OwnerRecord, override?: string[]): string[] {
  if (override && override.length > 0) {
    return override;
  }

  return parseRecipients(owner.email);
}

async function listOwners(ownerUserId?: number): Promise<OwnerRecord[]> {
  const where = ownerUserId !== undefined ? { id: ownerUserId } : undefined;

  const rows = await prisma.user.findMany({
    where,
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: String(row.email || "").trim().toLowerCase(),
  }));
}

async function fetchLoans(ownerUserId: number): Promise<LoanBackupRow[]> {
  const rows = await prisma.loan.findMany({
    where: { ownerUserId },
    orderBy: [{ id: "asc" }],
    select: {
      id: true,
      status: true,
      principalAmount: true,
      totalAmount: true,
      installmentsCount: true,
      paymentMethod: true,
      startDate: true,
      firstDueDate: true,
      dueDate: true,
      observations: true,
      createdAt: true,
      updatedAt: true,
      client: {
        select: {
          name: true,
          phone: true,
          email: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    clientName: row.client.name,
    clientPhone: row.client.phone,
    clientEmail: row.client.email,
    principalAmount: toSafeNumber(row.principalAmount),
    totalAmount: toSafeNumber(row.totalAmount),
    installmentsCount: row.installmentsCount,
    paymentMethod: row.paymentMethod,
    startDateIso: dateOnlyToIso(row.startDate),
    firstDueDateIso: dateOnlyToIso(row.firstDueDate),
    dueDateIso: dateOnlyToIso(row.dueDate),
    observations: row.observations,
    createdAtIso: row.createdAt.toISOString(),
    updatedAtIso: row.updatedAt.toISOString(),
  }));
}

async function fetchInstallments(ownerUserId: number): Promise<InstallmentBackupRow[]> {
  const rows = await prisma.installment.findMany({
    where: { ownerUserId },
    orderBy: [{ loanId: "asc" }, { installmentNumber: "asc" }, { id: "asc" }],
    select: {
      id: true,
      loanId: true,
      installmentNumber: true,
      status: true,
      amount: true,
      principalAmount: true,
      interestAmount: true,
      dueDate: true,
      paymentDate: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      client: {
        select: {
          name: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    loanId: row.loanId,
    installmentNumber: row.installmentNumber,
    status: row.status,
    clientName: row.client.name,
    amount: toSafeNumber(row.amount),
    principalAmount: row.principalAmount !== null ? toSafeNumber(row.principalAmount) : null,
    interestAmount: row.interestAmount !== null ? toSafeNumber(row.interestAmount) : null,
    dueDateIso: dateOnlyToIso(row.dueDate),
    paymentDateIso: row.paymentDate ? dateOnlyToIso(row.paymentDate) : null,
    notes: row.notes,
    createdAtIso: row.createdAt.toISOString(),
    updatedAtIso: row.updatedAt.toISOString(),
  }));
}

async function fetchFinanceRows(ownerUserId: number, type: FinanceTransactionType): Promise<FinanceBackupRow[]> {
  const rows = await prisma.financeTransaction.findMany({
    where: {
      ownerUserId,
      type,
      category: {
        notIn: [...AUTOMATIC_FINANCE_CATEGORIES],
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      status: true,
      amount: true,
      categoryId: true,
      category: true,
      date: true,
      description: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    amount: toSafeNumber(row.amount),
    categoryId: row.categoryId,
    category: row.category,
    dateIso: dateOnlyToIso(row.date),
    description: row.description,
    notes: row.notes,
    createdAtIso: row.createdAt.toISOString(),
    updatedAtIso: row.updatedAt.toISOString(),
  }));
}

function buildLoansCsv(rows: LoanBackupRow[], timeZone: string): string {
  return buildCsvContentPtBr(
    [
      "emprestimo_id",
      "status",
      "cliente",
      "telefone",
      "email",
      "valor_principal",
      "valor_total",
      "quantidade_parcelas",
      "forma_pagamento",
      "data_inicio",
      "primeiro_vencimento",
      "vencimento_final",
      "observacoes",
      "criado_em",
      "atualizado_em",
    ],
    rows.map((row) => [
      row.id,
      row.status,
      row.clientName,
      row.clientPhone,
      row.clientEmail,
      formatMoneyPtBr(row.principalAmount),
      formatMoneyPtBr(row.totalAmount),
      row.installmentsCount,
      row.paymentMethod,
      formatDateOnlyPtBr(row.startDateIso),
      formatDateOnlyPtBr(row.firstDueDateIso),
      formatDateOnlyPtBr(row.dueDateIso),
      row.observations,
      formatDateTimePtBr(row.createdAtIso, timeZone),
      formatDateTimePtBr(row.updatedAtIso, timeZone),
    ]),
  );
}

function buildInstallmentsCsv(rows: InstallmentBackupRow[], timeZone: string): string {
  return buildCsvContentPtBr(
    [
      "parcela_id",
      "emprestimo_id",
      "numero_parcela",
      "status",
      "cliente",
      "valor_parcela",
      "valor_principal",
      "valor_juros",
      "vencimento",
      "data_pagamento",
      "observacoes",
      "criado_em",
      "atualizado_em",
    ],
    rows.map((row) => [
      row.id,
      row.loanId,
      row.installmentNumber,
      row.status,
      row.clientName,
      formatMoneyPtBr(row.amount),
      row.principalAmount !== null ? formatMoneyPtBr(row.principalAmount) : null,
      row.interestAmount !== null ? formatMoneyPtBr(row.interestAmount) : null,
      formatDateOnlyPtBr(row.dueDateIso),
      row.paymentDateIso ? formatDateOnlyPtBr(row.paymentDateIso) : null,
      row.notes,
      formatDateTimePtBr(row.createdAtIso, timeZone),
      formatDateTimePtBr(row.updatedAtIso, timeZone),
    ]),
  );
}

function buildFinanceCsv(rows: FinanceBackupRow[], timeZone: string): string {
  return buildCsvContentPtBr(
    [
      "lancamento_id",
      "type",
      "status",
      "valor",
      "categoria_id",
      "category",
      "vencimento",
      "descricao",
      "observacoes",
      "criado_em",
      "atualizado_em",
    ],
    rows.map((row) => [
      row.id,
      row.type,
      row.status,
      formatMoneyPtBr(row.amount),
      row.categoryId,
      row.category,
      formatDateOnlyPtBr(row.dateIso),
      row.description,
      row.notes,
      formatDateTimePtBr(row.createdAtIso, timeZone),
      formatDateTimePtBr(row.updatedAtIso, timeZone),
    ]),
  );
}

async function buildAttachmentsForOwner(
  input: WeeklyBackupAttachmentsInput,
  timeZone: string,
  ownerName: string,
): Promise<EmailAttachment[]> {
  const stamp = input.referenceDateIso.replaceAll("-", "");
  const prefix = `credix_backup_${stamp}_user_${input.ownerUserId}`;
  const pdfContent = await buildWeeklyBackupPdfBuffer({
    ownerName,
    ownerUserId: input.ownerUserId,
    referenceDateIso: input.referenceDateIso,
    timeZone,
    loans: input.loans,
    installments: input.installments,
    receivables: input.receivables,
    payables: input.payables,
  });

  return [
    {
      filename: `${prefix}_resumo.pdf`,
      content: pdfContent,
      contentType: "application/pdf",
    },
    {
      filename: `${prefix}_emprestimos.csv`,
      content: buildLoansCsv(input.loans, timeZone),
      contentType: "text/csv; charset=utf-8",
    },
    {
      filename: `${prefix}_parcelas.csv`,
      content: buildInstallmentsCsv(input.installments, timeZone),
      contentType: "text/csv; charset=utf-8",
    },
    {
      filename: `${prefix}_contas_a_receber.csv`,
      content: buildFinanceCsv(input.receivables, timeZone),
      contentType: "text/csv; charset=utf-8",
    },
    {
      filename: `${prefix}_contas_a_pagar.csv`,
      content: buildFinanceCsv(input.payables, timeZone),
      contentType: "text/csv; charset=utf-8",
    },
  ];
}

function buildSubject(referenceDateIso: string): string {
  return `[Credix] Backup semanal ${formatDateIso(referenceDateIso)}`;
}

function buildTextBody(params: {
  ownerName: string;
  ownerId: number;
  referenceDateIso: string;
  loansCount: number;
  installmentsCount: number;
  receivablesCount: number;
  payablesCount: number;
}): string {
  return [
    `Backup semanal Credix - ${formatDateIso(params.referenceDateIso)}`,
    `Usuario: ${params.ownerName} (#${params.ownerId})`,
    "",
    "Resumo:",
    `- Emprestimos: ${params.loansCount}`,
    `- Parcelas: ${params.installmentsCount}`,
    `- Contas a receber: ${params.receivablesCount}`,
    `- Contas a pagar: ${params.payablesCount}`,
    "",
    "Anexos:",
    "- resumo.pdf",
    "- emprestimos.csv",
    "- parcelas.csv",
    "- contas_a_receber.csv",
    "- contas_a_pagar.csv",
    "",
    "Mensagem automatica do Credix.",
  ].join("\n");
}

function buildHtmlBody(params: {
  ownerName: string;
  ownerId: number;
  referenceDateIso: string;
  loansCount: number;
  installmentsCount: number;
  receivablesCount: number;
  payablesCount: number;
}): string {
  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.45;">
      <h1 style="margin:0 0 10px;font-size:22px;">Backup semanal Credix - ${escapeHtml(formatDateIso(params.referenceDateIso))}</h1>
      <p style="margin:0 0 16px;font-size:14px;">Usuario: <strong>${escapeHtml(params.ownerName)}</strong> (#${params.ownerId})</p>
      <table style="border-collapse:collapse;font-size:14px;min-width:360px;">
        <tbody>
          <tr>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;background:#f8fafc;">Emprestimos</td>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;"><strong>${params.loansCount}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;background:#f8fafc;">Parcelas</td>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;"><strong>${params.installmentsCount}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;background:#f8fafc;">Contas a receber</td>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;"><strong>${params.receivablesCount}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;background:#f8fafc;">Contas a pagar</td>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;"><strong>${params.payablesCount}</strong></td>
          </tr>
        </tbody>
      </table>
      <p style="margin:14px 0 0;font-size:14px;">Anexos: resumo em PDF + arquivos CSV completos.</p>
      <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">Mensagem automatica do Credix.</p>
    </div>
  `;
}

export async function sendWeeklyBackupEmail(
  options: WeeklyBackupEmailOptions = {},
): Promise<SendWeeklyBackupEmailResult> {
  const force = Boolean(options.force);
  if (!env.EMAIL_WEEKLY_BACKUP_ENABLED && !force) {
    return {
      ok: true,
      skipped: true,
      message: "Backup semanal por e-mail desativado no .env",
      referenceDateIso: "",
      recipients: [],
      sentEmails: 0,
      ownersProcessed: 0,
      ownersSkipped: 0,
      loansCount: 0,
      installmentsCount: 0,
      receivablesCount: 0,
      payablesCount: 0,
    };
  }

  const timeZone = normalizeTimeZone(options.timeZone ?? env.EMAIL_WEEKLY_BACKUP_TZ);
  const explicitReferenceDateIso = options.referenceDateIso?.trim();
  const referenceDateIso = (() => {
    if (!explicitReferenceDateIso) return getIsoTodayInTimeZone(timeZone);
    return isIsoDate(explicitReferenceDateIso) ? explicitReferenceDateIso : "";
  })();

  if (!referenceDateIso) {
    return {
      ok: false,
      skipped: true,
      message: "Data de referencia invalida. Use YYYY-MM-DD",
      referenceDateIso: "",
      recipients: [],
      sentEmails: 0,
      ownersProcessed: 0,
      ownersSkipped: 0,
      loansCount: 0,
      installmentsCount: 0,
      receivablesCount: 0,
      payablesCount: 0,
    };
  }

  const smtpError = getSmtpConfigError();
  if (smtpError) {
    return {
      ok: false,
      skipped: true,
      message: smtpError,
      referenceDateIso,
      recipients: [],
      sentEmails: 0,
      ownersProcessed: 0,
      ownersSkipped: 0,
      loansCount: 0,
      installmentsCount: 0,
      receivablesCount: 0,
      payablesCount: 0,
    };
  }

  const parsedOwnerUserId = Number(options.ownerUserId);
  const scopeOwnerUserId = Number.isFinite(parsedOwnerUserId) && parsedOwnerUserId > 0
    ? Math.trunc(parsedOwnerUserId)
    : undefined;
  const owners = await listOwners(scopeOwnerUserId);
  const configuredOverrideRecipients = parseRecipients(env.EMAIL_WEEKLY_BACKUP_TO);
  const explicitOverrideRecipients = options.recipients && options.recipients.length > 0
    ? parseRecipients(options.recipients.join(","))
    : [];
  const overrideRecipients = explicitOverrideRecipients.length > 0
    ? explicitOverrideRecipients
    : configuredOverrideRecipients;

  if (owners.length === 0) {
    return {
      ok: false,
      skipped: true,
      message: "Nenhum usuario encontrado para envio do backup semanal",
      referenceDateIso,
      recipients: [],
      sentEmails: 0,
      ownersProcessed: 0,
      ownersSkipped: 0,
      loansCount: 0,
      installmentsCount: 0,
      receivablesCount: 0,
      payablesCount: 0,
    };
  }

  const recipientsSet = new Set<string>();
  const skippedOwners: string[] = [];
  const failedOwners: string[] = [];
  let sentEmails = 0;
  let ownersProcessed = 0;
  let ownersSkipped = 0;
  let loansCount = 0;
  let installmentsCount = 0;
  let receivablesCount = 0;
  let payablesCount = 0;

  for (const owner of owners) {
    ownersProcessed += 1;
    const recipients = resolveRecipients(owner, overrideRecipients);
    if (recipients.length === 0) {
      ownersSkipped += 1;
      skippedOwners.push(`Usuario ${owner.id} sem destinatario valido`);
      continue;
    }

    const [ownerLoans, ownerInstallments, ownerReceivables, ownerPayables] = await Promise.all([
      fetchLoans(owner.id),
      fetchInstallments(owner.id),
      fetchFinanceRows(owner.id, FinanceTransactionType.INCOME),
      fetchFinanceRows(owner.id, FinanceTransactionType.EXPENSE),
    ]);

    const attachments = await buildAttachmentsForOwner({
      ownerUserId: owner.id,
      referenceDateIso,
      loans: ownerLoans,
      installments: ownerInstallments,
      receivables: ownerReceivables,
      payables: ownerPayables,
    }, timeZone, owner.name);

    try {
      await sendEmail({
        to: recipients,
        subject: buildSubject(referenceDateIso),
        text: buildTextBody({
          ownerName: owner.name,
          ownerId: owner.id,
          referenceDateIso,
          loansCount: ownerLoans.length,
          installmentsCount: ownerInstallments.length,
          receivablesCount: ownerReceivables.length,
          payablesCount: ownerPayables.length,
        }),
        html: buildHtmlBody({
          ownerName: owner.name,
          ownerId: owner.id,
          referenceDateIso,
          loansCount: ownerLoans.length,
          installmentsCount: ownerInstallments.length,
          receivablesCount: ownerReceivables.length,
          payablesCount: ownerPayables.length,
        }),
        attachments,
      });

      sentEmails += 1;
      loansCount += ownerLoans.length;
      installmentsCount += ownerInstallments.length;
      receivablesCount += ownerReceivables.length;
      payablesCount += ownerPayables.length;
      recipients.forEach((recipient) => recipientsSet.add(recipient));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failedOwners.push(`Usuario ${owner.id}: ${message}`);
    }
  }

  const recipients = [...recipientsSet];
  if (sentEmails === 0) {
    const reasonParts: string[] = [];
    if (skippedOwners.length > 0) reasonParts.push(`Sem destinatario: ${skippedOwners.join(" | ")}`);
    if (failedOwners.length > 0) reasonParts.push(`Falha no envio: ${failedOwners.join(" | ")}`);

    return {
      ok: false,
      skipped: true,
      message: reasonParts.join(" | ") || "Nenhum e-mail de backup semanal foi enviado",
      referenceDateIso,
      recipients,
      sentEmails,
      ownersProcessed,
      ownersSkipped,
      loansCount,
      installmentsCount,
      receivablesCount,
      payablesCount,
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
      referenceDateIso,
      recipients,
      sentEmails,
      ownersProcessed,
      ownersSkipped,
      loansCount,
      installmentsCount,
      receivablesCount,
      payablesCount,
    };
  }

  return {
    ok: true,
    skipped: false,
    message: `Backup semanal enviado para ${sentEmails} usuario(s)`,
    referenceDateIso,
    recipients,
    sentEmails,
    ownersProcessed,
    ownersSkipped,
    loansCount,
    installmentsCount,
    receivablesCount,
    payablesCount,
  };
}


