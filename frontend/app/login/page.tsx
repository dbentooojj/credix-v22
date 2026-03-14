"use client";

import { BrandWordmark } from "../components/BrandWordmark";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, User } from "lucide-react";

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
      // Ajustaremos o Endpoint no próximo passo
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Garante fluxo de cookies
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

      router.push("/app"); // Rota nova do Next.js
    } catch (err: any) {
      setErrorMsg(err.message || "Falha ao realizar login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#060b18]">
      {/* Background gradients via Tailwind */}
      <div className="fixed inset-0 pointer-events-none auth-bg" />

      <div className="w-full max-w-[460px] relative z-10">
        <div className="flex justify-center mb-8">
          <BrandWordmark size="login" />
        </div>

        <div className="w-full">
          <form onSubmit={handleLogin} className="space-y-5">
            <label className="flex items-center gap-2 px-4 h-[58px] border border-slate-400/20 rounded-xl bg-white/5 focus-within:border-indigo-400/50 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white/10 transition-all">
              <span className="sr-only">Email</span>
              <User className="w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-transparent border-0 text-slate-200 text-lg font-medium placeholder:text-slate-500 focus:outline-none focus:ring-0"
                placeholder="Email"
              />
            </label>

            <div className="relative">
              <label className="flex items-center gap-2 px-4 h-[58px] border border-slate-400/20 rounded-xl bg-white/5 focus-within:border-indigo-400/50 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white/10 transition-all">
                <span className="sr-only">Senha</span>
                <Lock className="w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-transparent border-0 text-slate-200 text-lg font-medium placeholder:text-slate-500 focus:outline-none focus:ring-0 pr-10"
                  placeholder="Senha"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-400/10 rounded-lg transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between mt-1 text-[1.05rem]">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded-full border border-slate-500/60 bg-slate-900/80 checked:bg-emerald-500 checked:border-emerald-500 appearance-none flex items-center justify-center relative before:content-['✓'] before:absolute before:text-slate-900 before:text-[10px] before:font-bold before:opacity-0 checked:before:opacity-100 transition-all"
                />
                <span>Lembrar-me</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-slate-400 hover:text-slate-200 italic transition-colors"
              >
                Esqueceu?
              </Link>
            </div>

            {errorMsg && (
              <div className="rounded-xl px-3 py-2.5 text-sm bg-rose-500/15 text-rose-200 border border-rose-500/30">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[50px] rounded-xl font-bold text-indigo-50 text-[1.03rem] shadow-lg shadow-blue-600/20 bg-gradient-to-br from-indigo-500 via-blue-600 to-blue-500 hover:brightness-105 active:translate-y-[1px] disabled:opacity-70 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            &copy; 2026 Credix
          </p>
        </div>
      </div>

      <style jsx global>{`
        .auth-bg {
          background: radial-gradient(1200px 560px at 8% -18%, rgba(99, 102, 241, 0.22), transparent 56%),
            radial-gradient(900px 420px at 100% -6%, rgba(37, 99, 235, 0.17), transparent 60%);
        }
      `}</style>
    </div>
  );
}
