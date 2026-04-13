import type { Metadata } from "next";
import { Suspense } from "react";
import { RelatoriosPageClient } from "./RelatoriosPageClient";

export const metadata: Metadata = {
  title: "Relatorios | Credix",
  description: "Relatorios financeiros e de emprestimos da operacao",
};

export default function RelatoriosPage() {
  return (
    <Suspense fallback={<div className="h-40 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]" />}>
      <RelatoriosPageClient />
    </Suspense>
  );
}
