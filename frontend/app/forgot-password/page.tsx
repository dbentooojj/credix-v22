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
        // Ignore session check failures.
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F0F4FA] px-4 py-6 text-slate-800 safe-area-top safe-area-bottom">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#4F7EF7]/12 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_460px_at_10%_-6%,rgba(79,126,247,0.18),transparent_58%),radial-gradient(760px_420px_at_100%_0%,rgba(125,165,255,0.16),transparent_52%)]" />
      </div>

      <div className="relative z-10 w-full max-w-[460px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4F7EF7] shadow-[0_6px_18px_rgba(79,126,247,0.28)]">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2C4.686 2 2 4.686 2 8s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 2a4 4 0 110 8A4 4 0 018 4zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" fill="white" />
              </svg>
            </span>
            <span className="text-3xl font-bold tracking-tight">
              <span className="text-slate-800">Cred</span>
              <span className="text-[#4F7EF7]">ix</span>
            </span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#4F7EF7]/15 bg-white/90 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#4F7EF7] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.14)]" />
            Recuperacao segura de acesso
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white/96 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-lg sm:p-7">
          <div className="mb-6 space-y-2 text-center">
            <h1 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-slate-800">
              Recuperar senha
            </h1>
            <p className="text-sm leading-6 text-slate-500">
              Informe seu e-mail cadastrado e, se encontrarmos uma conta, enviaremos um link
              seguro para redefinicao de senha.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition focus-within:border-[#4F7EF7] focus-within:shadow-[0_0_0_3px_rgba(79,126,247,0.12)]">
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
                className="h-full min-h-[48px] flex-1 bg-transparent text-base font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none"
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
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                ].join(" ")}
              >
                {status.message}
              </div>
            ) : (
              <p className="text-[0.78rem] leading-5 text-slate-500">
                Voce recebera um e-mail apenas se o endereco informado estiver cadastrado na
                plataforma.
              </p>
            )}

            <button
              className="flex h-12 min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] text-sm font-bold text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)] transition-all hover:-translate-y-[1px] hover:bg-[#3b6ef0] hover:shadow-[0_6px_20px_rgba(79,126,247,0.5)] active:translate-y-0 disabled:translate-y-0 disabled:opacity-75 disabled:shadow-none"
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
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
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

          <p className="mt-4 text-center text-[0.78rem] text-slate-400">
            &copy; 2026 Credix. Mantemos seus dados de acesso sempre protegidos.
          </p>
        </div>
      </div>
    </div>
  );
}
