"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit2,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  CalendarDays,
  Circle,
} from "lucide-react";
import { ModalBase, ModalBtnGhost, ModalBtnPrimary, ModalField, modalInputClass } from "../../../components/ModalBase";

// --- TYPES ---
type Transaction = {
  id: string | number;
  type?: string;
  description?: string;
  category?: string;
  amount?: number | string;
  date?: string;
  status?: string;
};

// --- HELPERS ---
const SYSTEM_CATEGORIES = new Set(["emprestimo_parcela", "emprestimo_desembolso"]);

function parseDateOnly(value: any) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
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

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(date)
    .replace(/^\p{L}/u, (c) => c.toUpperCase());
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type DisplayStatus = {
  key: string;
  group: string;
  label: string;
  color: string;
};

function getDisplayStatus(item: Transaction): DisplayStatus {
  const dueDate = parseDateOnly(item.date);
  const today = startOfDay(new Date());

  if (item.status === "completed") {
    return { key: "paid", group: "paid", label: "Recebida", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
  }
  if (dueDate && startOfDay(dueDate).getTime() < today.getTime()) {
    return { key: "overdue", group: "overdue", label: "Vencida", color: "bg-red-500/20 text-red-400 border-red-500/40" };
  }
  if (dueDate && startOfDay(dueDate).getTime() === today.getTime()) {
    return { key: "due-today", group: "due-today", label: "Vence hoje", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
  }
  if (item.status === "scheduled") {
    return { key: "scheduled", group: "pending", label: "Agendada", color: "bg-sky-500/20 text-sky-400 border-sky-500/40" };
  }
  return { key: "pending", group: "pending", label: "Pendente", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
}

function buildObservation(item: Transaction, ds: DisplayStatus) {
  const dueDate = parseDateOnly(item.date);
  const today = startOfDay(new Date());
  if (ds.key === "paid") return "Recebimento registrado no sistema.";
  if (ds.key === "overdue" && dueDate) {
    const diff = Math.floor((today.getTime() - startOfDay(dueDate).getTime()) / 86400000);
    return `Em atraso há ${diff} dia(s).`;
  }
  if (ds.key === "due-today") return "Recebimento previsto para hoje.";
  if (ds.key === "scheduled") return "Recebimento agendado para esta data.";
  return "Aguardando confirmação de recebimento.";
}

function sameMonth(date: Date, cursor: Date) {
  return date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth();
}

export function ContasReceberClient() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [viewingItem, setViewingItem] = useState<Transaction | null>(null);
  const [deletingItem, setDeletingItem] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form fields
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState("pending");
  const [formCreationMode, setFormCreationMode] = useState("single");
  const [formInstallmentCount, setFormInstallmentCount] = useState("4");
  const [formInstallmentAmountMode, setFormInstallmentAmountMode] = useState("total");
  const [formRecurringMonths, setFormRecurringMonths] = useState("12");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/finance/transactions").then((r) => r.json());
      if (res.data) setTransactions(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openCreateModal() {
    setEditingItem(null);
    setFormDescription("");
    setFormCategory("");
    setFormAmount("");
    setFormDate(toDateInputValue(new Date()));
    setFormStatus("pending");
    setFormCreationMode("single");
    setFormInstallmentCount("4");
    setFormInstallmentAmountMode("total");
    setFormRecurringMonths("12");
    setShowFormModal(true);
  }

  function openEditModal(item: Transaction) {
    setEditingItem(item);
    setFormDescription(item.description || "");
    setFormCategory(item.category || "");
    setFormAmount(String(Number(item.amount || 0)));
    setFormDate(item.date || "");
    setFormStatus(item.status || "pending");
    setFormCreationMode("single");
    setShowFormModal(true);
  }

  function openViewModal(item: Transaction) {
    setViewingItem(item);
    setShowViewModal(true);
  }

  function openDeleteModal(item: Transaction) {
    setDeletingItem(item);
    setShowDeleteModal(true);
  }

  async function handleSave() {
    if (!formDescription.trim() || !formCategory.trim() || !formAmount || !formDate) return;
    setSaving(true);
    try {
      if (editingItem) {
        await fetch(`/api/finance/transactions/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "income",
            description: formDescription.trim(),
            category: formCategory.trim(),
            amount: Number(formAmount),
            date: formDate,
            status: formStatus,
          }),
        });
      } else {
        const body: any = {
          type: "income",
          description: formDescription.trim(),
          category: formCategory.trim(),
          amount: Number(formAmount),
          date: formDate,
          status: formStatus,
          creationMode: formCreationMode,
        };
        if (formCreationMode === "installments") {
          body.installmentCount = Number(formInstallmentCount);
          body.installmentAmountMode = formInstallmentAmountMode;
        }
        if (formCreationMode === "recurring_monthly") {
          body.recurringMonths = Number(formRecurringMonths);
        }
        await fetch("/api/finance/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setShowFormModal(false);
      await fetchData();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      await fetch(`/api/finance/transactions/${deletingItem.id}`, { method: "DELETE" });
      setShowDeleteModal(false);
      setDeletingItem(null);
      await fetchData();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  async function handleComplete(item: Transaction) {
    try {
      await fetch(`/api/finance/transactions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      await fetchData();
    } catch {
      // silent
    }
  }

  const incomeItems = useMemo(() => {
    return transactions
      .filter((t) => t.type === "income" && !SYSTEM_CATEGORIES.has(t.category || ""))
      .map((t) => ({
        ...t,
        amount: Number(t.amount || 0),
        dueDate: parseDateOnly(t.date),
        displayStatus: getDisplayStatus(t),
      }));
  }, [transactions]);

  const monthItems = useMemo(() => {
    return incomeItems.filter((item) => item.dueDate && sameMonth(item.dueDate, monthCursor));
  }, [incomeItems, monthCursor]);

  const summary = useMemo(() => {
    let overdue = 0, dueToday = 0, pending = 0;
    monthItems.forEach((item) => {
      const ds = item.displayStatus;
      if (ds.key === "overdue") overdue++;
      else if (ds.key === "due-today") dueToday++;
      else if (ds.group === "pending") pending++;
    });
    return { overdue, dueToday, pending };
  }, [monthItems]);

  const filtered = useMemo(() => {
    let result = [...monthItems];

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((t) =>
        (t.description || "").toLowerCase().includes(s) || (t.category || "").toLowerCase().includes(s)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((t) => {
        const ds = t.displayStatus;
        if (statusFilter === "pending") return ds.group === "pending";
        return ds.group === statusFilter;
      });
    }

    const order: Record<string, number> = { overdue: 0, "due-today": 1, scheduled: 2, pending: 3, paid: 4 };
    result.sort((a, b) => {
      const ra = order[a.displayStatus.key] ?? 9;
      const rb = order[b.displayStatus.key] ?? 9;
      if (ra !== rb) return ra - rb;
      const da = a.dueDate ? a.dueDate.getTime() : 0;
      const db = b.dueDate ? b.dueDate.getTime() : 0;
      return da - db;
    });

    return result;
  }, [monthItems, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPageSafe = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPageSafe - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  function prevMonth() {
    setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
    setPage(1);
  }
  function nextMonth() {
    setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
    setPage(1);
  }

  const STATUS_CHIPS = [
    { key: "all", label: "Todas" },
    { key: "pending", label: "Pendentes" },
    { key: "paid", label: "Recebidas" },
    { key: "overdue", label: "Vencidas" },
    { key: "due-today", label: "Vencendo hoje" },
  ];

  function getStatusIcon(key: string) {
    if (key === "paid") return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (key === "overdue") return <AlertTriangle className="h-3.5 w-3.5" />;
    if (key === "due-today") return <Clock className="h-3.5 w-3.5" />;
    if (key === "scheduled") return <CalendarDays className="h-3.5 w-3.5" />;
    return <Circle className="h-3.5 w-3.5" />;
  }

  const isEditing = Boolean(editingItem);

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-20">
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">Contas a Receber</h1>
          <p className="mt-1 text-sm text-slate-400">Acompanhe receitas, cobranças e recebimentos do seu negócio.</p>
        </div>
        <button onClick={openCreateModal} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 active:bg-emerald-700">
          <Plus className="h-4 w-4" />
          Nova receita
        </button>
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_auto] xl:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input type="text" className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" placeholder="Buscar por descrição ou categoria" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[140px] text-center text-sm font-bold text-slate-200">{formatMonthLabel(monthCursor)}</span>
          <button onClick={nextMonth} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </section>

      <section className="mb-5 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((chip) => (
          <button key={chip.key} onClick={() => { setStatusFilter(chip.key); setPage(1); }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${statusFilter === chip.key ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300" : "border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-300"}`}
          >{chip.label}</button>
        ))}
      </section>

      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5 lg:p-6 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="text-red-400">{summary.overdue} vencida(s)</span>
          <span className="text-slate-600">•</span>
          <span className="text-amber-400">{summary.dueToday} vence hoje</span>
          <span className="text-slate-600">•</span>
          <span className="text-emerald-400">{summary.pending} pendente(s)</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm text-slate-300" style={{ minWidth: 900 }}>
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-right">Valor (R$)</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Observação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Carregando receitas...</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nenhuma receita encontrada neste mês.</td></tr>
              ) : (
                pageRows.map((item) => {
                  const ds = item.displayStatus;
                  const obs = buildObservation(item, ds);
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-800/40">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-100">{item.description || "Sem descrição"}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.category || "Sem categoria"}</div>
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-400">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-4 text-slate-300 font-semibold">{formatDate(item.dueDate)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ds.color}`}>
                          {getStatusIcon(ds.key)}
                          {ds.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400 max-w-[200px]">{obs}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openViewModal(item)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 transition-colors hover:bg-blue-500/20" title="Ver detalhes"><Eye className="h-4 w-4" /></button>
                          {ds.group !== "paid" && (
                            <button onClick={() => handleComplete(item)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20" title="Marcar como recebida">
                              <CheckCircle2 className="h-3.5 w-3.5" />Receber
                            </button>
                          )}
                          <button onClick={() => openEditModal(item)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20" title="Editar"><Edit2 className="h-4 w-4" /></button>
                          <button onClick={() => openDeleteModal(item)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-800/60 pt-4">
            <p className="text-sm text-slate-400">
              Mostrando <span className="text-slate-200">{filtered.length > 0 ? startIdx + 1 : 0}</span> até{" "}
              <span className="text-slate-200">{Math.min(startIdx + pageSize, filtered.length)}</span> de{" "}
              <span className="font-semibold text-slate-200">{filtered.length}</span> receitas
            </p>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-medium text-slate-400">Página <span className="text-slate-200">{currentPageSafe}</span> de {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL: CRIAR / EDITAR ===== */}
      <ModalBase open={showFormModal} onClose={() => setShowFormModal(false)} title={isEditing ? "Editar receita" : "Nova receita"} subtitle={isEditing ? "Altere os dados da receita." : "Preencha os dados da nova receita."} size="max-w-xl"
        footer={<><ModalBtnGhost onClick={() => setShowFormModal(false)} disabled={saving}>Cancelar</ModalBtnGhost><ModalBtnPrimary variant="emerald" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Salvar receita"}</ModalBtnPrimary></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <ModalField label="Descrição" full><input className={modalInputClass} maxLength={300} placeholder="Ex: Consultoria mensal" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} /></ModalField>
          <ModalField label="Categoria"><input className={modalInputClass} maxLength={120} placeholder="Ex: Serviços" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} /></ModalField>
          <ModalField label="Valor (R$)"><input className={modalInputClass} type="number" min="0.01" step="0.01" placeholder="0,00" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} /></ModalField>
          {!isEditing && (
            <ModalField label="Tipo de lançamento" full>
              <select className={modalInputClass} value={formCreationMode} onChange={(e) => setFormCreationMode(e.target.value)}>
                <option value="single">Único</option><option value="installments">Parcelado</option><option value="recurring_monthly">Recorrente mensal</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">Use parcelado para dividir em parcelas ou recorrente para lançamentos mensais.</p>
            </ModalField>
          )}
          {!isEditing && formCreationMode === "installments" && (
            <>
              <ModalField label="Quantidade de parcelas"><input className={modalInputClass} type="number" min="2" max="60" value={formInstallmentCount} onChange={(e) => setFormInstallmentCount(e.target.value)} /></ModalField>
              <ModalField label="Valor informado"><select className={modalInputClass} value={formInstallmentAmountMode} onChange={(e) => setFormInstallmentAmountMode(e.target.value)}><option value="total">Valor total</option><option value="per_installment">Valor por parcela</option></select></ModalField>
            </>
          )}
          {!isEditing && formCreationMode === "recurring_monthly" && (
            <ModalField label="Quantidade de meses"><input className={modalInputClass} type="number" min="2" max="120" value={formRecurringMonths} onChange={(e) => setFormRecurringMonths(e.target.value)} /></ModalField>
          )}
          <ModalField label="Data de vencimento"><input className={modalInputClass} type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} /></ModalField>
          <ModalField label="Situação">
            <select className={modalInputClass} value={formStatus} onChange={(e) => setFormStatus(e.target.value)}>
              <option value="pending">Pendente</option><option value="scheduled">Agendada</option><option value="completed">Recebida</option>
            </select>
          </ModalField>
        </div>
      </ModalBase>

      {/* ===== MODAL: VER DETALHES ===== */}
      <ModalBase open={showViewModal} onClose={() => setShowViewModal(false)} title="Detalhes da receita" subtitle="Visualize as informações desta receita."
        footer={<><ModalBtnGhost onClick={() => setShowViewModal(false)}>Fechar</ModalBtnGhost><ModalBtnPrimary variant="emerald" onClick={() => { setShowViewModal(false); if (viewingItem) openEditModal(viewingItem); }}>Editar receita</ModalBtnPrimary></>}
      >
        {viewingItem && (() => {
          const ds = getDisplayStatus(viewingItem);
          const obs = buildObservation(viewingItem, ds);
          return (
            <div className="space-y-4">
              <div className="flex items-start justify-between rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                <p className="font-bold text-slate-100">{viewingItem.description || "Sem descrição"}</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ds.color}`}>{ds.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Categoria</p><p className="mt-1 text-sm font-semibold text-slate-200">{viewingItem.category || "—"}</p></div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor</p><p className="mt-1 text-sm font-semibold text-emerald-400">{formatCurrency(viewingItem.amount)}</p></div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vencimento</p><p className="mt-1 text-sm font-semibold text-slate-200">{formatDate(parseDateOnly(viewingItem.date))}</p></div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Observação</p><p className="mt-1 text-sm font-medium text-slate-300">{obs}</p></div>
              </div>
            </div>
          );
        })()}
      </ModalBase>

      {/* ===== MODAL: EXCLUIR ===== */}
      <ModalBase open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Confirmar exclusão" subtitle={`Deseja excluir "${deletingItem?.description || "esta receita"}"?`}
        footer={<><ModalBtnGhost onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancelar</ModalBtnGhost><ModalBtnPrimary variant="red" onClick={handleDelete} disabled={deleting}>{deleting ? "Excluindo..." : "Excluir receita"}</ModalBtnPrimary></>}
      >
        <p className="text-sm text-slate-400">Esta ação não pode ser desfeita. A receita será removida permanentemente.</p>
      </ModalBase>
    </div>
  );
}
