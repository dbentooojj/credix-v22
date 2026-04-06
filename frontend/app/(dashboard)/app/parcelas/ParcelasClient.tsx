"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUpDown,
  Trash2,
  RotateCcw,
  DollarSign,
} from "lucide-react";
import { ModalBase, ModalBtnGhost, ModalBtnPrimary, ModalField, modalInputClass } from "../../../components/ModalBase";
import { MobileDataCard, MobileDataCardActions, MobileDataCardRow } from "../../../components/MobileDataCard";
import { formatCurrencyInput, formatCurrencyInputFromNumber, parseCurrencyInput } from "../../../../utils/currencyInput";
import { getDateOnlyRelationToToday } from "../../../../utils/dateOnlyStatus";

// --- TYPES ---
type Debtor = {
  id: string | number;
  name?: string;
  document?: string;
  cpf?: string;
  phone?: string;
};

type Loan = {
  id: string | number;
  debtor_id: string | number;
};

type Installment = {
  id: string | number;
  loan_id: string | number;
  number?: number;
  installment_number?: number;
  amount?: number | string;
  due_date?: string;
  status?: string;
  payment_method?: string;
  paid_at?: string;
};

// --- HELPERS ---
function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function parseDateValue(value: any) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  const raw = String(value).trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatCurrency(value: any) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getStatusBadge(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "pago" || s === "paid") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
  if (s === "pendente" || s === "pending") return "bg-amber-500/20 text-amber-400 border-amber-500/40";
  if (s === "atrasado" || s === "overdue" || s === "late") return "bg-red-500/20 text-red-400 border-red-500/40";
  return "bg-slate-500/20 text-slate-400 border-slate-500/40";
}

function translateStatus(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "pago" || s === "paid") return "Pago";
  if (s === "pendente" || s === "pending") return "Pendente";
  if (s === "atrasado" || s === "overdue" || s === "late") return "Atrasado";
  return status || "Desconhecido";
}

function isOverdue(dueDate: unknown, status: string) {
  const s = translateStatus(status);
  if (s === "Pago") return false;
  return getDateOnlyRelationToToday(dueDate) === "past";
}

function isCurrentMonth(date: Date | null) {
  if (!date) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ParcelasClient() {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [clientFilter, setClientFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("Todas");
  const [sortBy, setSortBy] = useState("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);
  const [payDate, setPayDate] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("PIX");
  const [payNotes, setPayNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [resInstallments, resLoans, resDebtors] = await Promise.all([
        fetch("/api/tables/installments").then((r) => r.json()),
        fetch("/api/tables/loans").then((r) => r.json()),
        fetch("/api/tables/debtors").then((r) => r.json()),
      ]);
      if (resInstallments.data) setInstallments(resInstallments.data);
      if (resLoans.data) setLoans(resLoans.data);
      if (resDebtors.data) setDebtors(resDebtors.data);
    } catch {
      // erro silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Modal handlers ---
  function openPayModal(inst: any) {
    setSelectedInst(inst);
    setPayDate(toDateInputValue(new Date()));
    setPayAmount(formatCurrencyInputFromNumber(inst.amount || 0));
    setPayMethod("PIX");
    setPayNotes("");
    setShowPayModal(true);
  }

  function openRevertModal(inst: any) {
    setSelectedInst(inst);
    setShowRevertModal(true);
  }

  function openDeleteModal(inst: any) {
    setSelectedInst(inst);
    setShowDeleteModal(true);
  }

  async function handlePay() {
    const parsedAmount = parseCurrencyInput(payAmount);
    if (!selectedInst || !payDate || !payAmount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    setActionLoading(true);
    try {
      await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: Number(selectedInst.loan_id),
          installmentId: Number(selectedInst.id),
          amount: parsedAmount,
          paymentDate: payDate,
          method: payMethod,
          notes: payNotes.trim() || undefined,
        }),
      });
      setShowPayModal(false);
      await fetchData();
    } catch { /* silent */ } finally { setActionLoading(false); }
  }

  async function handleRevert() {
    if (!selectedInst) return;
    setActionLoading(true);
    try {
      await fetch(`/api/payments/installments/${selectedInst.id}/revert`, { method: "POST" });
      setShowRevertModal(false);
      await fetchData();
    } catch { /* silent */ } finally { setActionLoading(false); }
  }

  async function handleDeleteInst() {
    if (!selectedInst) return;
    setActionLoading(true);
    try {
      await fetch(`/api/payments/installments/${selectedInst.id}`, { method: "DELETE" });
      setShowDeleteModal(false);
      await fetchData();
    } catch { /* silent */ } finally { setActionLoading(false); }
  }

  // Enriquecer dados
  const enriched = useMemo(() => {
    return installments.map((inst) => {
      const loan = loans.find((l) => sameId(l.id, inst.loan_id));
      const debtor = loan ? debtors.find((d) => sameId(d.id, loan.debtor_id)) : undefined;
      const dueDate = parseDateValue(inst.due_date);
      const amount = Number(inst.amount || 0);
      const rawStatus = inst.status || "";
      const uiStatus = isOverdue(inst.due_date, rawStatus) ? "Atrasado" : translateStatus(rawStatus);
      const installmentNumber = inst.number ?? inst.installment_number ?? 0;

      return {
        ...inst,
        loan,
        debtor,
        dueDate,
        amount,
        uiStatus,
        installmentNumber,
        searchStr: `${debtor?.name || ""} ${debtor?.phone || ""} ${inst.loan_id} ${inst.id}`.toLowerCase(),
      };
    });
  }, [installments, loans, debtors]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const paidThisMonth = enriched.filter(
      (i) => i.uiStatus === "Pago" && i.dueDate && isCurrentMonth(i.dueDate)
    );
    const pending = enriched.filter((i) => i.uiStatus === "Pendente");
    const overdue = enriched.filter((i) => i.uiStatus === "Atrasado");

    return {
      receivedValue: paidThisMonth.reduce((s, i) => s + i.amount, 0),
      receivedCount: paidThisMonth.length,
      pendingValue: pending.reduce((s, i) => s + i.amount, 0),
      pendingCount: pending.length,
      overdueValue: overdue.reduce((s, i) => s + i.amount, 0),
      overdueCount: overdue.length,
    };
  }, [enriched]);

  // Lista de clientes para o filtro
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    debtors.forEach((d) => map.set(String(d.id), d.name || `Cliente #${d.id}`));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [debtors]);

  // Filtrar e ordenar
  const filtered = useMemo(() => {
    let result = [...enriched];

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((i) => i.searchStr.includes(s));
    }

    if (statusFilter !== "Todos") {
      result = result.filter((i) => i.uiStatus === statusFilter);
    }

    if (clientFilter !== "all") {
      result = result.filter((i) => sameId(i.debtor?.id, clientFilter));
    }

    if (paymentMethodFilter !== "Todas") {
      result = result.filter((i) => i.payment_method === paymentMethodFilter);
    }

    if (periodFilter !== "all") {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      result = result.filter((i) => {
        if (!i.dueDate) return false;
        const d = new Date(i.dueDate.getTime());
        d.setHours(0, 0, 0, 0);
        if (periodFilter === "today") return d.getTime() === now.getTime();
        if (periodFilter === "next7") {
          const limit = new Date(now.getTime() + 7 * 86400000);
          return d >= now && d <= limit;
        }
        if (periodFilter === "month_current") return isCurrentMonth(d);
        if (periodFilter === "last30") {
          const past = new Date(now.getTime() - 30 * 86400000);
          return d >= past && d <= now;
        }
        return true;
      });
    }

    result.sort((a, b) => {
      let valA: any, valB: any;
      if (sortBy === "client") {
        valA = (a.debtor?.name || "").toLowerCase();
        valB = (b.debtor?.name || "").toLowerCase();
      } else if (sortBy === "loan") {
        valA = Number(a.loan_id) || 0;
        valB = Number(b.loan_id) || 0;
      } else if (sortBy === "number") {
        valA = a.installmentNumber;
        valB = b.installmentNumber;
      } else if (sortBy === "due_date") {
        valA = a.dueDate ? a.dueDate.getTime() : 0;
        valB = b.dueDate ? b.dueDate.getTime() : 0;
      } else if (sortBy === "amount") {
        valA = a.amount;
        valB = b.amount;
      } else if (sortBy === "status") {
        valA = a.uiStatus;
        valB = b.uiStatus;
      } else {
        valA = a.id;
        valB = b.id;
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [enriched, search, statusFilter, clientFilter, periodFilter, paymentMethodFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPageSafe = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPageSafe - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("asc"); }
  }

  function renderSortIcon(field: string) {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-1 inline text-slate-500" />;
    return <ArrowUpDown className="h-3 w-3 opacity-100 ml-1 inline text-blue-500" />;
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("Todos");
    setClientFilter("all");
    setPeriodFilter("all");
    setPaymentMethodFilter("Todas");
    setPage(1);
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">Controle de Cobrança</h1>
          <p className="mt-1.5 text-sm text-slate-400">Acompanhe pendências, atrasos e recebimentos com ação rápida.</p>
        </div>
      </section>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {/* Recebido no mês */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
          <div className="flex items-start justify-between">
            <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Recebido no mês</p>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-emerald-400">{loading ? "..." : formatCurrency(kpis.receivedValue)}</p>
          <p className="mt-1 sm:mt-1.5 text-xs font-semibold text-slate-500">
            <CheckCircle2 className="inline h-3 w-3 mr-1 text-emerald-500" />
            {loading ? "..." : `${kpis.receivedCount} parcela(s) paga(s)`}
          </p>
        </div>
        {/* Total pendente */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-amber-500" />
          <div className="flex items-start justify-between">
            <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Total pendente</p>
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-amber-400">{loading ? "..." : formatCurrency(kpis.pendingValue)}</p>
          <p className="mt-1 sm:mt-1.5 text-xs font-semibold text-slate-500">
            <Clock className="inline h-3 w-3 mr-1 text-amber-500" />
            {loading ? "..." : `${kpis.pendingCount} parcela(s) em aberto`}
          </p>
        </div>
        {/* Total atrasado */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-red-500" />
          <div className="flex items-start justify-between">
            <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Total atrasado</p>
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-red-400">{loading ? "..." : formatCurrency(kpis.overdueValue)}</p>
          <p className="mt-1 sm:mt-1.5 text-xs font-semibold text-slate-500">
            <AlertTriangle className="inline h-3 w-3 mr-1 text-red-500" />
            {loading ? "..." : `${kpis.overdueCount} parcela(s) em atraso`}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3 sm:p-5 lg:p-6 shadow-xl backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12 mb-5">
          <div className="md:col-span-2 xl:col-span-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                placeholder="Nome, telefone, empréstimo ou parcela"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="Todos">Todos</option>
              <option value="Pago">Pago</option>
              <option value="Pendente">Pendente</option>
              <option value="Atrasado">Em atraso</option>
            </select>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Cliente</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={clientFilter}
              onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            >
              <option value="all">Todos os clientes</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Período</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={periodFilter}
              onChange={(e) => { setPeriodFilter(e.target.value); setPage(1); }}
            >
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="next7">Próximos 7 dias</option>
              <option value="month_current">Mês atual</option>
              <option value="last30">Últimos 30 dias</option>
            </select>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Forma de pagamento</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={paymentMethodFilter}
              onChange={(e) => { setPaymentMethodFilter(e.target.value); setPage(1); }}
            >
              <option value="Todas">Todas</option>
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Transferência">Transferência</option>
              <option value="Cartão">Cartão</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div className="xl:col-span-1 flex items-end">
            <button
              onClick={clearFilters}
              className="inline-flex h-[42px] w-full items-center justify-center whitespace-nowrap rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-700"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-100">Parcelas da cobrança</h3>
          <span className="text-sm text-slate-400">
            Resultados: <strong className="text-slate-200">{filtered.length}</strong>
          </span>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-800 md:block">
          <table className="w-full text-left text-sm text-slate-300" style={{ minWidth: 1020 }}>
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("client")}>
                  Cliente {renderSortIcon("client")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("loan")}>
                  Empréstimo {renderSortIcon("loan")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("number")}>
                  Parcela {renderSortIcon("number")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("due_date")}>
                  Vencimento {renderSortIcon("due_date")}
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("amount")}>
                  Valor {renderSortIcon("amount")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("status")}>
                  Status {renderSortIcon("status")}
                </th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Carregando parcelas...</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma parcela encontrada.</td></tr>
              ) : (
                pageRows.map((inst) => (
                  <tr key={inst.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-100">{inst.debtor?.name || "—"}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-300">#{inst.loan_id}</td>
                    <td className="px-4 py-4 text-slate-300">{inst.installmentNumber}/{enriched.filter(e => sameId(e.loan_id, inst.loan_id)).length}</td>
                    <td className="px-4 py-4 text-slate-400">{formatDate(inst.dueDate)}</td>
                    <td className="px-4 py-4 text-right font-bold text-slate-100">{formatCurrency(inst.amount)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(inst.uiStatus)}`}>
                        {inst.uiStatus}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inst.uiStatus !== "Pago" && (
                          <button onClick={() => openPayModal(inst)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20" title="Registrar pagamento">
                            <DollarSign className="h-3.5 w-3.5" />Pagar
                          </button>
                        )}
                        {inst.uiStatus === "Pago" && (
                          <button onClick={() => openRevertModal(inst)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 text-xs font-semibold text-amber-400 transition-colors hover:bg-amber-500/20" title="Estornar pagamento">
                            <RotateCcw className="h-3.5 w-3.5" />Estornar
                          </button>
                        )}
                        <button onClick={() => openDeleteModal(inst)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20" title="Excluir parcela">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="grid gap-3 md:hidden">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Carregando parcelas...
            </div>
          ) : pageRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma parcela encontrada.
            </div>
          ) : (
            pageRows.map((inst) => {
              const totalLoanInstallments = enriched.filter((item) => sameId(item.loan_id, inst.loan_id)).length;
              const isPaid = inst.uiStatus === "Pago";

              return (
                <MobileDataCard
                  key={inst.id}
                  title={inst.debtor?.name || "Cliente"}
                  subtitle={`Emprestimo #${inst.loan_id} • Parcela ${inst.installmentNumber}/${totalLoanInstallments}`}
                  badge={(
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(inst.uiStatus)}`}>
                      {inst.uiStatus}
                    </span>
                  )}
                  actions={(
                    <MobileDataCardActions
                      primary={isPaid ? (
                        <button
                          onClick={() => openRevertModal(inst)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500/90 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Estornar
                        </button>
                      ) : (
                        <button
                          onClick={() => openPayModal(inst)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                        >
                          <DollarSign className="h-4 w-4" />
                          Pagar
                        </button>
                      )}
                    >
                      <button
                        onClick={() => openDeleteModal(inst)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
                        title="Excluir parcela"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </MobileDataCardActions>
                  )}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <MobileDataCardRow label="Vencimento" value={formatDate(inst.dueDate)} />
                    <MobileDataCardRow label="Valor" value={formatCurrency(inst.amount)} />
                  </div>
                </MobileDataCard>
              );
            })
          )}
        </div>

        {!loading && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/60 pt-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-400">
              Mostrando <span className="text-slate-200">{filtered.length > 0 ? startIdx + 1 : 0}</span> até{" "}
              <span className="text-slate-200">{Math.min(startIdx + pageSize, filtered.length)}</span> de{" "}
              <span className="font-semibold text-slate-200">{filtered.length}</span> resultados
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-400">
                Página <span className="text-slate-200">{currentPageSafe}</span> de {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL: REGISTRAR PAGAMENTO ===== */}
      <ModalBase open={showPayModal} onClose={() => setShowPayModal(false)} title="Registrar pagamento" subtitle={selectedInst ? `Parcela #${selectedInst.installmentNumber} — ${selectedInst.debtor?.name || "Cliente"}` : ""}
        footer={<><ModalBtnGhost onClick={() => setShowPayModal(false)} disabled={actionLoading}>Cancelar</ModalBtnGhost><ModalBtnPrimary variant="emerald" onClick={handlePay} disabled={actionLoading}>{actionLoading ? "Salvando..." : "Confirmar pagamento"}</ModalBtnPrimary></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <ModalField label="Valor (R$)"><input className={modalInputClass} inputMode="decimal" maxLength={24} type="text" value={payAmount} onChange={(e) => setPayAmount(formatCurrencyInput(e.target.value))} /></ModalField>
          <ModalField label="Data do pagamento"><input className={modalInputClass} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></ModalField>
          <ModalField label="Método de pagamento">
            <select className={modalInputClass} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="PIX">Pix</option><option value="DINHEIRO">Dinheiro</option><option value="TRANSFERENCIA">Transferência</option><option value="CARTAO">Cartão</option><option value="BOLETO">Boleto</option><option value="OUTRO">Outro</option>
            </select>
          </ModalField>
          <ModalField label="Observações"><input className={modalInputClass} placeholder="Opcional" maxLength={200} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} /></ModalField>
        </div>
      </ModalBase>

      {/* ===== MODAL: ESTORNAR PAGAMENTO ===== */}
      <ModalBase open={showRevertModal} onClose={() => setShowRevertModal(false)} title="Estornar pagamento" subtitle={selectedInst ? `Parcela #${selectedInst.installmentNumber} — ${selectedInst.debtor?.name || "Cliente"}` : ""}
        footer={<><ModalBtnGhost onClick={() => setShowRevertModal(false)} disabled={actionLoading}>Cancelar</ModalBtnGhost><ModalBtnPrimary variant="red" onClick={handleRevert} disabled={actionLoading}>{actionLoading ? "Estornando..." : "Confirmar estorno"}</ModalBtnPrimary></>}
      >
        <p className="text-sm text-slate-400">O pagamento será removido e a parcela voltará ao status anterior (Pendente ou Atrasado). Esta ação não pode ser desfeita.</p>
      </ModalBase>

      {/* ===== MODAL: EXCLUIR PARCELA ===== */}
      <ModalBase open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Excluir parcela" subtitle={selectedInst ? `Parcela #${selectedInst.installmentNumber} — ${selectedInst.debtor?.name || "Cliente"}` : ""}
        footer={<><ModalBtnGhost onClick={() => setShowDeleteModal(false)} disabled={actionLoading}>Cancelar</ModalBtnGhost><ModalBtnPrimary variant="red" onClick={handleDeleteInst} disabled={actionLoading}>{actionLoading ? "Excluindo..." : "Confirmar exclusão"}</ModalBtnPrimary></>}
      >
        <p className="text-sm text-slate-400">A parcela será removida permanentemente do empréstimo. Parcelas pagas devem ser estornadas antes de serem excluídas.</p>
      </ModalBase>
    </div>
  );
}
