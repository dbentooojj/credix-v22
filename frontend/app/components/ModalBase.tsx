"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** max-w class, default "max-w-lg" */
  size?: string;
}

export function ModalBase({ open, onClose, title, subtitle, children, footer, size = "max-w-lg" }: ModalBaseProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl shadow-black/40 ${size}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-700/50 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-700/50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Reusable button styles ---- */
export function ModalBtnGhost({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function ModalBtnPrimary({ children, onClick, disabled, type = "button", variant = "blue" }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "blue" | "emerald" | "red";
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-600 hover:bg-blue-500 shadow-blue-500/20",
    emerald: "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20",
    red: "bg-red-600 hover:bg-red-500 shadow-red-500/20",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-lg transition-colors disabled:opacity-50 ${colors[variant]}`}
    >
      {children}
    </button>
  );
}

/* ---- Reusable field wrapper ---- */
export function ModalField({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

export const modalInputClass =
  "w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50";
