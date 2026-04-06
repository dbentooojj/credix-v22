'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  MessageCircle,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

type InsightTone = 'positive' | 'negative' | 'neutral';

type KpiInsight = {
  text: string;
  tone: InsightTone;
};

type KpiCardData = {
  currentValue: number;
  previousValue: number;
  series: Array<{ label: string; value: number }>;
  insight?: KpiInsight;
};

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
  paymentLink?: string | null;
  virtualStatus?: 'PENDING' | 'OVERDUE';
};

type DashboardPayload = {
  meta?: {
    generatedAt?: string;
    timezone?: string;
    period?: string;
    metric?: string;
  };
  kpis: {
    cashBalance: number;
    cashAdjustmentNet: number;
    openReceivableOverdue: number;
    openReceivableFuture: number;
    totalOpenReceivable: number;
    receivedThisMonth: number;
    profitThisMonth: number;
    totalLoaned: number;
    delinquencyRate: number;
    roiRate: number;
    profitTotal: number;
    totalOverdue: number;
  };
  dailySummary: {
    dueToday: { count: number; totalValue: number; href?: string };
    overdue: { count: number; totalValue: number; href?: string };
    next7Days: { count: number; totalValue: number; href?: string };
  };
  chart: {
    points: Array<{
      label: string;
      received: number;
      value?: number;
      overdue: number;
      open: number;
    }>;
  };
  portfolio?: {
    kpis?: {
      openReceivableOverdue: number;
      openReceivableFuture: number;
      totalOpenReceivable: number;
      receivedThisMonth: number;
      totalReceived?: number;
      profitThisMonth: number;
      totalLoaned: number;
      delinquencyRate: number;
      roiRate: number;
      profitTotal: number;
      totalOverdue: number;
    };
    chart?: {
      points: Array<{
        label: string;
        received: number;
        value?: number;
        overdue: number;
        open: number;
      }>;
    };
    kpiCards?: Record<string, KpiCardData | undefined>;
  };
  upcomingDue: QueueItem[];
  overduePayments: QueueItem[];
  kpiCards: Record<string, KpiCardData | undefined>;
};

type HealthMetrics = {
  recoveryRate: number;
  overdueCount: number;
  riskContracts: number;
  avgTicket: number;
  avgInstallment: number;
  totalOverdue: number;
  hasPortfolioBase: boolean;
};

const QUEUE_PAGE_SIZE = 4;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
  }).format((value || 0) / 100);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatDateShort(isoDate: string) {
  if (!isoDate) return '-';
  const [year, month, day] = isoDate.split('-');
  if (!day || !month) return isoDate;
  return `${day}/${month}`;
}

function formatDateFull(isoDate: string) {
  if (!isoDate) return '-';
  const [year, month, day] = isoDate.split('-');
  if (!day || !month || !year) return isoDate;
  return `${day}/${month}/${year}`;
}

function formatPeriodLabel(period: string) {
  return {
    '3m': 'Ultimos 3 meses',
    '6m': 'Ultimos 6 meses',
    '12m': 'Ultimos 12 meses',
  }[period] || 'Ultimos meses';
}

function buildDelta(current: number, previous: number) {
  if (Math.abs(previous) < 0.00001) {
    if (Math.abs(current) < 0.00001) {
      return {
        value: '0,00%',
        tone: 'neutral' as const,
        note: 'Sem variacao relevante.',
      };
    }

    return {
      value: 'Sem base',
      tone: 'neutral' as const,
      note: 'Ainda nao existe base anterior para comparar.',
    };
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(delta) < 0.005) {
    return {
      value: '0,00%',
      tone: 'neutral' as const,
      note: 'Mesmo ritmo do mes anterior.',
    };
  }

  const deltaText = Math.abs(delta).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    value: `${delta > 0 ? '+' : '-'}${deltaText}%`,
    tone: delta > 0 ? ('positive' as const) : ('negative' as const),
    note: delta > 0 ? 'Acima do mes anterior.' : 'Abaixo do mes anterior.',
  };
}

function getToneTextClass(tone?: InsightTone) {
  return {
    positive: 'text-emerald-600',
    negative: 'text-rose-500',
    neutral: 'text-slate-500',
  }[tone || 'neutral'];
}

function getHealthDescriptor(score: number) {
  if (score >= 80) {
    return {
      label: 'Saudavel',
      note: 'Boa recuperacao com pressao baixa de atraso.',
      chip: 'border-emerald-200 bg-emerald-50 text-emerald-600',
      bar: 'bg-emerald-500',
      value: 'text-emerald-600',
    };
  }

  if (score >= 60) {
    return {
      label: 'Estavel',
      note: 'A carteira segue controlada, mas pede acompanhamento.',
      chip: 'border-sky-200 bg-sky-50 text-sky-600',
      bar: 'bg-sky-500',
      value: 'text-sky-600',
    };
  }

  if (score >= 40) {
    return {
      label: 'Atencao',
      note: 'O atraso comeca a pressionar o fluxo esperado.',
      chip: 'border-amber-200 bg-amber-50 text-amber-700',
      bar: 'bg-amber-500',
      value: 'text-amber-700',
    };
  }

  return {
    label: 'Critico',
    note: 'A carteira exige cobranca ativa e revisao imediata.',
    chip: 'border-rose-200 bg-rose-50 text-rose-600',
    bar: 'bg-rose-500',
    value: 'text-rose-600',
  };
}

function getHealthEmptyDescriptor() {
  return {
    label: 'Sem base',
    note: 'Ainda nao ha dados suficientes para avaliar a saude da carteira.',
    chip: 'border-slate-200 bg-slate-100 text-slate-500',
    bar: 'bg-slate-300',
    value: 'text-slate-500',
  };
}

function getStatusPillClass(statusColor: QueueItem['statusColor']) {
  return {
    red: 'border-rose-200 bg-rose-50 text-rose-600',
    yellow: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-600',
  }[statusColor];
}

function SmallMetricCard({
  label,
  value,
  note,
  icon,
  accent,
  valueClassName,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  accent: string;
  valueClassName?: string;
}) {
  return (
    <article className="self-start rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className={cn('mt-2.5 text-[1.75rem] font-bold tracking-tight text-slate-800', valueClassName)}>{value}</p>
        </div>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', accent)}>{icon}</span>
      </div>
      <p className="mt-2.5 text-sm text-slate-500">{note}</p>
    </article>
  );
}

function SupportMetricCard({
  label,
  value,
  note,
  valueClassName,
}: {
  label: string;
  value: string;
  note: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={cn('mt-2 text-[1.35rem] font-bold tracking-tight text-slate-800', valueClassName)}>{value}</p>
      <p className="mt-1.5 text-sm text-slate-500">{note}</p>
    </div>
  );
}

function ActionCard({
  label,
  count,
  value,
  note,
  cta,
  icon,
  toneClassName,
  iconClassName,
  onClick,
}: {
  label: string;
  count: string;
  value: string;
  note: string;
  cta: string;
  icon: React.ReactNode;
  toneClassName: string;
  iconClassName: string;
  onClick: () => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className={cn('mt-3 text-[2rem] font-bold leading-none tracking-tight', toneClassName)}>{count}</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{note}</p>
        </div>
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', iconClassName)}>{icon}</span>
      </div>
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#4F7EF7]/30 hover:bg-[#4F7EF7]/5 hover:text-[#4F7EF7]"
        onClick={onClick}
        type="button"
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </button>
    </article>
  );
}

export default function CarteiraDashboardClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [period, setPeriod] = useState<'3m' | '6m' | '12m'>('6m');
  const [chartView, setChartView] = useState<'line' | 'stacked'>('line');
  const [error, setError] = useState('');
  const [paymentItem, setPaymentItem] = useState<QueueItem | null>(null);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [overduePage, setOverduePage] = useState(1);
  const metric = 'recebido';

  const normalizeWhatsAppPhone = (rawPhone: string) => {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    if (digits.length > 11) return digits;
    return '';
  };

  const handleWhatsApp = (item: QueueItem) => {
    const phone = normalizeWhatsAppPhone(item?.phone);
    if (!phone) {
      alert('Cliente sem telefone valido para WhatsApp');
      return;
    }

    const text = `Ola, ${item.debtorName || ''}. Parcela em aberto: ${formatCurrency(item.amount)} (venc. ${formatDateShort(item.dueDate)}). Chave PIX: ${item.pixKey || 'nao informado'}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
      const response = await fetch(`/api/dashboard?period=${period}&metric=${metric}&tz=${tz}`);
      if (!response.ok) throw new Error('Falha ao carregar dashboard');
      const payload: DashboardPayload = await response.json();
      setData(payload);
    } catch (nextError: any) {
      setError(nextError.message || 'Erro de conexao');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!paymentItem) return;

    const fd = new FormData(e.currentTarget);
    const postData = {
      loanId: paymentItem.loanId,
      installmentId: paymentItem.installmentId,
      amount: paymentItem.amount,
      paymentDate: fd.get('paymentDate'),
      method: fd.get('method'),
      notes: 'Atualizado via dashboard NextJS',
    };

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });

      if (!res.ok) throw new Error('Falha ao baixar parcela');
      setPaymentItem(null);
      fetchDashboard();
    } catch {
      alert('Erro ao marcar pagamento.');
    }
  };

  useEffect(() => {
    void fetchDashboard();
  }, [period]);

  useEffect(() => {
    setUpcomingPage(1);
    setOverduePage(1);
  }, [data?.upcomingDue?.length, data?.overduePayments?.length]);

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const kpis = data?.portfolio?.kpis || data?.kpis || ({} as DashboardPayload['kpis']);
  const kpiCards = data?.portfolio?.kpiCards || data?.kpiCards || {};
  const chart = data?.portfolio?.chart || data?.chart;
  const receivableBase = (kpis.receivedThisMonth || 0) + (kpis.totalOpenReceivable || 0);
  const recoveryRate = receivableBase > 0 ? ((kpis.receivedThisMonth || 0) / receivableBase) * 100 : 0;
  const normalizedDelinquency = Math.max(0, Math.min(100, kpis.delinquencyRate || 0));

  const receivedKpi = kpiCards.receivedThisMonth;
  const profitKpi = kpiCards.profitThisMonth;
  const totalLoanedKpi = kpiCards.totalLoaned;
  const receivedDelta = buildDelta(receivedKpi?.currentValue ?? kpis.receivedThisMonth ?? 0, receivedKpi?.previousValue ?? 0);

  const health = useMemo<HealthMetrics | null>(() => {
    if (!data) return null;

    const upcoming = data.upcomingDue || [];
    const overdue = data.overduePayments || [];
    const overdueCount = overdue.length;
    const riskContracts = overdue.length;
    const totalOpenReceivable = kpis.totalOpenReceivable ?? 0;
    const receivedThisMonth = kpis.receivedThisMonth ?? 0;
    const totalLoaned = kpis.totalLoaned ?? 0;
    const totalOverdue = kpis.openReceivableOverdue ?? kpis.totalOverdue ?? 0;
    const receivablePool = receivedThisMonth + totalOpenReceivable;
    const recovery = receivablePool > 0 ? (receivedThisMonth / receivablePool) * 100 : 0;
    const hasPortfolioBase = totalLoaned > 0 || totalOpenReceivable > 0 || receivedThisMonth > 0;
    const loanIds = new Set([...upcoming, ...overdue].map((item) => Number(item.loanId || 0)).filter((id) => id > 0));
    const installmentCount = upcoming.length + overdue.length;

    return {
      recoveryRate: recovery,
      overdueCount,
      riskContracts,
      avgTicket: loanIds.size > 0 ? totalLoaned / loanIds.size : 0,
      avgInstallment: installmentCount > 0 ? totalOpenReceivable / installmentCount : 0,
      totalOverdue,
      hasPortfolioBase,
    };
  }, [data, kpis]);

  const healthScore = health?.hasPortfolioBase
    ? Math.round((Math.max(0, Math.min(recoveryRate, 100)) * 0.62) + ((100 - normalizedDelinquency) * 0.38))
    : null;
  const healthDescriptor = health?.hasPortfolioBase
    ? getHealthDescriptor(healthScore ?? 0)
    : getHealthEmptyDescriptor();

  const upcomingItems = data?.upcomingDue || [];
  const overdueItems = data?.overduePayments || [];
  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingItems.length / QUEUE_PAGE_SIZE));
  const overdueTotalPages = Math.max(1, Math.ceil(overdueItems.length / QUEUE_PAGE_SIZE));

  const pagedUpcomingItems = useMemo(() => {
    const start = (upcomingPage - 1) * QUEUE_PAGE_SIZE;
    return upcomingItems.slice(start, start + QUEUE_PAGE_SIZE);
  }, [upcomingItems, upcomingPage]);

  const pagedOverdueItems = useMemo(() => {
    const start = (overduePage - 1) * QUEUE_PAGE_SIZE;
    return overdueItems.slice(start, start + QUEUE_PAGE_SIZE);
  }, [overdueItems, overduePage]);

  const renderChart = () => {
    if (!chart?.points) return null;

    const labels = chart.points.map((point) => point.label);
    const receivedData = chart.points.map((point) => point.received || point.value || 0);
    const overdueData = chart.points.map((point) => point.overdue || 0);
    const openData = chart.points.map((point) => point.open || 0);
    const lastIndex = Math.max(0, labels.length - 1);
    const isStacked = chartView === 'stacked';

    const currentMonthHighlightPlugin = {
      id: 'current-month-highlight',
      beforeDatasetsDraw(chart: any) {
        const { ctx, chartArea, scales } = chart;
        const xScale = scales?.x;
        if (!ctx || !chartArea || !xScale || labels.length === 0) return;

        const currentX = xScale.getPixelForValue(lastIndex);
        const previousX = lastIndex > 0 ? xScale.getPixelForValue(lastIndex - 1) : chartArea.left;
        const span = lastIndex > 0 ? currentX - previousX : chartArea.right - chartArea.left;
        const bandWidth = Math.max(44, Math.min(88, span * 0.76));

        ctx.save();
        ctx.fillStyle = 'rgba(37, 99, 235, 0.06)';
        ctx.fillRect(currentX - bandWidth / 2, chartArea.top, bandWidth, chartArea.bottom - chartArea.top);
        ctx.restore();
      },
    };

    const datasetsLine = [
      {
        label: 'Recebido',
        data: receivedData,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointRadius: (context: any) => (context.dataIndex === lastIndex ? 5 : 3),
        pointHoverRadius: 6,
        pointBackgroundColor: (context: any) => (context.dataIndex === lastIndex ? '#1d4ed8' : '#2563eb'),
        pointBorderColor: '#ffffff',
        pointBorderWidth: (context: any) => (context.dataIndex === lastIndex ? 3 : 2),
      },
      {
        label: 'Em aberto',
        data: openData,
        borderColor: '#22c55e',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 6],
        fill: false,
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'Em atraso',
        data: overdueData,
        borderColor: '#f43f5e',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [4, 6],
        fill: false,
        tension: 0.3,
        pointRadius: 0,
      },
    ];

    const datasetsBar = [
      { label: 'Recebido', data: receivedData, backgroundColor: '#2563eb', borderRadius: 10, maxBarThickness: 28 },
      { label: 'Em aberto', data: openData, backgroundColor: '#22c55e', borderRadius: 10, maxBarThickness: 28 },
      { label: 'Em atraso', data: overdueData, backgroundColor: '#f43f5e', borderRadius: 10, maxBarThickness: 28 },
    ];

    const chartData = {
      labels,
      datasets: isStacked ? datasetsBar : datasetsLine,
    };

    const options: any = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          titleColor: '#0f172a',
          bodyColor: '#334155',
          borderColor: 'rgba(226, 232, 240, 0.95)',
          borderWidth: 1,
          padding: 12,
          titleFont: { weight: '700' },
          callbacks: {
            title: (items: any) => {
              if (!items?.length) return '';
              return `${items[0].label} • ${items[0].dataIndex === lastIndex ? 'mes atual' : 'historico'}`;
            },
            label: (context: any) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          stacked: isStacked,
          ticks: { color: '#64748b', font: { size: 11, weight: '600' } },
          grid: { display: false, drawBorder: false },
          border: { display: false },
        },
        y: {
          stacked: isStacked,
          ticks: {
            color: '#94a3b8',
            font: { size: 11, weight: '600' },
            callback: (value: number) => `R$ ${formatCompactNumber(Number(value))}`,
          },
          grid: { color: 'rgba(226, 232, 240, 0.8)', drawBorder: false },
          border: { display: false },
        },
      },
    };

    if (isStacked) {
      return <Bar data={chartData as any} options={options} plugins={[currentMonthHighlightPlugin]} />;
    }

    return <Line data={chartData as any} options={options} plugins={[currentMonthHighlightPlugin]} />;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-12 text-blue-500">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-3 font-semibold">Carregando painel...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
        <AlertCircle className="mb-2 h-6 w-6" />
        <p>{error}</p>
        <button
          className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2 font-medium text-rose-700 transition-colors hover:bg-rose-100"
          onClick={fetchDashboard}
          type="button"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1600px] space-y-6 bg-transparent pb-24 font-sans lg:pb-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-slate-400">Carteira de emprestimos</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800 sm:text-[2rem]">Painel da carteira</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
            Tela operacional para acompanhar cobranca, vencimentos, retorno e pressao de risco da carteira.
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <article className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_55%,#eef4ff_100%)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="grid gap-5 xl:grid-cols-[1.35fr_.95fr] xl:items-start">
            <div className="max-w-none">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-slate-400">Visao imediata da carteira</p>
              <h3 className="mt-2 text-[1.15rem] font-bold text-slate-800">A receber</h3>
              <p className="mt-2 text-sm text-slate-500">
                Total aberto da carteira somando parcelas futuras e parcelas em atraso.
              </p>
              <p className="mt-6 text-[2.9rem] font-bold leading-none tracking-tight text-slate-900">
                {formatCurrency(kpis.totalOpenReceivable || 0)}
              </p>
              <p className="mt-3 text-sm text-slate-500">
                Caixa previsto da carteira ativa no curto prazo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">A vencer</p>
                <p className="mt-2 text-[1.8rem] font-bold tracking-tight text-slate-800">
                  {formatCurrency(kpis.openReceivableFuture || 0)}
                </p>
                <p className="mt-1.5 text-sm text-slate-500">Parcelas em dia aguardando vencimento.</p>
              </div>

              <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-rose-400">Em atraso</p>
                <p className="mt-2 text-[1.8rem] font-bold tracking-tight text-rose-600">
                  {formatCurrency(kpis.openReceivableOverdue || 0)}
                </p>
                <p className="mt-1.5 text-sm text-rose-500">Exige cobranca e acompanhamento mais proximo.</p>
              </div>
            </div>
          </div>
        </article>

        <div className="grid gap-4 md:grid-cols-2">
          <SmallMetricCard
            accent="bg-emerald-50 text-emerald-600"
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Recebido no mes"
            note={receivedKpi?.insight?.text || 'Volume que ja retornou para o caixa neste mes.'}
            value={formatCurrency(kpis.receivedThisMonth || 0)}
          />
          <SmallMetricCard
            accent="bg-violet-50 text-violet-600"
            icon={<TrendingUp className="h-4 w-4" />}
            label="Lucro do mes"
            note={profitKpi?.insight?.text || 'Resultado gerado pelas baixas do periodo atual.'}
            value={formatCurrency(kpis.profitThisMonth || 0)}
          />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <SupportMetricCard
          label="Total emprestado"
          note={
            totalLoanedKpi?.previousValue
              ? `Base anterior: ${formatCurrency(totalLoanedKpi.previousValue)}`
              : 'Capital total alocado na carteira.'
          }
          value={formatCurrency(kpis.totalLoaned || 0)}
        />
        <SupportMetricCard
          label="Retorno total"
          note={`ROI acumulado: ${formatPercent(kpis.roiRate || 0)}`}
          value={formatCurrency(kpis.profitTotal || 0)}
          valueClassName="text-[#4F7EF7]"
        />
        <SupportMetricCard
          label="Taxa de inadimplencia"
          note="Percentual do atraso sobre o total aberto da carteira."
          value={formatPercent(kpis.delinquencyRate || 0)}
          valueClassName="text-rose-600"
        />
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.07)]">
        <div className="mb-5 flex flex-col gap-1">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-slate-400">Acoes do dia</p>
          <h3 className="text-[1.15rem] font-bold text-slate-800">O que pede atencao agora</h3>
          <p className="text-sm text-slate-500">Prioridades operacionais para baixar, cobrar e planejar os proximos dias.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <ActionCard
            cta="Abrir fila"
            count={String(data?.dailySummary?.dueToday?.count || 0)}
            icon={<Clock className="h-5 w-5" />}
            iconClassName="bg-blue-50 text-blue-600"
            label="Vence hoje"
            note="Parcelas prontas para baixa no dia."
            onClick={() => scrollToSection('queue-upcoming')}
            toneClassName="text-blue-600"
            value={formatCurrency(data?.dailySummary?.dueToday?.totalValue || 0)}
          />
          <ActionCard
            cta="Ir para cobrancas"
            count={String(data?.dailySummary?.overdue?.count || 0)}
            icon={<AlertTriangle className="h-5 w-5" />}
            iconClassName="bg-rose-50 text-rose-600"
            label="Em atraso"
            note="Titulos que precisam de cobranca e baixa."
            onClick={() => scrollToSection('queue-overdue')}
            toneClassName="text-rose-600"
            value={formatCurrency(data?.dailySummary?.overdue?.totalValue || 0)}
          />
          <ActionCard
            cta="Planejar semana"
            count={String(data?.dailySummary?.next7Days?.count || 0)}
            icon={<Calendar className="h-5 w-5" />}
            iconClassName="bg-amber-50 text-amber-700"
            label="Proximos 7 dias"
            note="Antecipe contatos e confirme entradas da semana."
            onClick={() => scrollToSection('queue-upcoming')}
            toneClassName="text-amber-700"
            value={formatCurrency(data?.dailySummary?.next7Days?.totalValue || 0)}
          />
        </div>
      </section>

      {health ? (
        <section className="grid gap-5 xl:grid-cols-[1.55fr_.95fr]">
          <article className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[1.15rem] font-bold text-slate-800">Performance mensal da carteira</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Recebido como serie principal, com apoio de aberto e atraso por mes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                      chartView === 'line' ? 'bg-[#4F7EF7] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
                    )}
                    onClick={() => setChartView('line')}
                    type="button"
                  >
                    Linha
                  </button>
                  <button
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                      chartView === 'stacked' ? 'bg-[#4F7EF7] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
                    )}
                    onClick={() => setChartView('stacked')}
                    type="button"
                  >
                    Barras
                  </button>
                </div>

                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-[#4F7EF7]"
                  onChange={(event) => setPeriod(event.target.value as '3m' | '6m' | '12m')}
                  value={period}
                >
                  <option value="3m">3 meses</option>
                  <option value="6m">6 meses</option>
                  <option value="12m">12 meses</option>
                </select>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">Recebido no mes</p>
                <p className="mt-2 text-[2rem] font-bold tracking-tight text-slate-800">
                  {formatCurrency(receivedKpi?.currentValue ?? kpis.receivedThisMonth ?? 0)}
                </p>
                <p className={cn('mt-2 text-sm font-semibold', getToneTextClass(receivedKpi?.insight?.tone))}>
                  {receivedKpi?.insight?.text || 'Sem insight adicional para o periodo.'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">Variacao vs mes anterior</p>
                <p className={cn('mt-2 text-[2rem] font-bold tracking-tight', getToneTextClass(receivedDelta.tone))}>
                  {receivedDelta.value}
                </p>
                <p className={cn('mt-2 text-sm font-semibold', getToneTextClass(receivedDelta.tone))}>{receivedDelta.note}</p>
                <p className="mt-1.5 text-sm text-slate-500">
                  Atual: {formatCurrency(receivedKpi?.currentValue ?? kpis.receivedThisMonth ?? 0)} | Anterior:{' '}
                  {formatCurrency(receivedKpi?.previousValue ?? 0)}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">Escala em R$</p>
                <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                  {formatPeriodLabel(period)}
                </span>
              </div>

              <div className="relative h-[320px] w-full rounded-[20px] border border-slate-200 bg-white p-4">
                {!chart?.points?.length || !chart.points.some((point) => point.received > 0 || point.overdue > 0 || point.open > 0) ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[20px] text-center text-slate-500">
                    <TrendingUp className="mb-3 h-10 w-10 opacity-20" />
                    <p className="text-sm font-semibold">Sem dados no periodo.</p>
                  </div>
                ) : null}
                {renderChart()}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                  Recebido
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                  Em aberto
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-rose-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f43f5e]" />
                  Em atraso
                </span>
              </div>
            </div>
          </article>

          <aside className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.07)]">
            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">Indice de saude</p>
                  {healthScore !== null ? (
                    <p className={cn('mt-3 text-[2.7rem] font-bold leading-none tracking-tight', healthDescriptor.value)}>
                      {healthScore}
                      <span className="ml-1 text-lg font-semibold text-slate-400">/100</span>
                    </p>
                  ) : (
                    <p className={cn('mt-3 text-[1.9rem] font-bold leading-none tracking-tight', healthDescriptor.value)}>
                      Sem base
                    </p>
                  )}
                  <p className="mt-3 text-sm text-slate-500">{healthDescriptor.note}</p>
                </div>
                <span className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', healthDescriptor.chip)}>
                  {healthDescriptor.label}
                </span>
              </div>

              {healthScore !== null ? (
                <div className="mt-5 h-2 rounded-full bg-slate-200">
                  <div className={cn('h-full rounded-full transition-all duration-500', healthDescriptor.bar)} style={{ width: `${Math.max(0, Math.min(healthScore, 100))}%` }} />
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <SupportMetricCard label="Taxa de recuperacao" note="Recebido no mes sobre a carteira em aberto." value={formatPercent(health.recoveryRate)} valueClassName="text-emerald-600" />
              <SupportMetricCard label="Taxa de inadimplencia" note="Percentual da carteira atualmente atrasado." value={formatPercent(kpis.delinquencyRate || 0)} valueClassName="text-rose-600" />
              <SupportMetricCard label="Clientes inadimplentes" note="Quantidade de titulos vencidos no radar." value={String(health.overdueCount)} />
              <SupportMetricCard label="Contratos em risco" note="Contratos com atraso e pressao operacional." value={String(health.riskContracts)} />
              <SupportMetricCard label="Exposicao em atraso" note="Volume financeiro pressionado pelo atraso." value={formatCurrency(health.totalOverdue)} valueClassName="text-rose-600" />
              <SupportMetricCard label="Ticket medio" note="Media de capital por contrato ativo." value={formatCurrency(health.avgTicket)} />
              <SupportMetricCard label="Parcela media" note="Media financeira por parcela aberta." value={formatCurrency(health.avgInstallment)} />
            </div>
          </aside>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.07)]" id="queue-upcoming">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[1.15rem] font-bold text-slate-800">Proximos vencimentos</h3>
              <p className="mt-1 text-sm text-slate-500">Fila operacional para baixa rapida e acompanhamento da semana.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
              {upcomingItems.length} registro(s)
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {pagedUpcomingItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500">
                <Calendar className="mx-auto mb-3 h-10 w-10 opacity-30" strokeWidth={1.5} />
                <p className="text-sm font-semibold">Nenhum vencimento em dia.</p>
              </div>
            ) : (
              pagedUpcomingItems.map((item) => (
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between" key={`upcoming-${item.installmentId}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em]', getStatusPillClass(item.statusColor))}>{item.statusLabel}</span>
                      <span className="text-xs font-medium text-slate-400">{item.dueRelative}</span>
                    </div>
                    <p className="mt-3 truncate text-sm font-bold text-slate-800">{item.debtorName}</p>
                    <p className="mt-1 text-xs text-slate-500">Parcela {item.installmentNumber}/{item.loanInstallmentsCount} • Vencimento {formatDateFull(item.dueDate)}</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <p className="text-lg font-bold tracking-tight text-slate-800">{formatCurrency(item.amount)}</p>
                    <button className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500 hover:text-white" onClick={() => setPaymentItem({ ...item, virtualStatus: 'PENDING' })} type="button">
                      <CheckCircle2 className="h-4 w-4" />
                      Baixar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-500">
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={upcomingPage === 1} onClick={() => setUpcomingPage((current) => Math.max(1, current - 1))} type="button">Anterior</button>
            <span>Pagina {upcomingPage} de {upcomingTotalPages}</span>
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={upcomingPage >= upcomingTotalPages} onClick={() => setUpcomingPage((current) => Math.min(upcomingTotalPages, current + 1))} type="button">Proxima</button>
          </div>
        </article>

        <article className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.07)]" id="queue-overdue">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[1.15rem] font-bold text-slate-800">Cobrancas em atraso</h3>
              <p className="mt-1 text-sm text-slate-500">Fila de cobranca com baixa rapida e contato por WhatsApp.</p>
            </div>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">{overdueItems.length} registro(s)</span>
          </div>
          <div className="mt-5 space-y-3">
            {pagedOverdueItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 opacity-30" strokeWidth={1.5} />
                <p className="text-sm font-semibold">Sem pagamentos atrasados.</p>
              </div>
            ) : (
              pagedOverdueItems.map((item) => (
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between" key={`overdue-${item.installmentId}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em]', getStatusPillClass(item.statusColor))}>{item.statusLabel}</span>
                      <span className="text-xs font-medium text-rose-400">{item.dueRelative}</span>
                    </div>
                    <p className="mt-3 truncate text-sm font-bold text-slate-800">{item.debtorName}</p>
                    <p className="mt-1 text-xs text-slate-500">Parcela {item.installmentNumber}/{item.loanInstallmentsCount} • Vencimento {formatDateFull(item.dueDate)}</p>
                  </div>

                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <p className="text-lg font-bold tracking-tight text-rose-600">{formatCurrency(item.amount)}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <button className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500 hover:text-white" onClick={() => setPaymentItem({ ...item, virtualStatus: 'OVERDUE' })} type="button">
                        <CheckCircle2 className="h-4 w-4" />
                        Baixar
                      </button>
                      <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#25D366] hover:bg-[#25D366] hover:text-white" onClick={() => handleWhatsApp(item)} type="button">
                        <MessageCircle className="h-4 w-4" />
                        Cobrar
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-500">
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={overduePage === 1} onClick={() => setOverduePage((current) => Math.max(1, current - 1))} type="button">Anterior</button>
            <span>Pagina {overduePage} de {overdueTotalPages}</span>
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={overduePage >= overdueTotalPages} onClick={() => setOverduePage((current) => Math.min(overdueTotalPages, current + 1))} type="button">Proxima</button>
          </div>
        </article>
      </section>

      {paymentItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Confirmar recebimento
              </h3>
              <button className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" onClick={() => setPaymentItem(null)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="space-y-4 p-5" onSubmit={handleMarkPaid}>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Cliente</span>
                  <span className="max-w-[150px] truncate font-semibold text-slate-700">{paymentItem.debtorName}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Valor</span>
                  <span className="text-xl font-black tracking-tight text-emerald-500">{formatCurrency(paymentItem.amount)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Data efetiva de pagamento</label>
                <input className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" defaultValue={new Date().toISOString().split('T')[0]} name="paymentDate" required type="date" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Metodo de baixa</label>
                <select className="appearance-none rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" name="method" required>
                  <option value="PIX">PIX automatico</option>
                  <option value="DINHEIRO">Dinheiro fisico</option>
                  <option value="TRANSFERENCIA">Transferencia bancaria / TED</option>
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50" onClick={() => setPaymentItem(null)} type="button">Cancelar</button>
                <button className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-95" type="submit">Confirmar quitacao</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
