"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BellIcon,
  CalendarCheckIcon,
  ChevronRightIcon,
  HistoryIcon,
  PulseIcon,
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
      overdueIncomingCount?: number;
      overdueOutgoingCount?: number;
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

function formatDateTime(value?: string, timeZone?: string) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone || "UTC",
  }).format(date);
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

function formatPeriodLabel(period?: string) {
  return (
    {
      "3m": "Ultimos 3 meses",
      "6m": "Ultimos 6 meses",
      "12m": "Ultimos 12 meses",
    }[period || ""] || "Periodo padrao"
  );
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

function buildInsight(currentValue: unknown, previousValue: unknown) {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);

  if (Math.abs(previous) < 0.00001) {
    if (Math.abs(current) < 0.00001) return { tone: "neutral", text: "0,00% vs mes ant." } as const;
    return { tone: current >= 0 ? "positive" : "negative", text: "Sem base ant." } as const;
  }

  const percentage = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(percentage) < 0.005) {
    return { tone: "neutral", text: "0,00% vs mes ant." } as const;
  }

  const percentageText = Math.abs(percentage).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    tone: percentage > 0 ? "positive" : "negative",
    text: `${percentage > 0 ? "+" : "-"}${percentageText}% vs mes ant.`,
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
    throw new Error("Sessao expirada.");
  }

  if (!response.ok || !payload) {
    throw new Error(typeof payload?.message === "string" ? payload.message : "Falha ao carregar a visao geral.");
  }

  return payload as DashboardPayload;
}

function MetricCard({
  href,
  label,
  value,
  note,
  meta,
  tone,
  icon,
}: {
  href: string;
  label: string;
  value: string;
  note: string;
  meta: string;
  tone: "cash" | "receivable" | "payable" | "projected";
  icon: ReactNode;
}) {
  const toneClass = {
    cash: "border-sky-400/40 bg-[linear-gradient(135deg,rgba(14,41,105,0.94),rgba(13,30,77,0.9))]",
    receivable: "border-emerald-400/35 bg-[linear-gradient(135deg,rgba(4,93,74,0.94),rgba(3,64,50,0.9))]",
    payable: "border-rose-400/35 bg-[linear-gradient(135deg,rgba(117,7,39,0.94),rgba(85,7,32,0.9))]",
    projected: "border-fuchsia-400/35 bg-[linear-gradient(135deg,rgba(78,17,133,0.94),rgba(67,20,108,0.9))]",
  }[tone];

  return (
    <Link
      className={`relative block min-h-[132px] overflow-hidden rounded-[18px] border px-5 py-[1.15rem] shadow-[0_16px_34px_rgba(2,6,23,0.24)] ${toneClass}`}
      href={normalizeHref(href)}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_42%)]" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <p className="text-[0.8rem] font-medium uppercase tracking-[0.04em] text-slate-200">{label}</p>
        <span className="text-slate-200/90">{icon}</span>
      </div>
      <p className="relative z-10 mt-4 text-[2rem] font-medium tracking-[-0.03em] text-slate-50">{value}</p>
      <p className="relative z-10 mt-2 text-[0.98rem] text-slate-50/95">{note}</p>
      <p className="relative z-10 mt-1 text-[0.8rem] text-slate-200/80">{meta}</p>
    </Link>
  );
}

function FinancialAlert({
  href,
  label,
  tone,
  icon,
}: {
  href: string;
  label: string;
  tone: "amber" | "rose" | "sky" | "slate" | "violet";
  icon: ReactNode;
}) {
  const toneClass = {
    amber: {
      card: "border-amber-400/15 bg-amber-500/10 hover:border-amber-300/25",
      icon: "bg-amber-400/10 text-amber-100",
      text: "text-amber-50",
    },
    rose: {
      card: "border-rose-400/15 bg-rose-500/10 hover:border-rose-300/25",
      icon: "bg-rose-400/10 text-rose-100",
      text: "text-rose-50",
    },
    violet: {
      card: "border-fuchsia-400/15 bg-fuchsia-500/10 hover:border-fuchsia-300/25",
      icon: "bg-fuchsia-400/10 text-fuchsia-100",
      text: "text-fuchsia-50",
    },
    sky: {
      card: "border-sky-400/15 bg-sky-500/10 hover:border-sky-300/25",
      icon: "bg-sky-400/10 text-sky-100",
      text: "text-sky-50",
    },
    slate: {
      card: "border-slate-700/60 bg-slate-950/30 hover:border-slate-500/50 hover:bg-slate-900/70",
      icon: "bg-slate-800/80 text-slate-300",
      text: "text-slate-100",
    },
  }[tone];

  return (
    <Link
      className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition hover:-translate-y-0.5 ${toneClass.card}`}
      href={normalizeHref(href)}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass.icon}`}>{icon}</span>
      <span className={`min-w-0 flex-1 text-sm font-semibold leading-5 ${toneClass.text}`}>{label}</span>
      <ChevronRightIcon className="h-3 w-3 shrink-0 text-slate-500 transition group-hover:text-slate-300" />
    </Link>
  );
}

function DailySummaryCard({
  href,
  title,
  value,
  meta,
  tone,
  icon,
}: {
  href: string;
  title: string;
  value: string;
  meta: string;
  tone: "incoming" | "outgoing" | "projected";
  icon: ReactNode;
}) {
  const toneClass = {
    incoming: {
      card: "border-emerald-400/35 bg-[linear-gradient(135deg,rgba(8,76,77,0.9),rgba(12,54,64,0.88))]",
      icon: "bg-emerald-500/15 text-emerald-300",
      value: "text-teal-300",
    },
    outgoing: {
      card: "border-rose-400/30 bg-[linear-gradient(135deg,rgba(80,16,58,0.9),rgba(60,18,53,0.88))]",
      icon: "bg-rose-500/15 text-rose-300",
      value: "text-rose-300",
    },
    projected: {
      card: "border-sky-400/30 bg-[linear-gradient(135deg,rgba(23,49,104,0.9),rgba(26,50,93,0.88))]",
      icon: "bg-sky-500/15 text-sky-300",
      value: "text-sky-300",
    },
  }[tone];

  return (
    <Link
      className={`relative block overflow-hidden rounded-[18px] border px-4 py-4 transition hover:-translate-y-0.5 ${toneClass.card}`}
      href={normalizeHref(href)}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_42%)] opacity-70" />
      <div className="relative z-10 flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${toneClass.icon}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[0.96rem] font-medium text-slate-200">{title}</p>
          <p className={`mt-4 text-[2rem] font-medium tracking-[-0.03em] ${toneClass.value}`}>{value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-200/80">{meta}</p>
        </div>
      </div>
    </Link>
  );
}

function MonthlyFlowChart({ points, hasData, emptyMessage }: { points: MonthlyPoint[]; hasData: boolean; emptyMessage: string }) {
  if (!hasData || points.length === 0) {
    return (
      <div className="relative mt-4 min-h-[320px] overflow-hidden rounded-[18px] border border-slate-700/40 bg-slate-950/30 p-4">
        <div className="absolute inset-4 flex items-center justify-center rounded-[14px] bg-slate-950/70 text-center text-sm leading-6 text-slate-400">
          <div>
            <TrendUpIcon className="mx-auto mb-2 h-8 w-8 opacity-60" />
            <p className="font-semibold">{emptyMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  const width = 700;
  const height = 290;
  const top = 20;
  const bottom = 44;
  const side = 16;
  const innerWidth = width - side * 2;
  const innerHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [toNumber(point.received ?? point.value), toNumber(point.open), toNumber(point.overdue)]),
  );
  const groupWidth = innerWidth / points.length;
  const barWidth = Math.max(10, groupWidth * 0.16);
  const barGap = Math.max(4, groupWidth * 0.08);
  const linePoints = points
    .map((point, index) => {
      const centerX = side + groupWidth * index + groupWidth / 2;
      const y = top + innerHeight - (toNumber(point.received ?? point.value) / maxValue) * innerHeight;
      return `${centerX.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="relative mt-4 overflow-hidden rounded-[18px] border border-slate-700/40 bg-slate-950/30 p-4">
      <svg aria-label="Fluxo mensal" className="block h-[290px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = top + innerHeight * step;
          return (
            <line
              key={step}
              stroke="rgba(71,85,105,0.45)"
              strokeDasharray="4 6"
              strokeWidth="1"
              x1={side}
              x2={width - side}
              y1={y}
              y2={y}
            />
          );
        })}

        {points.map((point, index) => {
          const centerX = side + groupWidth * index + groupWidth / 2;
          const open = toNumber(point.open);
          const overdue = toNumber(point.overdue);
          const openHeight = (open / maxValue) * innerHeight;
          const overdueHeight = (overdue / maxValue) * innerHeight;
          const baseY = top + innerHeight;

          return (
            <g key={`bars-${point.label || index}`}>
              <rect
                fill="rgba(59,130,246,0.32)"
                height={openHeight}
                rx="8"
                stroke="rgba(96,165,250,0.7)"
                strokeWidth="1"
                width={barWidth}
                x={centerX - barWidth - barGap / 2}
                y={baseY - openHeight}
              />
              <rect
                fill="rgba(248,113,113,0.28)"
                height={overdueHeight}
                rx="8"
                stroke="rgba(252,165,165,0.75)"
                strokeWidth="1"
                width={barWidth}
                x={centerX + barGap / 2}
                y={baseY - overdueHeight}
              />
            </g>
          );
        })}

        <polyline
          fill="none"
          points={linePoints}
          stroke="#34d399"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />

        {points.map((point, index) => {
          const centerX = side + groupWidth * index + groupWidth / 2;
          const y = top + innerHeight - (toNumber(point.received ?? point.value) / maxValue) * innerHeight;

          return (
            <g key={`point-${point.label || index}`}>
              <circle cx={centerX} cy={y} fill="#34d399" r="4" stroke="rgba(15,23,42,0.9)" strokeWidth="2" />
              <text fill="#94a3b8" fontSize="11" textAnchor="middle" x={centerX} y={height - 16}>
                {point.label || "--"}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-300">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          Recebido
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400/80" />
          Em aberto
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          Atrasado
        </span>
      </div>
    </div>
  );
}

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
    <article className={`relative overflow-hidden rounded-2xl border border-slate-700/30 bg-[linear-gradient(180deg,rgba(10,18,34,0.96),rgba(9,16,30,0.84))] p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)] ${loading ? "opacity-70" : ""}`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_30%)] opacity-60" />
      <div className="relative z-10">
        <div>
          <h3 className="text-[1.06rem] font-bold tracking-[-0.02em] text-slate-100">Movimentacoes recentes</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">Apenas transacoes realizadas.</p>
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-700/60 bg-slate-950/30 px-4 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-900/70 text-slate-400">
              <RefreshIcon className="h-6 w-6" />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-100">Sem movimentacoes recentes.</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Quando houver recebimentos, ajustes ou lancamentos, eles aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-hidden rounded-[18px] border border-slate-700/40 bg-slate-950/25 md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-left text-[0.76rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-5 py-4">Data</th>
                      <th className="px-5 py-4">Tipo</th>
                      <th className="px-5 py-4">Origem</th>
                      <th className="px-5 py-4">Descricao</th>
                      <th className="px-5 py-4 text-right">Entrada</th>
                      <th className="px-5 py-4 text-right">Saida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const isOutgoing = item.direction === "out";
                      const href = normalizeHref(item.href);

                      return (
                        <tr
                          className="cursor-pointer border-t border-slate-800/80 transition hover:bg-slate-900/60"
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
                          <td className="px-5 py-4 text-[0.98rem] font-medium text-slate-100">{formatDateLong(item.occurredAt)}</td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex min-h-[26px] items-center rounded-full border px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] ${
                                isOutgoing
                                  ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                                  : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                              }`}
                            >
                              {item.typeLabel || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex min-h-[26px] items-center rounded-full border border-slate-600/50 bg-slate-900/70 px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-slate-200">
                              {item.moduleLabel || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-base font-medium text-slate-50">{item.title || "-"}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-400">{item.subtitle || "-"}</p>
                          </td>
                          <td className={`px-5 py-4 text-right text-base font-bold tracking-[-0.02em] ${isOutgoing ? "text-slate-500" : "text-emerald-300"}`}>
                            {isOutgoing ? "-" : formatCurrency(item.amount)}
                          </td>
                          <td className={`px-5 py-4 text-right text-base font-bold tracking-[-0.02em] ${isOutgoing ? "text-rose-300" : "text-slate-500"}`}>
                            {isOutgoing ? formatCurrency(item.amount) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:hidden">
              {items.map((item, index) => {
                const isOutgoing = item.direction === "out";

                return (
                  <Link
                    className="block rounded-2xl border border-slate-700/50 bg-slate-950/25 px-4 py-4 transition hover:-translate-y-0.5 hover:border-slate-500/50 hover:bg-slate-900/70"
                    href={normalizeHref(item.href)}
                    key={`${item.id || "movement-mobile"}-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <span
                            className={`inline-flex min-h-[26px] items-center rounded-full border px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] ${
                              isOutgoing
                                ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                            }`}
                          >
                            {item.typeLabel || "-"}
                          </span>
                          <span className="inline-flex min-h-[26px] items-center rounded-full border border-slate-600/50 bg-slate-900/70 px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-slate-200">
                            {item.moduleLabel || "-"}
                          </span>
                        </div>
                        <p className="text-[0.98rem] font-bold text-slate-50">{item.title || "-"}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{item.subtitle || "-"}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-base font-extrabold tracking-[-0.02em] ${isOutgoing ? "text-rose-300" : "text-emerald-300"}`}>
                          {isOutgoing ? "-" : "+"}
                          {formatCurrency(item.amount)}
                        </p>
                        <p className="mt-2 text-[0.78rem] text-slate-400">{formatDateLong(item.occurredAt)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              Mostrando {startItem}-{endItem} de {totalItems} movimentacoes
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-[2.35rem] min-w-[2.35rem] items-center justify-center rounded-full border border-slate-600/70 bg-slate-950/30 px-4 text-sm font-bold text-slate-200 transition hover:border-sky-400/40 hover:bg-slate-800/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
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
                    className={`inline-flex min-h-[2.35rem] min-w-[2.35rem] items-center justify-center rounded-full border px-4 text-sm font-bold transition ${
                      page === currentPage
                        ? "border-violet-400/50 bg-[linear-gradient(135deg,rgba(109,40,217,0.46),rgba(91,33,182,0.4))] text-white shadow-[0_8px_20px_rgba(76,29,149,0.24)]"
                        : "border-slate-600/70 bg-slate-950/30 text-slate-200 hover:border-sky-400/40 hover:bg-slate-800/80 hover:text-white"
                    }`}
                    disabled={loading}
                    key={page}
                    onClick={() => onPageChange(page)}
                    type="button"
                  >
                    {page}
                  </button>
                ) : (
                  <span className="inline-flex min-w-[2rem] items-center justify-center text-sm font-bold text-slate-500" key={page}>
                    ...
                  </span>
                ),
              )}
              <button
                className="inline-flex min-h-[2.35rem] min-w-[2.35rem] items-center justify-center rounded-full border border-slate-600/70 bg-slate-950/30 px-4 text-sm font-bold text-slate-200 transition hover:border-sky-400/40 hover:bg-slate-800/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                disabled={currentPage >= totalPages || loading}
                onClick={() => onPageChange(currentPage + 1)}
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

export function OverviewPageClient() {
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

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
        setError(nextError instanceof Error ? nextError.message : "Falha ao carregar a visao geral.");
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
  }, [page]);

  const overview = payload?.overviewSummary;
  const operations = payload?.dailyOperations;
  const chart = payload?.chart;
  const chartPoints = chart?.points || [];
  const currentPoint = chartPoints.length ? chartPoints[chartPoints.length - 1] : null;
  const previousPoint = chartPoints.length > 1 ? chartPoints[chartPoints.length - 2] : null;
  const currentValue = toNumber(currentPoint?.received ?? currentPoint?.value);
  const previousValue = toNumber(previousPoint?.received ?? previousPoint?.value);
  const flowInsight = buildInsight(currentValue, previousValue);
  const exposure = toNumber(currentPoint?.open) + toNumber(currentPoint?.overdue);

  const receiptsToday = operations?.receiptsToday;
  const paymentsToday = operations?.paymentsToday;
  const receiptsTodayItems = receiptsToday?.items || [];
  const paymentsTodayItems = paymentsToday?.items || [];
  const incomingValue = toNumber(receiptsToday?.totalValue);
  const outgoingValue = toNumber(paymentsToday?.totalValue);
  const cashBalance = toNumber(overview?.cashBalance?.value);
  const projectedDayValue = cashBalance + incomingValue - outgoingValue;
  const projectedValue = toNumber(overview?.projectedBalance?.value);
  const overdueIncomingCount = toNumber(operations?.alerts?.overdueIncomingCount);
  const overdueOutgoingCount = toNumber(operations?.alerts?.overdueOutgoingCount);

  const alerts: Array<{
    href: string;
    icon: ReactNode;
    label: string;
    tone: "amber" | "rose" | "sky" | "slate" | "violet";
  }> = [
    {
      href: operations?.alerts?.outgoingHref || "/admin/contas-a-pagar.html",
      icon: <BellIcon className="h-4 w-4" />,
      label: paymentsTodayItems.length
        ? `${paymentsTodayItems.length} ${paymentsTodayItems.length === 1 ? "conta vence hoje" : "contas vencem hoje"}`
        : "Nenhuma conta vence hoje",
      tone: paymentsTodayItems.length ? "amber" : "slate",
    },
    {
      href: operations?.alerts?.outgoingHref || "/admin/contas-a-pagar.html",
      icon: <AlertCircleIcon className="h-4 w-4" />,
      label: overdueOutgoingCount
        ? `${overdueOutgoingCount} ${overdueOutgoingCount === 1 ? "conta atrasada" : "contas atrasadas"}`
        : "Nenhuma conta atrasada",
      tone: overdueOutgoingCount ? "rose" : "slate",
    },
    {
      href: operations?.alerts?.incomingHref || "/admin/installments.html?status=overdue&due=month",
      icon: <HistoryIcon className="h-4 w-4" />,
      label: overdueIncomingCount
        ? `${overdueIncomingCount} ${overdueIncomingCount === 1 ? "recebimento atrasado" : "recebimentos atrasados"}`
        : "Nenhum recebimento atrasado",
      tone: overdueIncomingCount ? "amber" : "slate",
    },
    {
      href: overview?.projectedBalance?.href || "/app/visao-geral",
      icon: <PulseIcon className="h-4 w-4" />,
      label: projectedValue < 1000 ? `Saldo projetado < ${formatCurrency(1000)}` : `Saldo projetado: ${formatCurrency(projectedValue)}`,
      tone: projectedValue < 1000 ? "violet" : "sky",
    },
  ];

  return (
    <div className={`w-full max-w-[1600px] mx-auto ${initialLoading ? "opacity-90" : ""}`}>
      <section className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[clamp(2rem,1.2vw+1.2rem,2.45rem)] font-bold leading-[1.04] tracking-[-0.035em] text-slate-100">
            Visao geral
          </h1>
          <p className="mt-2 max-w-[54rem] text-[0.96rem] leading-[1.6] text-slate-300">
            Resumo do caixa, recebimentos e compromissos financeiros.
          </p>
        </div>
        <div className="grid gap-3 text-left lg:justify-items-end lg:text-right">
          <span className="inline-flex items-center rounded-full border border-sky-400/15 bg-slate-900/60 px-3 py-[0.34rem] text-[0.69rem] font-semibold text-slate-300">
            Periodo: {formatPeriodLabel(payload?.meta?.period)}
          </span>
          <div className="text-sm text-slate-400">
            Atualizado:{" "}
            <span className="font-semibold text-slate-200">
              {formatDateTime(payload?.meta?.generatedAt, payload?.meta?.timezone)}
            </span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          href={overview?.cashBalance?.href || "/dashboard.html"}
          icon={<WalletIcon className="h-[1.05rem] w-[1.05rem]" />}
          label="Saldo em caixa"
          meta={`Ajustes: ${formatCurrency(payload?.cashAdjustment?.net)}`}
          note={overview?.cashBalance?.note || "Disponivel agora"}
          tone="cash"
          value={formatCurrency(overview?.cashBalance?.value)}
        />
        <MetricCard
          href={overview?.accountsReceivable?.href || "/admin/contas-a-receber.html"}
          icon={<ArrowUpRightIcon className="h-[1.05rem] w-[1.05rem]" />}
          label="Contas a receber"
          meta={`Emprestimos: ${formatCurrency(overview?.accountsReceivable?.loanValue)} | Financeiro: ${formatCurrency(overview?.accountsReceivable?.financeValue)}`}
          note={overview?.accountsReceivable?.note || "Emprestimos + Financeiro"}
          tone="receivable"
          value={formatCurrency(overview?.accountsReceivable?.value)}
        />
        <MetricCard
          href={overview?.accountsPayable?.href || "/admin/contas-a-pagar.html"}
          icon={<ArrowDownLeftIcon className="h-[1.05rem] w-[1.05rem]" />}
          label="Contas a pagar"
          meta={`${toNumber(overview?.accountsPayable?.itemsCount)} lancamento(s) pendente(s)`}
          note={overview?.accountsPayable?.note || "Compromissos pendentes"}
          tone="payable"
          value={formatCurrency(overview?.accountsPayable?.value)}
        />
        <MetricCard
          href={overview?.projectedBalance?.href || "/app/visao-geral"}
          icon={<TrendUpIcon className="h-[1.05rem] w-[1.05rem]" />}
          label="Saldo previsto"
          meta={`Entradas: ${formatCurrency(overview?.projectedBalance?.receivableValue)} | Saidas: ${formatCurrency(overview?.projectedBalance?.payableValue)}`}
          note={overview?.projectedBalance?.note || "Apos entradas e saidas"}
          tone="projected"
          value={formatCurrency(overview?.projectedBalance?.value)}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1.15fr_.8fr]">
        <OperationPanel
          amountClassName="text-emerald-100"
          emptyNote="Quando houver parcelas ou contas a receber no dia, elas aparecem aqui."
          emptyTitle="Sem recebimentos previstos para hoje."
          items={receiptsTodayItems}
          note="Titulos previstos para entrada no dia atual."
          title="Recebimentos de hoje"
          totalValue={incomingValue}
        />
        <OperationPanel
          amountClassName="text-rose-100"
          emptyNote="Quando houver contas a pagar no dia, elas aparecem aqui."
          emptyTitle="Sem pagamentos previstos para hoje."
          items={paymentsTodayItems}
          note="Saidas financeiras previstas para hoje."
          title="Pagamentos de hoje"
          totalValue={outgoingValue}
        />
        <article className="relative overflow-hidden rounded-2xl border border-slate-700/30 bg-[linear-gradient(180deg,rgba(10,18,34,0.96),rgba(9,16,30,0.84))] p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_30%)] opacity-60" />
          <div className="relative z-10 grid gap-4">
            <div>
              <h3 className="text-[1.06rem] font-bold tracking-[-0.02em] text-slate-100">Alertas financeiros</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Leitura rapida dos compromissos e riscos do dia.</p>
            </div>
            <div className="grid gap-3">
              {alerts.map((alert) => (
                <FinancialAlert href={alert.href} icon={alert.icon} key={alert.label} label={alert.label} tone={alert.tone} />
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
        <article className="relative overflow-hidden rounded-2xl border border-slate-700/30 bg-[linear-gradient(180deg,rgba(10,18,34,0.96),rgba(9,16,30,0.84))] p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_30%)] opacity-60" />
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[1.06rem] font-bold tracking-[-0.02em] text-slate-100">Fluxo mensal</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">Leitura dos ultimos meses com recebido, em aberto e atraso.</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-sky-400/15 bg-slate-900/60 px-3 py-1 text-[0.72rem] font-bold text-indigo-200">
                Ultimos 6 meses
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-700/50 bg-slate-950/25 px-4 py-4">
                <p className="text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">Mes atual</p>
                <p className="mt-2 text-[1.42rem] font-bold tracking-[-0.03em] text-slate-100">{currentPoint ? formatCurrency(currentValue) : "--"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {currentPoint ? `${formatMetricLabel(chart?.metric)} em ${currentPoint.label || "mes atual"}.` : "Sem dados no periodo atual."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/50 bg-slate-950/25 px-4 py-4">
                <p className="text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">Comparativo</p>
                <p className="mt-2 text-[1.42rem] font-bold tracking-[-0.03em] text-slate-100">{previousPoint ? formatCurrency(previousValue) : "--"}</p>
                <p
                  className={`mt-2 text-sm leading-6 ${
                    flowInsight.tone === "positive"
                      ? "text-emerald-300"
                      : flowInsight.tone === "negative"
                        ? "text-rose-300"
                        : "text-slate-400"
                  }`}
                >
                  {previousPoint ? `${flowInsight.text} sobre ${previousPoint.label}.` : "Sem base anterior para comparativo."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/50 bg-slate-950/25 px-4 py-4">
                <p className="text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">Carteira do mes</p>
                <p className="mt-2 text-[1.42rem] font-bold tracking-[-0.03em] text-slate-100">{formatCurrency(exposure)}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Em aberto: {formatCurrency(currentPoint?.open)} | Atrasado: {formatCurrency(currentPoint?.overdue)}
                </p>
              </div>
            </div>
            <MonthlyFlowChart
              emptyMessage={chart?.emptyMessage || "Sem dados no periodo."}
              hasData={Boolean(chart?.hasData)}
              points={chartPoints}
            />
          </div>
        </article>

        <article className="relative overflow-hidden rounded-2xl border border-slate-700/30 bg-[linear-gradient(180deg,rgba(10,18,34,0.96),rgba(9,16,30,0.84))] p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_30%)] opacity-60" />
          <div className="relative z-10">
            <div>
              <h3 className="text-[1.06rem] font-bold tracking-[-0.02em] text-slate-100">Resumo do dia</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Entradas, saidas e projecao imediata do caixa.</p>
            </div>
            <div className="mt-5 grid gap-4">
              <DailySummaryCard
                href={overview?.accountsReceivable?.href || "/admin/contas-a-receber.html"}
                icon={<ArrowUpRightIcon className="h-4 w-4" />}
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
                href={overview?.accountsPayable?.href || "/admin/contas-a-pagar.html"}
                icon={<ArrowDownLeftIcon className="h-4 w-4" />}
                meta={
                  paymentsTodayItems.length
                    ? `${paymentsTodayItems.length} ${paymentsTodayItems.length === 1 ? "saida prevista para hoje." : "saidas previstas para hoje."}`
                    : "Nenhuma saida prevista para hoje."
                }
                title="Saidas previstas hoje"
                tone="outgoing"
                value={formatCurrency(outgoingValue)}
              />
              <DailySummaryCard
                href={overview?.projectedBalance?.href || "/app/visao-geral"}
                icon={<WalletIcon className="h-4 w-4" />}
                meta={`Caixa atual ${formatCurrency(cashBalance)} + entradas - saidas do dia.`}
                title="Saldo projetado do dia"
                tone="projected"
                value={formatCurrency(projectedDayValue)}
              />
            </div>
          </div>
        </article>
      </section>

      <section className="mt-4">
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
    </div>
  );
}

function EmptyState({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-950/30 px-4 py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-900/70 text-slate-400">
        <CalendarCheckIcon className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-semibold text-slate-100">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{note}</p>
    </div>
  );
}

function OperationPanel({
  title,
  note,
  totalValue,
  items,
  emptyTitle,
  emptyNote,
  amountClassName,
}: {
  title: string;
  note: string;
  totalValue: number;
  items: OperationItem[];
  emptyTitle: string;
  emptyNote: string;
  amountClassName: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-700/30 bg-[linear-gradient(180deg,rgba(10,18,34,0.96),rgba(9,16,30,0.84))] p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_30%)] opacity-60" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1.06rem] font-bold tracking-[-0.02em] text-slate-100">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{note}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-sky-400/15 bg-slate-900/70 px-3 py-1 text-[0.72rem] font-bold text-indigo-200">
          Total: {formatCurrency(totalValue)}
        </span>
      </div>

      <div className="relative z-10 mt-4 grid gap-3">
        {items.length === 0 ? (
          <EmptyState note={emptyNote} title={emptyTitle} />
        ) : (
          items.map((item, index) => (
            <Link
              className="rounded-2xl border border-slate-700/60 bg-slate-950/30 px-4 py-4 transition hover:-translate-y-0.5 hover:border-slate-500/50 hover:bg-slate-900/70"
              href={normalizeHref(item.href)}
              key={`${item.title || "item"}-${index}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="inline-flex min-h-[28px] items-center rounded-full border border-slate-600/60 bg-slate-900/80 px-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-200">
                      {item.typeLabel || "-"}
                    </span>
                    <span className="inline-flex min-h-[28px] items-center rounded-full border border-slate-700/60 bg-slate-950/70 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      {item.moduleLabel || "-"}
                    </span>
                  </div>
                  <p className="truncate text-base font-bold text-slate-50">{item.title || "-"}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{item.subtitle || "-"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-extrabold tracking-[-0.03em] ${amountClassName}`}>
                    {formatCurrency(item.amount)}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </article>
  );
}
