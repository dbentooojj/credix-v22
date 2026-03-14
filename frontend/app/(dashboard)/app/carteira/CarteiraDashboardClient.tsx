'use client';

import React, { useState, useEffect, useMemo } from 'react';

import { 
  TrendingUp, RefreshCw, CheckCircle2, 
  AlertCircle, MessageCircle, X, Search, ChevronLeft, ChevronRight,
  Calendar
} from 'lucide-react';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler
);

interface DashboardPayload {
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
    dueToday: { count: number, totalValue: number },
    overdue: { count: number, totalValue: number },
    next7Days: { count: number, totalValue: number }
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
  upcomingDue: any[];
  overduePayments: any[];
  kpiCards: any;
}

export default function CarteiraDashboardClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [period, setPeriod] = useState('6m');
  const [metric, setMetric] = useState('recebido');
  const [chartView, setChartView] = useState<'line' | 'stacked'>('line');
  const [error, setError] = useState('');

  // Modals state
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [paymentItem, setPaymentItem] = useState<any>(null);

  // Table state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const normalizeWhatsAppPhone = (rawPhone: string) => {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    if (digits.length > 11) return digits;
    return '';
  };

  const handleWhatsApp = (item: any) => {
    const phone = normalizeWhatsAppPhone(item?.phone);
    if (!phone) return alert('Cliente sem telefone válido para WhatsApp');
    const text = `Olá, ${item.debtorName || ''}. Parcela em aberto: ${formatCurrency(item.amount)} (venc. ${formatDateShort(item.dueDate)}). Chave PIX: ${item.pixKey || 'não informado'}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
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
      notes: `Atualizado via dashboard NextJS`,
    };
    
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
      });
      if (!res.ok) throw new Error('Falha ao baixar parcela');
      setPaymentItem(null);
      fetchDashboard();
    } catch (error) {
      alert('Erro ao marcar pagamento.');
    }
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
    } catch (err: any) {
      setError(err.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [period, metric]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const formatPercent = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(val / 100);

  const formatDateShort = (isoDate: string) => {
    if (!isoDate) return '-';
    const [year, month, day] = isoDate.split('-');
    if (!day || !month) return isoDate;
    return `${day}/${month}`;
  };

  const formatDateFull = (isoDate: string) => {
    if (!isoDate) return '-';
    try {
      const [year, month, day] = isoDate.split('-');
      return `${day}/${month}/${year}`;
    } catch(e) {
      return isoDate;
    }
  }

  // --- Calculations ---
  const kpis = data?.kpis || {} as any;
  const overdueCount = data?.overduePayments?.length || 0;
  const upcomingCount = data?.upcomingDue?.length || 0;
  
  const receivableBase = (kpis?.receivedThisMonth || 0) + (kpis?.totalOpenReceivable || 0);
  const recoveryRate = receivableBase > 0 ? ((kpis?.receivedThisMonth || 0) / receivableBase) * 100 : 0;
  const normalizedDelinquency = Math.max(0, Math.min(100, kpis?.delinquencyRate || 0));
  const healthScore = Math.round((Math.max(0, Math.min(recoveryRate, 100)) * 0.62) + ((100 - normalizedDelinquency) * 0.38));

  const allInstallments = useMemo(() => {
    if (!data) return [];
    // Unindo Upcoming e Overdue para formar a DataGrid. Ideally o Backend enviaria array unico.
    // Usamos Record para deduplicar caso o back envie duplicado (se Overdue tbm = Upcoming hoje)
    const record: Record<string, any> = {};
    (data.upcomingDue || []).forEach(i => {
       record[i.installmentId] = { ...i, virtualStatus: 'PENDING' };
    });
    (data.overduePayments || []).forEach(i => {
       record[i.installmentId] = { ...i, virtualStatus: 'OVERDUE' };
    });
    return Object.values(record).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [data]);

  const filteredInstallments = useMemo(() => {
    return allInstallments.filter(item => {
      const matchSearch = item.debtorName?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'ALL' || item.virtualStatus === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [allInstallments, searchTerm, filterStatus]);

  const totalPages = Math.ceil(filteredInstallments.length / pageSize) || 1;
  const currentTableData = filteredInstallments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-12 text-blue-400">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-3 font-semibold">Carregando painel...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300">
        <AlertCircle className="w-6 h-6 mb-2" />
        <p>{error}</p>
        <button onClick={fetchDashboard} className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors font-medium">
          Tentar Novamente
        </button>
      </div>
    );
  }

  const renderChart = () => {
    if (!data?.chart?.points) return null;
    
    const labels = data.chart.points.map(p => p.label);
    const receivedData = data.chart.points.map(p => p.received || p.value || 0);
    const overdueData = data.chart.points.map(p => p.overdue || 0);
    const openData = data.chart.points.map(p => p.open || 0);

    const isStacked = chartView === 'stacked';

    const datasetsLine = [
      {
        label: 'Atraso',
        data: overdueData,
        borderColor: '#f43f5e', // rose-500
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 2.5,
        tension: 0.3,
      },
      {
        label: 'Recebido',
        data: receivedData,
        borderColor: '#10b981', // emerald-500
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 2.5,
        tension: 0.3,
      },
      {
        label: 'Em aberto',
        data: openData,
        borderColor: '#06b6d4', // cyan-500
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 2.5,
        tension: 0.3,
      }
    ];

    const datasetsBar = [
      { label: 'Recebido', data: receivedData, backgroundColor: '#10b981', borderRadius: 4 },
      { label: 'Em aberto', data: openData, backgroundColor: '#06b6d4', borderRadius: 4 },
      { label: 'Atraso', data: overdueData, backgroundColor: '#f43f5e', borderRadius: 4 }
    ];

    const chartData = {
      labels,
      datasets: isStacked ? datasetsBar : datasetsLine,
    };

    const options: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#fff',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(51, 65, 85, 0.5)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (context: any) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          stacked: isStacked,
          ticks: { color: '#64748b', font: { family: 'Inter' } },
          grid: { color: 'rgba(51, 65, 85, 0.2)', drawBorder: false }
        },
        y: {
          stacked: isStacked,
          ticks: { 
            color: '#64748b',
            font: { family: 'Inter' },
            callback: (value: number) => formatCurrency(value)
          },
          grid: { color: 'rgba(51, 65, 85, 0.2)', drawBorder: false }
        }
      }
    };

    if (isStacked) {
      return <Bar data={chartData as any} options={options} />;
    }
    return <Line data={chartData as any} options={options} />;
  };

  // Helpers nativos do código antigo para extrair a Saúde
  const getHealthMetrics = () => {
    if (!data) return null;
    const kpis = data.kpis;
    const upcoming = data.upcomingDue || [];
    const overdue = data.overduePayments || [];
    const overdueCount = overdue.length;
    const riskContracts = overdue.length;

    const totalOpenReceivable = kpis?.totalOpenReceivable ?? 0;
    const receivedThisMonth = kpis?.receivedThisMonth ?? 0;
    const totalLoaned = kpis?.totalLoaned ?? 0;
    const openFuture = kpis?.openReceivableFuture ?? 0;
    const totalOverdue = kpis?.openReceivableOverdue ?? kpis?.totalOverdue ?? 0;

    const receivableBase = receivedThisMonth + totalOpenReceivable;
    const recoveryRate = receivableBase > 0 ? (receivedThisMonth / receivableBase) * 100 : 0;
    
    const loanIds = new Set([...upcoming, ...overdue].map((item: any) => Number(item?.loanId || 0)).filter((id) => id > 0));
    const installmentCount = upcoming.length + overdue.length;
    
    const avgTicket = loanIds.size > 0 ? totalLoaned / loanIds.size : 0;
    const avgInstallment = installmentCount > 0 ? totalOpenReceivable / installmentCount : 0;

    return {
      recoveryRate,
      overdueCount,
      riskContracts,
      avgTicket,
      avgInstallment,
      openFuture,
      totalOverdue
    };
  };

  const health = getHealthMetrics();

  return (
    <div className="space-y-6 pb-20 bg-transparent min-h-screen text-slate-100 font-sans w-full max-w-[1600px] mx-auto">
      
      {/* Header Premium Flat */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
           <h2 className="text-[clamp(1.5rem,2vw,2.2rem)] font-bold text-[#f8fafc] leading-[1.04] tracking-[-0.035em]">Painel da Carteira</h2>
           <p className="mt-1 text-[0.9rem] font-normal leading-[1.6] text-[#cbd5e1]">Acompanhe o fluxo financeiro em tempo real e antecipe recebimentos</p>
        </div>
        <div className="text-xs text-slate-400 font-medium">
             Atualizado: <span id="lastRefresh">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Grid de KPIs - Nível Principal (3 blocos) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Card: Total Recebido */}
        <div className="relative overflow-hidden rounded-2xl p-5 min-h-[124px] flex flex-col justify-between border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 shadow-[0_10px_30px_rgba(2,6,23,0.28)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none">
          <div className="flex items-start justify-between relative z-10">
             <span className="text-[0.8rem] text-slate-200 font-medium tracking-[0.04em] uppercase opacity-95">Total recebido no mes</span>
             <AlertCircle className="w-4 h-4 text-slate-300 opacity-80" />
          </div>
          <div className="relative z-10">
             <div className="mt-2 text-[2rem] text-slate-50 font-medium leading-[1.04] tracking-[-0.03em]">{formatCurrency(kpis.receivedThisMonth || 0)}</div>
             <p className="mt-1.5 flex items-center gap-1.5 min-h-[18px] text-[0.78rem] font-semibold leading-[1.2] text-slate-300">Proj.: {formatCurrency((kpis.receivedThisMonth || 0) * 1.05)}</p>
          </div>
          {/* Falso Sparkline inferior */}
          <div className="h-0.5 w-[90%] bg-white/20 absolute bottom-4 left-5 rounded-full"></div>
        </div>

        {/* Card: A Receber */}
        <div className="relative overflow-hidden rounded-2xl p-5 min-h-[124px] flex flex-col justify-between border border-blue-500/30 bg-gradient-to-br from-[#0e2969]/90 to-[#0d1e4d]/84 shadow-[0_10px_30px_rgba(2,6,23,0.28)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none">
          <div className="flex items-start justify-between relative z-10">
             <span className="text-[0.8rem] text-slate-200 font-medium tracking-[0.04em] uppercase opacity-95">A receber</span>
             <AlertCircle className="w-4 h-4 text-slate-300 opacity-80" />
          </div>
          <div className="relative z-10">
             <div className="mt-2 text-[2rem] text-slate-50 font-medium leading-[1.04] tracking-[-0.03em]">{formatCurrency(kpis.totalOpenReceivable || 0)}</div>
             <p className={`mt-1.5 text-[0.86rem] leading-[1.45] font-semibold ${kpis.openReceivableOverdue > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                Futuras: {formatCurrency(kpis.openReceivableFuture || 0)} &bull; {kpis.openReceivableOverdue > 0 ? `Atrasadas: ${formatCurrency(kpis.openReceivableOverdue)}` : 'Sem inadimplência'}
             </p>
          </div>
          {/* Falso Sparkline inferior */}
          <div className="h-0.5 w-[90%] bg-white/20 absolute bottom-4 left-5 rounded-full"></div>
        </div>

        {/* Card: Lucro do Mes */}
        <div className="relative overflow-hidden rounded-2xl p-5 min-h-[124px] flex flex-col justify-between border border-slate-700 bg-gradient-to-b from-[#0a1222]/95 to-[#09101e]/85 shadow-[0_10px_30px_rgba(2,6,23,0.28)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none">
          <div className="flex items-start justify-between relative z-10">
             <span className="text-[0.8rem] text-slate-200 font-medium tracking-[0.04em] uppercase opacity-95">Lucro do mes</span>
             <AlertCircle className="w-4 h-4 text-slate-300 opacity-80" />
          </div>
          <div className="relative z-10">
             <div className="mt-2 text-[2rem] text-slate-50 font-medium leading-[1.04] tracking-[-0.03em]">{formatCurrency(kpis.profitThisMonth || 0)}</div>
             <p className="mt-1.5 flex items-center gap-1.5 min-h-[18px] text-[0.78rem] font-semibold leading-[1.2] text-slate-300">3M: sem historico</p>
          </div>
          {/* Falso Sparkline inferior */}
          <div className="h-0.5 w-[90%] bg-white/20 absolute bottom-4 left-5 rounded-full"></div>
        </div>
      </div>

      {/* Grid de KPIs - Secundários Strip (4 blocos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[2px] bg-slate-800/10 rounded-2xl overflow-hidden border border-slate-800/80 mb-6">
        <div className="relative flex flex-col justify-center bg-gradient-to-b from-[#0a1222]/95 to-[#09101e]/85 p-[18px]">
          <p className="text-[#94a3b8] text-[0.8rem] font-medium tracking-[0.04em] uppercase opacity-95 break-words">Total emprestado</p>
          <p className="mt-1 text-[1.4rem] font-bold text-slate-100 tracking-[-0.02em]">{formatCurrency(kpis.totalLoaned || 0)}</p>
        </div>
        <div className="relative flex flex-col justify-center bg-gradient-to-b from-[#0a1222]/95 to-[#09101e]/85 p-[18px]">
          <p className="text-[#94a3b8] text-[0.8rem] font-medium tracking-[0.04em] uppercase opacity-95 break-words">Retorno total</p>
          <p className="mt-1 text-[1.4rem] font-bold text-slate-100 tracking-[-0.02em]">{formatCurrency(kpis.profitTotal || 0)}</p>
          <p className="text-[#94a3b8] text-[0.78rem] font-semibold mt-1">ROI: {formatPercent(kpis.roiRate || 0)}</p>
        </div>
        <div className="relative flex flex-col justify-center bg-gradient-to-b from-[#0a1222]/95 to-[#09101e]/85 p-[18px]">
          <p className="text-[#94a3b8] text-[0.8rem] font-medium tracking-[0.04em] uppercase opacity-95 break-words">Taxa de inadimplencia</p>
          <p className="mt-1 text-[1.4rem] font-bold text-rose-500 tracking-[-0.02em]">{formatPercent(kpis.delinquencyRate || 0)}</p>
        </div>
        <div className="relative flex flex-col justify-center bg-gradient-to-b from-[#0a1222]/95 to-[#09101e]/85 p-[18px]">
          <p className="text-[#94a3b8] text-[0.8rem] font-medium tracking-[0.04em] uppercase opacity-95 break-words">Health score</p>
          <p className="mt-1 text-[1.4rem] font-bold text-slate-100 tracking-[-0.02em]">{healthScore}/100</p>
        </div>
      </div>

      {/* Resumo Rápido Diário (Modificado do EJS) */}
      <div className="bg-slate-900/40 border border-[#1e293b]/80 rounded-[1.25rem] p-5 mb-8 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.5)]">
        <h3 className="text-[0.7rem] font-bold text-slate-200 uppercase tracking-[0.05em] mb-4">Resumo do Dia (Action Center)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#111827] border border-[#1e293b]/70 rounded-xl p-[18px] flex items-center justify-between transition-all hover:bg-[#1e293b]/40 cursor-pointer shadow-sm">
            <div>
               <p className="text-[0.7rem] font-semibold text-slate-400 mb-0.5">Vence hoje</p>
               <p className="text-[1.35rem] font-bold text-[#f8fafc] leading-tight">{data?.dailySummary?.dueToday?.count || 0}</p>
            </div>
            <div className="text-right">
               <p className="text-[1rem] font-semibold text-[#f8fafc] mt-2">{formatCurrency(data?.dailySummary?.dueToday?.totalValue || 0)}</p>
            </div>
          </div>
          <div className="bg-[#111827] border border-[#1e293b]/70 rounded-xl p-[18px] flex items-center justify-between transition-all hover:bg-[#1e293b]/40 cursor-pointer shadow-sm">
            <div>
               <p className="text-[0.7rem] font-semibold text-rose-400 mb-0.5">Em atraso (mês)</p>
               <p className="text-[1.35rem] font-bold text-rose-500 leading-tight">{data?.dailySummary?.overdue?.count || 0}</p>
            </div>
            <div className="text-right">
               <p className="text-[1rem] font-semibold text-rose-500 mt-2">{formatCurrency(data?.dailySummary?.overdue?.totalValue || 0)}</p>
            </div>
          </div>
          <div className="bg-[#111827] border border-[#1e293b]/70 rounded-xl p-[18px] flex items-center justify-between transition-all hover:bg-[#1e293b]/40 cursor-pointer shadow-sm">
            <div>
               <p className="text-[0.7rem] font-semibold text-slate-400 mb-0.5">Prox. 7 dias</p>
               <p className="text-[1.35rem] font-bold text-[#f8fafc] leading-tight">{data?.dailySummary?.next7Days?.count || 0}</p>
            </div>
            <div className="text-right">
               <p className="text-[1rem] font-semibold text-[#f8fafc] mt-2">{formatCurrency(data?.dailySummary?.next7Days?.totalValue || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Caixas de Ação Rápida e Atrasados (Reconstrução EJS idêntica) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Caixa 1: Próximos Vencimentos */}
          <div className="bg-gradient-to-b from-[#111827] to-[#0f172a] border border-[#1e293b] rounded-[1.25rem] p-5 h-full flex flex-col shadow-[0_10px_30px_rgba(2,6,23,0.35)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none relative overflow-hidden">
             <div className="mb-4 relative z-10">
                <h3 className="text-[1.25rem] font-bold text-[#f8fafc] tracking-[-0.01em]">Ação rápida: próximos vencimentos</h3>
                <p className="mt-1 text-[0.82rem] text-slate-400">Lista operacional para marcar pagamento rápido.</p>
             </div>
             <div className="flex-1 flex flex-col justify-center min-h-[220px] relative z-10">
                {(data?.upcomingDue || []).length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40 text-slate-400" strokeWidth={1.5} />
                    <p className="text-[0.9rem]">Nenhum vencimento em dia.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                     {(data?.upcomingDue || []).slice(0, 4).map((item, idx) => (
                        <div key={`upc-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/60 transition-colors">
                           <div>
                              <p className="text-sm font-bold text-slate-200 truncate max-w-[180px]">{item.debtorName}</p>
                              <p className="text-[0.7rem] text-slate-400 font-medium">Vence {formatDateShort(item.dueDate)}</p>
                           </div>
                           <div className="flex items-center gap-3">
                              <p className="font-bold text-emerald-400 text-sm">{formatCurrency(item.amount)}</p>
                              <button onClick={() => setPaymentItem({ ...item, virtualStatus: 'PENDING' })} className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors" title="Baixar">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                     ))}
                  </div>
                )}
             </div>
             <div className="mt-4 flex items-center justify-between text-[0.75rem] text-slate-400 font-medium relative z-10">
                <button className="rounded-lg border border-[#334155] px-3 py-1.5 hover:bg-[#1e293b] hover:text-slate-200 transition text-[#94a3b8] disabled:opacity-50">Anterior</button>
                <span>{ (data?.upcomingDue?.length || 0) > 0 ? `Página 1 de ${Math.ceil((data?.upcomingDue?.length || 0) / 4)}` : 'Sem registros' }</span>
                <button className="rounded-lg border border-[#334155] px-3 py-1.5 hover:bg-[#1e293b] hover:text-slate-200 transition text-[#94a3b8] disabled:opacity-50">Próxima</button>
             </div>
          </div>

          {/* Caixa 2: Pagamentos Atrasados */}
          <div className="bg-gradient-to-b from-[#111827] to-[#0f172a] border border-[#1e293b] rounded-[1.25rem] p-5 h-full flex flex-col shadow-[0_10px_30px_rgba(2,6,23,0.35)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none relative overflow-hidden">
             <div className="mb-4 relative z-10">
                <h3 className="text-[1.25rem] font-bold text-[#f8fafc] tracking-[-0.01em]">Pagamentos atrasados</h3>
                <p className="mt-1 text-[0.82rem] text-slate-400">Lista operacional para cobranca e baixa de atrasos.</p>
             </div>
             <div className="flex-1 flex flex-col justify-center min-h-[220px] relative z-10">
                {(data?.overduePayments || []).length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40 text-slate-400" strokeWidth={1.5} />
                    <p className="text-[0.9rem]">Sem pagamentos atrasados.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                     {(data?.overduePayments || []).slice(0, 4).map((item, idx) => (
                        <div key={`ovrd-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/60 transition-colors">
                           <div>
                              <p className="text-sm font-bold text-slate-200 truncate max-w-[180px]">{item.debtorName}</p>
                              <p className="text-[0.7rem] text-rose-400 font-medium">Atrasado ({formatDateShort(item.dueDate)})</p>
                           </div>
                           <div className="flex items-center gap-3">
                              <p className="font-bold text-emerald-400 text-sm">{formatCurrency(item.amount)}</p>
                              <button onClick={() => setPaymentItem({ ...item, virtualStatus: 'OVERDUE' })} className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors" title="Baixar">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleWhatsApp(item)} className="w-8 h-8 rounded-lg bg-slate-700/50 text-slate-300 flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-colors" title="Cobrar no Wpp">
                                <MessageCircle className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                     ))}
                  </div>
                )}
             </div>
             <div className="mt-4 flex items-center justify-between text-[0.75rem] text-slate-400 font-medium relative z-10">
                <button className="rounded-lg border border-[#334155] px-3 py-1.5 hover:bg-[#1e293b] hover:text-slate-200 transition text-[#94a3b8] disabled:opacity-50">Anterior</button>
                <span>{ (data?.overduePayments?.length || 0) > 0 ? `Página 1 de ${Math.ceil((data?.overduePayments?.length || 0) / 4)}` : 'Sem registros' }</span>
                <button className="rounded-lg border border-[#334155] px-3 py-1.5 hover:bg-[#1e293b] hover:text-slate-200 transition text-[#94a3b8] disabled:opacity-50">Próxima</button>
             </div>
          </div>
      </div>

      {/* Chart Section & Saúde da Carteira */}
      {data && health && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-8 mt-8 relative z-10 w-full">
            {/* Grafico Performance Mnesal */}
            <div className="xl:col-span-8">
                <div className="bg-[#151c2c] border border-slate-800 rounded-2xl p-6 h-full shadow-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="text-indigo-500 w-5 h-5" />
                            <h3 className="text-[1.15rem] font-bold text-slate-100">Performance mensal da carteira</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-[#1e2736] rounded-xl border border-slate-700/60 p-1">
                                <button onClick={() => setChartView('line')} className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${chartView === 'line' ? 'bg-[#5c59c5] text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>Linha</button>
                                <button onClick={() => setChartView('stacked')} className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${chartView === 'stacked' ? 'bg-[#293447] text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>Barras empilhadas</button>
                            </div>
                            <select 
                              className="bg-[#1e2736] border border-slate-700/60 text-slate-300 text-xs font-medium rounded-xl py-2 px-3 outline-none focus:border-indigo-500"
                              value={period}
                              onChange={(e) => setPeriod(e.target.value)}
                            >
                                <option value="3m">3 meses</option>
                                <option value="6m">6 meses</option>
                                <option value="12m">12 meses</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-[#1b2537] border border-slate-700/50 rounded-2xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between shadow-inner">
                        <div>
                            <p className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400 mb-1">Recebido no mes</p>
                            <p className="text-2xl font-bold text-slate-100">{formatCurrency(data.kpis.receivedThisMonth || 0)}</p>
                        </div>
                        <div className="sm:text-right mt-3 sm:mt-0">
                            <p className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400 mb-1">vs mes anterior</p>
                            <p className="text-xl font-bold text-slate-300">--</p>
                        </div>
                    </div>

                    <div className="h-[300px] w-full relative bg-[#172031] border border-slate-800 rounded-xl p-4">
                        {(!data.chart.points || data.chart.points.length === 0 || !data.chart.points.some(p => p.received > 0 || p.overdue > 0 || p.open > 0)) ? (
                           <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10 bg-[#172031]/80 rounded-xl">
                              <TrendingUp className="w-10 h-10 opacity-30 mb-3" />
                              <p className="font-semibold text-sm">Sem dados no periodo.</p>
                           </div>
                        ) : null}
                        {renderChart()}
                    </div>
                </div>
            </div>

            {/* Saúde da Carteira */}
            <aside className="xl:col-span-4">
                <div className="bg-[#151c2c] border border-slate-800 rounded-2xl p-6 h-full shadow-2xl flex flex-col">
                    <div className="flex items-center justify-between gap-3 mb-5">
                        <h3 className="text-xl font-bold text-slate-100">Saude da carteira</h3>
                        <button className="flex items-center rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-[0.7rem] font-bold text-slate-300 hover:bg-slate-700 transition">
                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                            Ajustar caixa
                        </button>
                    </div>

                    <div className="mb-6">
                        <p className="text-3xl font-bold text-slate-100">{formatCurrency(data?.kpis?.cashBalance || 0)}</p>
                        <p className="text-sm text-slate-400 mt-1 font-medium">Ajustes: {formatCurrency(data?.kpis?.cashAdjustmentNet || 0)}</p>
                        <p className="text-xs text-slate-500 mt-2">0,00% vs mes ant.</p>
                    </div>

                    <div className="mt-2 mb-6">
                        <div className="flex items-center justify-between text-[0.68rem] font-bold uppercase tracking-widest text-slate-400 mb-2">
                            <span>Taxa de recuperacao</span>
                            <span className="text-slate-300">{(health?.recoveryRate || 0).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1})}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-500 rounded-full" style={{ width: `${Math.max(0, Math.min(health?.recoveryRate || 0, 100))}%` }}></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-[#0f1422] rounded-xl p-4 border border-slate-800/80">
                            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1">Clientes<br/>Inadimplentes</p>
                            <p className="text-2xl font-bold text-slate-100">{health?.overdueCount || 0}</p>
                        </div>
                        <div className="bg-[#0f1422] rounded-xl p-4 border border-slate-800/80">
                            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1">Contratos<br/>Em risco</p>
                            <p className="text-2xl font-bold text-slate-100">{health?.riskContracts || 0}</p>
                        </div>
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-5 border-t border-slate-700/60 pt-5 text-sm">
                        <div>
                            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1">Ticket medio</p>
                            <p className="font-bold text-slate-100">{formatCurrency(health?.avgTicket || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1">Parcela media</p>
                            <p className="font-bold text-slate-100">{formatCurrency(health?.avgInstallment || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1">Recebiveis futuros</p>
                            <p className="font-bold text-emerald-400">{formatCurrency(health?.openFuture || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1">Exposicao atraso</p>
                            <p className="font-bold text-rose-500">{formatCurrency(health?.totalOverdue || 0)}</p>
                        </div>
                    </div>
                </div>
            </aside>
        </section>
      )}


      {/* Modals of Ajuste de Caixa */}
      {isCashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
              <div>
                <h3 className="text-xl font-bold text-slate-100">Ajustar Caixa</h3>
                <p className="text-xs text-slate-400 mt-0.5">Registre entrada ou retirada manual</p>
              </div>
              <button 
                onClick={() => setIsCashModalOpen(false)}
                className="p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form 
              className="p-5 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const postData = {
                  type: fd.get('type'),
                  amount: parseFloat(String(fd.get('amount')).replace(',', '.')),
                  date: fd.get('date'),
                  description: fd.get('description'),
                };
                
                try {
                  const res = await fetch('/api/dashboard/cash-adjustments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(postData)
                  });
                  if (!res.ok) throw new Error('Erro ao salvar ajuste');
                  setIsCashModalOpen(false);
                  fetchDashboard();
                } catch (error) {
                  alert('Erro ao salvar ajuste.');
                }
              }}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo de Movimento</label>
                  <select name="type" required className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                    <option value="income">Entrada Positiva (+)</option>
                    <option value="expense">Retirada Negativa (-)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor Monetário (R$)</label>
                  <input name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00" className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data de Referência</label>
                  <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Detalhes (Opcional)</label>
                  <input name="description" type="text" placeholder="Ex: Saque de sócios" className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                </div>
              </div>

              <div className="pt-5 flex gap-3">
                <button type="button" onClick={() => setIsCashModalOpen(false)} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold transition-colors border border-slate-700 text-sm">
                  Desistir
                </button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-all shadow-lg shadow-indigo-600/20 text-sm active:scale-95">
                  Salvar Transação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirm Payment */}
      {paymentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm shadow-2xl">
          <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative">
            
            <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-emerald-950/20">
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500 w-5 h-5"/> Confirmar Recebimento
              </h3>
              <button onClick={() => setPaymentItem(null)} className="p-1 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form className="p-5 space-y-5" onSubmit={handleMarkPaid}>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-sm flex flex-col gap-2 shadow-inner">
                 <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold tracking-wider text-[0.7rem] uppercase">Cliente Devedor</span>
                    <span className="font-bold text-slate-200 truncate max-w-[150px]">{paymentItem.debtorName}</span>
                 </div>
                 <div className="flex justify-between items-center mt-1 pt-3 border-t border-slate-800/80">
                    <span className="text-slate-500 font-semibold tracking-wider text-[0.7rem] uppercase">Valor a Receber</span>
                    <span className="font-black text-xl tracking-tighter text-emerald-400">{formatCurrency(paymentItem.amount)}</span>
                 </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest pl-1">Data Efetiva de Pagamento</label>
                <input name="paymentDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest pl-1">Método de Baixa</label>
                <select name="method" required className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none">
                  <option value="PIX">PIX Automático</option>
                  <option value="DINHEIRO">Dinheiro Físico</option>
                  <option value="TRANSFERENCIA">Transferência Bancária / TED</option>
                </select>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/40 active:scale-95">
                  Confirmar Quitação Total
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
