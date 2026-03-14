"use client";

import { ReactNode, useState } from "react";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Background gradients via Tailwind Globals or here */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-40 mix-blend-screen" 
        style={{
          background: "radial-gradient(ellipse at 50% -20%, rgba(37, 99, 235, 0.15), transparent 60%)"
        }}
      />

      <Header isOpen={isSidebarOpen} onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />

      <div className="flex pt-16 sm:pt-20 relative z-10">
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />

        {/* 
          Main Content Area 
          Aplica margin-left no desktop (lg:ml-64 é a largura da sidebar) 
        */}
        <main className="flex-1 w-full lg:ml-64 p-4 sm:p-6 lg:p-8 transition-all duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}
