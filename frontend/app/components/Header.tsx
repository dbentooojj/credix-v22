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
    // Busca dados do LocalStorage logados
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
    <header className="fixed w-full top-0 z-50 bg-slate-950/80 border-b border-blue-500/10 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-3 py-3 sm:px-6 sm:py-4">
        
        <div className="flex items-center">
          <button 
            onClick={onMenuClick}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-blue-500/20 active:bg-blue-600/30 transition-colors focus:outline-none lg:hidden"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <h1 className="ml-2 sm:ml-4">
            <Link href="/app/visao-geral" className="flex items-center focus:outline-none" aria-label="Credix">
              <BrandWordmark size="header" />
            </Link>
          </h1>
        </div>

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-4 lg:gap-6 min-w-0">
          <div className="relative min-w-0" ref={menuRef}>
            
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 text-slate-200 hover:text-white focus:outline-none min-w-0 max-w-full overflow-hidden px-2 py-1 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              <span className="font-semibold min-w-0 truncate text-sm sm:text-base">
                Olá, {userName}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-xl border border-slate-700/60 bg-slate-900 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-1.5 flex flex-col gap-0.5">
                  <button 
                    onClick={() => handleAction("/app/conta?tab=profile")}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Meu perfil</span>
                  </button>
                  <button 
                    onClick={() => handleAction("/app/conta?tab=security")}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    <span>Segurança</span>
                  </button>
                  <button 
                    onClick={() => handleAction("/app/conta?tab=help")}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <HelpCircle className="w-4 h-4 text-slate-400" />
                    <span>Ajuda</span>
                  </button>

                  <div className="my-1 h-px bg-slate-800"></div>

                  <button 
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
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
