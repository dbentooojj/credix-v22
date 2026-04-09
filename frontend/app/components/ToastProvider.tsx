"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

type ToastInput = {
  message: string;
  title?: string;
  kind?: ToastKind;
  durationMs?: number;
};

type ToastRecord = {
  id: number;
  message: string;
  title?: string;
  kind: ToastKind;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toastToneClass: Record<ToastKind, string> = {
  success: "toast-success",
  error: "toast-error",
  info: "toast-info",
};

const toastIconMap = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} satisfies Record<ToastKind, typeof CheckCircle2>;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextToastIdRef = useRef(1);
  const timeoutMapRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((toastId: number) => {
    const timeoutId = timeoutMapRef.current.get(toastId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMapRef.current.delete(toastId);
    }

    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const message = input.message.trim();
    if (!message) return;

    const toastId = nextToastIdRef.current++;
    const durationMs = input.durationMs ?? (input.kind === "error" ? 5200 : 3600);
    const nextToast: ToastRecord = {
      id: toastId,
      message,
      title: input.title?.trim() || undefined,
      kind: input.kind ?? "info",
    };

    setToasts((current) => [...current, nextToast]);

    const timeoutId = setTimeout(() => {
      timeoutMapRef.current.delete(toastId);
      setToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, durationMs);

    timeoutMapRef.current.set(toastId, timeoutId);
  }, []);

  useEffect(() => {
    return () => {
      timeoutMapRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutMapRef.current.clear();
    };
  }, []);

  const contextValue = useMemo<ToastContextValue>(() => ({
    showToast,
    success: (message, title) => showToast({ kind: "success", message, title }),
    error: (message, title) => showToast({ kind: "error", message, title }),
    info: (message, title) => showToast({ kind: "info", message, title }),
  }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <div aria-live="polite" aria-atomic="true" className="toast-container pointer-events-none">
        {toasts.map((toast) => {
          const Icon = toastIconMap[toast.kind];

          return (
            <div
              className={`toast ${toastToneClass[toast.kind]} pointer-events-auto w-[min(92vw,24rem)]`}
              key={toast.id}
              role="status"
            >
              <Icon className="h-5 w-5 shrink-0" />

              <div className="min-w-0 flex-1">
                {toast.title ? (
                  <p className="truncate text-sm font-bold">{toast.title}</p>
                ) : null}
                <p className={`text-sm ${toast.title ? "mt-0.5" : ""}`}>{toast.message}</p>
              </div>

              <button
                aria-label="Fechar notificacao"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current/70 transition hover:bg-black/5 hover:text-current"
                onClick={() => removeToast(toast.id)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast precisa estar dentro de ToastProvider.");
  }

  return context;
}
