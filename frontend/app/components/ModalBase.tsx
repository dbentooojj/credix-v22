"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useGlobalScrollLock } from "./useGlobalScrollLock";

const modalButtonBaseClass =
  "inline-flex h-11 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-4 py-2 text-center text-sm leading-none transition-all active:translate-y-px active:scale-[0.98] disabled:opacity-50 sm:w-[160px]";

interface ModalBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

export function ModalBase({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "max-w-lg",
  headerClassName = "",
  bodyClassName = "",
  footerClassName = "",
}: ModalBaseProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useGlobalScrollLock(open);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-4 sm:px-5 sm:py-5"
      role="dialog"
      aria-modal="true"
      style={{
        paddingTop: "calc(1rem + var(--safe-area-top))",
        paddingBottom: "calc(1rem + var(--safe-area-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[6px] animate-fade-in"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={`relative z-10 mx-auto flex w-full max-h-[calc(100dvh-2rem)] flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.16)] animate-slide-up sm:max-h-[calc(100dvh-2.5rem)] ${size}`}
      >
        <div className={`flex items-start justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6 ${headerClassName}`}>
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

        <div className={`flex-1 overflow-y-auto px-5 py-4 sm:px-6 ${bodyClassName}`}>{children}</div>

        {footer ? (
          <div
            className={`shrink-0 border-t border-slate-100 px-5 pt-4 sm:px-6 ${footerClassName}`}
            style={{ paddingBottom: "calc(1rem + var(--safe-area-bottom))" }}
          >
            <div className="ml-auto flex w-full flex-col-reverse items-stretch gap-2.5 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
              {footer}
            </div>
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
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`${modalButtonBaseClass} border-slate-200 bg-white font-semibold text-slate-600 shadow-none hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 ${className}`}
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
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "blue" | "emerald" | "red";
  className?: string;
}) {
  const colors: Record<string, string> = {
    blue: "border-[#4F7EF7] bg-[#4F7EF7] hover:bg-[#3b6ef0] hover:border-[#3b6ef0]",
    emerald: "border-emerald-600 bg-emerald-600 hover:bg-emerald-500 hover:border-emerald-500",
    red: "border-red-500 bg-red-500 hover:bg-red-600 hover:border-red-600",
  };

  return (
    <button
      className={`${modalButtonBaseClass} font-bold text-white shadow-none ${colors[variant]} ${className}`}
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
