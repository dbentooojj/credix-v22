"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Mail, User, ShieldCheck, HelpCircle } from "lucide-react";
import { Suspense } from "react";

export default function ContaPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1000px] text-slate-400 p-6">Carregando conta...</div>}>
      <ContaPageContent />
    </Suspense>
  );
}

function ContaPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("tab") || "profile";

  function setTab(tab: string) {
    router.push(`/app/conta?tab=${tab}`);
  }

  const tabs = [
    { key: "profile", label: "Meu perfil", icon: User },
    { key: "security", label: "Segurança", icon: ShieldCheck },
    { key: "help", label: "Ajuda", icon: HelpCircle },
  ];

  return (
    <div className="mx-auto max-w-[1000px] w-full">
      {/* Page Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl tracking-tight">Conta</h1>
        <p className="mt-1.5 text-sm text-slate-400">Gerencie perfil, segurança e suporte.</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Tab Navigation */}
        <nav className="flex flex-row gap-2 overflow-x-auto pb-2 scrollbar-none items-center" role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              role="tab"
              aria-selected={currentTab === key}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all whitespace-nowrap border min-h-[44px] ${
                currentTab === key
                  ? "bg-[#4F7EF7] border-[#4F7EF7]/60 text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)]"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100 hover:border-slate-700 active:scale-95"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-5 sm:p-6 md:p-8 backdrop-blur-sm">
          {currentTab === "profile" && (
            <div className="animate-fade-in">
              <div className="flex items-start gap-4 mb-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
                  A
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Meu Perfil</h2>
                  <p className="mt-1 text-sm text-slate-400">Dados cadastrais e informações pessoais.</p>
                </div>
              </div>
              
              <div className="space-y-5 max-w-lg">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Nome completo</label>
                  <input type="text" className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition" placeholder="Seu nome..." />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">E-mail</label>
                  <input type="email" className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition" placeholder="seu@email.com" />
                </div>
                <button className="rounded-xl bg-[#4F7EF7] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)] transition hover:bg-[#3b6ef0] active:translate-y-px min-h-[44px]">
                  Salvar alterações
                </button>
              </div>
            </div>
          )}

          {currentTab === "security" && (
            <div className="animate-fade-in">
              <div className="flex items-start gap-4 mb-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-lg font-bold text-white shadow-lg shadow-amber-500/20">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Segurança</h2>
                  <p className="mt-1 text-sm text-slate-400">Gerencie sua senha e sessões ativas.</p>
                </div>
              </div>
              
              <div className="space-y-5 max-w-lg">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Senha atual</label>
                  <input type="password" className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition" placeholder="••••••••" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Nova senha</label>
                  <input type="password" className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition" placeholder="••••••••" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Confirmar nova senha</label>
                  <input type="password" className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition" placeholder="••••••••" />
                </div>
                <button className="rounded-xl bg-[#4F7EF7] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)] transition hover:bg-[#3b6ef0] active:translate-y-px min-h-[44px]">
                  Atualizar senha
                </button>
              </div>
            </div>
          )}

          {currentTab === "help" && (
            <div className="animate-fade-in">
              <div className="flex items-start gap-4 mb-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white shadow-lg shadow-emerald-500/20">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Ajuda</h2>
                  <p className="mt-1 text-sm text-slate-400">Contato rápido. Escolha um canal:</p>
                </div>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <a 
                  href="mailto:usecredix@gmail.com"
                  className="group flex flex-col rounded-2xl border border-slate-800/60 bg-slate-800/30 p-5 transition-all hover:bg-slate-800/60 hover:border-slate-700 hover:shadow-lg hover:shadow-blue-500/5 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4F7EF7] shadow-[0_4px_12px_rgba(79,126,247,0.35)]">
                      <Mail className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors">E-mail</h3>
                      <p className="mt-0.5 text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">usecredix@gmail.com</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500 group-hover:text-slate-400 transition-colors">Clique para enviar mensagem</p>
                </a>

                <a 
                  href="https://wa.me/5547999600742"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col rounded-2xl border border-slate-800/60 bg-slate-800/30 p-5 transition-all hover:bg-slate-800/60 hover:border-slate-700 hover:shadow-lg hover:shadow-emerald-500/5 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-[0_4px_12px_rgba(5,150,105,0.35)]">
                      <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.47-1.761-1.643-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors">WhatsApp</h3>
                      <p className="mt-0.5 text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">+55 47 99960-0742</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500 group-hover:text-slate-400 transition-colors">Clique para abrir conversa</p>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
