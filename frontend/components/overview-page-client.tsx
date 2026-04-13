"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useCashAdjustmentModal } from "../app/components/CashAdjustmentModalProvider";
import { PageHeader } from "../app/components/PageHeader";
import {
  AlertCircleIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BellIcon,
  CalendarCheckIcon,
  HistoryIcon,
  RefreshIcon,
  TrendUpIcon,
  WalletIcon,
} from "./icons";

type DashboardPayload = {
  meta?: {
    generatedAt?: string;
    timezone?: string;
    period?: string;
    metric?: string;
  };
  cashAdjustment?: {
    net?: number;
  };
  overviewSummary?: {
    cashBalance?: SummaryCard;
    accountsReceivable?: SummaryCard & {
      loanValue?: number;
      financeValue?: number;
    };
    accountsPayable?: SummaryCard & {
      itemsCount?: number;
    };
    projectedBalance?: SummaryCard & {
      receivableValue?: number;
      payableValue?: number;
    };
  };
  dailyOperations?: {
    receiptsToday?: OperationGroup;
    paymentsToday?: OperationGroup;
    alerts?: {
      dueTodayOutgoingCount?: number;
      dueTodayOutgoingValue?: number;
      overdueIncomingCount?: number;
      overdueIncomingValue?: number;
      overdueOutgoingCount?: number;
      overdueOutgoingValue?: number;
      upcoming7OutgoingCount?: number;
      upcoming7OutgoingValue?: number;
      incomingHref?: string;
      outgoingHref?: string;
    };
  };
  chart?: {
    metric?: string;
    period?: string;
    points?: MonthlyPoint[];
    hasData?: boolean;
    emptyMessage?: string;
  };
  recentMovements?: RecentMovement[];
  recentMovementsPagination?: PaginationMeta;
};

type SummaryCard = {
  value?: number;
  note?: string;
  href?: string;
};

type OperationGroup = {
  totalValue?: number;
  items?: OperationItem[];
};

type OperationItem = {
  href?: string;
  typeLabel?: string;
  moduleLabel?: string;
  title?: string;
  subtitle?: string;
  amount?: number;
};

type MonthlyPoint = {
  label?: string;
  value?: number;
  received?: number;
  open?: number;
  overdue?: number;
};

type RecentMovement = {
  id?: string;
  href?: string;
  occurredAt?: string;
  direction?: "in" | "out";
  typeLabel?: string;
  moduleLabel?: string;
  title?: string;
  subtitle?: string;
  amount?: number;
};

type PaginationMeta = {
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
};

type PaginationToken = number | "left" | "right";

const RECENT_MOVEMENTS_PAGE_SIZE = 6;

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatCompactNumber(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

function formatDateLong(value?: string) {
  if (!value) return "--";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMetricLabel(metric?: string) {
  return (
    {
      recebido: "Recebido",
      emprestado: "Emprestado",
      lucro: "Lucro",
    }[metric || ""] || "Recebido"
  );
}

function buildFlowHeader(period?: string) {
  const normalized = String(period || "")
    .trim()
    .toLowerCase();
  const match = normalized.match(/^(\d+)([dmy])$/);

  if (!match) {
    return {
      title: "Fluxo dos últimos meses",
      subtitle: "Recebido, a vencer e em atraso por mês.",
    } as const;
  }

  const amount = Number(match[1]) || 0;
  const unit = match[2];

  if (unit === "m") {
    return {
      title: `Fluxo dos últimos ${amount} ${amount === 1 ? "mês" : "meses"}`,
      subtitle: "Recebido, a vencer e em atraso por mês.",
    } as const;
  }

  if (unit === "d") {
    return {
      title: `Fluxo dos últimos ${amount} ${amount === 1 ? "dia" : "dias"}`,
      subtitle: "Recebido, a vencer e em atraso no período.",
    } as const;
  }

  return {
    title: `Fluxo dos últimos ${amount} ${amount === 1 ? "ano" : "anos"}`,
    subtitle: "Recebido, a vencer e em atraso por mês.",
  } as const;
}

function buildInsight(currentValue: unknown, previousValue: unknown) {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);

  if (Math.abs(previous) < 0.00001) {
    if (Math.abs(current) < 0.00001) {
      return {
        tone: "neutral",
        headline: "0,00%",
        summary: "Sem variação relevante em relação ao mês anterior.",
        hasBaseline: false,
      } as const;
    }

    return {
      tone: current >= 0 ? "positive" : "negative",
      headline: "Sem base",
      summary: "Ainda não existe um mês anterior com valor para comparar.",
      hasBaseline: false,
    } as const;
  }

  const percentage = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(percentage) < 0.005) {
    return {
      tone: "neutral",
      headline: "0,00%",
      summary: "Mesmo ritmo do mês anterior.",
      hasBaseline: true,
    } as const;
  }

  const percentageText = Math.abs(percentage).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    tone: percentage > 0 ? "positive" : "negative",
    headline: `${percentage > 0 ? "+" : "-"}${percentageText}%`,
    summary: percentage > 0 ? "acima do mês anterior" : "abaixo do mês anterior",
    hasBaseline: true,
  } as const;
}

function normalizeHref(href?: string) {
  if (!href) return "#";
  if (href === "/admin/visao-geral.html" || href === "/visao-geral" || href === "/visao-geral.html") {
    return "/app/visao-geral";
  }
  return href;
}

function buildPaginationSequence(currentPage: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const sequence: PaginationToken[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) sequence.push("left");
  for (let page = start; page <= end; page += 1) sequence.push(page);
  if (end < totalPages - 1) sequence.push("right");
  sequence.push(totalPages);
  return sequence;
}

async function fetchOverview(page: number, signal: AbortSignal) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  const params = new URLSearchParams({
    period: "6m",
    metric: "recebido",
    tz: timeZone,
    recentMovementsPage: String(Math.max(1, page)),
    recentMovementsPageSize: String(RECENT_MOVEMENTS_PAGE_SIZE),
  });

  const response = await fetch(`/api/dashboard?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Sessão expirada.");
  }

  if (!response.ok || !payload) {
    throw new Error(typeof payload?.message === "string" ? payload.message : "Falha ao carregar a visão geral.");
  }

  return payload as DashboardPayload;
}

/* ─────────────────────────────────────────
   METRIC CARD  (KPI top row)
───────────────────────────────────────── */
function MetricCard({
  href,
  label,
  value,
  note,
  meta,
  tone,
  icon,
  action,
}: {
  href?: string;
  label: string;
  value: string;
  note: string;
  meta: string;
  tone: "cash" | "receivable" | "payable" | "projected";
  icon: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    disabled?: boolean;
  };
}) {
  const toneConfig = {
    cash: {
      iconBg: "bg-[#EEF4FF]",
      iconColor: "text-[#4F7EF7]",
      accent: "text-[#4F7EF7]",
      badge: "bg-[#EEF4FF] text-[#4F7EF7]",
      border: "border-[#4F7EF7]/15",
      topBar: "bg-[#4F7EF7]",
    },
    receivable: {
      iconBg: "bg-[#ECFDF5]",
      iconColor: "text-emerald-600",
      accent: "text-emerald-600",
      badge: "bg-[#ECFDF5] text-emerald-700",
      border: "border-emerald-200/60",
      topBar: "bg-emerald-500",
    },
    payable: {
      iconBg: "bg-[#FFF1F2]",
      iconColor: "text-rose-500",
      accent: "text-rose-500",
      badge: "bg-[#FFF1F2] text-rose-600",
      border: "border-rose-200/60",
      topBar: "bg-rose-500",
    },
    projected: {
      iconBg: "bg-[#FAF5FF]",
      iconColor: "text-violet-600",
      accent: "text-violet-600",
      badge: "bg-[#FAF5FF] text-violet-700",
      border: "border-violet-200/60",
      topBar: "bg-violet-500",
    },
  }[tone];

  const content = (
    <>
      {/* Thin accent top bar */}
      <div className={`absolute inset-x-0 top-0 h-1 rounded-t-[18px] ${toneConfig.topBar}`} />
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneConfig.iconBg}`}>
          <span className={toneConfig.iconColor}>{icon}</span>
        </div>
        {action ? (
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[0.75rem] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
            disabled={action.disabled}
            onClick={action.onClick}
            type="button"
          >
            {action.icon ?? null}
            <span>{action.label}</span>
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-[1.75rem] font-bold tracking-tight text-slate-800">{value}</p>
      <p className="mt-1.5 hidden text-sm text-slate-500 sm:block">{note}</p>
      <p className="mt-1 hidden text-xs text-slate-400 sm:block">{meta}</p>
    </>
  );

  const classes = `relative block overflow-hidden rounded-[18px] border ${toneConfig.border} bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_4px_16px_rgba(15,23,42,0.05)] transition hover:shadow-[0_4px_20px_rgba(15,23,42,0.10)]`;

  if (!action && href) {
    return (
      <Link className={classes} href={normalizeHref(href)}>
        {content}
      </Link>
    );
  }

  return <article className={classes}>{content}</article>;
}

/* ─────────────────────────────────────────
   FINANCIAL ALERT PILL
───────────────────────────────────────── */
function FinancialAlert({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: "amber" | "rose" | "sky" | "slate" | "violet";
  icon: ReactNode;
}) {
  const toneClass = {
    amber: {
      card: "border-amber-200/70 bg-amber-50",
      icon: "bg-amber-100 text-amber-600",
      text: "text-amber-800",
    },
    rose: {
      card: "border-rose-200/70 bg-rose-50",
      icon: "bg-rose-100 text-rose-600",
      text: "text-rose-800",
    },
    violet: {
      card: "border-violet-200/70 bg-violet-50",
      icon: "bg-violet-100 text-violet-600",
      text: "text-violet-800",
    },
    sky: {
      card: "border-sky-200/70 bg-sky-50",
      icon: "bg-sky-100 text-sky-600",
      text: "text-sky-800",
    },
    slate: {
      card: "border-slate-200/70 bg-slate-50",
      icon: "bg-slate-100 text-slate-500",
      text: "text-slate-600",
    },
  }[tone];

  return (
    <article className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${toneClass.card}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass.icon}`}>{icon}</span>
      <span className={`min-w-0 flex-1 text-sm font-medium leading-5 ${toneClass.text}`}>{label}</span>
    </article>
  );
}

/* ─────────────────────────────────────────
   DAILY SUMMARY CARD
───────────────────────────────────────── */
function DailySummaryCard({
  title,
  value,
  meta,
  tone,
  icon,
}: {
  title: string;
  value: string;
  meta: string;
  tone: "incoming" | "outgoing" | "projected";
  icon: ReactNode;
}) {
  const toneClass = {
    incoming: {
      card: "border-emerald-200/60 bg-emerald-50/60",
      icon: "bg-emerald-100 text-emerald-600",
      value: "text-emerald-700",
    },
    outgoing: {
      card: "border-rose-200/60 bg-rose-50/60",
      icon: "bg-rose-100 text-rose-600",
      value: "text-rose-700",
    },
    projected: {
      card: "border-[#4F7EF7]/20 bg-[#EEF4FF]/60",
      icon: "bg-[#EEF4FF] text-[#4F7EF7]",
      value: "text-[#4F7EF7]",
    },
  }[tone];

  return (
    <article className={`overflow-hidden rounded-xl border px-4 py-4 ${toneClass.card}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass.icon}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className={`mt-2 text-[1.6rem] font-bold tracking-tight ${toneClass.value}`}>{value}</p>
          <p className="mt-1.5 hidden text-xs text-slate-500 sm:block">{meta}</p>
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────
   MONTHLY FLOW CHART
───────────────────────────────────────── */
function MonthlyFlowChart({
  points,
  hasData,
  emptyMessage,
}: {
  points: MonthlyPoint[];
  hasData: boolean;
  emptyMessage: string;
}) {
  if (!hasData || points.length === 0) {
    return (
      <div className="relative mt-4 min-h-[280px] overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
        <div className="absolute inset-4 flex items-center justify-center rounded-xl text-center text-sm text-slate-400">
          <div>
            <TrendUpIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-slate-500">{emptyMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  const width = 700;
  const height = 270;
  const top = 20;
  const bottom = 44;
  const left = 60;
  const right = 16;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [
      toNumber(point.received ?? point.value),
      toNumber(point.open),
      toNumber(point.overdue),
    ]),
  );
  const groupWidth = innerWidth / points.length;
  const barWidth = Math.max(10, groupWidth * 0.16);
  const barGap = Math.max(4, groupWidth * 0.08);
  const currentIndex = Math.max(0, points.length - 1);
  const currentBandX = left + groupWidth * currentIndex + groupWidth * 0.12;
  const currentBandWidth = groupWidth * 0.76;
  const legendItems = [
    { label: "Recebido", color: "bg-[#4F7EF7]", chip: "bg-blue-50 text-blue-600 border-blue-100" },
    { label: "Em aberto", color: "bg-sky-300", chip: "bg-sky-50 text-sky-600 border-sky-100" },
    { label: "Atrasado", color: "bg-rose-300", chip: "bg-rose-50 text-rose-600 border-rose-100" },
  ];

  // Build area path for received line
  const areaPoints = points.map((point, index) => {
    const cx = left + groupWidth * index + groupWidth / 2;
    const y = top + innerHeight - (toNumber(point.received ?? point.value) / maxValue) * innerHeight;
    return { cx, y };
  });
  const lineD = areaPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.cx.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaD =
    lineD +
    ` L ${areaPoints[areaPoints.length - 1]?.cx.toFixed(1)} ${(top + innerHeight).toFixed(1)}` +
    ` L ${areaPoints[0]?.cx.toFixed(1)} ${(top + innerHeight).toFixed(1)} Z`;

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/35 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.64rem] font-bold uppercase tracking-[0.12em] text-slate-400">Escala em R$</p>
        <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[0.68rem] font-semibold text-blue-600">
          Último ponto: {points[currentIndex]?.label || "mês atual"}
        </span>
      </div>
      <svg
        aria-label="Fluxo dos últimos meses"
        className="block h-[270px] w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F7EF7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#4F7EF7" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <rect
          fill="rgba(79,126,247,0.06)"
          height={innerHeight + 10}
          rx="16"
          width={currentBandWidth}
          x={currentBandX}
          y={top - 5}
        />
        <text fill="#4F7EF7" fontSize="10" fontWeight="700" textAnchor="middle" x={currentBandX + currentBandWidth / 2} y={12}>
          MES ATUAL
        </text>

        {/* Grid lines */}
        {gridSteps.map((step) => {
          const y = top + innerHeight * step;
          const tickValue = maxValue * (1 - step);
          return (
            <g key={step}>
              <line
                stroke="rgba(203,213,225,0.8)"
                strokeDasharray="4 5"
                strokeWidth="1"
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
              />
              <text fill="#94A3B8" fontSize="10" textAnchor="end" x={left - 8} y={y + 3}>
                {formatCompactNumber(tickValue)}
              </text>
            </g>
          );
        })}

        {/* Bars: open & overdue */}
        {points.map((point, index) => {
          const centerX = left + groupWidth * index + groupWidth / 2;
          const open = toNumber(point.open);
          const overdue = toNumber(point.overdue);
          const openH = (open / maxValue) * innerHeight;
          const overdueH = (overdue / maxValue) * innerHeight;
          const baseY = top + innerHeight;
          return (
            <g key={`bars-${point.label || index}`}>
              <title>
                {point.label || "--"} | Em aberto: {formatCurrency(open)} | Atrasado: {formatCurrency(overdue)}
              </title>
              <rect
                fill="#BFDBFE"
                height={openH}
                rx="5"
                stroke="#93C5FD"
                strokeWidth="1"
                width={barWidth}
                x={centerX - barWidth - barGap / 2}
                y={baseY - openH}
              />
              <rect
                fill="#FECACA"
                height={overdueH}
                rx="5"
                stroke="#FCA5A5"
                strokeWidth="1"
                width={barWidth}
                x={centerX + barGap / 2}
                y={baseY - overdueH}
              />
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#areaGrad)" />

        {/* Line */}
        <path
          d={lineD}
          fill="none"
          stroke="#4F7EF7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />

        {/* Data points + labels */}
        {areaPoints.map((p, index) => {
          const point = points[index];
          const receivedValue = toNumber(point?.received ?? point?.value);
          const isCurrentPoint = index === currentIndex;
          const markerY = Math.max(18, p.y - 16);
          return (
            <g key={`pt-${point?.label || index}`}>
              <title>
                {point?.label || "--"} | Recebido: {formatCurrency(receivedValue)}
              </title>
              {isCurrentPoint ? (
                <>
                  <rect fill="#ffffff" height="18" rx="9" stroke="#BFDBFE" width="48" x={p.cx - 24} y={markerY - 14} />
                  <text fill="#2563EB" fontSize="9" fontWeight="700" textAnchor="middle" x={p.cx} y={markerY - 2}>
                    ATUAL
                  </text>
                </>
              ) : null}
              <circle cx={p.cx} cy={p.y} fill="#4F7EF7" r={isCurrentPoint ? "5" : "4"} stroke="#fff" strokeWidth={isCurrentPoint ? "3" : "2"} />
              <text fill="#94A3B8" fontSize="11" textAnchor="middle" x={p.cx} y={height - 16}>
                {point?.label || "--"}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 flex flex-nowrap items-center gap-2 text-[10px] font-semibold sm:flex-wrap sm:text-xs">
        {legendItems.map((item) => (
          <span
            className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1.5 ${item.chip} sm:flex-none sm:gap-2 sm:px-3`}
            key={item.label}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   RECENT MOVEMENTS TABLE
───────────────────────────────────────── */
function RecentMovements({
  items,
  meta,
  loading,
  onPageChange,
}: {
  items: RecentMovement[];
  meta: PaginationMeta;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const currentPage = Math.max(1, Number(meta.page) || 1);
  const totalPages = Math.max(1, Number(meta.totalPages) || 1);
  const totalItems = Math.max(0, Number(meta.totalItems) || 0);
  const pageSize = Math.max(1, Number(meta.pageSize) || RECENT_MOVEMENTS_PAGE_SIZE);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(totalItems, currentPage * pageSize);
  const pages = buildPaginationSequence(currentPage, totalPages);

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_4px_16px_rgba(15,23,42,0.05)] ${loading ? "opacity-70" : ""}`}
    >
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Movimentacoes recentes</h3>
            <p className="mt-0.5 text-sm text-slate-500">Apenas transacoes realizadas.</p>
          </div>
          {totalItems > 0 ? (
            <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-bold text-[#4F7EF7]">
              {totalItems} {totalItems === 1 ? "registro" : "registros"}
            </span>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <RefreshIcon className="h-6 w-6" />
          </div>
          <p className="mt-4 font-semibold text-slate-700">Sem movimentacoes recentes.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[0.7rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                  <th className="px-5 py-3.5">Data</th>
                  <th className="px-5 py-3.5">Tipo</th>
                  <th className="px-5 py-3.5">Origem</th>
                  <th className="px-5 py-3.5">Descrição</th>
                  <th className="px-5 py-3.5 text-right">Entrada</th>
                  <th className="px-5 py-3.5 text-right">Saida</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const isOutgoing = item.direction === "out";
                  const href = normalizeHref(item.href);

                  return (
                    <tr
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/80"
                      key={`${item.id || "movement"}-${index}`}
                      onClick={() => {
                        window.location.href = href;
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          window.location.href = href;
                        }
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      <td className="px-5 py-3.5 text-sm font-medium text-slate-700">
                        {formatDateLong(item.occurredAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide ${
                            isOutgoing
                              ? "bg-rose-50 text-rose-600"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {item.typeLabel || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-slate-600">
                          {item.moduleLabel || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-800">{item.title || "-"}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{item.subtitle || "-"}</p>
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right text-sm font-bold ${isOutgoing ? "text-slate-300" : "text-emerald-600"}`}
                      >
                        {isOutgoing ? "-" : formatCurrency(item.amount)}
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right text-sm font-bold ${isOutgoing ? "text-rose-500" : "text-slate-300"}`}
                      >
                        {isOutgoing ? formatCurrency(item.amount) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 p-4 md:hidden">
            {items.map((item, index) => {
              const isOutgoing = item.direction === "out";
              return (
                <Link
                  className="block rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3.5 transition hover:border-slate-300 hover:bg-white"
                  href={normalizeHref(item.href)}
                  key={`${item.id || "movement-mobile"}-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${
                            isOutgoing ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {item.typeLabel || "-"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-600">
                          {item.moduleLabel || "-"}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{item.title || "-"}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.subtitle || "-"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-base font-extrabold ${isOutgoing ? "text-rose-500" : "text-emerald-600"}`}>
                        {isOutgoing ? "-" : "+"}
                        {formatCurrency(item.amount)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{formatDateLong(item.occurredAt)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Mostrando {startItem}–{endItem} de {totalItems} movimentacoes
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-[#4F7EF7]/40 hover:text-[#4F7EF7] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage <= 1 || loading}
              onClick={() => onPageChange(currentPage - 1)}
              type="button"
            >
              Anterior
            </button>
            {pages.map((page) =>
              typeof page === "number" ? (
                <button
                  aria-current={page === currentPage ? "page" : undefined}
                  className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2.5 text-xs font-bold transition ${
                    page === currentPage
                      ? "border-[#4F7EF7] bg-[#4F7EF7] text-white shadow-[0_4px_12px_rgba(79,126,247,0.3)]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#4F7EF7]/40 hover:text-[#4F7EF7]"
                  }`}
                  disabled={loading}
                  key={page}
                  onClick={() => onPageChange(page)}
                  type="button"
                >
                  {page}
                </button>
              ) : (
                <span
                  className="inline-flex h-8 min-w-[2rem] items-center justify-center text-xs font-bold text-slate-400"
                  key={page}
                >
                  ...
                </span>
              ),
            )}
            <button
              className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-[#4F7EF7]/40 hover:text-[#4F7EF7] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage >= totalPages || loading}
              onClick={() => onPageChange(currentPage + 1)}
              type="button"
            >
              Proxima
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/* ─────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────── */
function EmptyState({
  title,
  note,
  className = "",
}: {
  title: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-10 text-center ${className}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <CalendarCheckIcon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      {note ? <p className="mt-1 text-sm text-slate-500">{note}</p> : null}
    </div>
  );
}

/* ─────────────────────────────────────────
   OPERATION PANEL
───────────────────────────────────────── */
function OperationPanel({
  title,
  note,
  totalValue,
  secondaryTotalLabel,
  secondaryTotalValue,
  items,
  emptyTitle,
  emptyNote,
  amountClassName,
}: {
  title: string;
  note?: string;
  totalValue: number;
  secondaryTotalLabel?: string;
  secondaryTotalValue?: number;
  items: OperationItem[];
  emptyTitle: string;
  emptyNote?: string;
  amountClassName: string;
}) {
  const pageSize = 4;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleItems = items.slice(startIndex, endIndex);
  const startItem = totalItems === 0 ? 0 : startIndex + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(totalItems, endIndex);
  const pages = buildPaginationSequence(currentPage, totalPages);

  return (
    <article className="self-start overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_4px_16px_rgba(15,23,42,0.05)] xl:flex xl:h-[430px] xl:flex-col">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          {note ? <p className="mt-0.5 text-sm text-slate-500">{note}</p> : null}
        </div>
        <div className="flex flex-wrap items-start gap-1.5 sm:shrink-0 sm:flex-col sm:items-end">
          <span className="inline-flex items-center rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-bold text-[#4F7EF7]">
            Total: {formatCurrency(totalValue)}
          </span>
          {secondaryTotalLabel && typeof secondaryTotalValue === "number" && secondaryTotalValue > 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              {secondaryTotalLabel}: {formatCurrency(secondaryTotalValue)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 min-h-0 gap-2.5 overflow-y-auto p-4">
          {items.length === 0 ? (
            <EmptyState className="flex h-full flex-col justify-center" note={emptyNote} title={emptyTitle} />
          ) : (
            visibleItems.map((item, index) => (
              <Link
                className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3.5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                href={normalizeHref(item.href)}
                key={`${item.title || "item"}-${startIndex + index}`}
              >
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-600">
                        {item.typeLabel || "-"}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">
                        {item.moduleLabel || "-"}
                      </span>
                    </div>
                    <p className="text-sm font-semibold leading-5 text-slate-800 sm:truncate">{item.title || "-"}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.subtitle || "-"}</p>
                  </div>
                  <div className="flex justify-end border-t border-slate-200/80 pt-2 sm:block sm:shrink-0 sm:border-t-0 sm:pt-0 sm:text-right">
                    <p className={`text-base font-bold whitespace-nowrap ${amountClassName}`}>
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Mostrando {startItem}-{endItem} de {totalItems} itens
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-[#4F7EF7]/40 hover:text-[#4F7EF7] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
                type="button"
              >
                Anterior
              </button>
              {pages.map((page) =>
                typeof page === "number" ? (
                  <button
                    aria-current={page === currentPage ? "page" : undefined}
                    className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2.5 text-xs font-bold transition ${
                      page === currentPage
                        ? "border-[#4F7EF7] bg-[#4F7EF7] text-white shadow-[0_4px_12px_rgba(79,126,247,0.3)]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#4F7EF7]/40 hover:text-[#4F7EF7]"
                    }`}
                    key={`${title}-${page}`}
                    onClick={() => setCurrentPage(page)}
                    type="button"
                  >
                    {page}
                  </button>
                ) : (
                  <span
                    className="inline-flex h-8 min-w-[2rem] items-center justify-center text-xs font-bold text-slate-400"
                    key={`${title}-${page}`}
                  >
                    ...
                  </span>
                ),
              )}
              <button
                className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-[#4F7EF7]/40 hover:text-[#4F7EF7] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
                type="button"
              >
                Proxima
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE COMPONENT
───────────────────────────────────────── */
export function OverviewPageClient() {
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const { openCashAdjustmentModal: openGlobalCashAdjustmentModal } = useCashAdjustmentModal();

  function openCashAdjustmentModal() {
    openGlobalCashAdjustmentModal({
      onSuccess: () => {
        setRefreshTick((current) => current + 1);
      },
    });
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setError(null);
    if (payload) setPageLoading(true);
    else setInitialLoading(true);

    void fetchOverview(page, controller.signal)
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
      })
      .catch((nextError) => {
        if (!active || controller.signal.aborted) return;
        console.error(nextError);
        setError(
          nextError instanceof Error ? nextError.message : "Falha ao carregar a visão geral.",
        );
      })
      .finally(() => {
        if (!active) return;
        setInitialLoading(false);
        setPageLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page, refreshTick]);

  const overview = payload?.overviewSummary;
  const operations = payload?.dailyOperations;
  const chart = payload?.chart;
  const chartPoints = chart?.points || [];
  const currentPoint = chartPoints.length ? chartPoints[chartPoints.length - 1] : null;
  const previousPoint = chartPoints.length > 1 ? chartPoints[chartPoints.length - 2] : null;
  const flowHeader = buildFlowHeader(chart?.period);
  const metricLabel = formatMetricLabel(chart?.metric);
  const currentValue = toNumber(currentPoint?.received ?? currentPoint?.value);
  const previousValue = toNumber(previousPoint?.received ?? previousPoint?.value);
  const flowInsight = buildInsight(currentValue, previousValue);
  const openCurrentMonth = toNumber(currentPoint?.open);
  const overdueCurrentMonth = toNumber(currentPoint?.overdue);
  const pendingCurrentMonth = openCurrentMonth + overdueCurrentMonth;

  const receiptsToday = operations?.receiptsToday;
  const paymentsToday = operations?.paymentsToday;
  const receiptsTodayItems = receiptsToday?.items || [];
  const paymentsTodayItems = paymentsToday?.items || [];
  const incomingValue = toNumber(receiptsToday?.totalValue);
  const outgoingValue = toNumber(paymentsToday?.totalValue);
  const cashBalance = toNumber(overview?.cashBalance?.value);
  const projectedDayValue = cashBalance + incomingValue - outgoingValue;
  const dueTodayOutgoingCount = toNumber(operations?.alerts?.dueTodayOutgoingCount);
  const overdueIncomingCount = toNumber(operations?.alerts?.overdueIncomingCount);
  const overdueIncomingValue = toNumber(operations?.alerts?.overdueIncomingValue);
  const overdueOutgoingCount = toNumber(operations?.alerts?.overdueOutgoingCount);
  const upcoming7OutgoingCount = toNumber(operations?.alerts?.upcoming7OutgoingCount);
  const upcoming7OutgoingValue = toNumber(operations?.alerts?.upcoming7OutgoingValue);

  const alerts: Array<{
    icon: ReactNode;
    label: string;
    tone: "amber" | "rose" | "sky" | "slate" | "violet";
  }> = [
    {
      icon: <BellIcon className="h-4 w-4" />,
      label: dueTodayOutgoingCount
        ? `${dueTodayOutgoingCount} ${dueTodayOutgoingCount === 1 ? "conta vence hoje" : "contas vencem hoje"}`
        : "Nenhuma conta vence hoje",
      tone: dueTodayOutgoingCount ? "amber" : "slate",
    },
    {
      icon: <AlertCircleIcon className="h-4 w-4" />,
      label: overdueOutgoingCount
        ? `${overdueOutgoingCount} ${overdueOutgoingCount === 1 ? "conta atrasada" : "contas atrasadas"}`
        : "Nenhuma conta atrasada",
      tone: overdueOutgoingCount ? "rose" : "slate",
    },
    {
      icon: <HistoryIcon className="h-4 w-4" />,
      label: overdueIncomingCount
        ? `${overdueIncomingCount} ${overdueIncomingCount === 1 ? "recebimento atrasado" : "recebimentos atrasados"}`
        : "Nenhum recebimento atrasado",
      tone: overdueIncomingCount ? "amber" : "slate",
    },
    {
      icon: <CalendarCheckIcon className="h-4 w-4" />,
      label: upcoming7OutgoingCount
        ? `${upcoming7OutgoingCount} ${upcoming7OutgoingCount === 1 ? "vencimento nos próximos 7 dias" : "vencimentos nos próximos 7 dias"} (${formatCurrency(upcoming7OutgoingValue)})`
        : "Nenhum vencimento nos próximos 7 dias",
      tone: upcoming7OutgoingCount ? "sky" : "slate",
    },
  ];

  // Loading skeleton
  if (initialLoading) {
    return (
      <div className="w-full max-w-[1600px] mx-auto animate-pulse">
        <div className="mb-7">
          <div className="h-9 w-48 rounded-xl bg-slate-200" />
          <div className="mt-2 h-5 w-80 rounded-lg bg-slate-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-[18px] bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-[1600px] mx-auto pb-24 lg:pb-8 ${initialLoading ? "opacity-90" : ""}`}>
      {/* ── PAGE HEADER ── */}
      <section className="mb-6 hidden">
        <div>
          <div>
            <h1 className="text-2xl sm:text-[clamp(1.6rem,1.2vw+1rem,2.1rem)] font-bold leading-tight tracking-tight text-slate-800">
              Visão geral
            </h1>
            <p className="mt-1.5 hidden text-sm text-slate-500 md:block">
              Resumo do caixa, recebimentos e compromissos financeiros.
            </p>
          </div>
        </div>
      </section>

      <PageHeader
        subtitle="Resumo do caixa, recebimentos e compromissos financeiros."
        title="Visão geral"
      />

      {/* Error banner */}
      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {/* ── ROW 1: KPI CARDS ── */}
      <section className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          action={{
            label: "Ajustar caixa",
            onClick: openCashAdjustmentModal,
            icon: <WalletIcon className="h-3.5 w-3.5" />,
          }}
          icon={<WalletIcon className="h-5 w-5" />}
          label="Saldo em caixa"
          meta={`Ajustes: ${formatCurrency(payload?.cashAdjustment?.net)}`}
          note={overview?.cashBalance?.note || "Disponível agora"}
          tone="cash"
          value={formatCurrency(overview?.cashBalance?.value)}
        />
        <MetricCard
          icon={<ArrowUpRightIcon className="h-5 w-5" />}
          label="Contas a receber"
          meta={`Emprestimos: ${formatCurrency(overview?.accountsReceivable?.loanValue)} | Financeiro: ${formatCurrency(overview?.accountsReceivable?.financeValue)}`}
          note={overview?.accountsReceivable?.note || "Emprestimos + Financeiro"}
          tone="receivable"
          value={formatCurrency(overview?.accountsReceivable?.value)}
        />
        <MetricCard
          icon={<ArrowDownLeftIcon className="h-5 w-5" />}
          label="Contas a pagar"
          meta={`${toNumber(overview?.accountsPayable?.itemsCount)} lancamento(s) pendente(s)`}
          note={overview?.accountsPayable?.note || "Compromissos pendentes"}
          tone="payable"
          value={formatCurrency(overview?.accountsPayable?.value)}
        />
        <MetricCard
          icon={<TrendUpIcon className="h-5 w-5" />}
          label="Saldo previsto"
          meta={`Entradas: ${formatCurrency(overview?.projectedBalance?.receivableValue)} | Saidas: ${formatCurrency(overview?.projectedBalance?.payableValue)}`}
          note={overview?.projectedBalance?.note || "Após entradas e saídas"}
          tone="projected"
          value={formatCurrency(overview?.projectedBalance?.value)}
        />
      </section>

      {/* ── ROW 2: OPERATIONS + ALERTS ── */}
      <section className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-[1.15fr_1.15fr_.8fr] xl:items-stretch">
        <OperationPanel
          amountClassName="text-emerald-600"
          emptyTitle="Sem recebimentos previstos para hoje."
          items={receiptsTodayItems}
          secondaryTotalLabel={overdueIncomingCount ? `Atrasados (${overdueIncomingCount})` : undefined}
          secondaryTotalValue={overdueIncomingCount ? overdueIncomingValue : undefined}
          title="Recebimentos de hoje"
          totalValue={incomingValue}
        />
        <OperationPanel
          amountClassName="text-rose-500"
          emptyTitle="Sem pagamentos para hoje ou vencidos."
          items={paymentsTodayItems}
          title="Pagamentos de hoje"
          totalValue={outgoingValue}
        />

        {/* Alerts card */}
        <article className="self-start overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_4px_16px_rgba(15,23,42,0.05)] xl:flex xl:h-[430px] xl:flex-col">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-bold text-slate-800">Alertas financeiros</h3>
            <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">Leitura rápida dos compromissos e riscos do dia.</p>
          </div>
          <div className="grid flex-1 content-start gap-2.5 overflow-y-auto p-4">
            {alerts.map((alert) => (
              <FinancialAlert icon={alert.icon} key={alert.label} label={alert.label} tone={alert.tone} />
            ))}
          </div>
        </article>
      </section>

      {/* ── ROW 3: CHART + DAILY SUMMARY ── */}
      <section className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-[1.45fr_.75fr] xl:items-stretch">
        {/* Monthly flow chart */}
        <article className="self-start overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_4px_16px_rgba(15,23,42,0.05)] xl:h-full">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-bold text-slate-800">{flowHeader.title}</h3>
            <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">{flowHeader.subtitle}</p>
          </div>
          <div className="p-5">
            {/* Mini stats row */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3.5">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">{metricLabel} no mês</p>
                <p className="mt-1.5 text-[1.35rem] font-bold tracking-tight text-slate-800">
                  {currentPoint ? formatCurrency(currentValue) : "--"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {currentPoint
                    ? `${metricLabel} registrado em ${currentPoint.label || "mês atual"}.`
                    : "Sem dados no período atual."}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3.5">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">Variação vs mês anterior</p>
                <p
                  className={`mt-1.5 text-[1.35rem] font-bold tracking-tight ${
                    flowInsight.tone === "positive"
                      ? "text-emerald-600"
                      : flowInsight.tone === "negative"
                        ? "text-rose-500"
                        : "text-slate-800"
                  }`}
                >
                  {flowInsight.headline}
                </p>
                <p
                  className={`mt-1 text-xs font-semibold ${
                    flowInsight.tone === "positive"
                      ? "text-emerald-600"
                      : flowInsight.tone === "negative"
                        ? "text-rose-500"
                        : "text-slate-400"
                  }`}
                >
                  {flowInsight.summary}
                </p>
                <p
                  className="mt-1 hidden text-xs text-slate-500 sm:block"
                >
                  {previousPoint
                    ? `${currentPoint?.label || "Mês atual"}: ${formatCurrency(currentValue)} | ${previousPoint.label || "Mês anterior"}: ${formatCurrency(previousValue)}`
                    : "Quando houver dois meses no período, o comparativo aparece aqui."}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3.5">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400">Pendências deste mês</p>
                <p className="mt-1.5 text-[1.35rem] font-bold tracking-tight text-slate-800">
                  {formatCurrency(pendingCurrentMonth)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  A vencer: {formatCurrency(openCurrentMonth)} | Em atraso: {formatCurrency(overdueCurrentMonth)}
                </p>
              </div>
            </div>
            <MonthlyFlowChart
              emptyMessage={chart?.emptyMessage || "Sem dados no período."}
              hasData={Boolean(chart?.hasData)}
              points={chartPoints}
            />
          </div>
        </article>

        {/* Daily summary */}
        <article className="self-start overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_4px_16px_rgba(15,23,42,0.05)] xl:flex xl:h-full xl:flex-col">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-bold text-slate-800">Resumo do dia</h3>
            <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">Entradas, saídas e projeção imediata do caixa.</p>
          </div>
          <div className="grid gap-3 p-5 xl:flex-1 xl:auto-rows-fr">
            <DailySummaryCard
              icon={<ArrowUpRightIcon className="h-4.5 w-4.5" />}
              meta={
                receiptsTodayItems.length
                  ? `${receiptsTodayItems.length} ${receiptsTodayItems.length === 1 ? "entrada prevista para hoje." : "entradas previstas para hoje."}`
                  : "Nenhuma entrada prevista para hoje."
              }
              title="Entradas previstas hoje"
              tone="incoming"
              value={formatCurrency(incomingValue)}
            />
            <DailySummaryCard
              icon={<ArrowDownLeftIcon className="h-4.5 w-4.5" />}
              meta={
                paymentsTodayItems.length
                  ? `${paymentsTodayItems.length} ${paymentsTodayItems.length === 1 ? "saída prevista para hoje." : "saídas previstas para hoje."}`
                  : "Nenhuma saída prevista para hoje."
              }
              title="Saidas previstas hoje"
              tone="outgoing"
              value={formatCurrency(outgoingValue)}
            />
            <DailySummaryCard
              icon={<WalletIcon className="h-4.5 w-4.5" />}
              meta={`Caixa atual ${formatCurrency(cashBalance)} + entradas − saídas do dia.`}
              title="Saldo projetado do dia"
              tone="projected"
              value={formatCurrency(projectedDayValue)}
            />
          </div>
        </article>
      </section>

      {/* ── ROW 4: RECENT MOVEMENTS ── */}
      <section className="mt-3 sm:mt-4">
        <RecentMovements
          items={payload?.recentMovements || []}
          loading={pageLoading}
          meta={payload?.recentMovementsPagination || {}}
          onPageChange={(nextPage) => {
            if (pageLoading || nextPage === page || nextPage < 1) return;
            setPage(nextPage);
          }}
        />
      </section>

      {/* ── CASH ADJUSTMENT MODAL ── */}
    </div>
  );
}
