"use client";

import { useEffect, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

type Summary = { totalLoaned: number; totalReceived: number; realizedProfit: number; totalOpen: number; loansCount: number; settledLoansCount: number };
type History = {
  rows: Array<{ loanId: string; startDate: string; principal: number; received: number; open: number; status: string; returnAmount: number; returnPercent: number; returnBasis: "REALIZADO" | "PREVISTO"; realizedProfit: number; remainingProfit: number; installmentsCount: number; paidInstallmentsCount: number; remainingInstallmentsCount: number; installmentMinAmount: number; installmentMaxAmount: number }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};
type Result<T> = { clientId: string; data?: T; error?: string; loading: boolean };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const statuses: Record<string, string> = { PENDENTE: "Pendente", EM_DIA: "Em dia", ATRASADO: "Atrasado", QUITADO: "Quitado" };

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Não foi possível carregar os dados financeiros.");
  return body;
}

// Shared by the desktop table and mobile card: one set of requests per expansion.
export function useClientFinancials(clientId: string | null, page: number, pageSize: number) {
  const [summary, setSummary] = useState<Result<Summary>>({ clientId: "", loading: false });
  const [history, setHistory] = useState<Result<History>>({ clientId: "", loading: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    setSummary({ clientId, loading: true });
    read<{ data: Summary }>(`/api/tables/debtors/${encodeURIComponent(clientId)}/financial-summary`, controller.signal)
      .then((body) => { if (!controller.signal.aborted) setSummary({ clientId, data: body.data, loading: false }); })
      .catch((error) => { if (!controller.signal.aborted) setSummary({ clientId, error: error.message, loading: false }); });
    return () => controller.abort();
  }, [clientId, attempt]);
  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    setHistory({ clientId, loading: true });
    read<History>(`/api/tables/debtors/${encodeURIComponent(clientId)}/loans?page=${page}&pageSize=${pageSize}`, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setHistory({ clientId, data, loading: false }); })
      .catch((error) => { if (!controller.signal.aborted) setHistory({ clientId, error: error.message, loading: false }); });
    return () => controller.abort();
  }, [clientId, page, pageSize, attempt]);
  return {
    summary: summary.clientId === clientId ? summary : { clientId: clientId || "", loading: true },
    history: history.clientId === clientId ? history : { clientId: clientId || "", loading: true },
    retry: () => setAttempt((value) => value + 1),
  };
}

export function ClientFinancialPanel({ financials, page, pageSize, onPageChange, onPageSizeChange }: {
  financials: ReturnType<typeof useClientFinancials>; page: number; pageSize: number;
  onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void;
}) {
  const { summary, history, retry } = financials;
  const values = summary.data;
  const pagination = history.data?.pagination;
  const buttonClass = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-40";
  return (
    <div data-client-details className="w-full min-w-0 max-w-full cursor-auto space-y-3 overflow-hidden px-3 pb-3 pt-1 sm:px-4 sm:pb-4" aria-label="Resumo financeiro e histórico do cliente">
      {summary.loading ? <p role="status" className="text-sm text-slate-400">Carregando resumo financeiro...</p> : null}
      {summary.error ? <p role="alert" className="text-sm text-red-400">{summary.error} <button onClick={retry} className="underline">Tentar novamente</button></p> : null}
      {values ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
          {([
            ["Total emprestado", money(values.totalLoaned), false],
            ["Total recebido", money(values.totalReceived), true],
            ["Lucro realizado", money(values.realizedProfit), values.realizedProfit >= 0],
            ["Total em aberto", money(values.totalOpen), false],
            ["Quantidade de empréstimos", values.loansCount, false],
            ["Empréstimos quitados", values.settledLoansCount, true],
          ] as const).map(([label, value, positive]) => (
            <div key={label} className="min-w-0 rounded-lg bg-slate-800/40 px-3 py-2.5">
              <div className="text-xs text-slate-400">{label}</div>
              <div className={`mt-1 break-words text-sm font-bold tabular-nums ${positive ? "text-emerald-500" : label === "Lucro realizado" ? "text-red-400" : "text-slate-300"}`}>{value}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-300">Histórico de empréstimos</h3>
        {(pagination?.totalItems ?? values?.loansCount ?? 0) > 5 ? <label className="flex items-center gap-2 text-xs text-slate-400">Por página
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-300">
            <option value={5}>5</option><option value={10}>10</option>
          </select>
        </label> : null}
      </div>
      {history.loading ? <p role="status" className="py-4 text-sm text-slate-400">Carregando empréstimos...</p> : null}
      {history.error ? <p role="alert" className="text-sm text-red-400">{history.error} <button onClick={retry} className="underline">Tentar novamente</button></p> : null}
      {history.data ? <>
        {history.data.rows.length === 0 ? <p className="py-4 text-sm text-slate-400">Este cliente ainda não possui empréstimos.</p> : (<>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full whitespace-nowrap text-left text-xs text-slate-300">
              <caption className="sr-only">Empréstimos do cliente, do mais recente para o mais antigo</caption>
              <thead className="text-slate-400"><tr>
                <th className="px-2 py-2 font-medium">Data do empréstimo</th>
                <th className="px-2 py-2 text-right font-medium">Valor emprestado</th>
                <th className="px-2 py-2 text-right font-medium">Parcelas</th>
                <th className="px-2 py-2 text-right font-medium">Retorno</th>
                <th className="px-2 py-2 text-right font-medium">Total recebido</th>
                <th className="px-2 py-2 text-right font-medium">Saldo em aberto</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/50">{history.data.rows.map((loan) => <tr key={loan.loanId}>
                <td className="px-2 py-2">{loan.startDate.split("-").reverse().join("/")}</td>
                <td className="px-2 py-2 text-right tabular-nums">{money(loan.principal)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div className="font-semibold text-slate-300">{Math.abs(loan.installmentMaxAmount - loan.installmentMinAmount) <= 0.01
                    ? `${loan.installmentsCount}x de ${money(loan.installmentMaxAmount)}`
                    : `${loan.installmentsCount} parcelas`}</div>
                  {Math.abs(loan.installmentMaxAmount - loan.installmentMinAmount) > 0.01 ? <div className="text-[10px] text-slate-400">
                    {money(loan.installmentMinAmount)} a {money(loan.installmentMaxAmount)}
                  </div> : null}
                  <div className="text-[10px] text-slate-500">{loan.remainingInstallmentsCount === 0
                    ? "Todas pagas"
                    : loan.paidInstallmentsCount === 0
                      ? `${loan.remainingInstallmentsCount} restantes`
                      : `${loan.remainingInstallmentsCount} restantes · ${loan.paidInstallmentsCount} pagas`}</div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div className="font-semibold text-emerald-500">{loan.returnPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                  <div className="text-[10px] text-slate-400">{money(loan.returnAmount)} · {loan.returnBasis === "REALIZADO" ? "realizado" : "lucro total"}</div>
                  {loan.returnBasis === "PREVISTO" ? <div className="text-[10px] text-slate-500">
                    {money(loan.realizedProfit)} realizado · {money(loan.remainingProfit)} a receber
                  </div> : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-500">{money(loan.received)}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${loan.status === "ATRASADO" ? "text-red-400" : ""}`}>{money(loan.open)}</td>
                <td className={`px-2 py-2 ${loan.status === "ATRASADO" ? "text-red-400" : loan.status === "QUITADO" ? "text-emerald-500" : loan.status === "EM_DIA" ? "text-blue-400" : loan.status === "PENDENTE" ? "text-amber-400" : "text-slate-400"}`}>{statuses[loan.status] || loan.status}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {history.data.rows.map((loan) => (
              <article key={loan.loanId} className="min-w-0 rounded-xl border border-slate-200 bg-white/70 p-3 shadow-sm">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data do empréstimo</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">{loan.startDate.split("-").reverse().join("/")}</div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${loan.status === "ATRASADO" ? "text-red-400" : loan.status === "QUITADO" ? "text-emerald-500" : loan.status === "EM_DIA" ? "text-blue-400" : loan.status === "PENDENTE" ? "text-amber-400" : "text-slate-400"}`}>
                    {statuses[loan.status] || loan.status}
                  </span>
                </div>

                <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-200 pt-3">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor emprestado</dt>
                    <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-700">{money(loan.principal)}</dd>
                  </div>
                  <div className="min-w-0 text-right">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parcelas</dt>
                    <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-700">
                      {Math.abs(loan.installmentMaxAmount - loan.installmentMinAmount) <= 0.01
                        ? `${loan.installmentsCount}x de ${money(loan.installmentMaxAmount)}`
                        : `${loan.installmentsCount} parcelas`}
                    </dd>
                    {Math.abs(loan.installmentMaxAmount - loan.installmentMinAmount) > 0.01 ? (
                      <div className="mt-0.5 break-words text-[10px] text-slate-400">{money(loan.installmentMinAmount)} a {money(loan.installmentMaxAmount)}</div>
                    ) : null}
                    <div className="mt-0.5 break-words text-[10px] text-slate-500">
                      {loan.remainingInstallmentsCount === 0
                        ? "Todas pagas"
                        : loan.paidInstallmentsCount === 0
                          ? `${loan.remainingInstallmentsCount} restantes`
                          : `${loan.remainingInstallmentsCount} restantes · ${loan.paidInstallmentsCount} pagas`}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Retorno</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-emerald-500">
                      {loan.returnPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </dd>
                    <div className="mt-0.5 break-words text-[10px] text-slate-400">{money(loan.returnAmount)} · {loan.returnBasis === "REALIZADO" ? "realizado" : "lucro total"}</div>
                    {loan.returnBasis === "PREVISTO" ? (
                      <div className="mt-0.5 break-words text-[10px] text-slate-500">{money(loan.realizedProfit)} realizado · {money(loan.remainingProfit)} a receber</div>
                    ) : null}
                  </div>
                  <div className="min-w-0 text-right">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total recebido</dt>
                    <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-emerald-500">{money(loan.received)}</dd>
                  </div>
                  <div className="col-span-2 min-w-0 border-t border-slate-200 pt-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo em aberto</dt>
                    <dd className={`mt-1 break-words text-sm font-semibold tabular-nums ${loan.status === "ATRASADO" ? "text-red-400" : "text-slate-700"}`}>{money(loan.open)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </>)}
      </> : null}
      {pagination && pagination.totalPages > 1 ? <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-400">
        <nav aria-label="Paginação dos empréstimos" className="flex flex-wrap items-center gap-1">
          <button className={buttonClass} aria-label="Primeira página de empréstimos" disabled={history.loading || !pagination || pagination.page <= 1} onClick={() => onPageChange(1)}><ChevronFirst className="h-4 w-4" /></button>
          <button className={buttonClass} aria-label="Página anterior de empréstimos" disabled={history.loading || !pagination || pagination.page <= 1} onClick={() => onPageChange(Math.max(1, (pagination?.page ?? page) - 1))}><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-1" aria-live="polite">Página {pagination?.page ?? page} de {pagination?.totalPages ?? "…"}</span>
          <button className={buttonClass} aria-label="Próxima página de empréstimos" disabled={history.loading || !pagination || pagination.page >= pagination.totalPages} onClick={() => onPageChange((pagination?.page ?? page) + 1)}><ChevronRight className="h-4 w-4" /></button>
          <button className={buttonClass} aria-label="Última página de empréstimos" disabled={history.loading || !pagination || pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination?.totalPages ?? 1)}><ChevronLast className="h-4 w-4" /></button>
        </nav>
      </div> : null}
    </div>
  );
}
