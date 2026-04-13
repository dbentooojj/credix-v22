"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Filter,
  Landmark,
  Loader2,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { readJsonOrThrow } from "../../../../utils/apiClient";

type ReportTab = "finance" | "loans";
type GroupBy = "day" | "week" | "month";
type FinanceOrigin = "all" | "manual" | "installment_payment" | "loan_disbursement" | "cash_adjustment";
type FinanceDirection = "all" | "income" | "expense";
type FinanceStatusFilter = "all" | "completed" | "open";
type FinanceRowStatus = "completed" | "pending" | "scheduled";
type LoanStatusFilter = "all" | "PENDENTE" | "EM_DIA" | "ATRASADO" | "QUITADO";

type FinanceFiltersState = {
  startDate: string;
  endDate: string;
  preset: "today" | "7d" | "month" | "3m" | "custom";
  origin: FinanceOrigin;
  direction: FinanceDirection;
  status: FinanceStatusFilter;
  categoryId: string;
  groupBy: GroupBy;
  page: number;
};

type LoansFiltersState = {
  startDate: string;
  endDate: string;
  preset: "month" | "3m" | "6m" | "12m" | "custom";
  loanStatus: LoanStatusFilter;
  groupBy: GroupBy;
};

type FinanceReportResponse = {
  filters: {
    startDate: string;
    endDate: string;
    origin: FinanceOrigin;
    direction: FinanceDirection;
    status: FinanceStatusFilter;
    categoryId: string | "all";
    groupBy: GroupBy;
    page: number;
    pageSize: number;
  };
  availableCategories: Array<{
    id: string;
    name: string;
    emoji?: string | null;
    active: boolean;
    type: "income" | "expense";
  }>;
  summary: {
    openingBalance: number;
    cashIn: number;
    cashOut: number;
    closingBalance: number;
    openToReceive: number;
    openToPay: number;
    projectedBalance: number;
  };
  series: Array<{
    bucket: string;
    label: string;
    income: number;
    expense: number;
    net: number;
    count: number;
  }>;
  breakdowns: {
    byOrigin: Array<{
      key: string;
      label: string;
      income: number;
      expense: number;
      net: number;
      count: number;
    }>;
    byCategory: Array<{
      key: string;
      label: string;
      income: number;
      expense: number;
      net: number;
      count: number;
    }>;
  };
  analysis: {
    biggestIncome: {
      description: string;
      amount: number;
      categoryName: string;
      date: string;
    } | null;
    biggestExpense: {
      description: string;
      amount: number;
      categoryName: string;
      date: string;
    } | null;
    topIncomeCategory: {
      key: string;
      label: string;
      total: number;
      count: number;
      percentage: number;
    } | null;
    topExpenseCategory: {
      key: string;
      label: string;
      total: number;
      count: number;
      percentage: number;
    } | null;
    averageAmount: number;
    incomeByCategory: Array<{
      key: string;
      label: string;
      total: number;
      count: number;
      percentage: number;
    }>;
    expenseByCategory: Array<{
      key: string;
      label: string;
      total: number;
      count: number;
      percentage: number;
    }>;
  };
  rows: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    direction: "income" | "expense";
    status: FinanceRowStatus;
    origin: Exclude<FinanceOrigin, "all">;
    categoryId: string | null;
    categoryName: string;
    isAutomatic: boolean;
    linkedLoanId: string | null;
    linkedInstallmentId: string | null;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

type LoansReportResponse = {
  filters: {
    startDate: string;
    endDate: string;
    loanStatus: LoanStatusFilter;
    groupBy: GroupBy;
  };
  summary: {
    loanedInPeriod: number;
    receivedInPeriod: number;
    profitInPeriod: number;
    openPortfolioAtEnd: number;
    overduePortfolioAtEnd: number;
    delinquencyRateAtEnd: number;
    roiAccumulatedToEnd: number;
    totalContracts: number;
    overdueInstallmentsAtEnd: number;
  };
  series: Array<{
    bucket: string;
    label: string;
    loaned: number;
    received: number;
    profit: number;
  }>;
  portfolioStatus: {
    items: Array<{
      status: "PENDENTE" | "EM_DIA" | "ATRASADO" | "QUITADO";
      label: string;
      count: number;
      amount: number;
    }>;
    avgTicket: number;
    avgTermDays: number;
    totalContracts: number;
  };
  exportRows: Array<{
    loanId: string;
    clientName: string;
    status: "PENDENTE" | "EM_DIA" | "ATRASADO" | "QUITADO";
    principal: number;
    total: number;
    received: number;
    open: number;
    overdue: number;
    startDate: string;
    dueDate: string;
  }>;
};

type AsyncState<T> = {
  loading: boolean;
  error: string;
  data: T | null;
};

const FINANCE_TABLE_PAGE_SIZE = 10;
const LOANS_TABLE_PAGE_SIZE = 10;
const PAGINATION_WINDOW = 5;

const ORIGIN_LABEL: Record<Exclude<FinanceOrigin, "all">, string> = {
  manual: "Manual",
  installment_payment: "Recebimento de parcela",
  loan_disbursement: "Desembolso de emprestimo",
  cash_adjustment: "Ajuste de caixa",
};

const STATUS_LABEL: Record<FinanceRowStatus, string> = {
  completed: "Realizado",
  pending: "Pendente",
  scheduled: "Agendado",
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(isoDate: string, delta: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

function shiftMonths(isoDate: string, delta: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(1);
  date.setMonth(date.getMonth() + delta);
  return toIsoDate(date);
}

function getMonthStart(isoDate: string) {
  return `${isoDate.slice(0, 7)}-01`;
}

function dateDiffDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(Math.round((end - start) / 86400000), 0);
}

function getPreviousPeriodRange(startDate: string, endDate: string) {
  const length = Math.max(dateDiffDays(startDate, endDate) + 1, 1);
  const previousEndDate = shiftDays(startDate, -1);
  const previousStartDate = shiftDays(previousEndDate, -(length - 1));
  return { previousStartDate, previousEndDate };
}

function getDeltaPercent(currentValue: number, previousValue: number) {
  if (Math.abs(previousValue) < 0.00001) {
    if (Math.abs(currentValue) < 0.00001) return 0;
    return 100;
  }
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getPaginationWindow(currentPage: number, totalPages: number, maxButtons = PAGINATION_WINDOW) {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_value, index) => index + 1);
  }

  const half = Math.floor(maxButtons / 2);
  let start = Math.max(currentPage - half, 1);
  let end = Math.min(start + maxButtons - 1, totalPages);

  if (end - start + 1 < maxButtons) {
    start = Math.max(end - maxButtons + 1, 1);
  }

  return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(value));
}

function formatPercent(value: unknown) {
  return `${safeNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDate(isoDate: string) {
  if (!isoDate) return "--";
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatDateShort(isoDate: string) {
  if (!isoDate) return "--";
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(parsed);
}

function serializeQuery(entries: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (value !== "") params.set(key, value);
  });
  return params.toString();
}

function triggerCsvDownload(href: string) {
  if (typeof window === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function parseTab(value: string | null): ReportTab {
  return value === "loans" ? "loans" : "finance";
}

function parseGroupBy(value: string | null, fallback: GroupBy): GroupBy {
  if (value === "day" || value === "week" || value === "month") return value;
  return fallback;
}

function parseFinancePreset(value: string | null): FinanceFiltersState["preset"] {
  if (value === "today" || value === "7d" || value === "month" || value === "3m" || value === "custom") {
    return value;
  }
  return "month";
}

function parseLoansPreset(value: string | null): LoansFiltersState["preset"] {
  if (value === "month" || value === "3m" || value === "6m" || value === "12m" || value === "custom") {
    return value;
  }
  return "month";
}

function parseFinanceOrigin(value: string | null): FinanceOrigin {
  if (value === "manual" || value === "installment_payment" || value === "loan_disbursement" || value === "cash_adjustment" || value === "all") {
    return value;
  }
  return "all";
}

function parseFinanceDirection(value: string | null): FinanceDirection {
  if (value === "income" || value === "expense" || value === "all") return value;
  return "all";
}

function parseFinanceStatus(value: string | null): FinanceStatusFilter {
  if (value === "completed" || value === "open" || value === "all") return value;
  return "all";
}

function parseLoanStatus(value: string | null): LoanStatusFilter {
  if (value === "PENDENTE" || value === "EM_DIA" || value === "ATRASADO" || value === "QUITADO" || value === "all") {
    return value;
  }
  return "all";
}

function getFinancePresetRange(preset: FinanceFiltersState["preset"], todayIso: string) {
  if (preset === "today") {
    return { startDate: todayIso, endDate: todayIso };
  }
  if (preset === "7d") {
    return { startDate: shiftDays(todayIso, -6), endDate: todayIso };
  }
  if (preset === "3m") {
    return { startDate: getMonthStart(shiftMonths(todayIso, -2)), endDate: todayIso };
  }
  if (preset === "month") {
    return { startDate: getMonthStart(todayIso), endDate: todayIso };
  }
  return { startDate: getMonthStart(todayIso), endDate: todayIso };
}

function getLoansPresetRange(preset: LoansFiltersState["preset"], todayIso: string) {
  if (preset === "3m") return { startDate: getMonthStart(shiftMonths(todayIso, -2)), endDate: todayIso };
  if (preset === "6m") return { startDate: getMonthStart(shiftMonths(todayIso, -5)), endDate: todayIso };
  if (preset === "12m") return { startDate: getMonthStart(shiftMonths(todayIso, -11)), endDate: todayIso };
  return { startDate: getMonthStart(todayIso), endDate: todayIso };
}

function readFinanceFilters(searchParams: URLSearchParams, todayIso: string): FinanceFiltersState {
  const preset = parseFinancePreset(searchParams.get("fPreset"));
  const presetRange = getFinancePresetRange(preset, todayIso);
  const startDate = searchParams.get("fStartDate") || presetRange.startDate;
  const endDate = searchParams.get("fEndDate") || presetRange.endDate;
  const validRange = startDate <= endDate;
  const safeStart = validRange ? startDate : endDate;
  const safeEnd = validRange ? endDate : startDate;
  const autoGroupBy: GroupBy = dateDiffDays(safeStart, safeEnd) <= 62 ? "day" : "month";

  return {
    startDate: safeStart,
    endDate: safeEnd,
    preset,
    origin: parseFinanceOrigin(searchParams.get("fOrigin")),
    direction: parseFinanceDirection(searchParams.get("fDirection")),
    status: parseFinanceStatus(searchParams.get("fStatus")),
    categoryId: searchParams.get("fCategoryId") || "all",
    groupBy: parseGroupBy(searchParams.get("fGroupBy"), autoGroupBy),
    page: parsePositiveInt(searchParams.get("fPage"), 1),
  };
}

function readLoansFilters(searchParams: URLSearchParams, todayIso: string): LoansFiltersState {
  const preset = parseLoansPreset(searchParams.get("lPreset"));
  const presetRange = getLoansPresetRange(preset, todayIso);
  const startDate = searchParams.get("lStartDate") || presetRange.startDate;
  const endDate = searchParams.get("lEndDate") || presetRange.endDate;
  const validRange = startDate <= endDate;

  return {
    startDate: validRange ? startDate : endDate,
    endDate: validRange ? endDate : startDate,
    preset,
    loanStatus: parseLoanStatus(searchParams.get("lStatus")),
    groupBy: parseGroupBy(searchParams.get("lGroupBy"), "month"),
  };
}

function buildFinanceQuery(filters: FinanceFiltersState) {
  return serializeQuery({
    module: "finance",
    startDate: filters.startDate,
    endDate: filters.endDate,
    origin: filters.origin,
    direction: filters.direction,
    status: filters.status,
    categoryId: filters.categoryId || "all",
    groupBy: filters.groupBy,
    page: String(filters.page),
    pageSize: String(FINANCE_TABLE_PAGE_SIZE),
  });
}

function buildLoansQuery(filters: LoansFiltersState) {
  return serializeQuery({
    module: "loans",
    startDate: filters.startDate,
    endDate: filters.endDate,
    loanStatus: filters.loanStatus,
    groupBy: filters.groupBy,
  });
}

function SectionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "reports-print-card rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.07)] sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
  icon?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-slate-50/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-bold tracking-tight",
          tone === "positive" && "text-emerald-600",
          tone === "negative" && "text-rose-600",
          tone === "warning" && "text-amber-700",
          tone === "neutral" && "text-slate-800",
        )}
      >
        {value}
      </p>
    </article>
  );
}

function OverviewStatCard({
  label,
  value,
  tone = "neutral",
  icon,
  caption,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  icon?: ReactNode;
  caption?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_12px_22px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {icon ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-3 text-[1.85rem] font-black leading-none tracking-tight",
          tone === "positive" && "text-emerald-600",
          tone === "negative" && "text-rose-600",
          tone === "neutral" && "text-slate-900",
        )}
      >
        {value}
      </p>
      {caption ? <p className="mt-2 text-sm text-slate-500">{caption}</p> : null}
    </article>
  );
}

function VariationHighlightCard({
  label,
  value,
  description,
  tone = "positive",
}: {
  label: string;
  value: string;
  description: string;
  tone?: "positive" | "negative";
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border p-4 text-white shadow-[0_18px_30px_rgba(15,46,119,0.35)]",
        tone === "positive"
          ? "border-[#173fa4] bg-gradient-to-br from-[#09226c] via-[#0f2f92] to-[#1c49bb]"
          : "border-rose-400/40 bg-gradient-to-br from-rose-700 via-rose-600 to-rose-500",
      )}
    >
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-blue-100">{label}</p>
      <p className="mt-3 text-[2rem] font-black leading-none tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-blue-100/90">{description}</p>
    </article>
  );
}

function InsightTile({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-base font-bold tracking-tight",
          tone === "positive" && "text-emerald-600",
          tone === "negative" && "text-rose-600",
          tone === "warning" && "text-amber-700",
          tone === "neutral" && "text-slate-800",
        )}
      >
        {value}
      </p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </article>
  );
}

function CategoryCompositionCard({
  title,
  subtitle,
  tone,
  items,
}: {
  title: string;
  subtitle: string;
  tone: "income" | "expense";
  items: Array<{
    key: string;
    label: string;
    total: number;
    count: number;
    percentage: number;
  }>;
}) {
  const top = items[0] ?? null;
  const topShare = Math.max(0, Math.min(100, safeNumber(top?.percentage ?? 0)));
  const ringColor = tone === "income" ? "#1d4ed8" : "#e11d48";
  const ringBackground = tone === "income" ? "#dbeafe" : "#ffe4e6";
  const metricColor = tone === "income" ? "text-blue-700" : "text-rose-700";
  const displayShare = `${topShare.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

  return (
    <SectionCard className="h-full">
      <div className="mb-4">
        <h3 className="text-lg font-bold tracking-tight text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <EmptyBlock message="Sem categorias no periodo selecionado." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-[180px,1fr]">
          <div className="flex items-center justify-center">
            <div
              className="relative h-36 w-36 rounded-full"
              style={{
                background: `conic-gradient(${ringColor} ${topShare}%, ${ringBackground} ${topShare}% 100%)`,
              }}
            >
              <div className="absolute inset-[14px] rounded-full bg-white" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-black tracking-tight text-slate-900">{displayShare}</p>
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.13em] text-slate-500">
                  {top?.label ?? "Top categoria"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {items.slice(0, 4).map((item) => (
              <div key={item.key} className="rounded-xl border border-slate-200/90 bg-slate-50/90 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-700">{item.label}</p>
                  <p className={cn("text-sm font-bold", metricColor)}>{formatCurrency(item.total)}</p>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                  <span>{safeNumber(item.percentage).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total</span>
                  <span>{item.count} lanc.</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

function ToneBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "positive" | "negative" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        tone === "positive" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "negative" && "border-rose-200 bg-rose-50 text-rose-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "neutral" && "border-slate-200 bg-slate-100 text-slate-600",
      )}
    >
      {label}
    </span>
  );
}

function buildLinePoints(values: number[], width: number, height: number, minValue: number, maxValue: number) {
  const denominator = Math.max(maxValue - minValue, 1);
  const xStep = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = Math.round(index * xStep * 100) / 100;
      const y = Math.round((height - ((value - minValue) / denominator) * height) * 100) / 100;
      return `${x},${y}`;
    })
    .join(" ");
}

function CompactSeriesChart({
  labels,
  incomeValues,
  expenseValues,
  netValues,
}: {
  labels: string[];
  incomeValues: number[];
  expenseValues: number[];
  netValues: number[];
}) {
  const width = 960;
  const height = 270;
  const allValues = [...incomeValues, ...expenseValues, ...netValues];
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(1, ...allValues);
  const incomePolyline = buildLinePoints(incomeValues, width, height, minValue, maxValue);
  const expensePolyline = buildLinePoints(expenseValues, width, height, minValue, maxValue);
  const netPolyline = buildLinePoints(netValues, width, height, minValue, maxValue);
  const indexMarks = labels.length <= 6
    ? labels.map((_value, index) => index)
    : [0, Math.floor(labels.length * 0.25), Math.floor(labels.length * 0.5), Math.floor(labels.length * 0.75), labels.length - 1];
  const uniqueIndexMarks = [...new Set(indexMarks)].filter((value) => value >= 0 && value < labels.length);
  const xStep = labels.length > 1 ? width / (labels.length - 1) : width;

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Entradas</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" />Saidas</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />Saldo liquido</span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 sm:px-4">
        <svg className="h-[220px] w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={height * ratio}
              x2={width}
              y2={height * ratio}
              stroke="#dbe4f5"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
          ))}
          <polyline fill="none" points={incomePolyline} stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline fill="none" points={expensePolyline} stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline fill="none" points={netPolyline} stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
        {uniqueIndexMarks.map((index) => (
          <span key={`${labels[index]}-${index}`} className="truncate">
            {labels[index]}
          </span>
        ))}
      </div>
    </div>
  );
}

function BreakdownList({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Array<{ key: string; label: string; income: number; expense: number; net: number; count: number }>;
}) {
  const totalVolume = items.reduce((sum, item) => sum + Math.abs(item.income) + Math.abs(item.expense), 0);
  return (
    <SectionCard className="h-full">
      <div className="mb-4">
        <h3 className="text-lg font-bold tracking-tight text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <EmptyBlock message="Sem dados no periodo selecionado." />
      ) : (
        <div className="space-y-3">
          {items.slice(0, 8).map((item) => {
            const volume = Math.abs(item.income) + Math.abs(item.expense);
            const share = totalVolume > 0 ? Math.max((volume / totalVolume) * 100, 2) : 0;
            return (
              <div key={item.key} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-700">{item.label}</p>
                  <p className="text-xs font-semibold text-slate-500">{item.count} mov.</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${Math.min(share, 100)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span className="text-blue-600">+ {formatCurrency(item.income)}</span>
                  <span className="text-rose-600">- {formatCurrency(item.expense)}</span>
                  <span className={item.net >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatCurrency(item.net)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function PresetButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-[#4F7EF7]/50 bg-[#4F7EF7] text-white shadow-[0_10px_18px_rgba(79,126,247,0.35)]"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function RelatoriosPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const paramsSnapshot = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const activeTab = parseTab(paramsSnapshot.get("tab"));
  const financeFilters = useMemo(() => readFinanceFilters(paramsSnapshot, todayIso), [paramsSnapshot, todayIso]);
  const loansFilters = useMemo(() => readLoansFilters(paramsSnapshot, todayIso), [paramsSnapshot, todayIso]);
  const financeQuery = useMemo(() => buildFinanceQuery(financeFilters), [financeFilters]);
  const loansQuery = useMemo(() => buildLoansQuery(loansFilters), [loansFilters]);

  const [financeState, setFinanceState] = useState<AsyncState<FinanceReportResponse>>({
    loading: true,
    error: "",
    data: null,
  });
  const [financePreviousSummary, setFinancePreviousSummary] = useState<FinanceReportResponse["summary"] | null>(null);
  const [financeSearch, setFinanceSearch] = useState("");
  const [financeMobileFiltersOpen, setFinanceMobileFiltersOpen] = useState(false);
  const [loansSearch, setLoansSearch] = useState("");
  const [loansMobileFiltersOpen, setLoansMobileFiltersOpen] = useState(false);
  const [loansTablePage, setLoansTablePage] = useState(1);
  const [loansInstallmentStatusFilter, setLoansInstallmentStatusFilter] = useState<"all" | "overdue" | "open" | "paid">("all");
  const [loansDelayRange, setLoansDelayRange] = useState<"all" | "1_30" | "31_60" | "60_plus">("all");
  const [loansState, setLoansState] = useState<AsyncState<LoansReportResponse>>({
    loading: false,
    error: "",
    data: null,
  });

  function updateSearch(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    const query = next.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function switchTab(tab: ReportTab) {
    updateSearch({ tab });
  }

  function applyFinancePreset(preset: FinanceFiltersState["preset"]) {
    const range = getFinancePresetRange(preset, todayIso);
    const nextGroupBy: GroupBy = dateDiffDays(range.startDate, range.endDate) <= 62 ? "day" : "month";
    updateSearch({
      fPreset: preset,
      fStartDate: range.startDate,
      fEndDate: range.endDate,
      fGroupBy: nextGroupBy,
      fPage: "1",
    });
  }

  function applyLoansPreset(preset: LoansFiltersState["preset"]) {
    const range = getLoansPresetRange(preset, todayIso);
    updateSearch({
      lPreset: preset,
      lStartDate: range.startDate,
      lEndDate: range.endDate,
    });
  }

  function updateFinanceField(field: keyof FinanceFiltersState, value: string) {
    if (field === "startDate" || field === "endDate") {
      const nextStart = field === "startDate" ? value : financeFilters.startDate;
      const nextEnd = field === "endDate" ? value : financeFilters.endDate;
      const nextGroupBy: GroupBy = dateDiffDays(nextStart, nextEnd) <= 62 ? "day" : "month";
      updateSearch({
        fPreset: "custom",
        fStartDate: nextStart,
        fEndDate: nextEnd,
        fGroupBy: nextGroupBy,
        fPage: "1",
      });
      return;
    }

    if (field === "page") {
      updateSearch({ fPage: value });
      return;
    }

    if (field === "preset") {
      applyFinancePreset(value as FinanceFiltersState["preset"]);
      return;
    }

    const map: Partial<Record<keyof FinanceFiltersState, string>> = {
      origin: "fOrigin",
      direction: "fDirection",
      status: "fStatus",
      categoryId: "fCategoryId",
      groupBy: "fGroupBy",
    };
    const key = map[field];
    if (!key) return;
    updateSearch({ [key]: value, fPage: "1" });
  }

  function updateLoansField(field: keyof LoansFiltersState, value: string) {
    if (field === "startDate" || field === "endDate") {
      const nextStart = field === "startDate" ? value : loansFilters.startDate;
      const nextEnd = field === "endDate" ? value : loansFilters.endDate;
      updateSearch({
        lPreset: "custom",
        lStartDate: nextStart,
        lEndDate: nextEnd,
      });
      return;
    }

    if (field === "preset") {
      applyLoansPreset(value as LoansFiltersState["preset"]);
      return;
    }

    if (field === "loanStatus") {
      updateSearch({ lStatus: value });
      return;
    }

    if (field === "groupBy") {
      updateSearch({ lGroupBy: value });
    }
  }

  async function fetchFinance() {
    setFinanceState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const { previousStartDate, previousEndDate } = getPreviousPeriodRange(financeFilters.startDate, financeFilters.endDate);
      const previousQuery = serializeQuery({
        module: "finance",
        startDate: previousStartDate,
        endDate: previousEndDate,
        origin: financeFilters.origin,
        direction: financeFilters.direction,
        status: financeFilters.status,
        categoryId: financeFilters.categoryId || "all",
        groupBy: financeFilters.groupBy,
        page: "1",
        pageSize: String(FINANCE_TABLE_PAGE_SIZE),
      });

      const [response, previousResponse] = await Promise.all([
        fetch(`/api/reports/finance?${financeQuery}`),
        fetch(`/api/reports/finance?${previousQuery}`),
      ]);

      const payload = await readJsonOrThrow<FinanceReportResponse>(response, "Falha ao carregar relatorio financeiro.");
      const previousPayload = await readJsonOrThrow<FinanceReportResponse>(previousResponse, "Falha ao carregar comparativo financeiro.");
      setFinanceState({ loading: false, error: "", data: payload });
      setFinancePreviousSummary(previousPayload?.summary ?? null);
    } catch (error) {
      setFinanceState({
        loading: false,
        error: error instanceof Error ? error.message : "Falha ao carregar relatorio financeiro.",
        data: null,
      });
      setFinancePreviousSummary(null);
    }
  }

  async function fetchLoans() {
    setLoansState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/reports/loans?${loansQuery}`);
      const payload = await readJsonOrThrow<LoansReportResponse>(response, "Falha ao carregar relatorio de emprestimos.");
      setLoansState({ loading: false, error: "", data: payload });
    } catch (error) {
      setLoansState({
        loading: false,
        error: error instanceof Error ? error.message : "Falha ao carregar relatorio de emprestimos.",
        data: null,
      });
    }
  }

  useEffect(() => {
    if (activeTab === "finance") {
      void fetchFinance();
    }
  }, [activeTab, financeQuery]);

  useEffect(() => {
    if (activeTab === "loans") {
      void fetchLoans();
    }
  }, [activeTab, loansQuery]);

  useEffect(() => {
    setLoansTablePage(1);
  }, [loansSearch, loansInstallmentStatusFilter, loansDelayRange, loansState.data?.exportRows.length, loansFilters.startDate, loansFilters.endDate, loansFilters.loanStatus]);

  useEffect(() => {
    const cleanup = () => document.body.classList.remove("reports-print-page");
    window.addEventListener("afterprint", cleanup);
    return () => {
      window.removeEventListener("afterprint", cleanup);
      cleanup();
    };
  }, []);

  function handlePrint() {
    if (typeof window === "undefined") return;
    document.body.classList.add("reports-print-page");
    window.print();
  }

  function handleExportCsv() {
    const endpoint = activeTab === "finance" ? "/api/reports/finance/export.csv" : "/api/reports/loans/export.csv";
    const query = activeTab === "finance" ? financeQuery : loansQuery;
    triggerCsvDownload(`${endpoint}?${query}`);
  }

  function renderFinanceContent() {
    const data = financeState.data;
    const summary = data?.summary;
    const rawRows = data?.rows ?? [];
    const pagination = data?.pagination;
    const rows = rawRows.filter((row) => {
      const needle = financeSearch.trim().toLowerCase();
      if (!needle) return true;
      return (
        row.description.toLowerCase().includes(needle)
        || row.categoryName.toLowerCase().includes(needle)
        || row.id.toLowerCase().includes(needle)
      );
    });
    const financePageStart = pagination && pagination.totalItems > 0
      ? ((pagination.page - 1) * pagination.pageSize) + 1
      : 0;
    const financePageEnd = pagination
      ? Math.min(((pagination.page - 1) * pagination.pageSize) + rows.length, pagination.totalItems)
      : 0;
    const financePaginationWindow = pagination
      ? getPaginationWindow(pagination.page, pagination.totalPages)
      : [];
    const netCurrent = (summary?.cashIn ?? 0) - (summary?.cashOut ?? 0);
    const netPrevious = (financePreviousSummary?.cashIn ?? 0) - (financePreviousSummary?.cashOut ?? 0);
    const variationVsPrevious = getDeltaPercent(netCurrent, netPrevious);
    const insights = data?.analysis;
    const variationDescription = variationVsPrevious >= 0
      ? "Crescimento no fluxo operacional."
      : "Reducao no fluxo operacional.";

    return (
      <div className="space-y-5">
        <SectionCard className="reports-screen-only border-slate-200/90 bg-gradient-to-br from-white to-[#f4f7ff]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-800">Filtro do relatorio financeiro</h2>
                <p className="text-sm text-slate-500">Analise por periodo, fluxo e categorias do modulo financeiro.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 sm:flex">
                  <button
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    type="button"
                  >
                    <Filter className="h-4 w-4" />
                    Filtros avancados
                  </button>
                </div>
                <div className="flex items-center gap-2 sm:hidden">
                  <button
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700"
                    onClick={() => setFinanceMobileFiltersOpen((current) => !current)}
                    type="button"
                  >
                    {financeMobileFiltersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {financeMobileFiltersOpen ? "Recolher" : "Expandir"}
                  </button>
                  <button
                    className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                    onClick={() => void fetchFinance()}
                    type="button"
                  >
                    <RefreshCw className={cn("h-4 w-4", financeState.loading && "animate-spin")} />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 sm:hidden">
              Periodo {formatDate(financeFilters.startDate)} a {formatDate(financeFilters.endDate)}.
            </p>

            <div className={cn("space-y-4", !financeMobileFiltersOpen && "hidden sm:block")}>
              <div className="flex flex-wrap items-center gap-2">
              <PresetButton active={financeFilters.preset === "today"} label="Hoje" onClick={() => updateFinanceField("preset", "today")} />
              <PresetButton active={financeFilters.preset === "7d"} label="7 dias" onClick={() => updateFinanceField("preset", "7d")} />
              <PresetButton active={financeFilters.preset === "month"} label="Mes atual" onClick={() => updateFinanceField("preset", "month")} />
              <PresetButton active={financeFilters.preset === "3m"} label="3 meses" onClick={() => updateFinanceField("preset", "3m")} />
              <PresetButton active={financeFilters.preset === "custom"} label="Personalizado" onClick={() => updateFinanceField("preset", "custom")} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Inicio</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateFinanceField("startDate", event.target.value)}
                  type="date"
                  value={financeFilters.startDate}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fim</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateFinanceField("endDate", event.target.value)}
                  type="date"
                  value={financeFilters.endDate}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Origem</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateFinanceField("origin", event.target.value)}
                  value={financeFilters.origin}
                >
                  <option value="all">Financeiro (todas)</option>
                  <option value="manual">Manual</option>
                  <option value="cash_adjustment">Ajuste de caixa</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Direcao</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateFinanceField("direction", event.target.value)}
                  value={financeFilters.direction}
                >
                  <option value="all">Todas</option>
                  <option value="income">Entradas</option>
                  <option value="expense">Saidas</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateFinanceField("status", event.target.value)}
                  value={financeFilters.status}
                >
                  <option value="all">Todos</option>
                  <option value="completed">Realizados</option>
                  <option value="open">Em aberto</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Categoria</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateFinanceField("categoryId", event.target.value)}
                  value={financeFilters.categoryId}
                >
                  <option value="all">Todas</option>
                  {(data?.availableCategories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.emoji ? `${category.emoji} ` : ""}
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Agrupar por</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateFinanceField("groupBy", event.target.value)}
                  value={financeFilters.groupBy}
                >
                  <option value="day">Dia</option>
                  <option value="week">Semana</option>
                  <option value="month">Mes</option>
                </select>
              </label>
            </div>
            </div>
          </div>
        </SectionCard>

        {financeState.error ? (
          <SectionCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-rose-600">{financeState.error}</p>
              <button
                className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void fetchFinance()}
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          </SectionCard>
        ) : null}

        {financeState.loading && !data ? (
          <SectionCard>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#4F7EF7]" />
              Carregando dados financeiros...
            </div>
          </SectionCard>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewStatCard
                caption="Volume consolidado de entradas."
                icon={<TrendingUp className="h-4 w-4" />}
                label="Total de entradas"
                tone="positive"
                value={formatCurrency(summary?.cashIn ?? 0)}
              />
              <OverviewStatCard
                caption="Volume consolidado de saidas."
                icon={<TrendingDown className="h-4 w-4" />}
                label="Total de saidas"
                tone="negative"
                value={formatCurrency(summary?.cashOut ?? 0)}
              />
              <OverviewStatCard
                caption={`Saldo inicial ${formatCurrency(summary?.openingBalance ?? 0)}`}
                icon={<Landmark className="h-4 w-4" />}
                label="Saldo liquido"
                tone={netCurrent >= 0 ? "positive" : "negative"}
                value={formatCurrency(netCurrent)}
              />
              <VariationHighlightCard
                description={variationDescription}
                label="Variacao vs periodo anterior"
                tone={variationVsPrevious >= 0 ? "positive" : "negative"}
                value={formatPercent(variationVsPrevious)}
              />
            </div>

              <SectionCard>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black tracking-tight text-slate-800">Evolucao financeira</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Comparativo entre entradas, saidas e saldo liquido.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge label={`Saldo final ${formatCurrency(summary?.closingBalance ?? 0)}`} tone={(summary?.closingBalance ?? 0) >= 0 ? "positive" : "negative"} />
                    <ToneBadge label={`A receber ${formatCurrency(summary?.openToReceive ?? 0)}`} tone="positive" />
                    <ToneBadge label={`A pagar ${formatCurrency(summary?.openToPay ?? 0)}`} tone="negative" />
                    <ToneBadge label={`Projetado ${formatCurrency(summary?.projectedBalance ?? 0)}`} tone={(summary?.projectedBalance ?? 0) >= 0 ? "positive" : "negative"} />
                  </div>
                </div>

                {data.series.length === 0 ? (
                  <EmptyBlock message="Nao existem movimentos no periodo selecionado." />
                ) : (
                  <CompactSeriesChart
                    expenseValues={data.series.map((point) => point.expense)}
                    incomeValues={data.series.map((point) => point.income)}
                    labels={data.series.map((point) => point.label)}
                    netValues={data.series.map((point) => point.net)}
                  />
                )}
              </SectionCard>

            <div className="grid gap-5 xl:grid-cols-2">
              <CategoryCompositionCard
                items={insights?.incomeByCategory ?? []}
                subtitle="Participacao de receitas por categoria."
                title="Receitas por categoria"
                tone="income"
              />
              <CategoryCompositionCard
                items={insights?.expenseByCategory ?? []}
                subtitle="Participacao de despesas por categoria."
                title="Despesas por categoria"
                tone="expense"
              />
            </div>

            <SectionCard>
              <div className="mb-4">
                <h3 className="text-lg font-bold tracking-tight text-slate-800">Insights executivos</h3>
                <p className="mt-1 text-sm text-slate-500">Leitura rapida do periodo e comparacao com janela anterior.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <InsightTile
                  helper={insights?.biggestIncome?.description || ""}
                  label="Maior receita"
                  tone="positive"
                  value={insights?.biggestIncome ? formatCurrency(insights.biggestIncome.amount) : "--"}
                />
                <InsightTile
                  helper={insights?.biggestExpense?.description || ""}
                  label="Maior despesa"
                  tone="negative"
                  value={insights?.biggestExpense ? formatCurrency(insights.biggestExpense.amount) : "--"}
                />
                <InsightTile
                  helper={`${safeNumber(insights?.topIncomeCategory?.percentage ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`}
                  label="Top entrada"
                  tone="positive"
                  value={insights?.topIncomeCategory?.label ?? "--"}
                />
                <InsightTile
                  helper={`${safeNumber(insights?.topExpenseCategory?.percentage ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`}
                  label="Top gasto"
                  tone="negative"
                  value={insights?.topExpenseCategory?.label ?? "--"}
                />
                <InsightTile
                  helper={`${rawRows.length.toLocaleString("pt-BR")} lancamentos analisados`}
                  label="Media por lanc."
                  value={formatCurrency(insights?.averageAmount ?? 0)}
                />
                <InsightTile
                  helper="Comparativo com periodo imediatamente anterior."
                  label="Periodo anterior"
                  tone={variationVsPrevious >= 0 ? "positive" : "negative"}
                  value={formatPercent(variationVsPrevious)}
                />
              </div>
            </SectionCard>

            <SectionCard>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-800">Detalhamento de lancamentos</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Lista operacional filtrada por data, origem, status e categoria.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-slate-500">
                    {pagination?.totalItems ?? 0} registros
                  </div>
                  <input
                    className="min-h-[38px] w-full min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                    onChange={(event) => setFinanceSearch(event.target.value)}
                    placeholder="Buscar lancamento..."
                    type="search"
                    value={financeSearch}
                  />
                </div>
              </div>

              {rows.length === 0 ? (
                <EmptyBlock message="Nenhum movimento encontrado para os filtros atuais." />
              ) : (
                <div className="space-y-3">
                  <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/90 md:block">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50/80 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Data</th>
                          <th className="px-3 py-3">Descricao</th>
                          <th className="px-3 py-3">Categoria</th>
                          <th className="px-3 py-3">Tipo</th>
                          <th className="px-3 py-3 text-right">Valor</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Conta</th>
                          <th className="px-3 py-3">Origem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {rows.map((row) => (
                          <tr key={row.id} className="align-top">
                            <td className="px-3 py-3 font-semibold text-slate-700">{formatDateShort(row.date)}</td>
                            <td className="px-3 py-3">
                              <p className="max-w-[360px] text-sm font-semibold text-slate-700">{row.description}</p>
                              {row.linkedLoanId ? (
                                <p className="mt-1 text-xs text-slate-500">ID vinculado #{row.linkedLoanId}</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-slate-600">{row.categoryName}</td>
                            <td className="px-3 py-3">
                              <ToneBadge label={row.direction === "income" ? "Entrada" : "Saida"} tone={row.direction === "income" ? "positive" : "negative"} />
                            </td>
                            <td
                              className={cn(
                                "px-3 py-3 text-right font-bold",
                                row.direction === "income" ? "text-emerald-600" : "text-rose-600",
                              )}
                            >
                              {row.direction === "income" ? "+" : "-"} {formatCurrency(row.amount)}
                            </td>
                            <td className="px-3 py-3">
                              <ToneBadge
                                label={STATUS_LABEL[row.status]}
                                tone={row.status === "completed" ? "positive" : row.status === "scheduled" ? "warning" : "neutral"}
                              />
                            </td>
                            <td className="px-3 py-3 text-slate-600">--</td>
                            <td className="px-3 py-3">
                              <ToneBadge
                                label={ORIGIN_LABEL[row.origin]}
                                tone={row.origin === "loan_disbursement" ? "warning" : row.origin === "installment_payment" ? "positive" : "neutral"}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {rows.map((row) => (
                      <div key={`${row.id}-mobile`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_18px_rgba(15,23,42,0.05)]">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-700">{row.description}</p>
                          <span className={cn("text-sm font-bold", row.direction === "income" ? "text-emerald-600" : "text-rose-600")}>
                            {row.direction === "income" ? "+" : "-"} {formatCurrency(row.amount)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <ToneBadge label={STATUS_LABEL[row.status]} tone={row.status === "completed" ? "positive" : row.status === "scheduled" ? "warning" : "neutral"} />
                          <ToneBadge label={ORIGIN_LABEL[row.origin]} tone={row.origin === "loan_disbursement" ? "warning" : row.origin === "installment_payment" ? "positive" : "neutral"} />
                          <ToneBadge label={row.direction === "income" ? "Entrada" : "Saida"} tone={row.direction === "income" ? "positive" : "negative"} />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatDate(row.date)} | {row.categoryName} | Conta -- 
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pagination ? (
                <div className="reports-screen-only mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-slate-500">
                    Exibindo {financePageStart}-{financePageEnd} de {pagination.totalItems.toLocaleString("pt-BR")} lancamentos
                  </p>

                  {pagination.totalPages > 1 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                        disabled={pagination.page <= 1}
                        onClick={() => updateFinanceField("page", String(pagination.page - 1))}
                        type="button"
                      >
                        Anterior
                      </button>

                      {financePaginationWindow.map((page) => (
                        <button
                          key={`finance-page-${page}`}
                          className={cn(
                            "inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-lg border text-xs font-semibold transition",
                            page === pagination.page
                              ? "border-[#214fae] bg-[#10318c] text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                          )}
                          onClick={() => updateFinanceField("page", String(page))}
                          type="button"
                        >
                          {page}
                        </button>
                      ))}

                      <button
                        className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => updateFinanceField("page", String(pagination.page + 1))}
                        type="button"
                      >
                        Proxima
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          </>
        ) : null}
      </div>
    );
  }

  function renderLoansContent() {
    const data = loansState.data;
    const summary = data?.summary;
    const exportRows = data?.exportRows ?? [];
    const searchedRows = exportRows.filter((row) => {
      const needle = loansSearch.trim().toLowerCase();
      const matchesSearch = !needle || (
        row.clientName.toLowerCase().includes(needle)
        || row.loanId.toLowerCase().includes(needle)
      );
      if (!matchesSearch) return false;

      const dueDate = new Date(`${row.dueDate}T00:00:00Z`);
      const today = new Date();
      const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      const isOverdue = row.overdue > 0 || (row.open > 0 && diffDays > 0);
      const isPaid = row.open <= 0;
      const isOpen = row.open > 0 && !isOverdue;

      if (loansInstallmentStatusFilter === "overdue" && !isOverdue) return false;
      if (loansInstallmentStatusFilter === "open" && !isOpen) return false;
      if (loansInstallmentStatusFilter === "paid" && !isPaid) return false;

      if (loansDelayRange !== "all") {
        if (!isOverdue) return false;
        if (loansDelayRange === "1_30" && (diffDays < 1 || diffDays > 30)) return false;
        if (loansDelayRange === "31_60" && (diffDays < 31 || diffDays > 60)) return false;
        if (loansDelayRange === "60_plus" && diffDays < 61) return false;
      }

      return true;
    });
    const loansTableTotalPages = Math.max(1, Math.ceil(searchedRows.length / LOANS_TABLE_PAGE_SIZE));
    const safeLoansTablePage = Math.min(loansTablePage, loansTableTotalPages);
    const loansRowsPage = searchedRows.slice((safeLoansTablePage - 1) * LOANS_TABLE_PAGE_SIZE, safeLoansTablePage * LOANS_TABLE_PAGE_SIZE);
    const loansPageStart = searchedRows.length === 0 ? 0 : ((safeLoansTablePage - 1) * LOANS_TABLE_PAGE_SIZE) + 1;
    const loansPageEnd = Math.min(safeLoansTablePage * LOANS_TABLE_PAGE_SIZE, searchedRows.length);
    const paginationWindow = getPaginationWindow(safeLoansTablePage, loansTableTotalPages);
    const topOpenClient = [...exportRows]
      .sort((left, right) => right.open - left.open)[0] ?? null;
    const biggestContract = [...exportRows]
      .sort((left, right) => right.total - left.total)[0] ?? null;
    const topReceived = [...exportRows]
      .sort((left, right) => right.received - left.received)[0] ?? null;
    const recoveryRate = ((summary?.receivedInPeriod ?? 0) / Math.max(summary?.loanedInPeriod ?? 0, 1)) * 100;

    return (
      <div className="space-y-5">
        <SectionCard className="reports-screen-only border-slate-200/90 bg-gradient-to-br from-white to-[#f4f7ff]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-800">Filtro do relatorio de emprestimos</h2>
                <p className="text-sm text-slate-500">Recorte por periodo, status de contratos e risco da carteira.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 sm:flex">
                  <button
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    type="button"
                  >
                    <Filter className="h-4 w-4" />
                    Filtros avancados
                  </button>
                </div>
                <div className="flex items-center gap-2 sm:hidden">
                  <button
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700"
                    onClick={() => setLoansMobileFiltersOpen((current) => !current)}
                    type="button"
                  >
                    {loansMobileFiltersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {loansMobileFiltersOpen ? "Recolher" : "Expandir"}
                  </button>
                  <button
                    className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                    onClick={() => void fetchLoans()}
                    type="button"
                  >
                    <RefreshCw className={cn("h-4 w-4", loansState.loading && "animate-spin")} />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 sm:hidden">
              Periodo {formatDate(loansFilters.startDate)} a {formatDate(loansFilters.endDate)}.
            </p>

            <div className={cn("space-y-4", !loansMobileFiltersOpen && "hidden sm:block")}>
              <div className="flex flex-wrap items-center gap-2">
              <PresetButton active={loansFilters.preset === "month"} label="Mes atual" onClick={() => updateLoansField("preset", "month")} />
              <PresetButton active={loansFilters.preset === "3m"} label="3m" onClick={() => updateLoansField("preset", "3m")} />
              <PresetButton active={loansFilters.preset === "6m"} label="6m" onClick={() => updateLoansField("preset", "6m")} />
              <PresetButton active={loansFilters.preset === "12m"} label="12m" onClick={() => updateLoansField("preset", "12m")} />
              <PresetButton active={loansFilters.preset === "custom"} label="Personalizado" onClick={() => updateLoansField("preset", "custom")} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Inicio</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateLoansField("startDate", event.target.value)}
                  type="date"
                  value={loansFilters.startDate}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fim</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateLoansField("endDate", event.target.value)}
                  type="date"
                  value={loansFilters.endDate}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status do contrato</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateLoansField("loanStatus", event.target.value)}
                  value={loansFilters.loanStatus}
                >
                  <option value="all">Todos</option>
                  <option value="PENDENTE">Pendentes</option>
                  <option value="EM_DIA">Em dia</option>
                  <option value="ATRASADO">Atrasados</option>
                  <option value="QUITADO">Quitados</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Agrupar por</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => updateLoansField("groupBy", event.target.value)}
                  value={loansFilters.groupBy}
                >
                  <option value="day">Dia</option>
                  <option value="week">Semana</option>
                  <option value="month">Mes</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status das parcelas</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => setLoansInstallmentStatusFilter(event.target.value as "all" | "overdue" | "open" | "paid")}
                  value={loansInstallmentStatusFilter}
                >
                  <option value="all">Todos</option>
                  <option value="overdue">Atrasadas</option>
                  <option value="open">Em aberto</option>
                  <option value="paid">Quitadas</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Faixa de atraso</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20"
                  onChange={(event) => setLoansDelayRange(event.target.value as "all" | "1_30" | "31_60" | "60_plus")}
                  value={loansDelayRange}
                >
                  <option value="all">Todas</option>
                  <option value="1_30">1-30 dias</option>
                  <option value="31_60">31-60 dias</option>
                  <option value="60_plus">60+ dias</option>
                </select>
              </label>
            </div>
            </div>
          </div>
        </SectionCard>

        {loansState.error ? (
          <SectionCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-rose-600">{loansState.error}</p>
              <button
                className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void fetchLoans()}
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          </SectionCard>
        ) : null}

        {loansState.loading && !data ? (
          <SectionCard>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#4F7EF7]" />
              Carregando dados de emprestimos...
            </div>
          </SectionCard>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewStatCard
                caption="Total principal concedido no recorte."
                icon={<Landmark className="h-4 w-4" />}
                label="Emprestado no periodo"
                value={formatCurrency(summary?.loanedInPeriod ?? 0)}
              />
              <OverviewStatCard
                caption="Recebimentos consolidados de parcelas."
                icon={<TrendingUp className="h-4 w-4" />}
                label="Recebido no periodo"
                tone="positive"
                value={formatCurrency(summary?.receivedInPeriod ?? 0)}
              />
              <OverviewStatCard
                caption={`Parcelas vencidas ${safeNumber(summary?.overdueInstallmentsAtEnd ?? 0).toLocaleString("pt-BR")}`}
                icon={<TrendingDown className="h-4 w-4" />}
                label="Carteira aberta"
                tone={(summary?.openPortfolioAtEnd ?? 0) > 0 ? "negative" : "neutral"}
                value={formatCurrency(summary?.openPortfolioAtEnd ?? 0)}
              />
              <VariationHighlightCard
                description={`Inadimplencia atual ${formatPercent(summary?.delinquencyRateAtEnd ?? 0)}`}
                label="ROI acumulado"
                tone={(summary?.roiAccumulatedToEnd ?? 0) >= 0 ? "positive" : "negative"}
                value={formatPercent(summary?.roiAccumulatedToEnd ?? 0)}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.75fr,1fr]">
              <SectionCard>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black tracking-tight text-slate-800">Desempenho da carteira</h3>
                    <p className="mt-1 text-sm text-slate-500">Evolucao de emprestado, recebido e lucro no periodo.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge label={`Lucro ${formatCurrency(summary?.profitInPeriod ?? 0)}`} tone={(summary?.profitInPeriod ?? 0) >= 0 ? "positive" : "negative"} />
                    <ToneBadge label={`Recuperacao ${formatPercent(recoveryRate)}`} tone={recoveryRate >= 100 ? "positive" : "warning"} />
                  </div>
                </div>

                {data.series.length === 0 ? (
                  <EmptyBlock message="Nao existem contratos no periodo selecionado." />
                ) : (
                  <CompactSeriesChart
                    expenseValues={data.series.map((point) => point.received)}
                    incomeValues={data.series.map((point) => point.loaned)}
                    labels={data.series.map((point) => point.label)}
                    netValues={data.series.map((point) => point.profit)}
                  />
                )}
              </SectionCard>

              <SectionCard className="h-full">
                <div className="mb-4">
                  <h3 className="text-lg font-bold tracking-tight text-slate-800">Carteira na data final</h3>
                  <p className="mt-1 text-sm text-slate-500">Posicao consolidada de contratos e risco.</p>
                </div>
                <div className="space-y-3">
                  <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Carteira aberta" tone="negative" value={formatCurrency(summary?.openPortfolioAtEnd ?? 0)} />
                  <MetricCard icon={<TrendingDown className="h-4 w-4" />} label="Exposicao em atraso" tone="negative" value={formatCurrency(summary?.overduePortfolioAtEnd ?? 0)} />
                  <MetricCard
                    icon={<Filter className="h-4 w-4" />}
                    label="Inadimplencia"
                    tone={(summary?.delinquencyRateAtEnd ?? 0) > 20 ? "negative" : "warning"}
                    value={formatPercent(summary?.delinquencyRateAtEnd ?? 0)}
                  />
                  <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="Contratos no recorte" value={safeNumber(summary?.totalContracts ?? 0).toLocaleString("pt-BR")} />
                </div>
              </SectionCard>
            </div>

            <SectionCard>
              <div className="mb-4">
                <h3 className="text-lg font-bold tracking-tight text-slate-800">Composicao da carteira na data final</h3>
                <p className="mt-1 text-sm text-slate-500">Distribuicao por status e medias executivas da carteira.</p>
              </div>

              {data.portfolioStatus.items.length === 0 ? (
                <EmptyBlock message="Sem contratos para compor carteira no periodo." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
                  <div className="space-y-3">
                    {data.portfolioStatus.items.map((item) => {
                      const totalAmount = data.portfolioStatus.items.reduce((sum, current) => sum + current.amount, 0);
                      const share = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;
                      const tone = item.status === "ATRASADO"
                        ? "negative"
                        : item.status === "EM_DIA"
                          ? "positive"
                          : item.status === "QUITADO"
                            ? "neutral"
                            : "warning";

                      return (
                        <div key={item.status} className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <ToneBadge label={item.label} tone={tone} />
                            <span className="text-xs font-semibold text-slate-500">{item.count} contratos</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${Math.max(2, Math.min(100, share))}%` }} />
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-700">{formatCurrency(item.amount)}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <MetricCard icon={<Landmark className="h-4 w-4" />} label="Total de contratos" value={String(data.portfolioStatus.totalContracts)} />
                    <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Ticket medio" value={formatCurrency(data.portfolioStatus.avgTicket)} />
                    <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="Prazo medio (dias)" value={safeNumber(data.portfolioStatus.avgTermDays).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} />
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard>
              <div className="mb-4">
                <h3 className="text-lg font-bold tracking-tight text-slate-800">Insights rapidos de emprestimos</h3>
                <p className="mt-1 text-sm text-slate-500">Destaques de contratos, recuperacao e exposicao.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <InsightTile
                  helper={topOpenClient ? `Aberto ${formatCurrency(topOpenClient.open)}` : ""}
                  label="Cliente com maior aberto"
                  tone="negative"
                  value={topOpenClient ? topOpenClient.clientName : "--"}
                />
                <InsightTile
                  helper={biggestContract ? `Cliente ${biggestContract.clientName}` : ""}
                  label="Maior contrato"
                  tone="warning"
                  value={biggestContract ? formatCurrency(biggestContract.total) : "--"}
                />
                <InsightTile
                  helper={topReceived ? `Cliente ${topReceived.clientName}` : ""}
                  label="Maior valor recebido"
                  tone="positive"
                  value={topReceived ? formatCurrency(topReceived.received) : "--"}
                />
                <InsightTile
                  helper={`${safeNumber(summary?.totalContracts ?? 0).toLocaleString("pt-BR")} contratos`}
                  label="Ticket medio"
                  value={formatCurrency(data.portfolioStatus.avgTicket)}
                />
                <InsightTile
                  label="Taxa de inadimplencia"
                  tone={(summary?.delinquencyRateAtEnd ?? 0) > 20 ? "negative" : "warning"}
                  value={formatPercent(summary?.delinquencyRateAtEnd ?? 0)}
                />
                <InsightTile
                  helper={`${safeNumber(summary?.overdueInstallmentsAtEnd ?? 0).toLocaleString("pt-BR")} parcelas vencidas`}
                  label="Taxa de recuperacao"
                  tone={recoveryRate >= 100 ? "positive" : "warning"}
                  value={formatPercent(recoveryRate)}
                />
              </div>
            </SectionCard>

            <SectionCard>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-800">Detalhamento de contratos</h3>
                  <p className="mt-1 text-sm text-slate-500">Base detalhada de emprestimos do recorte selecionado.</p>
                </div>
                <input
                  className="min-h-[38px] w-full min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#4F7EF7] focus:ring-2 focus:ring-[#4F7EF7]/20 sm:w-auto"
                  onChange={(event) => setLoansSearch(event.target.value)}
                  placeholder="Buscar cliente ou contrato..."
                  type="search"
                  value={loansSearch}
                />
              </div>

              {loansRowsPage.length === 0 ? (
                <EmptyBlock message="Nenhum contrato encontrado para os filtros atuais." />
              ) : (
                <div className="space-y-3">
                  <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/90 md:block">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50/80 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Cliente</th>
                          <th className="px-3 py-3">Contrato</th>
                          <th className="px-3 py-3">Inicio</th>
                          <th className="px-3 py-3">Vencimento</th>
                          <th className="px-3 py-3 text-right">Total</th>
                          <th className="px-3 py-3 text-right">Recebido</th>
                          <th className="px-3 py-3 text-right">Aberto</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Origem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {loansRowsPage.map((row) => (
                          <tr key={row.loanId}>
                            <td className="px-3 py-3 font-semibold text-slate-700">{row.clientName}</td>
                            <td className="px-3 py-3 text-slate-600">#{row.loanId}</td>
                            <td className="px-3 py-3 text-slate-600">{formatDateShort(row.startDate)}</td>
                            <td className="px-3 py-3 text-slate-600">{formatDateShort(row.dueDate)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatCurrency(row.total)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-emerald-600">{formatCurrency(row.received)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatCurrency(row.open)}</td>
                            <td className="px-3 py-3">
                              <ToneBadge
                                label={row.status}
                                tone={row.status === "ATRASADO" ? "negative" : row.status === "EM_DIA" ? "positive" : row.status === "PENDENTE" ? "warning" : "neutral"}
                              />
                            </td>
                            <td className="px-3 py-3"><ToneBadge label="Emprestimos" tone="neutral" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {loansRowsPage.map((row) => (
                      <div key={`${row.loanId}-mobile`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_18px_rgba(15,23,42,0.05)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{row.clientName}</p>
                            <p className="text-xs text-slate-500">Contrato #{row.loanId}</p>
                          </div>
                          <div className="text-right">
                            <p className={cn("text-sm font-bold", row.open > 0 ? "text-rose-600" : "text-emerald-600")}>
                              {formatCurrency(row.open)}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500">Em aberto</p>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <ToneBadge
                            label={row.status}
                            tone={row.status === "ATRASADO" ? "negative" : row.status === "EM_DIA" ? "positive" : row.status === "PENDENTE" ? "warning" : "neutral"}
                          />
                          <ToneBadge label="Emprestimos" tone="neutral" />
                          <ToneBadge label={row.open > 0 ? "Aberto" : "Quitado"} tone={row.open > 0 ? "negative" : "positive"} />
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          Inicio {formatDate(row.startDate)} | Vencimento {formatDate(row.dueDate)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
                          <span className="text-emerald-600">Recebido {formatCurrency(row.received)}</span>
                          <span className="text-slate-600">Total {formatCurrency(row.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="reports-screen-only mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-500">
                  Exibindo {loansPageStart}-{loansPageEnd} de {searchedRows.length.toLocaleString("pt-BR")} contratos
                </p>

                {loansTableTotalPages > 1 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                      disabled={safeLoansTablePage <= 1}
                      onClick={() => setLoansTablePage((current) => Math.max(current - 1, 1))}
                      type="button"
                    >
                      Anterior
                    </button>

                    {paginationWindow.map((page) => (
                      <button
                        key={`loan-page-${page}`}
                        className={cn(
                          "inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-lg border text-xs font-semibold transition",
                          page === safeLoansTablePage
                            ? "border-[#214fae] bg-[#10318c] text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                        onClick={() => setLoansTablePage(page)}
                        type="button"
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                      disabled={safeLoansTablePage >= loansTableTotalPages}
                      onClick={() => setLoansTablePage((current) => Math.min(current + 1, loansTableTotalPages))}
                      type="button"
                    >
                      Proxima
                    </button>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </>
        ) : null}
      </div>
    );
  }

  const isBusy = isPending || (activeTab === "finance" ? financeState.loading : loansState.loading);
  const headerTitle = activeTab === "finance" ? "Relatório Financeiro" : "Relatório de Empréstimos";
  const headerSubtitle = activeTab === "finance"
    ? "Analise detalhada do desempenho financeiro no periodo."
    : "Performance da carteira, recebimentos e risco dos emprestimos.";

  return (
    <div className="reports-print-shell mx-auto w-full max-w-[1480px] pb-5">
      <header className="reports-print-card rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_16px_30px_rgba(15,23,42,0.06)] sm:p-5">
        <PageHeader
          subtitle={headerSubtitle}
          title={headerTitle}
          actions={(
            <div className="reports-screen-only grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end">
              <button
                className="inline-flex min-h-[36px] w-full items-center justify-center gap-2 rounded-xl border border-[#183f9f] bg-[#10318c] px-3 text-sm font-semibold text-white transition hover:bg-[#0d2872] sm:w-auto"
                onClick={handleExportCsv}
                type="button"
              >
                <Download className="h-4 w-4" />
                Exportar relatorio
              </button>
              <button
                className="inline-flex min-h-[36px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
                onClick={handlePrint}
                type="button"
              >
                <Printer className="h-4 w-4" />
                Imprimir / PDF
              </button>
            </div>
          )}
        />

        <div className="reports-screen-only mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 sm:mt-4 sm:inline-flex sm:w-auto sm:items-center sm:gap-1.5 sm:rounded-full">
          <button
            className={cn(
              "w-full rounded-full px-4 py-2 text-sm font-semibold transition sm:w-auto",
              activeTab === "finance" ? "bg-white text-[#214fae] shadow-sm" : "text-slate-600 hover:bg-white",
            )}
            onClick={() => switchTab("finance")}
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Financeiro
            </span>
          </button>
          <button
            className={cn(
              "w-full rounded-full px-4 py-2 text-sm font-semibold transition sm:w-auto",
              activeTab === "loans" ? "bg-white text-[#214fae] shadow-sm" : "text-slate-600 hover:bg-white",
            )}
            onClick={() => switchTab("loans")}
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Emprestimos
            </span>
          </button>
        </div>
      </header>

      <div className="mt-5">
        {activeTab === "finance" ? renderFinanceContent() : renderLoansContent()}
      </div>

      {isBusy ? (
        <p className="mt-3 text-xs font-medium text-slate-500">Atualizando relatorio...</p>
      ) : null}
    </div>
  );
}
