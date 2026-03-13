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
    "group flex min-h-[42px] items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition",
    isActive
      ? "border-sky-300/30 bg-[linear-gradient(135deg,rgba(37,99,235,0.38),rgba(30,64,175,0.3))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_24px_-22px_rgba(37,99,235,0.72)]"
      : "border-transparent text-slate-300 hover:translate-x-[1px] hover:border-sky-400/20 hover:bg-slate-900/90 hover:text-white",
    tone === "danger" && !isActive ? "text-rose-400" : "",
    tone === "success" && !isActive ? "text-emerald-400" : "",
  ].join(" ");
}

function itemIconClassName(isActive: boolean, tone?: NavItem["tone"]) {
  return [
    "h-4 w-4 shrink-0 transition",
    isActive ? "text-sky-100" : "text-slate-400 group-hover:text-sky-100",
    tone === "danger" && !isActive ? "text-rose-500" : "",
    tone === "success" && !isActive ? "text-emerald-500" : "",
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

  return (
    <div className="relative min-h-screen">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-700/30 bg-[rgba(12,18,32,0.86)] backdrop-blur-[10px]">
        <div className="flex h-16 items-center justify-between px-3 sm:h-20 sm:px-6">
          <div className="flex items-center">
            <button
              aria-label="Alternar menu lateral"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 transition hover:bg-sky-500/15 hover:text-white"
              onClick={handleSidebarToggle}
              type="button"
            >
              <MenuIcon className="h-5 w-5" />
            </button>

            <Link aria-label="Credix" className="ml-3 sm:ml-6" href="/app/visao-geral">
              <BrandWordmark compact />
            </Link>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-slate-200 transition hover:text-white"
              onClick={() => setUserMenuOpen((current) => !current)}
              type="button"
            >
              <span className="font-semibold">Ola, {displayName}</span>
              <ChevronDownIcon className="h-4 w-4" />
            </button>

            <div
              className={[
                "absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl shadow-slate-950/60 transition",
                userMenuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
              ].join(" ")}
            >
              <Link
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                href="/account.html?tab=profile"
              >
                <ProfileIcon className="h-4 w-4 text-slate-400" />
                <span>Meu perfil</span>
              </Link>
              <Link
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                href="/account.html?tab=security"
              >
                <ShieldIcon className="h-4 w-4 text-slate-400" />
                <span>Seguranca</span>
              </Link>
              <Link
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                href="/account.html?tab=help"
              >
                <HelpCircleIcon className="h-4 w-4 text-slate-400" />
                <span>Ajuda</span>
              </Link>
              <div className="my-2 border-t border-slate-700" />
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-400 transition hover:bg-rose-950/40"
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

      <div className="pt-16 sm:pt-20">
        <button
          aria-label="Fechar menu lateral"
          className={[
            "fixed inset-0 z-30 bg-slate-950/50 transition lg:hidden",
            mobileSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
          onClick={() => setMobileSidebarOpen(false)}
          type="button"
        />

        <aside
          className={[
            "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 border-r border-sky-500/15 bg-[radial-gradient(140%_140%_at_0%_0%,rgba(37,99,235,0.12),transparent_42%),linear-gradient(180deg,rgba(6,18,38,0.98)_0%,rgba(5,15,31,0.98)_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] transition-transform duration-150 sm:top-20 sm:h-[calc(100vh-5rem)]",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            desktopSidebarCollapsed ? "lg:-translate-x-full" : "",
          ].join(" ")}
        >
          <nav
            aria-label="Navegacao principal"
            className="h-full overflow-y-auto px-4 py-4 [scrollbar-color:rgba(59,130,246,0.35)_transparent] [scrollbar-width:thin]"
          >
            {navSections.map((section) => (
              <section className="mt-5 first:mt-0" key={section.title ?? section.items[0]?.href}>
                {section.title ? (
                  <h3 className="mb-2 px-2 text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                    {section.title}
                  </h3>
                ) : null}

                <div className="flex flex-col gap-1">
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
          </nav>
        </aside>

        <div className={`transition-[padding] duration-150 ${desktopSidebarCollapsed ? "lg:pl-0" : "lg:pl-64"}`}>
          <main className="relative z-10 min-h-[calc(100vh-4rem)] p-4 sm:min-h-[calc(100vh-5rem)] sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
