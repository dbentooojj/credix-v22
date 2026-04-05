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
  size?: string;
}

export function ModalBase({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "max-w-lg",
}: ModalBaseProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[6px] animate-fade-in"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={`relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.16)] animate-slide-up sm:max-h-[90vh] sm:rounded-2xl ${size}`}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0 pr-4">
            <h3 className="truncate text-lg font-bold text-slate-800">{title}</h3>
            {subtitle ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            aria-label="Fechar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-800 active:scale-95"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer ? (
          <div className="safe-area-bottom flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ModalBtnGhost({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function ModalBtnPrimary({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "blue",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "blue" | "emerald" | "red";
}) {
  const colors: Record<string, string> = {
    blue: "bg-[#4F7EF7] hover:bg-[#3b6ef0] shadow-[0_4px_12px_rgba(79,126,247,0.35)]",
    emerald: "bg-emerald-600 hover:bg-emerald-500 shadow-[0_4px_12px_rgba(5,150,105,0.25)]",
    red: "bg-red-500 hover:bg-red-600 shadow-[0_4px_12px_rgba(239,68,68,0.25)]",
  };

  return (
    <button
      className={`min-h-[44px] rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all active:translate-y-px active:scale-[0.98] disabled:opacity-50 ${colors[variant]}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function ModalField({
  label,
  children,
  full,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

export const modalInputClass =
  "min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#4F7EF7] focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]/15 disabled:bg-slate-50 disabled:opacity-60 transition";
