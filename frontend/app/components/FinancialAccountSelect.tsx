"use client";

import { useEffect, useState } from "react";

export type FinancialAccount = { id: number; name: string; balance: number; color: string; archived: boolean; institution?: string | null; description?: string | null; isOriginal: boolean; canDelete: boolean };

function normalizeAccountName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function findCashAccountId(accounts: FinancialAccount[]) {
  const activeAccounts = accounts.filter((account) => !account.archived);

  for (const name of ["dinheiro em especie", "dinheiro"]) {
    const exactMatch = activeAccounts.find((account) => normalizeAccountName(account.name) === name);
    if (exactMatch) return exactMatch.id;
  }

  return activeAccounts.find((account) => {
    const name = normalizeAccountName(account.name);
    return name.includes("dinheiro") || name.includes("especie");
  })?.id ?? null;
}

export function useFinancialAccounts() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/financial-accounts", { credentials: "include" });
      if (!response.ok) throw new Error("Falha ao carregar contas.");
      const body = await response.json() as { data: FinancialAccount[] };
      setAccounts(body.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh().catch(() => setLoading(false)); }, []);
  return { accounts, loading, refresh };
}

export function FinancialAccountSelect({ accounts, value, onChange, label = "Conta financeira" }: {
  accounts: FinancialAccount[]; value: number | null; onChange: (id: number | null) => void; label?: string;
}) {
  const selected = accounts.find((account) => account.id === value);
  return <label className="block text-sm font-medium text-slate-700">
    {label}
    <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={value ?? ""} onChange={(event) => onChange(Number(event.target.value) || null)} required>
      <option value="">Selecione uma conta</option>
      {accounts.filter((account) => !account.archived).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</option>)}
    </select>
    {selected && <span className="mt-1 block text-xs text-slate-500">Saldo disponível: {selected.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
  </label>;
}
