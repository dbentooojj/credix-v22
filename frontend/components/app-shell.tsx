"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BrandWordmark } from "./brand-wordmark";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ChartBarsIcon,
  ChevronDownIcon,
  FileTextIcon,
  GridIcon,
  HelpCircleIcon,
  LoansIcon,
  LogoutIcon,
  MenuIcon,
  ProfileIcon,
  ShieldIcon,
  UsersIcon,
} from "./icons";

type AppShellProps = {
  children: ReactNode;
};

type AuthUser = {
  name?: string;
  email?: string;
  role?: string;
};

type NavItem = {
  href: string;
  label: string;
  tone?: "danger" | "success";
  icon: typeof GridIcon;
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

const showReportsNav = process.env.NEXT_PUBLIC_SHOW_REPORTS_NAV === "true";

const navSections: NavSection[] = [
  {
    items: [
      {
        href: "/app/visao-geral",
        label: "Visao geral",
        icon: GridIcon,
      },
    ],
  },
  {
    title: "Emprestimos",
    items: [
      {
        href: "/dashboard.html",
        label: "Carteira",
        icon: ChartBarsIcon,
      },
      {
        href: "/debtors.html",
        label: "Clientes",
        icon: UsersIcon,
      },
      {
        href: "/loans.html",
        label: "Emprestimos",
        icon: LoansIcon,
      },
      {
        href: "/installments.html",
        label: "Parcelas",
        icon: CalendarIcon,
      },
    ],
  },
  {
    title: "Financeiro",
    items: [
      {
        href: "/admin/contas-a-pagar.html",
        label: "Contas a pagar",
        icon: ArrowUpIcon,
        tone: "danger",
      },
      {
        href: "/admin/contas-a-receber.html",
        label: "Contas a receber",
        icon: ArrowDownIcon,
        tone: "success",
      },
    ],
  },
  ...(showReportsNav
    ? [
        {
          title: "Analises",
          items: [
            {
              href: "/admin/finance-reports.html",
              label: "Relatorios",
              icon: FileTextIcon,
            },
          ],
        } satisfies NavSection,
      ]
    : []),
];

function itemIsActive(pathname: string, href: string) {
  if (href === "/app/visao-geral") {
    return pathname === href || pathname === "/app";
  }
  return pathname === href;
}

function itemClassName(isActive: boolean, tone?: NavItem["tone"]) {
  return [
    "group flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 select-none",
    isActive
      ? "bg-[#4F7EF7] text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)]"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:scale-[0.98]",
    tone === "danger" && !isActive ? "text-red-500 hover:text-red-600" : "",
    tone === "success" && !isActive ? "text-emerald-600 hover:text-emerald-700" : "",
  ].join(" ");
}

function itemIconClassName(isActive: boolean, tone?: NavItem["tone"]) {
  return [
    "h-4 w-4 shrink-0 transition-colors",
    isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600",
    tone === "danger" && !isActive ? "text-red-400 group-hover:text-red-500" : "",
    tone === "success" && !isActive ? "text-emerald-500 group-hover:text-emerald-600" : "",
  ].join(" ");
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setMobileSidebarOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const storedUser = window.localStorage.getItem("currentUser");
      if (storedUser) {
        setUser(JSON.parse(storedUser) as AuthUser);
      }
    } catch {
      // Ignore storage parsing failures.
    }

    let active = true;
    const controller = new AbortController();

    void fetch("/auth/me", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/login";
          return null;
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message || "Falha ao carregar a sessao.");
        }

        return payload?.user ?? null;
      })
      .then((authUser) => {
        if (!active || !authUser) return;

        const nextUser = {
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
        } satisfies AuthUser;

        setUser(nextUser);

        try {
          window.localStorage.setItem("isLoggedIn", "true");
          window.localStorage.setItem("currentUser", JSON.stringify(nextUser));
        } catch {
          // Ignore storage write failures.
        }
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.error(error);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (!menuRef.current?.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [userMenuOpen]);

  async function handleLogout() {
    try {
      window.localStorage.removeItem("isLoggedIn");
      window.localStorage.removeItem("currentUser");
    } catch {
      // Ignore storage failures during logout.
    }

    await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => null);

    window.location.href = "/login";
  }

  function handleSidebarToggle() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setDesktopSidebarCollapsed((current) => !current);
      return;
    }

    setMobileSidebarOpen((current) => !current);
  }

  const displayName = user?.name?.trim() || "Administrador";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="relative min-h-screen bg-[#F0F4FA]">
      {/* ── TOP HEADER ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-[12px]">
        <div className="flex h-16 items-center justify-between px-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              aria-label="Alternar menu lateral"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              onClick={handleSidebarToggle}
              type="button"
            >
              <MenuIcon className="h-5 w-5" />
            </button>

            <Link aria-label="Credix" className="ml-1" href="/app/visao-geral">
              <BrandWordmark compact />
            </Link>
          </div>

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-slate-700 transition hover:bg-slate-100"
              onClick={() => setUserMenuOpen((current) => !current)}
              type="button"
            >
              {/* Avatar circle */}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4F7EF7] text-xs font-bold text-white">
                {initials || "A"}
              </span>
              <span className="hidden text-sm font-semibold sm:block">{displayName}</span>
              <ChevronDownIcon className="h-4 w-4 text-slate-400" />
            </button>

            <div
              className={[
                "absolute right-0 top-full mt-2 w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_8px_32px_rgba(15,23,42,0.12)] transition-all duration-150",
                userMenuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
              ].join(" ")}
            >
              <Link
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                href="/account.html?tab=profile"
              >
                <ProfileIcon className="h-4 w-4 text-slate-400" />
                <span>Meu perfil</span>
              </Link>
              <Link
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                href="/account.html?tab=security"
              >
                <ShieldIcon className="h-4 w-4 text-slate-400" />
                <span>Seguranca</span>
              </Link>
              <Link
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                href="/account.html?tab=help"
              >
                <HelpCircleIcon className="h-4 w-4 text-slate-400" />
                <span>Ajuda</span>
              </Link>
              <div className="my-1.5 border-t border-slate-100" />
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-50"
                onClick={handleLogout}
                type="button"
              >
                <LogoutIcon className="h-4 w-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="pt-16">
        {/* Mobile overlay */}
        <button
          aria-label="Fechar menu lateral"
          className={[
            "fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm transition lg:hidden",
            mobileSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
          onClick={() => setMobileSidebarOpen(false)}
          type="button"
        />

        {/* ── SIDEBAR ── */}
        <aside
          className={[
            "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-60 border-r border-slate-200/80 bg-white transition-transform duration-200",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            desktopSidebarCollapsed ? "lg:-translate-x-full" : "",
          ].join(" ")}
        >
          <nav
            aria-label="Navegacao principal"
            className="flex h-full flex-col overflow-y-auto px-3 py-4 [scrollbar-width:thin]"
          >
            {navSections.map((section) => (
              <section className="mt-5 first:mt-0" key={section.title ?? section.items[0]?.href}>
                {section.title ? (
                  <h3 className="mb-1.5 px-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-slate-400">
                    {section.title}
                  </h3>
                ) : null}

                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = itemIsActive(pathname, item.href);

                    return (
                      <Link className={itemClassName(isActive, item.tone)} href={item.href} key={item.href}>
                        <Icon className={itemIconClassName(isActive, item.tone)} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}

            {/* Bottom spacer */}
            <div className="flex-1" />
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3.5 border border-slate-100">
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Conta</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-700">{displayName}</p>
              {user?.email ? (
                <p className="mt-0.5 truncate text-xs text-slate-400">{user.email}</p>
              ) : null}
            </div>
          </nav>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div className={`transition-[padding] duration-200 ${desktopSidebarCollapsed ? "lg:pl-0" : "lg:pl-60"}`}>
          <main className="relative z-10 min-h-[calc(100vh-4rem)] p-3 sm:p-5 lg:p-6 xl:p-8 pb-24 lg:pb-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
