"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Suspense } from "react";

export default function ContaPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1000px] text-slate-400">Carregando conta...</div>}>
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

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">Conta</h1>
        <p className="mt-1 text-sm text-slate-400">Gerencie perfil, segurança e suporte.</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Menu Lateral */}
        <nav className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-none items-center">
            <button
              onClick={() => setTab("profile")}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all whitespace-nowrap border ${
                currentTab === "profile"
                  ? "bg-indigo-600/90 border-indigo-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              Meu perfil
            </button>
            <button
              onClick={() => setTab("security")}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all whitespace-nowrap border ${
                currentTab === "security"
                  ? "bg-indigo-600/90 border-indigo-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              Segurança
            </button>
            <button
              onClick={() => setTab("help")}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all whitespace-nowrap border ${
                currentTab === "help"
                  ? "bg-indigo-600/90 border-indigo-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              Ajuda
            </button>
        </nav>

        {/* Conteúdo da Aba (Placeholder para as telas reais) */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-6 md:p-8">
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
              <h2 className="text-xl font-bold text-slate-100">Ajuda</h2>
              <p className="mt-2 text-sm text-slate-400">Contato rápido. Escolha um canal:</p>
              
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <a 
                  href="mailto:usecredix@gmail.com"
                  className="group flex flex-col rounded-2xl border border-slate-800/60 bg-slate-900/50 p-5 transition-all hover:bg-slate-800/80 hover:border-slate-700"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                      <Mail className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-200">E-mail</h3>
                      <p className="mt-0.5 text-sm font-medium text-slate-300 decoration-slate-400 underline-offset-4 group-hover:underline">usecredix@gmail.com</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-400">Clique para enviar mensagem</p>
                </a>

                <a 
                  href="https://wa.me/5547999600742"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col rounded-2xl border border-slate-800/60 bg-slate-900/50 p-5 transition-all hover:bg-slate-800/80 hover:border-slate-700"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600">
                      <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.47-1.761-1.643-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-200">WhatsApp</h3>
                      <p className="mt-0.5 text-sm font-medium text-slate-300 decoration-slate-400 underline-offset-4 group-hover:underline">+55 47 99960-0742</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-400">Clique para abrir conversa</p>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
