"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { ModalBase, ModalBtnGhost, ModalBtnPrimary, ModalField, modalInputClass } from "../../../components/ModalBase";
import { MobileDataCard, MobileDataCardActions, MobileDataCardRow } from "../../../components/MobileDataCard";

import {
  UsersIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  FilterXIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpDownIcon,
  EyeIcon,
  Edit2Icon,
  Trash2Icon,
  Plus,
} from "lucide-react";

// --- TYPES ---
type Debtor = {
  id: string | number;
  name?: string;
  phone?: string;
  document?: string;
  cpf?: string;
  email?: string;
  status?: string;
  created_at?: string;
};

type Loan = {
  id: string | number;
  debtor_id: string | number;
  status?: string;
};

type Installment = {
  id: string | number;
  debtor_id: string | number;
  loan_id: string | number;
  status?: string;
  payment_date?: string;
  due_date?: string;
  amount?: number | string;
  value?: number | string;
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
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return new Date(year, month, day);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function startOfDay(value: any) {
  const date = parseDateValue(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysBetween(fromDate: Date, toDate: Date) {
  if (!(fromDate instanceof Date) || !(toDate instanceof Date)) return 0;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCurrency(value: any) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDocument(value: any) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value || "-";
}

function formatPhone(value: any) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return value || "-";
}

function getScoreIndicator(scoreValue: number) {
  const score = Number.isFinite(Number(scoreValue)) ? Number(scoreValue) : 0;
  if (score >= 850) {
    return {
      badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
      dotClass: "bg-emerald-500",
      textClass: "text-emerald-700",
      label: "Risco baixo",
    };
  }
  if (score >= 700) {
    return {
      badgeClass: "border-yellow-300 bg-yellow-50 text-yellow-700",
      dotClass: "bg-yellow-500",
      textClass: "text-yellow-700",
      label: "Risco moderado",
    };
  }
  if (score >= 550) {
    return {
      badgeClass: "border-orange-300 bg-orange-50 text-orange-700",
      dotClass: "bg-orange-500",
      textClass: "text-orange-700",
      label: "Risco médio",
    };
  }
  return {
    badgeClass: "border-red-300 bg-red-50 text-red-700",
    dotClass: "bg-red-500",
    textClass: "text-red-700",
    label: "Risco alto",
  };
}

export function ClientesClient() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [deletingDebtor, setDeletingDebtor] = useState<Debtor | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDocument, setFormDocument] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formStatus, setFormStatus] = useState("ativo");

  async function readApiMessage(response: Response, fallback: string) {
    try {
      const body = await response.json();
      if (typeof body?.message === "string" && body.message.trim()) {
        return body.message;
      }
    } catch {
      // ignore body parsing failures
    }
    return fallback;
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [resDebtors, resInstallments, resLoans] = await Promise.all([
        fetch("/api/tables/debtors").then((r) => r.json()),
        fetch("/api/tables/installments").then((r) => r.json()),
        fetch("/api/tables/loans").then((r) => r.json()),
      ]);
      if (resDebtors.data) setDebtors(resDebtors.data);
      if (resInstallments.data) setInstallments(resInstallments.data);
      if (resLoans.data) setLoans(resLoans.data);
    } catch (err: any) {
      setError("Falha ao carregar dados dos clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Modal handlers ---
  function openCreateModal() {
    setEditingDebtor(null);
    setFormName(""); setFormDocument(""); setFormPhone(""); setFormEmail(""); setFormStatus("ativo");
    setShowFormModal(true);
  }

  function openEditModal(d: Debtor) {
    setEditingDebtor(d);
    setFormName(d.name || "");
    setFormDocument(d.document || d.cpf || "");
    setFormPhone(d.phone || "");
    setFormEmail(d.email || "");
    setFormStatus(d.status || "ativo");
    setShowFormModal(true);
  }

  function openDeleteModal(d: Debtor) {
    setDeletingDebtor(d);
    setShowDeleteModal(true);
  }

  async function handleSaveClient() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tables/debtors").then((r) => r.json());
      let rows: any[] = res.data || [];
      if (editingDebtor) {
        rows = rows.map((r: any) => String(r.id) === String(editingDebtor.id)
          ? { ...r, name: formName.trim(), document: formDocument.trim(), cpf: formDocument.trim(), phone: formPhone.trim(), email: formEmail.trim(), status: formStatus }
          : r);
      } else {
        const maxId = rows.reduce((m: number, r: any) => Math.max(m, Number(r.id) || 0), 0);
        rows.push({ id: maxId + 1, name: formName.trim(), document: formDocument.trim(), cpf: formDocument.trim(), phone: formPhone.trim(), email: formEmail.trim(), status: formStatus, created_at: new Date().toISOString() });
      }
      const putResponse = await fetch("/api/tables/debtors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      if (!putResponse.ok) {
        throw new Error(await readApiMessage(putResponse, "Nao foi possivel salvar o cliente."));
      }
      setShowFormModal(false);
      await fetchData();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel salvar o cliente.";
      setError(message);
      window.alert(message);
    } finally { setSaving(false); }
  }

  async function handleDeleteClient() {
    if (!deletingDebtor) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tables/debtors").then((r) => r.json());
      const rows = (res.data || []).filter((r: any) => String(r.id) !== String(deletingDebtor.id));
      const putResponse = await fetch("/api/tables/debtors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      if (!putResponse.ok) {
        throw new Error(await readApiMessage(putResponse, "Nao foi possivel excluir o cliente."));
      }
      setShowDeleteModal(false); setDeletingDebtor(null);
      await fetchData();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel excluir o cliente.";
      setError(message);
      window.alert(message);
    } finally { setSaving(false); }
  }

  // --- ENGINE DE PROCESSAMENTO (Réplica exata do backend/ejs) ---
  const enrichedDebtors = useMemo(() => {
    const today = startOfDay(new Date());

    return debtors.map((debtor) => {
      // Filtrar parcelas desse devedor
      const debInstallments = installments.filter((i) => sameId(i.debtor_id, debtor.id));
      const debLoans = loans.filter((l) => sameId(l.debtor_id, debtor.id));

      let loansCount = debLoans.length;
      let overdueCount = 0;
      let maxOverdueDays = 0;
      let openTotal = 0;

      let hasActiveLoan = false;

      // Histórico de parcelas passadas
      const history: any[] = [];

      debInstallments.forEach((inst) => {
        const status = String(inst.status || "").trim().toLowerCase();
        const amount = Number(inst.amount ?? inst.value ?? 0);
        const dueDate = startOfDay(inst.due_date);
        const paymentDate = startOfDay(inst.payment_date);

        if (dueDate) {
          history.push({
            status,
            dueDate,
            paymentDate,
            amount: Number.isFinite(amount) ? amount : 0,
          });

          if (status !== "pago" && today) {
            openTotal += Number.isFinite(amount) ? amount : 0;
            const daysOverdue = daysBetween(dueDate, today);
            if (daysOverdue > 0 || status === "atrasado") {
              overdueCount += 1;
              maxOverdueDays = Math.max(maxOverdueDays, daysOverdue);
            }
          }
        }
      });

      // Status derivation
      let uiStatus = "Inativo";
      const userRawStatus = String(debtor.status || "").trim().toLowerCase();
      if (userRawStatus === "ativo") {
        uiStatus = "Ativo";
      } else if (userRawStatus === "inativo") {
        uiStatus = "Inativo";
      }

      if (uiStatus === "Ativo") {
        if (overdueCount > 0) {
          uiStatus = "Atrasado";
        } else if (openTotal === 0 && loansCount > 0) {
          uiStatus = "Quitado";
        }
      }

      // --- CÁLCULO ÍNDICE CREDIX ---
      let scoreRaw = 500;
      history.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      let paidOnTimeCount = 0;
      let paidLateCount = 0;
      let unpaidOverdueCount = 0;
      let totalLateDays = 0;
      let totalOverdueOpenDays = 0;

      history.forEach((item) => {
        if (!item.dueDate || !today) return;
        if (item.dueDate > today && item.status !== "pago") return;

        const isPaid = item.status === "pago" || Boolean(item.paymentDate);
        if (isPaid) {
          const lateDays = item.paymentDate ? Math.max(daysBetween(item.dueDate, item.paymentDate), 0) : 0;
          if (lateDays === 0) {
            scoreRaw += 12;
            paidOnTimeCount += 1;
          } else if (lateDays <= 3) {
            scoreRaw -= 8;
            paidLateCount += 1;
            totalLateDays += lateDays;
          } else if (lateDays <= 7) {
            scoreRaw -= 20;
            paidLateCount += 1;
            totalLateDays += lateDays;
          } else if (lateDays <= 15) {
            scoreRaw -= 38;
            paidLateCount += 1;
            totalLateDays += lateDays;
          } else {
            scoreRaw -= 60;
            paidLateCount += 1;
            totalLateDays += lateDays;
          }
          return;
        }

        const overdueDays = Math.max(daysBetween(item.dueDate, today), 0);
        if (overdueDays > 0) {
          unpaidOverdueCount += 1;
          totalOverdueOpenDays += overdueDays;
          if (overdueDays <= 7) scoreRaw -= 48;
          else if (overdueDays <= 15) scoreRaw -= 78;
          else if (overdueDays <= 30) scoreRaw -= 118;
          else scoreRaw -= 165;
        }
      });

      let onTimeStreak = 0;
      for (let index = history.length - 1; index >= 0; index -= 1) {
        const item = history[index];
        const isPaid = item.status === "pago" || Boolean(item.paymentDate);
        if (!isPaid) break;
        const lateDays = item.paymentDate ? Math.max(daysBetween(item.dueDate, item.paymentDate), 0) : 0;
        if (lateDays === 0) onTimeStreak += 1;
        else break;
      }

      scoreRaw += Math.min(onTimeStreak * 6, 30);
      const closedLoansCount = debLoans.filter((l) => String(l.status).toLowerCase() === "quitado").length;
      scoreRaw += Math.min(closedLoansCount * 10, 40);

      const totalDueCount = history.filter((i) => i.dueDate <= today!).length;
      const score = Math.max(0, Math.min(1000, Math.round(scoreRaw)));
      // Fim Índice

      return {
        ...debtor,
        uiStatus,
        loansCount,
        overdueCount,
        maxOverdueDays,
        openTotal,
        score,
        totalDueCount,
      };
    });
  }, [debtors, installments, loans]);

  // Aplicação de Filtros e Ordenação
  const filteredAndSorted = useMemo(() => {
    let result = [...enrichedDebtors];

    if (statusFilter !== "Todos") {
      result = result.filter((d) => d.uiStatus === statusFilter);
    }

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((d) =>
        `${d.name || ""} ${d.phone || ""} ${d.document || d.cpf || ""} ${d.email || ""}`
          .toLowerCase()
          .includes(s)
      );
    }

    result.sort((a, b) => {
      let valA: any = a[sortBy as keyof typeof a];
      let valB: any = b[sortBy as keyof typeof b];

      if (sortBy === "open_total") {
        valA = a.openTotal;
        valB = b.openTotal;
      } else if (sortBy === "overdue_count") {
        valA = a.overdueCount;
        valB = b.overdueCount;
      } else if (sortBy === "document") {
        valA = (a.document || a.cpf || "").replace(/\D/g, "");
        valB = (b.document || b.cpf || "").replace(/\D/g, "");
      } else if (sortBy === "status") {
        valA = a.uiStatus;
        valB = b.uiStatus;
      } else if (sortBy === "name" || sortBy === "phone") {
        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [enrichedDebtors, search, statusFilter, sortBy, sortDir]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const currentPageSafe = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPageSafe - 1) * pageSize;
  const pageRows = filteredAndSorted.slice(startIdx, startIdx + pageSize);

  // KPIs
  const totalDebtors = enrichedDebtors.length;
  const activeDebtors = enrichedDebtors.filter((d) => d.uiStatus === "Ativo").length;
  const inactiveDebtors = enrichedDebtors.filter((d) => ["Inativo", "Quitado"].includes(d.uiStatus)).length;
  const overdueDebtors = enrichedDebtors.filter((d) => d.uiStatus === "Atrasado").length;

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  function renderSortIcon(field: string) {
    if (sortBy !== field) return <ArrowUpDownIcon className="h-3 w-3 opacity-40 ml-1 inline" />;
    return <ArrowUpDownIcon className="h-3 w-3 opacity-100 ml-1 inline text-blue-500" />;
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "Ativo":
      case "Quitado":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "Atrasado":
        return "bg-red-100 text-red-800 border-red-300";
      case "Inativo":
        return "bg-slate-200 text-slate-800 border-slate-300";
      default:
        return "bg-slate-200 text-slate-800 border-slate-300";
    }
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-24 lg:pb-8">
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">Clientes</h1>
          <p className="mt-1.5 text-sm text-slate-400">Consulte perfil, contato e situação de cada cliente.</p>
        </div>
        <button onClick={openCreateModal} className="inline-flex h-11 min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] px-5 text-sm font-bold text-white transition-all hover:bg-[#3b6ef0] shadow-[0_4px_14px_rgba(79,126,247,0.4)] active:translate-y-px active:scale-[0.98]">
          <Plus className="h-4 w-4" /> Novo cliente
        </button>
      </section>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-[#4F7EF7]" />
          <UsersIcon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Total de clientes</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-slate-100">{loading ? "..." : totalDebtors}</p>
          <p className="mt-1 sm:mt-1.5 text-xs font-semibold text-slate-500">
            {loading ? "Carregando..." : `${totalDebtors} registros`}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
          <CheckCircle2Icon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Clientes ativos</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-emerald-400">{loading ? "..." : activeDebtors}</p>
          <p className="mt-1 sm:mt-1.5 text-xs font-semibold text-slate-500">
            {loading ? "Carregando..." : `${((activeDebtors / (totalDebtors || 1)) * 100).toFixed(1)}% da base`}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-slate-500" />
          <ClockIcon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Clientes inativos</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-slate-100">{loading ? "..." : inactiveDebtors}</p>
          <p className="mt-1 sm:mt-1.5 text-xs font-semibold text-slate-500">{loading ? "Carregando..." : "Sem pendências"}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-red-500" />
          <AlertTriangleIcon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Com atraso</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-red-400">{loading ? "..." : overdueDebtors}</p>
          <p className="mt-1 sm:mt-1.5 text-xs font-semibold text-slate-500">
            {loading ? "Carregando..." : "Boletos vencidos"}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3 sm:p-5 lg:p-6 shadow-xl backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 md:gap-4 gap-4 mb-5">
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition"
              placeholder="Nome, telefone ou documento"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="Todos">Todos</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Atrasado">Atrasado</option>
              <option value="Quitado">Quitado</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Ordenar por</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setSortDir("asc");
              }}
            >
              <option value="name">Nome</option>
              <option value="document">Documento</option>
              <option value="phone">Telefone</option>
              <option value="open_total">Maior em aberto</option>
              <option value="overdue_count">Parcelas em atraso</option>
              <option value="status">Status</option>
            </select>
          </div>
          <div className="md:col-span-2 md:self-end">
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("Todos");
                setSortBy("name");
                setSortDir("asc");
              }}
              className="flex w-full h-[38px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              <FilterXIcon className="h-4 w-4" /> Limpar filtros
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-800 md:block">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors"
                  onClick={() => toggleSort("name")}
                >
                  Cliente {renderSortIcon("name")}
                </th>
                <th
                  className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors"
                  onClick={() => toggleSort("status")}
                >
                  Status {renderSortIcon("status")}
                </th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-center">Índice Credix</th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  onClick={() => toggleSort("overdue_count")}
                >
                  Atrasos {renderSortIcon("overdue_count")}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  onClick={() => toggleSort("open_total")}
                >
                  Total em aberto {renderSortIcon("open_total")}
                </th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Carregando clientes...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                pageRows.map((debtor) => {
                  const scoreInfo = getScoreIndicator(debtor.score);
                  return (
                    <tr
                      key={debtor.id}
                      className="transition-colors hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-100">{debtor.name || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {formatDocument(debtor.document || debtor.cpf) || "Sem doc."} • {formatPhone(debtor.phone) || "Sem cel."}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(
                            debtor.uiStatus
                          )}`}
                        >
                          {debtor.uiStatus}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {debtor.overdueCount > 0 ? (
                          <div className="text-red-400 font-semibold">{debtor.overdueCount} boleto(s) pendente(s)</div>
                        ) : debtor.openTotal > 0 ? (
                          <div className="text-emerald-400 font-semibold">Em dia</div>
                        ) : (
                          <div className="text-slate-500 font-semibold">-</div>
                        )}
                        {debtor.maxOverdueDays > 0 && (
                          <div className="text-xs text-red-400/80">({debtor.maxOverdueDays} dias atrasado)</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {debtor.totalDueCount > 0 ? (
                          <div className="inline-flex flex-col items-center">
                            <div
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${scoreInfo.badgeClass}`}
                            >
                              <span className={`h-2 w-2 rounded-full ${scoreInfo.dotClass}`} />
                              {debtor.score}
                            </div>
                            <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              {scoreInfo.label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-slate-600">Sem histórico</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {debtor.overdueCount > 0 ? (
                          <span className="text-base font-bold text-red-400">{debtor.overdueCount}</span>
                        ) : (
                          <span className="text-slate-600 font-semibold">0</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {debtor.openTotal > 0 ? (
                          <span className="text-sm font-bold text-slate-100">{formatCurrency(debtor.openTotal)}</span>
                        ) : (
                          <span className="text-slate-600 font-semibold">R$ 0,00</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEditModal(debtor)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20" title="Editar">
                            <Edit2Icon className="h-4 w-4" />
                          </button>
                          <button onClick={() => openDeleteModal(debtor)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20" title="Excluir">
                            <Trash2Icon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé Tabela (Paginação) */}
        <div className="grid gap-3 md:hidden">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Carregando clientes...
            </div>
          ) : pageRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Nenhum cliente encontrado
            </div>
          ) : (
            pageRows.map((debtor) => {
              const scoreInfo = getScoreIndicator(debtor.score);
              const situation = debtor.overdueCount > 0
                ? `${debtor.overdueCount} boleto(s) pendente(s)`
                : debtor.openTotal > 0
                  ? "Em dia"
                  : "-";

              return (
                <MobileDataCard
                  key={debtor.id}
                  title={debtor.name || "-"}
                  subtitle={`${formatDocument(debtor.document || debtor.cpf) || "Sem doc."} • ${formatPhone(debtor.phone) || "Sem cel."}`}
                  badge={(
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(debtor.uiStatus)}`}>
                      {debtor.uiStatus}
                    </span>
                  )}
                  actions={(
                    <MobileDataCardActions
                      primary={(
                        <button
                          onClick={() => openEditModal(debtor)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                        >
                          <Edit2Icon className="h-4 w-4" />
                          Editar
                        </button>
                      )}
                    >
                      <button
                        onClick={() => openDeleteModal(debtor)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
                        title="Excluir"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </MobileDataCardActions>
                  )}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <MobileDataCardRow
                      label="Situacao"
                      value={(
                        <div>
                          <div className={debtor.overdueCount > 0 ? "text-red-400" : debtor.openTotal > 0 ? "text-emerald-400" : "text-slate-400"}>
                            {situation}
                          </div>
                          {debtor.maxOverdueDays > 0 ? (
                            <div className="mt-1 text-xs text-red-400/80">{debtor.maxOverdueDays} dias atrasado</div>
                          ) : null}
                        </div>
                      )}
                    />
                    <MobileDataCardRow
                      label="Indice Credix"
                      value={debtor.totalDueCount > 0 ? debtor.score : "Sem historico"}
                      valueClassName={debtor.totalDueCount > 0 ? scoreInfo.textClass : "text-slate-400"}
                    />
                    <MobileDataCardRow
                      label="Atrasos"
                      value={debtor.overdueCount > 0 ? debtor.overdueCount : "0"}
                      valueClassName={debtor.overdueCount > 0 ? "text-red-400" : "text-slate-300"}
                    />
                    <MobileDataCardRow
                      label="Total em aberto"
                      value={debtor.openTotal > 0 ? formatCurrency(debtor.openTotal) : "R$ 0,00"}
                    />
                  </div>
                </MobileDataCard>
              );
            })
          )}
        </div>

        {!loading && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/60 pt-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-400">
              Mostrando <span className="text-slate-200">{filteredAndSorted.length > 0 ? startIdx + 1 : 0}</span> até{" "}
              <span className="text-slate-200">{Math.min(startIdx + pageSize, filteredAndSorted.length)}</span> de{" "}
              <span className="font-semibold text-slate-200">{filteredAndSorted.length}</span> resultados
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-400">
                Página <span className="text-slate-200">{currentPageSafe}</span> de {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL: CRIAR / EDITAR CLIENTE ===== */}
      <ModalBase open={showFormModal} onClose={() => setShowFormModal(false)} title={editingDebtor ? "Editar cliente" : "Novo cliente"} subtitle={editingDebtor ? "Altere os dados do cliente." : "Preencha os dados do novo cliente."}
        footer={<><ModalBtnGhost onClick={() => setShowFormModal(false)} disabled={saving}>Cancelar</ModalBtnGhost><ModalBtnPrimary onClick={handleSaveClient} disabled={saving}>{saving ? "Salvando..." : editingDebtor ? "Salvar" : "Cadastrar"}</ModalBtnPrimary></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <ModalField label="Nome completo" full><input className={modalInputClass} maxLength={200} placeholder="Ex: João Silva" value={formName} onChange={(e) => setFormName(e.target.value)} /></ModalField>
          <ModalField label="CPF / CNPJ"><input className={modalInputClass} maxLength={18} placeholder="000.000.000-00" value={formDocument} onChange={(e) => setFormDocument(e.target.value)} /></ModalField>
          <ModalField label="Telefone"><input className={modalInputClass} maxLength={15} placeholder="(00) 90000-0000" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} /></ModalField>
          <ModalField label="E-mail"><input className={modalInputClass} type="email" placeholder="email@exemplo.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></ModalField>
          <ModalField label="Status"><select className={modalInputClass} value={formStatus} onChange={(e) => setFormStatus(e.target.value)}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></ModalField>
        </div>
      </ModalBase>

      {/* ===== MODAL: EXCLUIR CLIENTE ===== */}
      <ModalBase open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Confirmar exclusão" subtitle={`Deseja excluir "${deletingDebtor?.name || "este cliente"}"?`}
        footer={<><ModalBtnGhost onClick={() => setShowDeleteModal(false)} disabled={saving}>Cancelar</ModalBtnGhost><ModalBtnPrimary variant="red" onClick={handleDeleteClient} disabled={saving}>{saving ? "Excluindo..." : "Excluir cliente"}</ModalBtnPrimary></>}
      >
        <p className="text-sm text-slate-400">Esta ação não pode ser desfeita. O cliente e seu histórico serão removidos permanentemente.</p>
      </ModalBase>
    </div>
  );
}
