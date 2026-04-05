"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Menu, 
  ChevronDown, 
  User, 
  ShieldCheck, 
  HelpCircle, 
  LogOut,
  X
} from "lucide-react";
import { BrandWordmark } from "./BrandWordmark";

export function Header({ isOpen, onMenuClick }: { isOpen?: boolean; onMenuClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userName, setUserName] = useState("Carregando...");
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem("currentUser");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.name || user.full_name || "Administrador");
      } catch (err) {}
    }
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
    } catch (e) {
      // Ignora e limpa local de qualquer forma
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
    <header className="fixed w-full top-0 z-50 bg-slate-950/85 border-b border-blue-500/10 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
      <div className="flex w-full items-center justify-between px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
        
        {/* Left: Menu + Logo */}
        <div className="flex items-center gap-1">
          <button 
            onClick={onMenuClick}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-blue-500/20 active:bg-blue-600/30 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <h1 className="ml-1 sm:ml-2">
            <Link href="/app/visao-geral" className="flex items-center focus:outline-none" aria-label="Credix - Ir para visão geral">
              <BrandWordmark size="header" />
            </Link>
          </h1>
        </div>

        {/* Right: User menu */}
        <div className="flex items-center min-w-0">
          <div className="relative min-w-0" ref={menuRef}>
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 text-slate-200 hover:text-white focus:outline-none min-w-0 max-w-full overflow-hidden px-2.5 py-1.5 rounded-xl hover:bg-slate-800/60 active:bg-slate-800/80 transition-all"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              {/* Avatar circle */}
              <span className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[0.7rem] font-bold text-white shrink-0 shadow-sm">
                {userName.charAt(0).toUpperCase()}
              </span>
              <span className="font-semibold min-w-0 truncate text-sm">
                Olá, {userName}
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-lg shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden animate-fade-in">
                {/* User info */}
                <div className="px-4 py-3 border-b border-slate-800">
                  <p className="text-sm font-semibold text-slate-100 truncate">{userName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Administrador</p>
                </div>

                <div className="p-1.5 flex flex-col gap-0.5">
                  <button 
                    onClick={() => handleAction("/app/conta?tab=profile")}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Meu perfil</span>
                  </button>
                  <button 
                    onClick={() => handleAction("/app/conta?tab=security")}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    <span>Segurança</span>
                  </button>
                  <button 
                    onClick={() => handleAction("/app/conta?tab=help")}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
                  >
                    <HelpCircle className="w-4 h-4 text-slate-400" />
                    <span>Ajuda</span>
                  </button>

                  <div className="my-1 h-px bg-slate-800" />

                  <button 
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 active:bg-rose-500/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
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
