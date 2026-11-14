"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCurrencyInput, parseCurrencyInput } from "../../utils/currencyInput";
import { getTodayIsoInAppTimeZone } from "../../utils/dateOnlyStatus";
import { FinancialAccountSelect, useFinancialAccounts } from "./FinancialAccountSelect";
import { ModalBase, ModalBtnGhost, ModalBtnPrimary, ModalField, modalInputClass } from "./ModalBase";

type Movement = { id: string; financialAccountId: number; type: "income" | "expense"; amount: number; category: string; date: string; createdAt: string; description: string; displayDescription?: string; status: string };
type MovementPage = { data: Movement[]; summary?: { income: number; expense: number }; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
const STATEMENT_PAGE_SIZE = 20;
const money = (amount: number) => amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatMovementDate = (date: string) => {
  const [year, month, day] = date.split("-");
  if (!day || !month || !year) return date;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
};
const formatMovementTime = (createdAt: string) => {
  const timestamp = new Date(createdAt);
  if (Number.isNaN(timestamp.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(timestamp);
};

const todayInBrazil = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const daysBefore = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const accountGridColumnClasses = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
} as const;

const statementDateHeaderClasses = [
  "border-blue-200 bg-blue-50 text-blue-950",
  "border-violet-200 bg-violet-50 text-violet-950",
  "border-emerald-200 bg-emerald-50 text-emerald-950",
  "border-amber-200 bg-amber-50 text-amber-950",
] as const;

const accountColors = ["#4f46e5", "#2563eb", "#0891b2", "#059669", "#65a30d", "#d97706", "#e11d48", "#9333ea"] as const;

const getAutomaticAccountColor = (usedColors: string[]) => {
  const normalizedUsedColors = new Set(usedColors.map((value) => value.toLowerCase()));
  return accountColors.find((value) => !normalizedUsedColors.has(value))
    ?? accountColors[usedColors.length % accountColors.length];
};

const getAccountGridColumnClass = (accountCount: number) => {
  if (accountCount <= 5) {
    return accountGridColumnClasses[Math.max(accountCount, 1) as keyof typeof accountGridColumnClasses];
  }

  const rowCount = Math.ceil(accountCount / 5);
  const columnCount = Math.ceil(accountCount / rowCount) as keyof typeof accountGridColumnClasses;
  return accountGridColumnClasses[columnCount];
};

export function FinancialAccountsPanel({ onMovementsChanged }: { onMovementsChanged?: () => void }) {
  const { accounts, refresh } = useFinancialAccounts();
  const [mode, setMode] = useState<"" | "account" | "transfer" | "delete">("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<number | null>(null);
  const [destination, setDestination] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayIsoInAppTimeZone);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [transferKey, setTransferKey] = useState("");
  const send = async (url: string, method: string, body: object) => {
    const response = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message || "Não foi possível concluir a operação.");
    return result;
  };
  const saveAccount = async () => {
    setSaving(true); setMessage("");
    try {
      await send(editingId ? `/api/financial-accounts/${editingId}` : "/api/financial-accounts", editingId ? "PATCH" : "POST", { name, color, description: description || null });
      setMode(""); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };
  const saveTransfer = async () => {
    const parsedAmount = parseCurrencyInput(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Informe um valor válido maior que zero.");
      return;
    }
    if (!date || date > getTodayIsoInAppTimeZone()) {
      setMessage("Informe uma data válida até hoje.");
      return;
    }
    setSaving(true); setMessage("");
    try {
      await send("/api/financial-accounts/transfers", "POST", { sourceAccountId: source, destinationAccountId: destination, amount: parsedAmount, date, description, idempotencyKey: transferKey });
      setMode(""); await refresh(); onMovementsChanged?.(); setMessage("Transferência registrada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao transferir."); }
    finally { setSaving(false); }
  };
  const openAccount = (id: number | null) => {
    const row = accounts.find((account) => account.id === id);
    setEditingId(id); setName(row?.name ?? ""); setColor(row?.color ?? getAutomaticAccountColor(accounts.map((account) => account.color))); setDescription(row?.description ?? ""); setMode("account"); setMessage("");
  };
  const archive = async (id: number, archived: boolean) => {
    try { await send(`/api/financial-accounts/${id}/archive`, "PATCH", { archived }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao arquivar."); }
  };
  const removeAccount = async () => {
    if (!editingId) return;
    setSaving(true); setMessage("");
    try {
      await send(`/api/financial-accounts/${editingId}`, "DELETE", {});
      setMode(""); await refresh(); setMessage("Conta excluída.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao excluir."); }
    finally { setSaving(false); }
  };
  const parsedTransferAmount = parseCurrencyInput(amount);
  const transferIsValid = Boolean(
    source
    && destination
    && source !== destination
    && Number.isFinite(parsedTransferAmount)
    && parsedTransferAmount > 0
    && date
    && date <= getTodayIsoInAppTimeZone()
  );
  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Contas financeiras</h2><div className="flex gap-2"><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => openAccount(null)}>Adicionar conta</button><button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => { setTransferKey(crypto.randomUUID()); setDate(getTodayIsoInAppTimeZone()); setMode("transfer"); setMessage(""); }}>Transferir</button></div></div>
    <div className={`grid gap-3 sm:grid-cols-2 ${getAccountGridColumnClass(accounts.length)}`}>{accounts.map((row) => <div key={row.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-semibold text-slate-800">{row.name}</span>{row.archived && <span className="text-xs text-slate-500">Arquivada</span>}</div><p className="mt-2 text-2xl font-bold text-slate-950">{money(row.balance)}</p><div className="mt-3 flex gap-3 text-xs font-semibold"><button className="text-blue-700" onClick={() => openAccount(row.id)}>Editar</button><button className="text-slate-600" onClick={() => void archive(row.id, !row.archived)}>{row.archived ? "Reativar" : "Arquivar"}</button>{row.canDelete && <button className="text-red-600" onClick={() => { setEditingId(row.id); setMode("delete"); setMessage(""); }}>Excluir</button>}</div></div>)}</div>
    <ModalBase
      open={mode === "account"}
      onClose={() => { if (!saving) setMode(""); }}
      title={editingId ? "Editar conta" : "Adicionar conta"}
      subtitle="Informe os dados da conta financeira."
      footer={<><ModalBtnGhost disabled={saving} onClick={() => setMode("")}>Cancelar</ModalBtnGhost><ModalBtnPrimary disabled={saving || !name.trim()} onClick={() => void saveAccount()}>{saving ? "Salvando..." : "Salvar"}</ModalBtnPrimary></>}
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!saving && name.trim()) void saveAccount(); }}>
        <ModalField label="Nome da conta" full><input autoFocus className={modalInputClass} placeholder="Ex: Conta principal" value={name} onChange={(event) => setName(event.target.value)} /></ModalField>
        <ModalField label="Descrição (opcional)" full><input className={modalInputClass} placeholder="Adicione uma observação" value={description} onChange={(event) => setDescription(event.target.value)} /></ModalField>
        <button aria-hidden="true" className="hidden" tabIndex={-1} type="submit" />
      </form>
      {mode === "account" && message ? <p role="alert" className="mt-3 text-sm font-medium text-red-600">{message}</p> : null}
    </ModalBase>
    <ModalBase
      open={mode === "delete"}
      onClose={() => { if (!saving) setMode(""); }}
      title="Excluir conta"
      subtitle="Essa ação é permanente."
      footer={<><ModalBtnGhost disabled={saving} onClick={() => setMode("")}>Cancelar</ModalBtnGhost><ModalBtnPrimary variant="red" disabled={saving} onClick={() => void removeAccount()}>{saving ? "Excluindo..." : "Excluir conta"}</ModalBtnPrimary></>}
    >
      <p className="text-sm text-slate-700">Deseja excluir a conta <strong>{accounts.find((row) => row.id === editingId)?.name}</strong>?</p>
      {mode === "delete" && message ? <p role="alert" className="mt-3 text-sm font-medium text-red-600">{message}</p> : null}
    </ModalBase>
    <ModalBase
      open={mode === "transfer"}
      onClose={() => { if (!saving) setMode(""); }}
      title="Transferir entre contas"
      subtitle="Escolha as contas e informe o valor da transferência."
      size="max-w-2xl"
      footer={<><ModalBtnGhost disabled={saving} onClick={() => setMode("")}>Cancelar</ModalBtnGhost><ModalBtnPrimary disabled={saving || !transferIsValid} onClick={() => void saveTransfer()}>{saving ? "Transferindo..." : "Confirmar transferência"}</ModalBtnPrimary></>}
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!saving && transferIsValid) void saveTransfer(); }}>
        <FinancialAccountSelect accounts={accounts} value={source} onChange={setSource} label="Conta de origem" />
        <FinancialAccountSelect accounts={accounts} value={destination} onChange={setDestination} label="Conta de destino" />
        <ModalField label="Valor da transferência">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-slate-400">R$</span>
            <input autoFocus className={`${modalInputClass} pl-11 text-base font-semibold`} type="text" inputMode="decimal" maxLength={24} placeholder="0,00" value={amount} onChange={(event) => setAmount(formatCurrencyInput(event.target.value))} />
          </div>
        </ModalField>
        <ModalField label="Data">
          <input className={modalInputClass} type="date" max={getTodayIsoInAppTimeZone()} value={date} onChange={(event) => setDate(event.target.value)} />
        </ModalField>
        <ModalField label="Descrição (opcional)" full>
          <input className={modalInputClass} placeholder="Ex: Reserva para conta principal" value={description} onChange={(event) => setDescription(event.target.value)} />
        </ModalField>
        {source && destination && source === destination ? <p role="alert" className="text-sm font-medium text-amber-700 sm:col-span-2">Selecione contas diferentes para concluir a transferência.</p> : null}
        <button aria-hidden="true" className="hidden" tabIndex={-1} type="submit" />
      </form>
      {mode === "transfer" && message ? <p role="alert" className="mt-3 text-sm font-medium text-red-600">{message}</p> : null}
    </ModalBase>
    {message && mode === "" && <p role="status" className="text-sm text-slate-700">{message}</p>}
  </section>;
}

export function FinancialStatementPanel({ compact = false }: { compact?: boolean }) {
  const { accounts } = useFinancialAccounts();
  const statementListRef = useRef<HTMLDivElement>(null);
  const previousPageRef = useRef(1);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [filter, setFilter] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(() => daysBefore(todayInBrazil(), 29));
  const [endDate, setEndDate] = useState(todayInBrazil);
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState({ income: 0, expense: 0 });
  const [page, setPage] = useState(1);
  const [totalMovements, setTotalMovements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [movementsError, setMovementsError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportAccountId, setExportAccountId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const openExport = () => {
    const today = todayInBrazil();
    setExportStartDate(startDate || daysBefore(today, 29));
    setExportEndDate(endDate || today);
    setExportAccountId(filter);
    setExportError("");
    setExportOpen(true);
  };

  const downloadPdf = async () => {
    if (exporting) return;
    if (exportStartDate && exportEndDate && exportStartDate > exportEndDate) {
      setExportError("Selecione um período válido.");
      return;
    }
    setExporting(true);
    setExportError("");
    try {
      const params = new URLSearchParams();
      if (exportStartDate) params.set("startDate", exportStartDate);
      if (exportEndDate) params.set("endDate", exportEndDate);
      if (exportAccountId !== null) params.set("accountId", String(exportAccountId));
      if (type) params.set("type", type);
      if (category.trim()) params.set("category", category.trim());
      if (search) params.set("search", search);
      const response = await fetch(`/api/finance/transactions/export.pdf?${params}`, { credentials: "include" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || "Não foi possível gerar o PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const today = todayInBrazil();
      const filenameStart = exportStartDate || "historico";
      const filenameEnd = exportEndDate || today;
      link.download = `extrato-${filenameStart}-${filenameEnd}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (previousPageRef.current === page) return;

    previousPageRef.current = page;
    statementListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    const loadMovements = async () => {
      setLoadingMovements(true);
      setMovementsError("");
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(compact ? 5 : STATEMENT_PAGE_SIZE),
        status: "completed",
      });
      if (filter !== null) params.set("accountId", String(filter));
      if (!compact) {
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (type) params.set("type", type);
        if (category.trim()) params.set("category", category.trim());
        if (search) params.set("search", search);
      }

      try {
        const response = await fetch(`/api/finance/transactions?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Não foi possível carregar o extrato.");
        const result = await response.json() as MovementPage;
        setMovements(result.data);
        setTotalMovements(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
        setSummary(result.summary ?? { income: 0, expense: 0 });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMovements([]);
        setTotalMovements(0);
        setTotalPages(0);
        setMovementsError(error instanceof Error ? error.message : "Não foi possível carregar o extrato.");
      } finally {
        if (!controller.signal.aborted) setLoadingMovements(false);
      }
    };
    void loadMovements();
    return () => controller.abort();
  }, [compact, filter, page, startDate, endDate, type, category, search]);

  const movementsByDate = Array.from(
    movements.reduce((groups, row) => {
      const rows = groups.get(row.date) ?? [];
      rows.push(row);
      groups.set(row.date, rows);
      return groups;
    }, new Map<string, Movement[]>()),
  );

  const resetPage = () => setPage(1);
  const clearFilters = () => {
    setFilter(null); setStartDate(""); setEndDate(""); setType(""); setCategory(""); setSearchInput(""); setSearch(""); resetPage();
  };

  if (compact) return <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-900">Últimas movimentações</h2>
      <Link href="/app/extrato" className="text-sm font-semibold text-blue-700 hover:underline">Ver extrato completo →</Link>
    </div>
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 divide-y divide-slate-100">
      {movements.map((row) => <div key={row.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.3fr)_8rem_9rem] sm:items-center sm:gap-4">
        <span className="min-w-0 font-medium text-slate-900 sm:truncate" title={row.displayDescription ?? row.description}>{row.displayDescription ?? row.description}</span>
        <span className="text-xs text-slate-600 sm:text-sm">{accounts.find((account) => account.id === row.financialAccountId)?.name ?? "Conta não encontrada"}</span>
        <span className="text-xs text-slate-500">{row.date.split("-").reverse().join("/")} · {formatMovementTime(row.createdAt)}</span>
        <span className={`font-semibold sm:text-right ${row.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>{row.type === "income" ? "+" : "−"}{money(row.amount)}</span>
      </div>)}
      {loadingMovements && <p role="status" className="p-5 text-center text-sm text-slate-500">Carregando movimentações...</p>}
      {!loadingMovements && movementsError && <p role="alert" className="p-5 text-center text-sm text-rose-600">{movementsError}</p>}
      {!loadingMovements && !movementsError && movements.length === 0 && <p className="p-5 text-center text-sm text-slate-500">Nenhuma movimentação encontrada.</p>}
    </div>
  </section>;

  return <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Movimentações</h2><button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={openExport}>Exportar PDF</button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-semibold text-slate-600">Data inicial<input aria-label="Data inicial" type="date" className={`${modalInputClass} mt-1`} max={endDate || undefined} value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate && e.target.value > endDate) setEndDate(e.target.value); resetPage(); }} /></label>
      <label className="text-xs font-semibold text-slate-600">Data final<input aria-label="Data final" type="date" className={`${modalInputClass} mt-1`} min={startDate || undefined} value={endDate} onChange={(e) => { setEndDate(e.target.value); if (startDate && e.target.value < startDate) setStartDate(e.target.value); resetPage(); }} /></label>
      <label className="text-xs font-semibold text-slate-600">Conta<select aria-label="Filtrar extrato por conta" className={`${modalInputClass} mt-1`} value={filter ?? ""} onChange={(e) => { setFilter(Number(e.target.value) || null); resetPage(); }}><option value="">Todas as contas</option>{accounts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Tipo<select className={`${modalInputClass} mt-1`} value={type} onChange={(e) => { setType(e.target.value); resetPage(); }}><option value="">Entradas e saídas</option><option value="income">Entradas</option><option value="expense">Saídas</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Categoria<input className={`${modalInputClass} mt-1`} placeholder="Buscar categoria" value={category} onChange={(e) => { setCategory(e.target.value); resetPage(); }} /></label>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); resetPage(); }}><label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Buscar<input className={`${modalInputClass} mt-1`} placeholder="Descrição, cliente ou empréstimo" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} /></label><button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Buscar</button></form>
    </div>
    <button type="button" className="mt-3 text-xs font-semibold text-blue-700 hover:underline" onClick={clearFilters}>Limpar filtros</button>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Entradas", summary.income, "text-emerald-700"], ["Saídas", summary.expense, "text-rose-700"], ["Saldo do período", summary.income - summary.expense, "text-slate-900"]].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{money(Number(value))}</p></div>)}</div>
    <div ref={statementListRef} className="mt-5 scroll-mt-24 space-y-6">
      {movementsByDate.map(([movementDate, rows], groupIndex) => {
        const dailyTotal = rows.reduce((total, row) => total + (row.type === "income" ? row.amount : -row.amount), 0);
        const dateHeaderClass = statementDateHeaderClasses[groupIndex % statementDateHeaderClasses.length];

        return <div key={movementDate} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3 ${dateHeaderClass}`}>
          <span className="text-sm font-bold capitalize">{formatMovementDate(movementDate)}</span>
          <span className="text-xs font-medium text-slate-600">
            {rows.length} {rows.length === 1 ? "movimentação" : "movimentações"}
            <span aria-hidden="true" className="mx-2 text-slate-400">•</span>
            <span className={`font-semibold ${dailyTotal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              Saldo {dailyTotal >= 0 ? "+" : "−"}{money(Math.abs(dailyTotal))}
            </span>
          </span>
        </div>
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,0.35fr)_6rem_9rem] gap-4 border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Descrição</span><span>Conta</span><span>Horário</span><span className="text-right">Valor</span>
        </div>
        <div className="divide-y divide-slate-100">{rows.map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.35fr)_6rem_9rem] sm:items-center sm:gap-4">
          <span className="min-w-0 font-medium text-slate-900 sm:truncate" title={row.displayDescription ?? row.description}>{row.displayDescription ?? row.description}</span>
          <span className="text-xs font-medium text-slate-900 sm:text-sm">{accounts.find((account) => account.id === row.financialAccountId)?.name ?? "Conta não encontrada"}</span>
          <span className="text-xs font-medium text-slate-900 sm:text-sm">{formatMovementTime(row.createdAt)}</span>
          <span className={`col-start-2 row-start-1 justify-self-end whitespace-nowrap font-semibold sm:col-start-4 sm:text-right ${row.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>{row.type === "income" ? "+" : "−"}{money(row.amount)}</span>
        </div>)}</div>
      </div>;
      })}
      {loadingMovements ? <p role="status" className="py-6 text-center text-sm text-slate-500">Carregando extrato...</p> : null}
      {!loadingMovements && movementsError ? <p role="alert" className="py-6 text-center text-sm text-rose-600">{movementsError}</p> : null}
      {!loadingMovements && !movementsError && movementsByDate.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhum movimento encontrado.</p> : null}
    </div>
    {!movementsError && totalMovements > 0 ? <nav aria-label="Paginação do extrato" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <p className="text-sm text-slate-500">
        Mostrando {(page - 1) * STATEMENT_PAGE_SIZE + 1}–{Math.min(page * STATEMENT_PAGE_SIZE, totalMovements)} de {totalMovements}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" disabled={loadingMovements || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
        <span className="min-w-24 text-center text-sm font-medium text-slate-600">Página {page} de {totalPages}</span>
        <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" disabled={loadingMovements || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button>
      </div>
    </nav> : null}
    <ModalBase
      open={exportOpen}
      onClose={() => { if (!exporting) setExportOpen(false); }}
      title="Exportar extrato em PDF"
      subtitle="Escolha o período e a conta para gerar o extrato."
      footer={<><ModalBtnGhost disabled={exporting} onClick={() => setExportOpen(false)}>Cancelar</ModalBtnGhost><ModalBtnPrimary disabled={exporting || Boolean(exportStartDate && exportEndDate && exportStartDate > exportEndDate)} onClick={() => void downloadPdf()}>{exporting ? "Gerando PDF..." : "Gerar PDF"}</ModalBtnPrimary></>}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ModalField label="Data inicial"><input type="date" className={modalInputClass} max={exportEndDate || undefined} value={exportStartDate} onChange={(event) => setExportStartDate(event.target.value)} disabled={exporting} /></ModalField>
        <ModalField label="Data final"><input type="date" className={modalInputClass} min={exportStartDate || undefined} value={exportEndDate} onChange={(event) => setExportEndDate(event.target.value)} disabled={exporting} /></ModalField>
        <div className="sm:col-span-2"><ModalField label="Conta"><select className={modalInputClass} value={exportAccountId ?? ""} onChange={(event) => setExportAccountId(event.target.value ? Number(event.target.value) : null)} disabled={exporting}><option value="">Consolidado (todas as contas)</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></ModalField></div>
      </div>
      {exportError ? <p role="alert" className="mt-3 text-sm font-medium text-red-600">{exportError}</p> : null}
    </ModalBase>
  </section>;
}
