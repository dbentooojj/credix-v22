'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Info,
  Landmark,
  MessageCircle,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

import { useCashAdjustmentModal } from '../../../components/CashAdjustmentModalProvider';
import {
  ModalBase,
  ModalBtnGhost,
  ModalBtnPrimary,
  ModalField,
  modalInputClass,
} from '../../../components/ModalBase';
import { PageHeader } from '../../../components/PageHeader';
import { useToast } from '../../../components/ToastProvider';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

type QueueItem = {
  installmentId: number;
  installmentNumber: number;
  loanInstallmentsCount: number;
  loanId: number;
  debtorId: number;
  debtorName: string;
  phone: string;
  paymentMethod: string;
  amount: number;
  dueDate: string;
  dueRelative: string;
  status: 'ATRASADA' | 'VENCE_HOJE' | 'EM_DIA';
  statusLabel: string;
  statusColor: 'red' | 'yellow' | 'green';
  pixKey?: string | null;
};

type FinancialKpis = {
  cashBalance: number;
  cashAdjustmentNet: number;
  capitalInvested: number;
  totalLoaned: number;
  totalOriginated: number;
  totalToReceive: number;
  totalOpenReceivable: number;
  openReceivableFuture: number;
  openReceivableOverdue: number;
  contractedInterestOutstanding: number;
  totalReceived: number;
  receivedThisMonth: number;
  profitThisMonth: number;
  profitTotal: number;
  roiRate: number;
  totalOverdue: number;
  delinquencyRate: number;
  activeLoansCount: number;
  activeClientsCount: number;
  overdueInstallmentsCount: number;
  overdueClientsCount: number;
};

type ChartPoint = {
  label: string;
  loaned: number;
  received: number;
  value?: number;
  overdue: number;
  open: number;
};

type DashboardPayload = {
  meta?: {
    generatedAt?: string;
    timezone?: string;
  };
  kpis: FinancialKpis;
  portfolio?: {
    kpis?: Partial<FinancialKpis>;
    chart?: { points: ChartPoint[] };
  };
  chart: { points: ChartPoint[] };
  dailySummary: {
    dueToday: { count: number; totalValue: number };
    overdue: { count: number; totalValue: number };
    overdueThisMonth: { count: number; totalValue: number };
    next7Days: { count: number; totalValue: number };
  };
  upcomingDue: QueueItem[];
  overduePayments: QueueItem[];
};

type PaymentMethod = 'PIX' | 'DINHEIRO' | 'TRANSFERENCIA' | 'CARTAO';

const QUEUE_PAGE_SIZE = 4;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(toFiniteNumber(value));
}

function formatPercent(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toFiniteNumber(value) / 100);
}

function formatCompactCurrency(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toFiniteNumber(value));
}

function formatDate(isoDate: string) {
  const [year, month, day] = String(isoDate || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : '-';
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        aria-label={text}
        className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
        type="button"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium leading-5 text-slate-800 opacity-0 shadow-[0_12px_30px_rgba(15,23,42,0.14)] transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        role="tooltip"
      >
        {text}
      </span>
    </span>
  );
}

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function MetricCard({
  label,
  value,
  note,
  detail,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  detail?: string;
  icon: ReactNode;
  tone?: 'neutral' | 'emerald' | 'slate';
}) {
  const toneClasses = {
    neutral: 'bg-stone-100 text-stone-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-600',
  }[tone];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            {note ? <InfoHint text={note} /> : null}
          </div>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
          {detail ? <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p> : null}
        </div>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneClasses)}>
          {icon}
        </span>
      </div>
    </article>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function RiskStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rose-100 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function DeadlineCard({
  label,
  count,
  value,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  count: number;
  value: string;
  icon: ReactNode;
  tone?: 'neutral' | 'blue' | 'rose';
  onClick: () => void;
}) {
  const colors = {
    neutral: {
      card: 'border-slate-200 hover:border-slate-300',
      icon: 'bg-stone-100 text-stone-600',
    },
    blue: {
      card: 'border-blue-100 hover:border-blue-300',
      icon: 'bg-blue-50 text-[#4F7EF7]',
    },
    rose: {
      card: 'border-rose-200 hover:border-rose-300',
      icon: 'bg-rose-50 text-rose-600',
    },
  }[tone];

  return (
    <button
      className={cn(
        'group flex min-h-[96px] w-full items-center justify-between gap-4 rounded-2xl border bg-white p-4 text-left transition-all duration-150 hover:shadow-[0_4px_12px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7EF7]/30',
        colors.card,
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', colors.icon)}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-900">{label}</span>
          <span className="mt-1 block text-xs text-slate-500">
            {count} {count === 1 ? 'parcela' : 'parcelas'}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={cn('text-sm font-bold', tone === 'rose' ? 'text-rose-700' : 'text-slate-900')}>
          {value}
        </span>
        <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function statusClass(color: QueueItem['statusColor']) {
  return {
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    yellow: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[color];
}

function QueuePanel({
  title,
  items,
  totalItems,
  page,
  totalPages,
  emptyMessage,
  emptyIcon,
  badgeClassName,
  onPrevious,
  onNext,
  onViewAll,
  renderActions,
}: {
  title: string;
  items: QueueItem[];
  totalItems: number;
  page: number;
  totalPages: number;
  emptyMessage: string;
  emptyIcon: ReactNode;
  badgeClassName: string;
  onPrevious: () => void;
  onNext: () => void;
  onViewAll: () => void;
  renderActions: (item: QueueItem) => ReactNode;
}) {
  return (
    <article className="flex h-[460px] min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold', badgeClassName)}>
          {totalItems}
        </span>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="flex h-full min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-slate-500">
            {emptyIcon}
            <p className="mt-3 text-sm font-semibold">{emptyMessage}</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              className="rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300"
              key={item.installmentId}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold', statusClass(item.statusColor))}>
                      {item.statusLabel}
                    </span>
                    <span className="text-xs text-slate-400">{item.dueRelative}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-900">{item.debtorName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Parcela {item.installmentNumber}/{item.loanInstallmentsCount} · {formatDate(item.dueDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-2.5">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {renderActions(item)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        {totalPages > 1 ? (
          <>
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              disabled={page === 1}
              onClick={onPrevious}
              type="button"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">{page} de {totalPages}</span>
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              disabled={page === totalPages}
              onClick={onNext}
              type="button"
            >
              Próxima
            </button>
          </>
        ) : (
          <button
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 transition hover:text-stone-900"
            onClick={onViewAll}
            type="button"
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto w-full max-w-[1440px] animate-pulse space-y-5" aria-label="Carregando carteira">
      <div className="h-20 rounded-2xl bg-slate-100" />
      <div className="h-64 rounded-3xl bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div className="h-36 rounded-2xl bg-slate-100" key={item} />)}
      </div>
    </div>
  );
}

export default function CarteiraDashboardClient() {
  const router = useRouter();
  const toast = useToast();
  const { openCashAdjustmentModal } = useCashAdjustmentModal();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<'3m' | '6m' | '12m'>('6m');
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [overduePage, setOverduePage] = useState(1);
  const [paymentItem, setPaymentItem] = useState<QueueItem | null>(null);
  const [paymentDate, setPaymentDate] = useState(todayInputValue);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
      const response = await fetch(`/api/dashboard?period=${period}&metric=recebido&tz=${encodeURIComponent(timezone)}`, {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.replace('/login');
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || 'Não foi possível carregar os dados da carteira.');
      }

      const payload = await response.json() as DashboardPayload;
      setData(payload);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [period, router]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    setUpcomingPage(1);
    setOverduePage(1);
  }, [data?.upcomingDue.length, data?.overduePayments.length]);

  const kpis = useMemo<FinancialKpis>(() => ({
    ...(data?.kpis || {} as FinancialKpis),
    ...(data?.portfolio?.kpis || {}),
  }), [data]);

  const chart = data?.portfolio?.chart || data?.chart;
  const totalToReceive = kpis.totalToReceive ?? kpis.totalOpenReceivable ?? 0;
  const totalOverdue = kpis.totalOverdue ?? kpis.openReceivableOverdue ?? 0;
  const overdueInstallmentsCount = kpis.overdueInstallmentsCount ?? data?.dailySummary.overdue.count ?? 0;
  const activeLoansCount = kpis.activeLoansCount ?? 0;
  const activeClientsCount = kpis.activeClientsCount ?? 0;

  const upcomingItems = data?.upcomingDue || [];
  const overdueItems = data?.overduePayments || [];
  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingItems.length / QUEUE_PAGE_SIZE));
  const overdueTotalPages = Math.max(1, Math.ceil(overdueItems.length / QUEUE_PAGE_SIZE));
  const pagedUpcoming = upcomingItems.slice((upcomingPage - 1) * QUEUE_PAGE_SIZE, upcomingPage * QUEUE_PAGE_SIZE);
  const pagedOverdue = overdueItems.slice((overduePage - 1) * QUEUE_PAGE_SIZE, overduePage * QUEUE_PAGE_SIZE);

  const chartData = useMemo(() => ({
    labels: chart?.points.map((point) => point.label) || [],
    datasets: [
      {
        label: 'Emprestado',
        data: chart?.points.map((point) => point.loaned || 0) || [],
        backgroundColor: '#4F7EF7',
        borderRadius: 6,
        maxBarThickness: 30,
      },
      {
        label: 'Recebido',
        data: chart?.points.map((point) => point.received || point.value || 0) || [],
        backgroundColor: '#4f8a70',
        borderRadius: 6,
        maxBarThickness: 34,
      },
      {
        label: 'A receber',
        data: chart?.points.map((point) => point.open || 0) || [],
        backgroundColor: '#d6d3d1',
        borderRadius: 6,
        maxBarThickness: 34,
      },
      {
        label: 'Vencido',
        data: chart?.points.map((point) => point.overdue || 0) || [],
        backgroundColor: '#fb7185',
        borderRadius: 6,
        maxBarThickness: 34,
      },
    ],
  }), [chart]);

  const chartOptions = useMemo<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#292524',
        padding: 12,
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#78716c', font: { size: 11, weight: 600 } },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: 'rgba(231, 229, 228, 0.85)' },
        ticks: {
          color: '#a8a29e',
          font: { size: 11, weight: 600 },
          callback: (value) => formatCompactCurrency(value),
        },
      },
    },
  }), []);

  function goToInstallments(filters?: { period?: string; status?: string }) {
    const params = new URLSearchParams();
    if (filters?.period) params.set('period', filters.period);
    if (filters?.status) params.set('status', filters.status);
    router.push(params.size ? `/app/parcelas?${params}` : '/app/parcelas');
  }

  function normalizeWhatsAppPhone(rawPhone: string) {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits.length > 11 ? digits : '';
  }

  function handleWhatsApp(item: QueueItem) {
    const phone = normalizeWhatsAppPhone(item.phone);
    if (!phone) {
      toast.error('Cadastre um telefone válido para este cliente.', 'WhatsApp indisponível');
      return;
    }

    const message = `Olá, ${item.debtorName}. A parcela de ${formatCurrency(item.amount)}, vencida em ${formatDate(item.dueDate)}, está em aberto. Chave PIX: ${item.pixKey || 'não informada'}.`;
    const openedWindow = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    if (openedWindow) openedWindow.opener = null;
  }

  function openPaymentModal(item: QueueItem) {
    setPaymentItem(item);
    setPaymentDate(todayInputValue());
    setPaymentMethod((['PIX', 'DINHEIRO', 'TRANSFERENCIA', 'CARTAO'].includes(item.paymentMethod)
      ? item.paymentMethod
      : 'PIX') as PaymentMethod);
    setPaymentError('');
  }

  function closePaymentModal() {
    if (paymentSaving) return;
    setPaymentItem(null);
    setPaymentError('');
  }

  async function handleMarkPaid() {
    if (!paymentItem || !paymentDate) {
      setPaymentError('Informe a data do recebimento.');
      return;
    }

    setPaymentSaving(true);
    setPaymentError('');

    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          loanId: paymentItem.loanId,
          installmentId: paymentItem.installmentId,
          amount: paymentItem.amount,
          paymentDate,
          method: paymentMethod,
          notes: 'Recebimento registrado pela Carteira',
        }),
      });

      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || 'Não foi possível baixar a parcela.');

      setPaymentItem(null);
      toast.success('A parcela foi baixada e os indicadores foram atualizados.', 'Recebimento confirmado');
      await fetchDashboard(true);
    } catch (nextError) {
      setPaymentError(nextError instanceof Error ? nextError.message : 'Não foi possível baixar a parcela.');
    } finally {
      setPaymentSaving(false);
    }
  }

  if (loading && !data) return <LoadingState />;

  if (!data) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-xl items-center justify-center">
        <div className="w-full rounded-2xl border border-rose-200 bg-white p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">Não foi possível abrir a Carteira</h1>
          <p className="mt-2 text-sm text-slate-500">{error || 'Tente carregar os dados novamente.'}</p>
          <button
            className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            onClick={() => void fetchDashboard()}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const hasChartData = chartData.datasets.some((dataset) => dataset.data.some((value) => toFiniteNumber(value) > 0));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-24 lg:pb-8">
      <PageHeader title="Carteira" />

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{error}</span>
          <button className="shrink-0 font-semibold underline" onClick={() => void fetchDashboard(true)} type="button">
            Tentar novamente
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr_1fr] lg:items-end lg:p-8">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                <Landmark className="h-4 w-4" />
              </span>
              Saldo em caixa
            </div>
            <p className={cn(
              'mt-4 break-words text-4xl font-bold tracking-[-0.04em] sm:text-5xl',
              kpis.cashBalance < 0 ? 'text-rose-600' : 'text-slate-950',
            )}>
              {formatCurrency(kpis.cashBalance)}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => openCashAdjustmentModal({ onSuccess: () => void fetchDashboard(true) })}
                type="button"
              >
                <Banknote className="h-4 w-4" />
                Alterar caixa
              </button>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <HeroStat label="Total já emprestado" value={formatCurrency(kpis.totalOriginated)} />
            <HeroStat label="Empréstimos ativos" value={String(activeLoansCount)} />
            <HeroStat label="Clientes ativos" value={String(activeClientsCount)} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<BriefcaseBusiness className="h-5 w-5" />}
          label="Capital em aberto"
          note="Principal ainda alocado nos empréstimos ativos."
          value={formatCurrency(kpis.totalLoaned)}
        />
        <MetricCard
          icon={<CircleDollarSign className="h-5 w-5" />}
          label="Total a receber"
          note="Soma do principal e dos juros de todas as parcelas ainda abertas."
          detail={`${formatCurrency(kpis.contractedInterestOutstanding)} em juros futuros`}
          tone="slate"
          value={formatCurrency(totalToReceive)}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Valor recebido"
          detail={`${formatCurrency(kpis.receivedThisMonth)} recebido no mês atual`}
          tone="emerald"
          value={formatCurrency(kpis.totalReceived)}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Lucro realizado"
          note="Somente juros efetivamente recebidos; principal devolvido não entra no lucro."
          tone="emerald"
          value={formatCurrency(kpis.profitTotal)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-rose-700">
                <ShieldAlert className="h-5 w-5" />
                <h2 className="font-bold">Inadimplência</h2>
                <InfoHint text="Considera somente parcelas vencidas antes de hoje e ainda não pagas." />
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-rose-700">{formatCurrency(totalOverdue)}</p>
            </div>
            <button
              className="inline-flex items-center gap-2 self-start rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
              onClick={() => goToInstallments({ status: 'atrasado' })}
              type="button"
            >
              Ver cobranças
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <RiskStat label="Parcelas vencidas" value={String(overdueInstallmentsCount)} />
            <RiskStat label="Clientes em atraso" value={String(kpis.overdueClientsCount ?? 0)} />
            <RiskStat label="Taxa de inadimplência" value={formatPercent(kpis.delinquencyRate)} />
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 text-slate-900">
            <TrendingUp className="h-5 w-5 text-emerald-700" />
            <h2 className="font-bold">ROI da carteira</h2>
            <InfoHint text={`Lucro realizado ÷ capital total originado (${formatCurrency(kpis.totalOriginated)}). A devolução do principal não entra no lucro.`} />
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{formatPercent(kpis.roiRate)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs text-slate-500">Lucro no mês</p>
              <p className="mt-1 font-bold text-slate-900">{formatCurrency(kpis.profitThisMonth)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">A receber sem atraso</p>
              <p className="mt-1 font-bold text-slate-900">{formatCurrency(Math.max(totalToReceive - totalOverdue, 0))}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <DeadlineCard
          count={data.dailySummary.dueToday.count}
          icon={<Clock3 className="h-5 w-5" />}
          label="Vence hoje"
          onClick={() => goToInstallments({ period: 'today', status: 'pendente' })}
          value={formatCurrency(data.dailySummary.dueToday.totalValue)}
        />
        <DeadlineCard
          count={data.dailySummary.next7Days.count}
          icon={<CalendarDays className="h-5 w-5" />}
          label="Próximos 7 dias"
          onClick={() => goToInstallments({ period: 'next7', status: 'pendente' })}
          tone="blue"
          value={formatCurrency(data.dailySummary.next7Days.totalValue)}
        />
        <DeadlineCard
          count={data.dailySummary.overdueThisMonth.count}
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Vencido no mês"
          onClick={() => goToInstallments({ period: 'month_current', status: 'atrasado' })}
          tone="rose"
          value={formatCurrency(data.dailySummary.overdueThisMonth.totalValue)}
        />
      </section>

      <section>
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-bold text-slate-900">Movimento da carteira</h2>
            <select
              aria-label="Período do gráfico"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 outline-none focus:border-emerald-600"
              onChange={(event) => setPeriod(event.target.value as '3m' | '6m' | '12m')}
              value={period}
            >
              <option value="3m">3 meses</option>
              <option value="6m">6 meses</option>
              <option value="12m">12 meses</option>
            </select>
          </div>
          <div className="mt-4 h-[280px] min-w-0 sm:h-[320px]">
            {hasChartData ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-slate-500">
                <TrendingUp className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold">Sem movimentação no período</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#4F7EF7]" />Emprestado</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#4f8a70]" />Recebido</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-stone-300" />A receber</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />Vencido</span>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <QueuePanel
          badgeClassName="border-stone-200 bg-stone-50 text-stone-700"
          emptyIcon={<CalendarDays className="h-8 w-8 text-slate-300" />}
          emptyMessage="Nenhum vencimento próximo."
          items={pagedUpcoming}
          onNext={() => setUpcomingPage((current) => Math.min(upcomingTotalPages, current + 1))}
          onPrevious={() => setUpcomingPage((current) => Math.max(1, current - 1))}
          onViewAll={() => goToInstallments({ period: 'next7', status: 'pendente' })}
          page={upcomingPage}
          renderActions={(item) => (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              onClick={() => openPaymentModal(item)}
              type="button"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Baixar parcela
            </button>
          )}
          title="Próximos vencimentos"
          totalItems={upcomingItems.length}
          totalPages={upcomingTotalPages}
        />

        <QueuePanel
          badgeClassName="border-rose-200 bg-rose-50 text-rose-700"
          emptyIcon={<CheckCircle2 className="h-8 w-8 text-emerald-400" />}
          emptyMessage="Nenhuma cobrança em atraso."
          items={pagedOverdue}
          onNext={() => setOverduePage((current) => Math.min(overdueTotalPages, current + 1))}
          onPrevious={() => setOverduePage((current) => Math.max(1, current - 1))}
          onViewAll={() => goToInstallments({ status: 'atrasado' })}
          page={overduePage}
          renderActions={(item) => (
            <>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                onClick={() => handleWhatsApp(item)}
                type="button"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Cobrar
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                onClick={() => openPaymentModal(item)}
                type="button"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Baixar parcela
              </button>
            </>
          )}
          title="Cobranças em atraso"
          totalItems={overdueItems.length}
          totalPages={overdueTotalPages}
        />
      </section>

      <ModalBase
        footer={(
          <>
            <ModalBtnGhost disabled={paymentSaving} onClick={closePaymentModal}>Cancelar</ModalBtnGhost>
            <ModalBtnPrimary disabled={paymentSaving} onClick={() => void handleMarkPaid()} variant="emerald">
              {paymentSaving ? 'Salvando...' : 'Confirmar recebimento'}
            </ModalBtnPrimary>
          </>
        )}
        onClose={closePaymentModal}
        open={Boolean(paymentItem)}
        size="max-w-md"
        subtitle="A baixa atualiza o caixa, o saldo a receber e os indicadores da carteira."
        title="Baixar parcela"
      >
        {paymentItem ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{paymentItem.debtorName}</p>
                  <p className="mt-1 text-xs text-slate-500">Parcela {paymentItem.installmentNumber}/{paymentItem.loanInstallmentsCount}</p>
                </div>
                <p className="shrink-0 text-lg font-bold text-emerald-700">{formatCurrency(paymentItem.amount)}</p>
              </div>
            </div>

            <ModalField label="Data do recebimento">
              <input className={modalInputClass} disabled={paymentSaving} onChange={(event) => setPaymentDate(event.target.value)} type="date" value={paymentDate} />
            </ModalField>

            <ModalField label="Forma de pagamento">
              <select className={modalInputClass} disabled={paymentSaving} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} value={paymentMethod}>
                <option value="PIX">PIX</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="CARTAO">Cartão</option>
              </select>
            </ModalField>

            {paymentError ? (
              <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </ModalBase>
    </div>
  );
}
