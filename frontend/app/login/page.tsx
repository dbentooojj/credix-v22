"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.message || "E-mail ou senha inválidos.");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("currentUser", JSON.stringify(payload.user || {}));
        localStorage.setItem("rememberMe", rememberMe ? "true" : "false");
        localStorage.setItem("credix:last-activity-at", String(Date.now()));
        localStorage.removeItem("credix:force-logout-at");
      }

      router.push("/app");
    } catch (err: any) {
      setErrorMsg(err.message || "Falha ao realizar login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F0F4FA]">
      {/* ── LEFT PANEL (decorative) ── */}
      <div className="hidden lg:flex lg:w-[46%] flex-col justify-between bg-[#4F7EF7] p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute top-1/2 right-8 h-32 w-32 rounded-full bg-white/5" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2C4.686 2 2 4.686 2 8s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 2a4 4 0 110 8A4 4 0 018 4zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" fill="white"/>
            </svg>
          </span>
          <span className="text-2xl font-bold text-white">
            Cred<span className="text-white/80">ix</span>
          </span>
        </div>

        {/* Tagline */}
        <div className="relative z-10">
          <h2 className="text-3xl font-bold leading-tight text-white">
            Gerencie seus<br />emprestimos com<br />inteligencia
          </h2>
          <p className="mt-4 text-blue-100/80 text-base leading-relaxed max-w-xs">
            Controle total sobre caixa, parcelas, clientes e financeiro em um unico lugar.
          </p>

          {/* Stats row */}
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: "Controle de caixa", icon: "💰" },
              { label: "Clientes e contratos", icon: "👥" },
              { label: "Parcelas e vencimentos", icon: "📅" },
              { label: "Relatorios financeiros", icon: "📊" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium text-white/90">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-blue-200/60">© 2026 Credix. Todos os direitos reservados.</p>
      </div>

      {/* ── RIGHT PANEL (form) ── */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4F7EF7] shadow-[0_4px_12px_rgba(79,126,247,0.4)]">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2C4.686 2 2 4.686 2 8s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 2a4 4 0 110 8A4 4 0 018 4zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" fill="white"/>
            </svg>
          </span>
          <span className="text-2xl font-bold text-slate-800">
            Cred<span className="text-[#4F7EF7]">ix</span>
          </span>
        </div>

        <div className="w-full max-w-[400px]">
          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-slate-800">Bem-vindo de volta</h1>
            <p className="mt-1.5 text-sm text-slate-500">Entre com suas credenciais para acessar o painel.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#4F7EF7]"
                />
                <span>Lembrar-me</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-[#4F7EF7] transition hover:text-[#3b6ef0]"
              >
                Esqueceu a senha?
              </Link>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#4F7EF7] py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(79,126,247,0.4)] transition hover:bg-[#3b6ef0] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Entrando...
                </span>
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">© 2026 Credix</p>
        </div>
      </div>
    </div>
  );
}
