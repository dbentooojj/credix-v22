"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

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
          window.location.href = "/app/visao-geral";
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
    <div className="min-h-screen bg-[#F0F4FA] safe-area-top safe-area-bottom">
      <div className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[420px] text-center">
          <div className="mb-8">
            <span className="text-3xl font-bold tracking-tight text-slate-800">
              Cred<span className="text-[#4F7EF7]">ix</span>
            </span>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold text-slate-800">Recuperar senha</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Digite seu e-mail para enviarmos o link de redefinicao, se houver uma conta
              cadastrada.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 transition min-h-[48px] focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15"
                  id="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>

            {hasMessage ? (
              <div
                className={[
                  "rounded-xl border px-3.5 py-2.5 text-center text-sm font-medium",
                  status.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                ].join(" ")}
              >
                {status.message}
              </div>
            ) : null}

            <button
              className="w-full rounded-xl bg-[#4F7EF7] py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)] transition-all hover:bg-[#3b6ef0] active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 min-h-[48px]"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-100/70 border-t-transparent" />
                  Enviando...
                </span>
              ) : (
                "Enviar link"
              )}
            </button>
          </form>

          <div className="mt-6 flex justify-center">
            <Link
              className="inline-flex items-center gap-2 text-sm font-medium text-[#4F7EF7] transition hover:text-[#3b6ef0]"
              href="/login"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </Link>
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">(c) 2026 Credix</p>
        </div>
      </div>
    </div>
  );
}
