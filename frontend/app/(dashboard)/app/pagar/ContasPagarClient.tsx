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
import { MobileDataCard, MobileDataCardRow } from "../../../components/MobileDataCard";
import { useToast } from "../../../components/ToastProvider";
import {
  FinanceCategoryManagerModal,
  FinanceCategoryPicker,
  type FinanceCategoryMeta,
  formatFinanceCategoryLabel,
  useFinanceCategoryCatalog,
} from "../../../components/FinanceCategoryControls";
import { readJsonOrThrow } from "../../../../utils/apiClient";
import { formatCurrencyInput, formatCurrencyInputFromNumber, parseCurrencyInput } from "../../../../utils/currencyInput";
import { getDateOnlyRelationToToday, getOverdueDays } from "../../../../utils/dateOnlyStatus";

// --- TYPES ---
type Transaction = {
  id: string | number;
  type?: string;
  description?: string;
  notes?: string | null;
  categoryId?: string | number | null;
  category?: string;
  categoryMeta?: FinanceCategoryMeta | null;
  amount?: number | string;
  date?: string;
  status?: string;
};

// --- HELPERS ---
const SYSTEM_CATEGORIES = new Set(["Recebimento de parcela", "Desembolso de emprestimo", "Ajuste de caixa"]);

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
  const dueRelation = getDateOnlyRelationToToday(item.date);

  if (item.status === "completed") {
    return { key: "paid", group: "paid", label: "Paga", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
  }
  if (dueRelation === "past") {
    return { key: "overdue", group: "overdue", label: "Vencida", color: "bg-red-500/20 text-red-400 border-red-500/40" };
  }
  if (dueRelation === "today") {
    return { key: "due-today", group: "due-today", label: "Vence hoje", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
  }
  if (item.status === "scheduled") {
    return { key: "scheduled", group: "pending", label: "Agendada", color: "bg-sky-500/20 text-sky-400 border-sky-500/40" };
  }
  return { key: "pending", group: "pending", label: "Pendente", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
}

function buildObservation(item: Transaction, ds: DisplayStatus) {
  const customNotes = String(item.notes || "").trim();
  if (customNotes) return customNotes;

  if (ds.key === "paid") return "Conta marcada como paga.";
  if (ds.key === "overdue") {
    const diff = getOverdueDays(item.date) ?? 0;
    return `Em atraso ha ${diff} dia(s).`;
  }
  if (ds.key === "due-today") return "Vencimento previsto para hoje.";
  if (ds.key === "scheduled") return "Pagamento agendado para esta data.";
  return "Aguardando confirmacao de pagamento.";
}

function isConfirmedTransaction(item: Transaction) {
  return String(item.status || "").toLowerCase() === "completed";
}

function sameMonth(date: Date, cursor: Date) {
  return date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth();
}

export function ContasPagarClient() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [viewingItem, setViewingItem] = useState<Transaction | null>(null);
  const [deletingItem, setDeletingItem] = useState<Transaction | null>(null);
  const [completingItem, setCompletingItem] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Form fields
  const [formDescription, setFormDescription] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState("pending");
  const [formCreationMode, setFormCreationMode] = useState("single");
  const [formInstallmentCount, setFormInstallmentCount] = useState("4");
  const [formInstallmentAmountMode, setFormInstallmentAmountMode] = useState("total");
  const [formRecurringMonths, setFormRecurringMonths] = useState("12");
  const {
    categories,
    createCategory,
    updateCategory,
    toggleArchive,
  } = useFinanceCategoryCatalog("expense");

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

  // --- Modal handlers ---
  function openCreateModal() {
    setEditingItem(null);
    setFormDescription("");
    setFormCategoryId("");
    setFormAmount("");
    setFormDate(toDateInputValue(new Date()));
    setFormNotes("");
    setFormStatus("pending");
    setFormCreationMode("single");
    setFormInstallmentCount("4");
    setFormInstallmentAmountMode("total");
    setFormRecurringMonths("12");
    setShowFormModal(true);
  }

  function openEditModal(item: Transaction) {
    if (isConfirmedTransaction(item)) {
      toast.info("Conta já confirmada não pode ser editada.");
      return;
    }

    setEditingItem(item);
    setFormDescription(item.description || "");
    setFormCategoryId(String(item.categoryId || item.categoryMeta?.id || ""));
    setFormAmount(formatCurrencyInputFromNumber(item.amount || 0));
    setFormDate(item.date || "");
    setFormNotes(item.notes || "");
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

  function openCompleteModal(item: Transaction) {
    setCompletingItem(item);
    setShowCompleteModal(true);
  }

  async function handleSave() {
    const parsedAmount = parseCurrencyInput(formAmount);
    if (!formDescription.trim() || !formCategoryId || !formAmount || !formDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Preencha descrição, categoria, valor e vencimento válidos.", "Dados incompletos");
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        const response = await fetch(`/api/finance/transactions/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "expense",
            description: formDescription.trim(),
            categoryId: formCategoryId,
            amount: parsedAmount,
            date: formDate,
            notes: formNotes,
            status: formStatus,
          }),
        });
        await readJsonOrThrow(response, "Não foi possível atualizar a conta.");
      } else {
        const body: any = {
          type: "expense",
          description: formDescription.trim(),
          categoryId: formCategoryId,
          amount: parsedAmount,
          date: formDate,
          notes: formNotes,
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
        const response = await fetch("/api/finance/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await readJsonOrThrow(response, "Não foi possível criar a conta.");
      }
      setShowFormModal(false);
      setEditingItem(null);
      await fetchData();
      toast.success(editingItem ? "Conta atualizada com sucesso." : "Conta cadastrada com sucesso.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Não foi possível salvar a conta.";
      toast.error(message, "Falha ao salvar conta");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/finance/transactions/${deletingItem.id}`, { method: "DELETE" });
      await readJsonOrThrow(response, "Não foi possível excluir a conta.");
      setShowDeleteModal(false);
      setDeletingItem(null);
      await fetchData();
      toast.success("Conta excluida com sucesso.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Não foi possível excluir a conta.";
      toast.error(message, "Falha ao excluir conta");
    } finally {
      setDeleting(false);
    }
  }

  async function handleComplete() {
    if (!completingItem) return;
    setCompleting(true);
    try {
      const response = await fetch(`/api/finance/transactions/${completingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      await readJsonOrThrow(response, "Não foi possível marcar a conta como paga.");
      setShowCompleteModal(false);
      setCompletingItem(null);
      await fetchData();
      toast.success("Conta marcada como paga.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Não foi possível marcar a conta como paga.";
      toast.error(message, "Falha ao concluir pagamento");
    } finally {
      setCompleting(false);
    }
  }

  // --- Data pipeline ---
  const expenseItems = useMemo(() => {
    return transactions
      .filter((t) => t.type === "expense" && !SYSTEM_CATEGORIES.has(t.category || ""))
      .map((t) => ({
        ...t,
        amount: Number(t.amount || 0),
        dueDate: parseDateOnly(t.date),
        displayStatus: getDisplayStatus(t),
      }));
  }, [transactions]);

  const monthItems = useMemo(() => {
    return expenseItems.filter((item) => item.dueDate && sameMonth(item.dueDate, monthCursor));
  }, [expenseItems, monthCursor]);

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
        (t.description || "").toLowerCase().includes(s)
        || (t.category || "").toLowerCase().includes(s)
        || (t.categoryMeta?.name || "").toLowerCase().includes(s)
      );
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
  }, [monthItems, search]);

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

  function getStatusIcon(key: string) {
    if (key === "paid") return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (key === "overdue") return <AlertTriangle className="h-3.5 w-3.5" />;
    if (key === "due-today") return <Clock className="h-3.5 w-3.5" />;
    if (key === "scheduled") return <CalendarDays className="h-3.5 w-3.5" />;
    return <Circle className="h-3.5 w-3.5" />;
  }

  const isEditing = Boolean(editingItem);

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">Contas a Pagar</h1>
        </div>
        <button onClick={openCreateModal} className="inline-flex h-11 min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] px-5 text-sm font-bold text-white transition-all hover:bg-[#3b6ef0] shadow-[0_4px_14px_rgba(79,126,247,0.4)] active:translate-y-px active:scale-[0.98]">
          <Plus className="h-4 w-4" />
          Nova conta
        </button>
      </section>

      {/* Search + Month Switcher */}
      <section className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_auto] xl:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Buscar por descrição ou categoria"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-bold text-slate-200">{formatMonthLabel(monthCursor)}</span>
          <button onClick={nextMonth} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Tabela */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3 sm:p-5 lg:p-6 shadow-xl backdrop-blur-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="text-red-400">{summary.overdue} vencida(s)</span>
          <span className="text-slate-600">|</span>
          <span className="text-amber-400">{summary.dueToday} vence hoje</span>
          <span className="text-slate-600">|</span>
          <span className="text-blue-400">{summary.pending} pendente(s)</span>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-800 md:block">
          <table className="w-full text-left text-sm text-slate-300" style={{ minWidth: 900 }}>
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-right">Valor (R$)</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detalhe</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Carregando contas...</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nenhuma conta encontrada neste mês.</td></tr>
              ) : (
                pageRows.map((item) => {
                  const ds = item.displayStatus;
                  const obs = buildObservation(item, ds);
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-800/40">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-100">{item.description || "Sem descrição"}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatFinanceCategoryLabel(item.categoryMeta, item.category)}</div>
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-slate-100">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-4 text-slate-300 font-semibold">{formatDate(item.dueDate)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ds.color}`}>
                          {getStatusIcon(ds.key)}
                          {ds.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400 max-w-[200px]">{obs}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {ds.group !== "paid" && (
                            <button onClick={() => openCompleteModal(item)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500" title="Marcar como paga">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Pagar
                            </button>
                          )}
                          <button onClick={() => openViewModal(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900" title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </button>
                          {ds.group !== "paid" ? (
                            <button onClick={() => openEditModal(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100" title="Editar">
                              <Edit2 className="h-4 w-4" />
                            </button>
                          ) : null}
                          <button onClick={() => openDeleteModal(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100" title="Excluir">
                            <Trash2 className="h-4 w-4" />
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

        <div className="grid gap-3 md:hidden">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Carregando contas...
            </div>
          ) : pageRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma conta encontrada neste mês.
            </div>
          ) : (
            pageRows.map((item) => {
              const ds = item.displayStatus;
              const obs = buildObservation(item, ds);
              const canPay = ds.group !== "paid";
              const canEdit = ds.group !== "paid";

              return (
                <MobileDataCard
                  key={item.id}
                  title={item.description || "Sem descrição"}
                  subtitle={formatFinanceCategoryLabel(item.categoryMeta, item.category)}
                  badge={(
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ds.color}`}>
                      {getStatusIcon(ds.key)}
                      {ds.label}
                    </span>
                  )}
                  actions={(
                    <div className="flex items-center justify-end gap-2">
                      {canPay ? (
                        <button
                          onClick={() => openCompleteModal(item)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-[0_8px_18px_rgba(225,29,72,0.28)] transition-colors hover:bg-rose-500"
                          title="Pagar"
                          aria-label={`Pagar conta ${item.description || item.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => openViewModal(item)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                        title="Ver detalhes"
                        aria-label={`Ver detalhes da conta ${item.description || item.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canEdit ? (
                        <button
                          onClick={() => openEditModal(item)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100"
                          title="Editar"
                          aria-label={`Editar conta ${item.description || item.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => openDeleteModal(item)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"
                        title="Excluir"
                        aria-label={`Excluir conta ${item.description || item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <MobileDataCardRow label="Valor" value={formatCurrency(item.amount)} />
                    <MobileDataCardRow label="Vencimento" value={formatDate(item.dueDate)} />
                  </div>
                  <MobileDataCardRow
                    className="col-span-2"
                    label="Detalhe"
                    value={<span className="block truncate">{obs}</span>}
                    valueClassName="text-slate-300"
                  />
                </MobileDataCard>
              );
            })
          )}
        </div>

        {!loading && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/60 pt-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-400">
              Mostrando <span className="text-slate-200">{filtered.length > 0 ? startIdx + 1 : 0}</span> ate{" "}
              <span className="text-slate-200">{Math.min(startIdx + pageSize, filtered.length)}</span> de{" "}
              <span className="font-semibold text-slate-200">{filtered.length}</span> contas
            </p>
            <div className="flex items-center justify-end gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-400">Página <span className="text-slate-200">{currentPageSafe}</span> de {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL: CRIAR / EDITAR ===== */}
      <ModalBase
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={isEditing ? "Editar conta" : "Nova conta a pagar"}
        size="max-w-xl"
        footer={
          <>
            <ModalBtnGhost onClick={() => setShowFormModal(false)} disabled={saving}>Cancelar</ModalBtnGhost>
            <ModalBtnPrimary onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : isEditing ? "Salvar alteracoes" : "Salvar conta"}
            </ModalBtnPrimary>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <ModalField label="Descrição" full>
            <input className={modalInputClass} maxLength={300} placeholder="Ex: Aluguel do escritorio" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
          </ModalField>
          <ModalField label="Categoria">
            <FinanceCategoryPicker
              categories={categories}
              fallbackLabel={editingItem?.category || ""}
              onChange={(category) => setFormCategoryId(category.id)}
              onCreateCategory={createCategory}
              onManage={() => setShowCategoryManagerModal(true)}
              valueCategoryId={formCategoryId}
            />
          </ModalField>
          <ModalField label="Valor (R$)">
            <input className={modalInputClass} inputMode="decimal" maxLength={24} type="text" placeholder="0,00" value={formAmount} onChange={(e) => setFormAmount(formatCurrencyInput(e.target.value))} />
          </ModalField>
          {!isEditing && (
            <ModalField label="Tipo de lancamento" full>
              <select className={modalInputClass} value={formCreationMode} onChange={(e) => setFormCreationMode(e.target.value)}>
                <option value="single">Unico</option>
                <option value="installments">Parcelado</option>
                <option value="recurring_monthly">Recorrente mensal</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">Use parcelado para dividir em parcelas ou recorrente para lancamentos mensais.</p>
            </ModalField>
          )}
          {!isEditing && formCreationMode === "installments" && (
            <>
              <ModalField label="Quantidade de parcelas">
                <input className={modalInputClass} type="number" min="2" max="60" value={formInstallmentCount} onChange={(e) => setFormInstallmentCount(e.target.value)} />
              </ModalField>
              <ModalField label="Valor informado">
                <select className={modalInputClass} value={formInstallmentAmountMode} onChange={(e) => setFormInstallmentAmountMode(e.target.value)}>
                  <option value="total">Valor total</option>
                  <option value="per_installment">Valor por parcela</option>
                </select>
              </ModalField>
            </>
          )}
          {!isEditing && formCreationMode === "recurring_monthly" && (
            <ModalField label="Quantidade de meses">
              <input className={modalInputClass} type="number" min="2" max="120" value={formRecurringMonths} onChange={(e) => setFormRecurringMonths(e.target.value)} />
            </ModalField>
          )}
          <ModalField label="Data de vencimento">
            <input className={modalInputClass} type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          </ModalField>
          <ModalField label="Situacao">
            <select className={modalInputClass} value={formStatus} onChange={(e) => setFormStatus(e.target.value)}>
              <option value="pending">Pendente</option>
              <option value="scheduled">Agendada</option>
              <option value="completed">Paga</option>
            </select>
          </ModalField>
          <ModalField label="Observacao (opcional)" full>
            <textarea
              className={`${modalInputClass} min-h-[96px] resize-none`}
              maxLength={1000}
              placeholder="Detalhes adicionais desta conta"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </ModalField>
        </div>
      </ModalBase>

      {/* ===== MODAL: VER DETALHES ===== */}
      <ModalBase
        open={showViewModal}
        onClose={() => setShowViewModal(false)}
        title="Detalhes da conta"
        footer={
          <>
            <ModalBtnGhost onClick={() => setShowViewModal(false)}>Fechar</ModalBtnGhost>
            {viewingItem && !isConfirmedTransaction(viewingItem) ? (
              <ModalBtnPrimary onClick={() => { setShowViewModal(false); if (viewingItem) openEditModal(viewingItem); }}>Editar conta</ModalBtnPrimary>
            ) : null}
          </>
        }
      >
        {viewingItem && (() => {
          const ds = getDisplayStatus(viewingItem);
          const obs = buildObservation(viewingItem, ds);
          return (
            <div className="space-y-4">
              <div className="flex items-start justify-between rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                <p className="font-bold text-slate-100">{viewingItem.description || "Sem descrição"}</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ds.color}`}>
                  {ds.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Categoria</p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">{formatFinanceCategoryLabel(viewingItem.categoryMeta, viewingItem.category)}</p>
                </div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor</p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">{formatCurrency(viewingItem.amount)}</p>
                </div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vencimento</p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">{formatDate(parseDateOnly(viewingItem.date))}</p>
                </div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Detalhe</p>
                  <p className="mt-1 text-sm font-medium text-slate-300">{obs}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </ModalBase>

      <ModalBase
        open={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        title="Confirmar pagamento"
        subtitle={`Deseja marcar "${completingItem?.description || "esta conta"}" como paga?`}
        footer={(
          <>
            <ModalBtnGhost onClick={() => setShowCompleteModal(false)} disabled={completing}>Cancelar</ModalBtnGhost>
            <ModalBtnPrimary variant="red" onClick={handleComplete} disabled={completing}>
              {completing ? "Confirmando..." : "Confirmar pagamento"}
            </ModalBtnPrimary>
          </>
        )}
      >
        <p className="text-sm text-slate-400">A conta sera atualizada para o status de paga imediatamente.</p>
      </ModalBase>

      {/* ===== MODAL: EXCLUIR ===== */}
      <ModalBase
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Confirmar exclusão"
        subtitle={`Deseja excluir "${deletingItem?.description || "esta conta"}"?`}
        footer={
          <>
            <ModalBtnGhost onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancelar</ModalBtnGhost>
            <ModalBtnPrimary variant="red" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir conta"}
            </ModalBtnPrimary>
          </>
        }
      >
        <p className="text-sm text-slate-400">Esta ação não pode ser desfeita. A conta será removida permanentemente.</p>
      </ModalBase>

      <FinanceCategoryManagerModal
        categories={categories}
        onClose={() => setShowCategoryManagerModal(false)}
        onToggleArchive={toggleArchive}
        onUpdateCategory={updateCategory}
        open={showCategoryManagerModal}
        title="Gerenciar categorias de despesas"
      />
    </div>
  );
}

