'use client';

import React, { useState, useEffect, useMemo } from 'react';

import { 
  TrendingUp, RefreshCw, CheckCircle2, 
  AlertCircle, MessageCircle, X, Calendar,
  Clock, AlertTriangle
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
  const [paymentItem, setPaymentItem] = useState<any>(null);

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

  const kpis = data?.kpis || {} as any;
  const overdueCount = data?.overduePayments?.length || 0;
  const upcomingCount = data?.upcomingDue?.length || 0;
  
  const receivableBase = (kpis?.receivedThisMonth || 0) + (kpis?.totalOpenReceivable || 0);
  const recoveryRate = receivableBase > 0 ? ((kpis?.receivedThisMonth || 0) / receivableBase) * 100 : 0;
  const normalizedDelinquency = Math.max(0, Math.min(100, kpis?.delinquencyRate || 0));
  const healthScore = Math.round((Math.max(0, Math.min(recoveryRate, 100)) * 0.62) + ((100 - normalizedDelinquency) * 0.38));

  const allInstallments = useMemo(() => {
    if (!data) return [];
    const record: Record<string, any> = {};
    (data.upcomingDue || []).forEach(i => {
       record[i.installmentId] = { ...i, virtualStatus: 'PENDING' };
    });
    (data.overduePayments || []).forEach(i => {
       record[i.installmentId] = { ...i, virtualStatus: 'OVERDUE' };
    });
    return Object.values(record).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [data]);

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
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 2.5,
        tension: 0.3,
      },
      {
        label: 'Recebido',
        data: receivedData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 2.5,
        tension: 0.3,
      },
      {
        label: 'Em aberto',
        data: openData,
        borderColor: '#06b6d4',
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
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">Painel da Carteira</h2>
          <p className="mt-1 text-sm text-slate-400">Acompanhe o fluxo financeiro em tempo real e antecipe recebimentos</p>
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Atualizado: <span id="lastRefresh" className="text-slate-400">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Grid de KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

        {/* Card: Total Recebido */}
        <div className="rounded-2xl p-5 min-h-[120px] flex flex-col justify-between border border-slate-800 bg-slate-950">
          <div className="flex items-start justify-between">
            <span className="text-[0.75rem] text-slate-400 font-semibold tracking-widest uppercase">Total recebido no mês</span>
            <CheckCircle2 className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3">
            <div className="text-[1.9rem] text-slate-50 font-bold leading-none tracking-tight">{formatCurrency(kpis.receivedThisMonth || 0)}</div>
            <p className="mt-2 text-[0.75rem] font-medium text-slate-500">Proj.: {formatCurrency((kpis.receivedThisMonth || 0) * 1.05)}</p>
          </div>
        </div>

        {/* Card: A Receber */}
        <div className="rounded-2xl p-5 min-h-[120px] flex flex-col justify-between border border-slate-800 bg-slate-950">
          <div className="flex items-start justify-between">
            <span className="text-[0.75rem] text-slate-400 font-semibold tracking-widest uppercase">A receber</span>
            <AlertCircle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3">
            <div className="text-[1.9rem] text-slate-50 font-bold leading-none tracking-tight">{formatCurrency(kpis.totalOpenReceivable || 0)}</div>
            <p className={`mt-2 text-[0.75rem] font-medium ${kpis.openReceivableOverdue > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
              Futuras: {formatCurrency(kpis.openReceivableFuture || 0)} &bull; {kpis.openReceivableOverdue > 0 ? `Atrasadas: ${formatCurrency(kpis.openReceivableOverdue)}` : 'Sem inadimplência'}
            </p>
          </div>
        </div>

        {/* Card: Lucro do Mês */}
        <div className="rounded-2xl p-5 min-h-[120px] flex flex-col justify-between border border-slate-800 bg-slate-950">
          <div className="flex items-start justify-between">
            <span className="text-[0.75rem] text-slate-400 font-semibold tracking-widest uppercase">Lucro do mês</span>
            <TrendingUp className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3">
            <div className="text-[1.9rem] text-slate-50 font-bold leading-none tracking-tight">{formatCurrency(kpis.profitThisMonth || 0)}</div>
            <p className="mt-2 text-[0.75rem] font-medium text-slate-500">3M: sem histórico</p>
          </div>
        </div>
      </div>

      {/* Strip de KPIs Secundários */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
          <p className="text-slate-500 text-[0.72rem] font-semibold tracking-widest uppercase mb-1.5">Total emprestado</p>
          <p className="text-[1.3rem] font-bold text-slate-100 tracking-tight">{formatCurrency(kpis.totalLoaned || 0)}</p>
        </div>
        <div className="rounded-xl bg-[#0d1117] border border-slate-800 p-4">
          <p className="text-slate-500 text-[0.72rem] font-semibold tracking-widest uppercase mb-1.5">Retorno total</p>
          <p className="text-[1.3rem] font-bold text-slate-100 tracking-tight">{formatCurrency(kpis.profitTotal || 0)}</p>
          <p className="text-slate-500 text-[0.72rem] font-medium mt-1">ROI: {formatPercent(kpis.roiRate || 0)}</p>
        </div>
        <div className="rounded-xl bg-[#0d1117] border border-slate-800 p-4">
          <p className="text-slate-500 text-[0.72rem] font-semibold tracking-widest uppercase mb-1.5">Taxa de inadimplência</p>
          <p className="text-[1.3rem] font-bold text-rose-500 tracking-tight">{formatPercent(kpis.delinquencyRate || 0)}</p>
        </div>
        <div className="rounded-xl bg-[#0d1117] border border-slate-800 p-4">
          <p className="text-slate-500 text-[0.72rem] font-semibold tracking-widest uppercase mb-1.5">Health score</p>
          <p className="text-[1.3rem] font-bold text-slate-100 tracking-tight">{healthScore}<span className="text-slate-500 text-sm font-medium">/100</span></p>
        </div>
      </div>

      {/* Action Center */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Resumo do Dia</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Vence hoje */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between hover:bg-slate-800/60 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-wider">Vence hoje</p>
                <p className="text-xl font-bold text-slate-100 leading-tight">{data?.dailySummary?.dueToday?.count || 0}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-300">{formatCurrency(data?.dailySummary?.dueToday?.totalValue || 0)}</p>
          </div>

          {/* Em atraso */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between hover:bg-slate-800/60 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-[0.7rem] font-semibold text-red-400 uppercase tracking-wider">Em atraso (mês)</p>
                <p className="text-xl font-bold text-red-400 leading-tight">{data?.dailySummary?.overdue?.count || 0}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-red-400">{formatCurrency(data?.dailySummary?.overdue?.totalValue || 0)}</p>
          </div>

          {/* Próximos 7 dias */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between hover:bg-slate-800/60 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-wider">Prox. 7 dias</p>
                <p className="text-xl font-bold text-slate-100 leading-tight">{data?.dailySummary?.next7Days?.count || 0}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-300">{formatCurrency(data?.dailySummary?.next7Days?.totalValue || 0)}</p>
          </div>
        </div>
      </div>

      {/* Listas Operacionais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Próximos Vencimentos */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-100">Ação rápida: próximos vencimentos</h3>
            <p className="mt-0.5 text-xs text-slate-500">Lista operacional para marcar pagamento rápido.</p>
          </div>
          <div className="flex-1 flex flex-col justify-center min-h-[200px]">
            {(data?.upcomingDue || []).length === 0 ? (
              <div className="text-center py-10 text-slate-600">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
                <p className="text-sm">Nenhum vencimento em dia.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.upcomingDue || []).slice(0, 4).map((item, idx) => (
                  <div key={`upc-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/40 hover:bg-slate-800/50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-200 truncate max-w-[180px]">{item.debtorName}</p>
                      <p className="text-[0.7rem] text-slate-500 font-medium mt-0.5">Vence {formatDateShort(item.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <p className="font-semibold text-emerald-400 text-sm">{formatCurrency(item.amount)}</p>
                      <button onClick={() => setPaymentItem({ ...item, virtualStatus: 'PENDING' })} className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors" title="Baixar">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <button className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 hover:text-slate-300 transition">Anterior</button>
            <span>{(data?.upcomingDue?.length || 0) > 0 ? `Página 1 de ${Math.ceil((data?.upcomingDue?.length || 0) / 4)}` : 'Sem registros'}</span>
            <button className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 hover:text-slate-300 transition">Próxima</button>
          </div>
        </div>

        {/* Pagamentos Atrasados */}
        <div className="bg-[#0d1117] border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-100">Pagamentos atrasados</h3>
            <p className="mt-0.5 text-xs text-slate-500">Lista operacional para cobrança e baixa de atrasos.</p>
          </div>
          <div className="flex-1 flex flex-col justify-center min-h-[200px]">
            {(data?.overduePayments || []).length === 0 ? (
              <div className="text-center py-10 text-slate-600">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
                <p className="text-sm">Sem pagamentos atrasados.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.overduePayments || []).slice(0, 4).map((item, idx) => (
                  <div key={`ovrd-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/40 hover:bg-slate-800/50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-200 truncate max-w-[180px]">{item.debtorName}</p>
                      <p className="text-[0.7rem] text-rose-400 font-medium mt-0.5">Atrasado ({formatDateShort(item.dueDate)})</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-emerald-400 text-sm">{formatCurrency(item.amount)}</p>
                      <button onClick={() => setPaymentItem({ ...item, virtualStatus: 'OVERDUE' })} className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors" title="Baixar">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleWhatsApp(item)} className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-colors" title="Cobrar no Wpp">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <button className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 hover:text-slate-300 transition">Anterior</button>
            <span>{(data?.overduePayments?.length || 0) > 0 ? `Página 1 de ${Math.ceil((data?.overduePayments?.length || 0) / 4)}` : 'Sem registros'}</span>
            <button className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 hover:text-slate-300 transition">Próxima</button>
          </div>
        </div>
      </div>

      {/* Chart Section & Saúde da Carteira */}
      {data && health && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-8 w-full">
          {/* Gráfico */}
          <div className="xl:col-span-8">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 h-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="text-indigo-400 w-5 h-5" />
                  <h3 className="text-base font-bold text-slate-100">Performance mensal da carteira</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-slate-900 rounded-lg border border-slate-700/60 p-1">
                    <button onClick={() => setChartView('line')} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${chartView === 'line' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>Linha</button>
                    <button onClick={() => setChartView('stacked')} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${chartView === 'stacked' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>Barras</button>
                  </div>
                  <select 
                    className="bg-slate-900 border border-slate-700/60 text-slate-300 text-xs font-medium rounded-lg py-2 px-3 outline-none focus:border-indigo-500"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="3m">3 meses</option>
                    <option value="6m">6 meses</option>
                    <option value="12m">12 meses</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl px-5 py-4 mb-5 flex flex-col sm:flex-row sm:items-end justify-between">
                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-widest text-slate-500 mb-1">Recebido no mês</p>
                  <p className="text-2xl font-bold text-slate-100">{formatCurrency(data.kpis.receivedThisMonth || 0)}</p>
                </div>
                <div className="sm:text-right mt-3 sm:mt-0">
                  <p className="text-[0.68rem] font-bold uppercase tracking-widest text-slate-500 mb-1">vs mês anterior</p>
                  <p className="text-xl font-bold text-slate-500">--</p>
                </div>
              </div>

              <div className="h-[280px] w-full relative bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                {(!data.chart.points || data.chart.points.length === 0 || !data.chart.points.some(p => p.received > 0 || p.overdue > 0 || p.open > 0)) ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-10 rounded-xl">
                    <TrendingUp className="w-10 h-10 opacity-20 mb-3" />
                    <p className="font-semibold text-sm">Sem dados no período.</p>
                  </div>
                ) : null}
                {renderChart()}
              </div>
            </div>
          </div>

          {/* Saúde da Carteira */}
          <aside className="xl:col-span-4">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 h-full flex flex-col">
              <h3 className="text-base font-bold text-slate-100 mb-6">Saúde da carteira</h3>

              {/* Taxa de recuperação */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-[0.68rem] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  <span>Taxa de recuperação</span>
                  <span className="text-slate-300">{(health?.recoveryRate || 0).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1})}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(health?.recoveryRate || 0, 100))}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800">
                  <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-500 mb-2 leading-tight">Clientes<br/>Inadimplentes</p>
                  <p className="text-2xl font-bold text-slate-100">{health?.overdueCount || 0}</p>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800">
                  <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-500 mb-2 leading-tight">Contratos<br/>Em risco</p>
                  <p className="text-2xl font-bold text-slate-100">{health?.riskContracts || 0}</p>
                </div>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-5 border-t border-slate-800 pt-5">
                <div>
                  <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-500 mb-1">Ticket médio</p>
                  <p className="font-semibold text-slate-100 text-sm">{formatCurrency(health?.avgTicket || 0)}</p>
                </div>
                <div>
                  <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-500 mb-1">Parcela média</p>
                  <p className="font-semibold text-slate-100 text-sm">{formatCurrency(health?.avgInstallment || 0)}</p>
                </div>
                <div>
                  <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-500 mb-1">Recebíveis futuros</p>
                  <p className="font-semibold text-emerald-400 text-sm">{formatCurrency(health?.openFuture || 0)}</p>
                </div>
                <div>
                  <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-500 mb-1">Exposição atraso</p>
                  <p className="font-semibold text-rose-500 text-sm">{formatCurrency(health?.totalOverdue || 0)}</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      )}

      {/* Modal Confirmar Pagamento */}
      {paymentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500 w-5 h-5"/> Confirmar Recebimento
              </h3>
              <button onClick={() => setPaymentItem(null)} className="p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form className="p-5 space-y-4" onSubmit={handleMarkPaid}>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-sm flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold tracking-wider text-[0.65rem] uppercase">Cliente</span>
                  <span className="font-semibold text-slate-200 truncate max-w-[150px]">{paymentItem.debtorName}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                  <span className="text-slate-500 font-semibold tracking-wider text-[0.65rem] uppercase">Valor</span>
                  <span className="font-black text-xl tracking-tight text-emerald-400">{formatCurrency(paymentItem.amount)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-widest">Data efetiva de pagamento</label>
                <input name="paymentDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-widest">Método de baixa</label>
                <select name="method" required className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none">
                  <option value="PIX">PIX Automático</option>
                  <option value="DINHEIRO">Dinheiro Físico</option>
                  <option value="TRANSFERENCIA">Transferência Bancária / TED</option>
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPaymentItem(null)} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold transition-colors border border-slate-700 text-sm">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-all shadow-lg shadow-emerald-600/20 text-sm active:scale-95">
                  Confirmar Quitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
