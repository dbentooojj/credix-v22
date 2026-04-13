"use client";

import { Suspense } from "react";
import { Mail, User, ShieldCheck, HelpCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";

export default function ContaPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1000px] p-6 text-slate-500">Carregando conta...</div>}>
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
    { key: "security", label: "Seguranca", icon: ShieldCheck },
    { key: "help", label: "Ajuda", icon: HelpCircle },
  ];

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15";

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader
        subtitle="Gerencie perfil, segurança e suporte."
        title="Conta"
      />

      <div className="flex flex-col gap-6">
        <nav className="scrollbar-none flex flex-row items-center gap-2 overflow-x-auto pb-2" role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              aria-selected={currentTab === key}
              className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-medium transition-all ${
                currentTab === key
                  ? "border-[#4F7EF7]/60 bg-[#4F7EF7] text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)]"
                  : "border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95"
              }`}
              onClick={() => setTab(key)}
              role="tab"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:p-6 md:p-8">
          {currentTab === "profile" && (
            <div className="animate-fade-in">
              <div className="max-w-lg space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Nome completo</label>
                  <input type="text" className={inputClass} placeholder="Seu nome..." />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">E-mail</label>
                  <input type="email" className={inputClass} placeholder="seu@email.com" />
                </div>
                <button className="min-h-[44px] rounded-xl bg-[#4F7EF7] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)] transition hover:bg-[#3b6ef0] active:translate-y-px">
                  Salvar alteracoes
                </button>
              </div>
            </div>
          )}

          {currentTab === "security" && (
            <div className="animate-fade-in">
              <div className="max-w-lg space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Senha atual</label>
                  <input type="password" className={inputClass} placeholder="••••••••" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Nova senha</label>
                  <input type="password" className={inputClass} placeholder="••••••••" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Confirmar nova senha</label>
                  <input type="password" className={inputClass} placeholder="••••••••" />
                </div>
                <button className="min-h-[44px] rounded-xl bg-[#4F7EF7] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)] transition hover:bg-[#3b6ef0] active:translate-y-px">
                  Atualizar senha
                </button>
              </div>
            </div>
          )}

          {currentTab === "help" && (
            <div className="animate-fade-in">
              <div className="grid gap-4 sm:grid-cols-2">
                <a
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-5 transition-all hover:border-slate-300 hover:bg-white hover:shadow-lg hover:shadow-blue-500/5 active:scale-[0.98]"
                  href="mailto:usecredix@gmail.com"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4F7EF7] shadow-[0_4px_12px_rgba(79,126,247,0.35)]">
                      <Mail className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">E-mail</h3>
                      <p className="mt-0.5 text-sm font-medium text-slate-500">usecredix@gmail.com</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">Clique para enviar mensagem</p>
                </a>

                <a
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-5 transition-all hover:border-slate-300 hover:bg-white hover:shadow-lg hover:shadow-emerald-500/5 active:scale-[0.98]"
                  href="https://wa.me/5547999600742"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-[0_4px_12px_rgba(5,150,105,0.35)]">
                      <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.47-1.761-1.643-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">WhatsApp</h3>
                      <p className="mt-0.5 text-sm font-medium text-slate-500">+55 47 99960-0742</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">Clique para abrir conversa</p>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
