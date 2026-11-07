"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { BrandWordmark } from "./BrandWordmark";

export function Header({ isOpen, onMenuClick }: { isOpen?: boolean; onMenuClick: () => void }) {
  const [userName, setUserName] = useState("Carregando...");
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem("currentUser");
    if (!userStr) return;

    try {
      const user = JSON.parse(userStr);
      setUserName(user.name || user.full_name || "Administrador");
    } catch {}
  }, []);

  async function handleLogout() {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignora e limpa local de qualquer forma.
    }

    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("currentUser");
    router.push("/login");
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex w-full items-center justify-between px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            onClick={onMenuClick}
            type="button"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <h1 className="ml-1 sm:ml-2">
            <Link
              aria-label="Credix - Ir para carteira"
              className="flex items-center focus:outline-none"
              href="/app/carteira"
            >
              <BrandWordmark size="header" />
            </Link>
          </h1>
        </div>

        <div className="ml-3 flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-1 text-slate-700 shadow-sm">
          <span className="min-w-0 truncate text-sm font-semibold" title={userName}>
            {userName}
          </span>
          <button
            aria-label="Sair"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            onClick={handleLogout}
            title="Sair"
            type="button"
          >
            <LogOut aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
