"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { BrandWordmark } from "./BrandWordmark";

export function Header({ isOpen, onMenuClick }: { isOpen?: boolean; onMenuClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userName, setUserName] = useState("Carregando...");
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem("currentUser");
    if (!userStr) return;

    try {
      const user = JSON.parse(userStr);
      setUserName(user.name || user.full_name || "Administrador");
    } catch {}
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    setMenuOpen(false);

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

  function handleAction(path: string) {
    setMenuOpen(false);
    router.push(path);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex w-full items-center justify-between px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
        <div className="flex items-center gap-1.5">
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
              aria-label="Credix - Ir para visão geral"
              className="flex items-center focus:outline-none"
              href="/app/visao-geral"
            >
              <BrandWordmark size="header" />
            </Link>
          </h1>
        </div>

        <div className="flex min-w-0 items-center">
          <div className="relative min-w-0" ref={menuRef}>
            <button
              aria-expanded={menuOpen}
              aria-haspopup="true"
              className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none"
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
            >
              <span className="min-w-0 truncate text-sm font-semibold">Ola, {userName}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)] animate-fade-in">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-800">{userName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Administrador</p>
                </div>

                <div className="flex flex-col gap-0.5 p-1.5">
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={() => handleAction("/app/conta?tab=profile")}
                    type="button"
                  >
                    <User className="h-4 w-4 text-slate-400" />
                    <span>Meu perfil</span>
                  </button>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={() => handleAction("/app/conta?tab=security")}
                    type="button"
                  >
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    <span>Seguranca</span>
                  </button>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={() => handleAction("/app/conta?tab=help")}
                    type="button"
                  >
                    <HelpCircle className="h-4 w-4 text-slate-400" />
                    <span>Ajuda</span>
                  </button>

                  <div className="my-1 h-px bg-slate-100" />

                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                    onClick={handleLogout}
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
