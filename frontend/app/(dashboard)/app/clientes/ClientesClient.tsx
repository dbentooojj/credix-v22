"use client";

import { Fragment, useState, useEffect, useMemo, useCallback, type MouseEvent } from "react";
import { ClientFinancialPanel, useClientFinancials } from "./ClientFinancialPanel";
import { ModalBase, ModalBtnGhost, ModalBtnPrimary, ModalField, modalInputClass } from "../../../components/ModalBase";
import { MobileDataCard, MobileDataCardRow } from "../../../components/MobileDataCard";
import { PageHeader } from "../../../components/PageHeader";
import { useToast } from "../../../components/ToastProvider";

import {
  UsersIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  FilterXIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
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

type ClientOverview = Debtor & {
  uiStatus: string; loansCount: number; overdueCount: number; pendingCount: number;
  maxOverdueDays: number; openTotal: number; overdueTotal: number; score: number; totalDueCount: number;
};

function situationText(debtor: ClientOverview) {
  if (debtor.overdueCount > 0) return debtor.overdueCount + (debtor.overdueCount === 1 ? " parcela vencida" : " parcelas vencidas");
  if (debtor.pendingCount > 0) return debtor.pendingCount + (debtor.pendingCount === 1 ? " parcela a vencer" : " parcelas a vencer");
  return debtor.openTotal > 0 ? "Em dia" : debtor.loansCount > 0 ? "Sem saldo em aberto" : "Sem empréstimos";
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
      label: "Risco medio",
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
  const toast = useToast();
  const [debtors, setDebtors] = useState<ClientOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(5);
  const financials = useClientFinancials(expandedId, historyPage, historyPageSize);

  function toggleClient(id: string | number) {
    setExpandedId((current) => current === String(id) ? null : String(id));
    setHistoryPage(1);
    setHistoryPageSize(5);
  }

  function handleClientRowClick(event: MouseEvent<HTMLElement>, id: string | number) {
    // Buttons retain their own action; interacting with the open history must
    // never collapse the mobile card or toggle the row twice.
    if ((event.target as Element).closest("button, a, input, select, textarea, [data-client-details]")) return;
    toggleClient(id);
  }

  function renderClientName(debtor: ClientOverview, mobile = false) {
    const expanded = expandedId === String(debtor.id);
    return <button type="button" onClick={() => toggleClient(debtor.id)} aria-expanded={expanded}
      aria-controls={(mobile ? "mobile" : "table") + "-client-financials-" + debtor.id}
      className="inline-flex max-w-full items-center gap-1.5 rounded text-left font-semibold hover:text-blue-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400">
      <span className="break-words">{debtor.name || "-"}</span>
      <ChevronDownIcon className={"h-3.5 w-3.5 shrink-0 transition-transform " + (expanded ? "rotate-180" : "")} />
    </button>;
  }

  function renderFinancialPanel() {
    return <ClientFinancialPanel financials={financials} page={historyPage} pageSize={historyPageSize}
      onPageChange={setHistoryPage} onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }} />;
  }

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
      setError(null);
      const response = await fetch("/api/tables/debtors/overview", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar dados dos clientes.");
      const body = await response.json();
      setDebtors(body.data);
      setExpandedId(null);
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
        throw new Error(await readApiMessage(putResponse, "Não foi possível salvar o cliente."));
      }
      setShowFormModal(false);
      await fetchData();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Não foi possível salvar o cliente.";
      setError(message);
      toast.error(message, "Falha ao salvar cliente");
    } finally { setSaving(false); }
  }

  async function handleDeleteClient() {
    if (!deletingDebtor) return;
    const debtorName = deletingDebtor.name || `#${deletingDebtor.id}`;
    setSaving(true);
    try {
      const res = await fetch("/api/tables/debtors").then((r) => r.json());
      const rows = (res.data || []).filter((r: any) => String(r.id) !== String(deletingDebtor.id));
      const putResponse = await fetch("/api/tables/debtors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      if (!putResponse.ok) {
        throw new Error(await readApiMessage(putResponse, "Não foi possível excluir o cliente."));
      }
      setShowDeleteModal(false); setDeletingDebtor(null);
      await fetchData();
      toast.success(`Cliente ${debtorName} excluido com sucesso.`);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Não foi possível excluir o cliente.";
      setShowDeleteModal(false);
      setDeletingDebtor(null);
      setError(message);
      toast.error(message, "Falha ao excluir cliente");
    } finally { setSaving(false); }
  }

  const enrichedDebtors = debtors;

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

  useEffect(() => { setExpandedId(null); setPage(1); }, [search, statusFilter, sortBy, sortDir]);
  useEffect(() => { setExpandedId(null); }, [currentPageSafe]);

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
      <PageHeader
        title="Clientes"
        actions={(
          <button onClick={openCreateModal} className="inline-flex h-11 min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] px-5 text-sm font-bold text-white transition-all hover:bg-[#3b6ef0] shadow-[0_4px_14px_rgba(79,126,247,0.4)] active:translate-y-px active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Novo cliente
          </button>
        )}
      />

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-[#4F7EF7]" />
          <UsersIcon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Total de clientes</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-slate-100">{loading ? "..." : totalDebtors}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
          <CheckCircle2Icon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Clientes ativos</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-emerald-400">{loading ? "..." : activeDebtors}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-slate-500" />
          <ClockIcon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Clientes inativos</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-slate-100">{loading ? "..." : inactiveDebtors}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-red-500" />
          <AlertTriangleIcon className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Com atraso</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-red-400">{loading ? "..." : overdueDebtors}</p>
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
          <table className="w-full min-w-[820px] table-fixed text-left text-sm text-slate-300">
            <colgroup>
              <col className="w-[26%]" /><col className="w-[12%]" /><col className="w-[20%]" />
              <col className="w-[14%]" /><col className="w-[18%]" /><col className="w-[10%]" />
            </colgroup>
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
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("overdue_count")}>Situação {renderSortIcon("overdue_count")}</th>
                <th className="px-4 py-3 text-center">Índice Credix</th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  onClick={() => toggleSort("open_total")}
                >
                  Total em aberto {renderSortIcon("open_total")}
                </th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/20">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Carregando clientes...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                pageRows.map((debtor) => {
                  const scoreInfo = getScoreIndicator(debtor.score);
                  const expanded = expandedId === String(debtor.id);
                  return (
                    <Fragment key={debtor.id}>
                    <tr onClick={(event) => handleClientRowClick(event, debtor.id)}
                      className={`cursor-pointer border-t border-slate-200/70 first:border-t-0 transition-colors ${expanded ? "bg-[#eef4ff]" : "hover:bg-slate-800/40"}`}>
                      <td className="px-4 py-3">
                        <div className="text-slate-100">{renderClientName(debtor)}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {debtor.document || debtor.cpf ? <>{formatDocument(debtor.document || debtor.cpf)} · </> : null}
                          {debtor.phone ? formatPhone(debtor.phone) : "Sem telefone"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(
                            debtor.uiStatus
                          )}`}
                        >
                          {debtor.uiStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {debtor.overdueCount > 0 ? (
                          <div className="text-red-400 font-semibold">{situationText(debtor)}</div>
                        ) : debtor.openTotal > 0 ? (
                          <div className="text-emerald-400 font-semibold">{situationText(debtor)}</div>
                        ) : (
                          <div className="text-slate-500">{situationText(debtor)}</div>
                        )}
                        {debtor.maxOverdueDays > 0 && (
                          <div className="text-xs text-red-400/80">{debtor.maxOverdueDays} {debtor.maxOverdueDays === 1 ? "dia" : "dias"} em atraso</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
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
                      <td className="px-4 py-3 text-right">
                        {debtor.openTotal > 0 ? (
                          <span className="text-sm font-bold text-slate-100">{formatCurrency(debtor.openTotal)}</span>
                        ) : (
                          <span className="text-slate-600 font-semibold">R$ 0,00</span>
                        )}
                        {debtor.overdueTotal > 0 ? <div className="mt-0.5 text-xs text-red-400">{formatCurrency(debtor.overdueTotal)} vencidos</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={(event) => { event.stopPropagation(); openEditModal(debtor); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20" title="Editar" aria-label={"Editar cliente " + (debtor.name || debtor.id)}>
                            <Edit2Icon className="h-4 w-4" />
                          </button>
                          <button onClick={(event) => { event.stopPropagation(); openDeleteModal(debtor); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20" title="Excluir" aria-label={"Excluir cliente " + (debtor.name || debtor.id)}>
                            <Trash2Icon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded ? <tr id={"table-client-financials-" + debtor.id} className="bg-[#eef4ff]">
                      <td colSpan={6} className="p-0">{renderFinancialPanel()}</td>
                    </tr> : null}
                    </Fragment>
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
              const documentText = formatDocument(debtor.document || debtor.cpf) || "Sem documento";
              const phoneText = formatPhone(debtor.phone) || "Sem telefone";
              const situation = situationText(debtor);
              const expanded = expandedId === String(debtor.id);

              return (
                <div key={debtor.id} onClick={(event) => handleClientRowClick(event, debtor.id)} className="cursor-pointer rounded-2xl">
                <MobileDataCard
                  className={expanded ? "!bg-[#eef4ff]" : undefined}
                  title={renderClientName(debtor, true)}
                  subtitle={(
                    <div className="space-y-1">
                      {debtor.document || debtor.cpf ? <p className="truncate">
                        <span className="font-semibold text-slate-600">CPF/CNPJ:</span>{" "}
                        <span>{documentText}</span>
                      </p> : null}
                      <p className="truncate">
                        <span className="font-semibold text-slate-600">Telefone:</span>{" "}
                        <span>{phoneText}</span>
                      </p>
                    </div>
                  )}
                  badge={(
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(debtor.uiStatus)}`}>
                      {debtor.uiStatus}
                    </span>
                  )}
                  actions={(
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(event) => { event.stopPropagation(); openEditModal(debtor); }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-[0_8px_18px_rgba(5,150,105,0.28)] transition-colors hover:bg-emerald-500"
                        title="Editar"
                        aria-label={`Editar cliente ${debtor.name || debtor.id}`}
                      >
                        <Edit2Icon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(event) => { event.stopPropagation(); openDeleteModal(debtor); }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
                        title="Excluir"
                        aria-label={`Excluir cliente ${debtor.name || debtor.id}`}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                >
                  <div className="space-y-2">
                    <MobileDataCardRow
                      label="Situação"
                      value={(
                        <div>
                          <div className={debtor.overdueCount > 0 ? "text-red-400" : debtor.openTotal > 0 ? "text-emerald-400" : "text-slate-400"}>
                            {situation}
                          </div>
                          {debtor.maxOverdueDays > 0 ? (
                            <div className="mt-1 text-xs text-red-400/80">{debtor.maxOverdueDays} {debtor.maxOverdueDays === 1 ? "dia" : "dias"} em atraso</div>
                          ) : null}
                        </div>
                      )}
                      className="bg-slate-50"
                    />
                    <div>
                      <MobileDataCardRow
                        label="Índice Credix"
                        value={debtor.totalDueCount > 0 ? debtor.score + " · " + scoreInfo.label : "Sem histórico"}
                        valueClassName={debtor.totalDueCount > 0 ? scoreInfo.textClass : "text-slate-400"}
                        className="bg-slate-50"
                      />
                    </div>
                    <MobileDataCardRow
                      label="Total em aberto"
                      value={<>{formatCurrency(debtor.openTotal)}{debtor.overdueTotal > 0 ? <div className="mt-1 text-xs text-red-400">{formatCurrency(debtor.overdueTotal)} vencidos</div> : null}</>}
                      className="bg-slate-50"
                    />
                  </div>
                  {expanded ? <div id={"mobile-client-financials-" + debtor.id} className="-mx-3 mt-2 cursor-auto">{renderFinancialPanel()}</div> : null}
                </MobileDataCard>
                </div>
              );
            })
          )}
        </div>

        {!loading && totalPages > 1 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/60 pt-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-400">
              Mostrando <span className="text-slate-200">{filteredAndSorted.length > 0 ? startIdx + 1 : 0}</span> ate{" "}
              <span className="text-slate-200">{Math.min(startIdx + pageSize, filteredAndSorted.length)}</span> de{" "}
              <span className="font-semibold text-slate-200">{filteredAndSorted.length}</span> resultados
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                disabled={currentPageSafe <= 1}
                onClick={() => setPage(currentPageSafe - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-400">
                Página <span className="text-slate-200">{currentPageSafe}</span> de {totalPages}
              </span>
              <button
                disabled={currentPageSafe >= totalPages}
                onClick={() => setPage(currentPageSafe + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL: CRIAR / EDITAR CLIENTE ===== */}
      <ModalBase open={showFormModal} onClose={() => setShowFormModal(false)} title={editingDebtor ? "Editar cliente" : "Novo cliente"}
        footer={<><ModalBtnGhost onClick={() => setShowFormModal(false)} disabled={saving}>Cancelar</ModalBtnGhost><ModalBtnPrimary onClick={handleSaveClient} disabled={saving}>{saving ? "Salvando..." : editingDebtor ? "Salvar" : "Cadastrar"}</ModalBtnPrimary></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <ModalField label="Nome completo" full><input className={modalInputClass} maxLength={200} placeholder="Ex: Joao Silva" value={formName} onChange={(e) => setFormName(e.target.value)} /></ModalField>
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

