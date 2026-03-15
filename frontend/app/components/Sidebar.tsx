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
    const base = "group flex items-center gap-3 w-full min-h-[42px] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border";
    
    if (active) {
      return `${base} bg-gradient-to-br from-blue-600/40 to-indigo-800/30 border-blue-400/30 text-white shadow-[0_8px_16px_-8px_rgba(37,99,235,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]`;
    }

    const unactiveColors = color === 'emerald' 
      ? "text-emerald-400 hover:text-emerald-300" 
      : color === 'rose' 
        ? "text-rose-400 hover:text-rose-300" 
        : "text-slate-300 hover:text-slate-50";

    return `${base} border-transparent hover:bg-slate-900/90 hover:border-blue-500/20 ${unactiveColors}`;
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
      <div 
        className={`fixed inset-0 z-30 bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <aside 
        className={`fixed top-16 sm:top-20 left-0 h-[calc(100%-4rem)] sm:h-[calc(100%-5rem)] w-64 z-40 bg-gradient-to-b from-slate-950/98 to-slate-900/98 border-r border-blue-500/10 shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
      >
        <div className="h-full overflow-y-auto overflow-x-hidden p-4 pb-6 scrollbar-thin scrollbar-thumb-blue-500/30">
          <section className="mb-5">
            <Link href="/app/visao-geral" className={linkClass("/app/visao-geral")}>
              <LayoutDashboard className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/visao-geral")}`} />
              <span className="truncate">Visão geral</span>
            </Link>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 px-2.5 text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">
              Empréstimos
            </h3>
            <div className="flex flex-col gap-1">
              <Link href="/app/carteira" className={linkClass("/app/carteira")}>
                <Briefcase className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/carteira")}`} />
                <span className="truncate">Carteira</span>
              </Link>
              <Link href="/app/clientes" className={linkClass("/app/clientes")}>
                <Users className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/clientes")}`} />
                <span className="truncate">Clientes</span>
              </Link>
              <Link href="/app/emprestimos" className={linkClass("/app/emprestimos")}>
                <CreditCard className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/emprestimos")}`} />
                <span className="truncate">Empréstimos</span>
              </Link>
              <Link href="/app/parcelas" className={linkClass("/app/parcelas")}>
                <BarChart3 className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/parcelas")}`} />
                <span className="truncate">Parcelas</span>
              </Link>
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 px-2.5 text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">
              Financeiro
            </h3>
            <div className="flex flex-col gap-1">
              <Link href="/app/pagar" className={linkClass("/app/pagar", "rose")}>
                <TrendingDown className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/pagar", "rose")}`} />
                <span className="truncate">Contas a pagar</span>
              </Link>
              <Link href="/app/receber" className={linkClass("/app/receber", "emerald")}>
                <TrendingUp className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/receber", "emerald")}`} />
                <span className="truncate">Contas a receber</span>
              </Link>
            </div>
          </section>

          {showReportsNav && (
            <section className="mb-5">
              <h3 className="mb-2 px-2.5 text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">
                Análises
              </h3>
              <div className="flex flex-col gap-1">
                <Link href="/app/relatorios" className={linkClass("/app/relatorios")}>
                  <FileText className={`w-4 h-4 shrink-0 transition-colors ${iconClass("/app/relatorios")}`} />
                  <span className="truncate">Relatórios</span>
                </Link>
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
