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
  Users,
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
  const showReportsNav = process.env.NEXT_PUBLIC_SHOW_REPORTS_NAV === "true";

  const isLinkActive = (path: string) => pathname.startsWith(path);

  const linkClass = (path: string, color?: "emerald" | "rose") => {
    const active = isLinkActive(path);
    const base =
      "group flex w-full min-h-[44px] select-none items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all duration-200";

    if (active) {
      return `${base} border-[#4F7EF7]/20 bg-[#EEF4FF] text-[#4F7EF7] shadow-[0_8px_18px_rgba(79,126,247,0.12)]`;
    }

    const tone =
      color === "emerald"
        ? "text-emerald-700 hover:text-emerald-700"
        : color === "rose"
          ? "text-rose-600 hover:text-rose-700"
          : "text-slate-600 hover:text-slate-900";

    return `${base} border-transparent hover:border-slate-200 hover:bg-slate-50 active:scale-[0.98] ${tone}`;
  };

  const iconClass = (path: string, color?: "emerald" | "rose") => {
    if (isLinkActive(path)) return "text-[#4F7EF7]";
    if (color === "emerald") return "text-emerald-500 group-hover:text-emerald-600";
    if (color === "rose") return "text-rose-500 group-hover:text-rose-600";
    return "text-slate-400 group-hover:text-slate-600";
  };

  return (
    <>
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />

      <aside
        aria-label="Menu principal"
        className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-[272px] border-r border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition-transform duration-300 will-change-transform sm:top-20 sm:h-[calc(100vh-5rem)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
        role="navigation"
      >
        <div className="h-full overflow-y-auto overflow-x-hidden p-4 pb-8 scrollbar-none">
          <section className="mb-6">
            <Link className={linkClass("/app/visao-geral")} href="/app/visao-geral" onClick={onClose}>
              <LayoutDashboard className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/visao-geral")}`} />
              <span className="truncate">Visao geral</span>
            </Link>
          </section>

          <section className="mb-6">
            <h3 className="mb-2.5 px-3 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Emprestimos
            </h3>
            <div className="flex flex-col gap-1">
              <Link className={linkClass("/app/carteira")} href="/app/carteira" onClick={onClose}>
                <Briefcase className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/carteira")}`} />
                <span className="truncate">Carteira</span>
              </Link>
              <Link className={linkClass("/app/clientes")} href="/app/clientes" onClick={onClose}>
                <Users className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/clientes")}`} />
                <span className="truncate">Clientes</span>
              </Link>
              <Link className={linkClass("/app/emprestimos")} href="/app/emprestimos" onClick={onClose}>
                <CreditCard className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/emprestimos")}`} />
                <span className="truncate">Emprestimos</span>
              </Link>
              <Link className={linkClass("/app/parcelas")} href="/app/parcelas" onClick={onClose}>
                <BarChart3 className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/parcelas")}`} />
                <span className="truncate">Parcelas</span>
              </Link>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2.5 px-3 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Financeiro
            </h3>
            <div className="flex flex-col gap-1">
              <Link className={linkClass("/app/pagar", "rose")} href="/app/pagar" onClick={onClose}>
                <TrendingDown className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/pagar", "rose")}`} />
                <span className="truncate">Contas a pagar</span>
              </Link>
              <Link className={linkClass("/app/receber", "emerald")} href="/app/receber" onClick={onClose}>
                <TrendingUp className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/receber", "emerald")}`} />
                <span className="truncate">Contas a receber</span>
              </Link>
            </div>
          </section>

          {showReportsNav && (
            <section className="mb-6">
              <h3 className="mb-2.5 px-3 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                Analises
              </h3>
              <div className="flex flex-col gap-1">
                <Link className={linkClass("/app/relatorios")} href="/app/relatorios" onClick={onClose}>
                  <FileText className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${iconClass("/app/relatorios")}`} />
                  <span className="truncate">Relatorios</span>
                </Link>
              </div>
            </section>
          )}

          <div className="mt-auto border-t border-slate-100 px-3 pt-6">
            <p className="text-[0.6rem] font-medium text-slate-400">Credix v1.0 - 2026</p>
          </div>
        </div>
      </aside>
    </>
  );
}
