"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { User, ShieldCheck, HelpCircle } from "lucide-react";

export default function ContaPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("tab") || "profile";

  function setTab(tab: string) {
    router.push(`/app/conta?tab=${tab}`);
  }

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">Minha Conta</h1>
        <p className="mt-1 text-sm text-slate-400">Gerencie seu perfil, preferências e segurança.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Menu Lateral */}
        <aside className="w-full shrink-0 lg:w-64">
          <nav className="flex flex-row gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0 scrollbar-none">
            <button
              onClick={() => setTab("profile")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal ${
                currentTab === "profile"
                  ? "bg-blue-600/10 text-blue-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <User className="h-5 w-5" />
              Meu Perfil
            </button>
            <button
              onClick={() => setTab("security")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal ${
                currentTab === "security"
                  ? "bg-blue-600/10 text-blue-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
              Segurança
            </button>
            <button
              onClick={() => setTab("help")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal ${
                currentTab === "help"
                  ? "bg-blue-600/10 text-blue-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <HelpCircle className="h-5 w-5" />
              Ajuda e Suporte
            </button>
          </nav>
        </aside>

        {/* Conteúdo da Aba (Placeholder para as telas reais) */}
        <div className="flex-1 rounded-2xl border border-slate-800/60 bg-slate-900/50 p-6 md:p-8">
          {currentTab === "profile" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-slate-100">Meu Perfil</h2>
              <p className="mt-2 text-sm text-slate-400">Dados cadastrais e informações pessoais.</p>
              
              <div className="mt-8 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400">Nome completo</label>
                  <input type="text" className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 focus:border-blue-500 focus:outline-none" placeholder="Seu nome..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400">E-mail</label>
                  <input type="email" className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 focus:border-blue-500 focus:outline-none" placeholder="seu@email.com" />
                </div>
                <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500">
                  Salvar alterações
                </button>
              </div>
            </div>
          )}

          {currentTab === "security" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-slate-100">Segurança</h2>
              <p className="mt-2 text-sm text-slate-400">Gerencie sua senha e sessões ativas.</p>
              
              <div className="mt-8 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400">Senha atual</label>
                  <input type="password" className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400">Nova senha</label>
                  <input type="password" className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 focus:border-blue-500 focus:outline-none" />
                </div>
                <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500">
                  Atualizar senha
                </button>
              </div>
            </div>
          )}

          {currentTab === "help" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-slate-100">Ajuda e Suporte</h2>
              <p className="mt-2 text-sm text-slate-400">Entre em contato conosco se precisar de ajuda com a Credix.</p>
              
              <div className="mt-8 space-y-6">
                <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 inline-block">
                  <h3 className="font-semibold text-slate-200">Equipe de Suporte</h3>
                  <p className="mt-1 text-sm text-slate-400">E-mail: suporte@credix.com.br</p>
                  <p className="mt-1 text-sm text-slate-400">Horário: Seg a Sex, 09h às 18h</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
