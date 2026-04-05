"use client";

import { ReactNode, useState } from "react";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  function handleMenuClick() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setIsSidebarCollapsed((current) => !current);
      return;
    }

    setIsSidebarOpen((current) => !current);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Subtle radial gradient background */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-30 mix-blend-screen" 
        aria-hidden="true"
        style={{
          background: "radial-gradient(ellipse at 50% -20%, rgba(37, 99, 235, 0.18), transparent 60%)"
        }}
      />

      <Header isOpen={isSidebarOpen} onMenuClick={handleMenuClick} />

      <div className="flex pt-16 sm:pt-20 relative z-10">
        <Sidebar 
          isOpen={isSidebarOpen} 
          isCollapsed={isSidebarCollapsed}
          onClose={() => setIsSidebarOpen(false)} 
        />

        {/* Main Content Area */}
        <main
          className={`flex-1 w-full min-w-0 p-3 transition-all duration-300 ease-out sm:p-5 lg:p-6 xl:p-8 pb-24 lg:pb-8 ${
            isSidebarCollapsed ? "lg:ml-0" : "lg:ml-[272px]"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
