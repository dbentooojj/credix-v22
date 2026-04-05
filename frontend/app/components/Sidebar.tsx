"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  BarChart3, 
  Briefcase, 
  CreditCard, 
  FileText, 
  LayoutDashboard, 
  TrendingDown, 
  TrendingUp, 
  Users 
} from "lucide-react";

export function Sidebar({
  isOpen,
  isCollapsed = false,
  onClose,
}: {
  isOpen: boolean;
  isCollapsed?: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const isLinkActive = (path: string) => pathname.startsWith(path);
  const showReportsNav = process.env.NEXT_PUBLIC_SHOW_REPORTS_NAV === 'true';

  const linkClass = (path: string, color?: 'emerald' | 'rose') => {
    const active = isLinkActive(path);
    const base = "group flex items-center gap-3 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border select-none";
    
    if (active) {
      return `${base} bg-gradient-to-br from-blue-600/40 to-indigo-800/30 border-blue-400/30 text-white shadow-[0_8px_16px_-8px_rgba(37,99,235,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]`;
    }

    const unactiveColors = color === 'emerald' 
      ? "text-emerald-400 hover:text-emerald-300" 
      : color === 'rose' 
        ? "text-rose-400 hover:text-rose-300" 
        : "text-slate-300 hover:text-slate-50";

    return `${base} border-transparent hover:bg-slate-900/90 hover:border-blue-500/20 active:scale-[0.98] ${unactiveColors}`;
  };

  const iconClass = (path: string, color?: 'emerald' | 'rose') => {
    const active = isLinkActive(path);
    if (active) return "text-blue-200";
    
    if (color === 'emerald') return "text-emerald-500 group-hover:text-emerald-300";
    if (color === 'rose') return "text-rose-500 group-hover:text-rose-300";
    
    return "text-slate-500 group-hover:text-blue-100";
  };

  return (
    <>
      {/* Overlay for mobile */}
      <div 
        className={`fixed inset-0 z-30 bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside 
        className={`fixed top-16 sm:top-20 left-0 h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] w-[272px] z-40 bg-gradient-to-b from-slate-950/[0.98] to-slate-900/[0.98] border-r border-blue-500/10 shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] transition-transform duration-300 will-change-transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
        role="navigation"
        aria-label="Menu principal"
      >
        <div className="h-full overflow-y-auto overflow-x-hidden p-4 pb-8 scrollbar-none">
          {/* Visão Geral */}
          <section className="mb-6">
            <Link href="/app/visao-geral" className={linkClass("/app/visao-geral")} onClick={onClose}>
              <LayoutDashboard className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/visao-geral")}`} />
              <span className="truncate">Visão geral</span>
            </Link>
          </section>

          {/* Empréstimos */}
          <section className="mb-6">
            <h3 className="mb-2.5 px-3 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-slate-500/80">
              Empréstimos
            </h3>
            <div className="flex flex-col gap-1">
              <Link href="/app/carteira" className={linkClass("/app/carteira")} onClick={onClose}>
                <Briefcase className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/carteira")}`} />
                <span className="truncate">Carteira</span>
              </Link>
              <Link href="/app/clientes" className={linkClass("/app/clientes")} onClick={onClose}>
                <Users className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/clientes")}`} />
                <span className="truncate">Clientes</span>
              </Link>
              <Link href="/app/emprestimos" className={linkClass("/app/emprestimos")} onClick={onClose}>
                <CreditCard className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/emprestimos")}`} />
                <span className="truncate">Empréstimos</span>
              </Link>
              <Link href="/app/parcelas" className={linkClass("/app/parcelas")} onClick={onClose}>
                <BarChart3 className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/parcelas")}`} />
                <span className="truncate">Parcelas</span>
              </Link>
            </div>
          </section>

          {/* Financeiro */}
          <section className="mb-6">
            <h3 className="mb-2.5 px-3 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-slate-500/80">
              Financeiro
            </h3>
            <div className="flex flex-col gap-1">
              <Link href="/app/pagar" className={linkClass("/app/pagar", "rose")} onClick={onClose}>
                <TrendingDown className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/pagar", "rose")}`} />
                <span className="truncate">Contas a pagar</span>
              </Link>
              <Link href="/app/receber" className={linkClass("/app/receber", "emerald")} onClick={onClose}>
                <TrendingUp className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/receber", "emerald")}`} />
                <span className="truncate">Contas a receber</span>
              </Link>
            </div>
          </section>

          {showReportsNav && (
            <section className="mb-6">
              <h3 className="mb-2.5 px-3 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-slate-500/80">
                Análises
              </h3>
              <div className="flex flex-col gap-1">
                <Link href="/app/relatorios" className={linkClass("/app/relatorios")} onClick={onClose}>
                  <FileText className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/relatorios")}`} />
                  <span className="truncate">Relatórios</span>
                </Link>
              </div>
            </section>
          )}

          {/* Spacer + Branding */}
          <div className="mt-auto pt-6 border-t border-slate-800/60 px-3">
            <p className="text-[0.6rem] font-medium text-slate-600">
              Credix v1.0 &mdash; 2026
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
