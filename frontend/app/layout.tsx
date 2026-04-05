import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Credix",
    template: "%s | Credix",
  },
  description: "Frontend Credix em Next.js para migracao incremental",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-[#F0F4FA] text-slate-800 antialiased`}>{children}</body>
    </html>
  );
}
