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
    <div className="dashboard-theme min-h-screen">
      <Header isOpen={isSidebarOpen} onMenuClick={handleMenuClick} />

      <div className="relative z-10 flex pt-16 sm:pt-20">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main
          className={`min-w-0 flex-1 w-full p-3 pb-24 transition-all duration-300 ease-out sm:p-5 lg:p-6 lg:pb-8 xl:p-8 ${
            isSidebarCollapsed ? "lg:ml-0" : "lg:ml-[272px]"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
