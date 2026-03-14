"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Status = {
  type: "idle" | "success" | "error";
  message: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });

  useEffect(() => {
    let active = true;

    void fetch("/auth/me", { credentials: "include" })
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          window.location.href = "/admin/visao-geral.html";
        }
      })
      .catch(() => {
        // Ignore session check failures – user permanece na pagina.
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSubmitting(true);
    setStatus({ type: "idle", message: "" });

    try {
      const response = await fetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      const message =
        payload?.message ?? "Se o e-mail estiver cadastrado, enviaremos instrucoes.";

      setStatus({ type: "success", message });
    } catch {
      setStatus({
        type: "error",
        message: "Nao foi possivel solicitar a recuperacao agora. Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const hasMessage = status.type !== "idle" && status.message.trim().length > 0;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-6 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_560px_at_8%_-18%,rgba(99,102,241,0.28),transparent_56%),radial-gradient(900px_420px_at_100%_-6%,rgba(37,99,235,0.22),transparent_60%),linear-gradient(165deg,#020617_0%,#020617_40%,#020617_100%)] opacity-80" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="inline-flex select-none flex-col leading-none" aria-label="Credix">
            <span className="text-3xl font-semibold tracking-tight sm:text-4xl">
              <span className="text-white">Cred</span>
              <span className="text-[#D8AF2F]">ix</span>
            </span>
            <span className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-slate-300/90">
              Gerenciamento inteligente
            </span>
          </span>

          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-slate-900/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sky-200">
            <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.35)]" />
            Recuperacao segura de acesso
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-700/60 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] p-6 shadow-[0_26px_70px_rgba(2,6,23,0.85)] backdrop-blur-lg sm:p-7">
          <div className="mb-6 space-y-2 text-center">
            <h1 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-slate-50">
              Recuperar senha
            </h1>
            <p className="text-sm leading-6 text-slate-300">
              Informe seu e-mail cadastrado e, se encontrarmos uma conta, enviaremos um link
              seguro para redefinicao de senha.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-slate-600/70 bg-slate-900/70 px-4 text-sm shadow-[0_0_0_1px_rgba(15,23,42,0.9)] transition focus-within:border-indigo-400 focus-within:shadow-[0_0_0_1px_rgba(129,140,248,0.9)]">
              <span className="sr-only">Email</span>
              <span className="flex h-5 w-5 items-center justify-center text-slate-400">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.9}
                  viewBox="0 0 24 24"
                >
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                  <path d="m22 6-10 7L2 6" />
                </svg>
              </span>
              <input
                autoComplete="email"
                className="h-full flex-1 bg-transparent text-base font-medium text-slate-100 placeholder:text-slate-400 focus:outline-none"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                required
                type="email"
                value={email}
              />
            </label>

            {hasMessage ? (
              <div
                className={[
                  "rounded-xl border px-3 py-2 text-sm",
                  status.type === "success"
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    : "border-rose-400/40 bg-rose-500/10 text-rose-100",
                ].join(" ")}
              >
                {status.message}
              </div>
            ) : (
              <p className="text-[0.78rem] leading-5 text-slate-400">
                Voce recebera um e-mail apenas se o endereco informado estiver cadastrado na
                plataforma.
              </p>
            )}

            <button
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/60 bg-[linear-gradient(135deg,#2f5fde,#2563eb)] text-sm font-semibold text-slate-50 shadow-[0_10px_24px_-16px_rgba(59,130,246,0.86),inset_0_1px_0_rgba(191,219,254,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_13px_26px_-16px_rgba(59,130,246,0.92),inset_0_1px_0_rgba(219,234,254,0.28)] disabled:translate-y-0 disabled:opacity-75 disabled:shadow-none"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-100/70 border-t-transparent" />
                  Enviando...
                </>
              ) : (
                <>
                  <span className="inline-flex h-4 w-4 items-center justify-center">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.9}
                      viewBox="0 0 24 24"
                    >
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                  </span>
                  Enviar link
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link
              className="inline-flex items-center gap-2 text-sm italic text-slate-300 transition hover:text-slate-50"
              href="/login"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.9}
                  viewBox="0 0 24 24"
                >
                  <path d="M12 19 5 12l7-7" />
                  <path d="M5 12h14" />
                </svg>
              </span>
              Voltar para o login
            </Link>
          </div>

          <p className="mt-4 text-center text-[0.78rem] text-slate-500">
            &copy; 2026 Credix. Mantemos seus dados de acesso sempre protegidos. Desenvolvido com
            carinho para Diogo.
          </p>
        </div>
      </div>
    </div>
  );
}

