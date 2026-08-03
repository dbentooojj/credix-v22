"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  ModalBase,
  ModalBtnGhost,
  ModalBtnPrimary,
  ModalField,
  modalInputClass,
} from "./ModalBase";
import { formatCurrencyInput, parseCurrencyInput } from "../../utils/currencyInput";
import { useToast } from "./ToastProvider";

const cashAdjustmentInputClass = `${modalInputClass} min-h-[40px] py-2`;

type CashAdjustmentModalOptions = {
  onSuccess?: () => void;
};

type CashAdjustmentModalContextValue = {
  openCashAdjustmentModal: (options?: CashAdjustmentModalOptions) => void;
};

const CashAdjustmentModalContext = createContext<CashAdjustmentModalContextValue | null>(null);

export function CashAdjustmentModalProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [cashType, setCashType] = useState<"income" | "expense">("income");
  const [cashAmount, setCashAmount] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [onSuccess, setOnSuccess] = useState<(() => void) | null>(null);

  function resetForm() {
    setCashType("income");
    setCashAmount("");
    setCashError(null);
  }

  function openCashAdjustmentModal(options?: CashAdjustmentModalOptions) {
    resetForm();
    setOnSuccess(() => options?.onSuccess ?? null);
    setOpen(true);
  }

  function closeCashAdjustmentModal() {
    if (cashSaving) return;
    setOpen(false);
  }

  async function handleCashAdjustmentSave() {
    const parsedAmount = parseCurrencyInput(cashAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setCashError("Informe um valor valido maior que zero.");
      return;
    }

    setCashSaving(true);
    setCashError(null);

    try {
      const response = await fetch("/api/dashboard/cash-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: cashType,
          amount: parsedAmount,
        }),
      });

      const body = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        throw new Error(
          typeof body?.message === "string" ? body.message : "Falha ao salvar ajuste de caixa.",
        );
      }

      setOpen(false);
      toast.success(
        cashType === "income"
          ? "Dinheiro adicionado ao caixa."
          : "Retirada registrada no caixa.",
        "Caixa atualizado",
      );
      onSuccess?.();
    } catch (error) {
      setCashError(
        error instanceof Error ? error.message : "Não foi possível registrar o ajuste.",
      );
    } finally {
      setCashSaving(false);
    }
  }

  return (
    <CashAdjustmentModalContext.Provider value={{ openCashAdjustmentModal }}>
      {children}

      <ModalBase
        bodyClassName="py-3.5"
        footer={
          <>
            <ModalBtnGhost
              disabled={cashSaving}
              onClick={closeCashAdjustmentModal}
            >
              Cancelar
            </ModalBtnGhost>
            <ModalBtnPrimary
              disabled={cashSaving}
              onClick={handleCashAdjustmentSave}
            >
              {cashSaving ? "Salvando..." : "Salvar"}
            </ModalBtnPrimary>
          </>
        }
        footerClassName="py-3"
        headerClassName="py-3"
        onClose={closeCashAdjustmentModal}
        open={open}
        size="max-w-md"
        subtitle="Registre uma entrada ou retirada. O novo saldo será atualizado em toda a aplicação."
        title="Alterar caixa"
      >
        <div className="grid grid-cols-1 gap-4">
          <ModalField label="Valor">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-slate-400">
                R$
              </span>
              <input
                autoFocus
                className={`${cashAdjustmentInputClass} pl-11 text-base font-semibold`}
                disabled={cashSaving}
                inputMode="decimal"
                maxLength={24}
                onChange={(event) => setCashAmount(formatCurrencyInput(event.target.value))}
                placeholder="0,00"
                type="text"
                value={cashAmount}
              />
            </div>
          </ModalField>

          <ModalField label="Tipo da alteração">
            <select
              className={cashAdjustmentInputClass}
              disabled={cashSaving}
              onChange={(event) => setCashType(event.target.value as "income" | "expense")}
              value={cashType}
            >
              <option value="income">Adicionar dinheiro</option>
              <option value="expense">Retirar dinheiro</option>
            </select>
          </ModalField>
        </div>

        {cashError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
            {cashError}
          </div>
        ) : null}
      </ModalBase>
    </CashAdjustmentModalContext.Provider>
  );
}

export function useCashAdjustmentModal() {
  const context = useContext(CashAdjustmentModalContext);

  if (!context) {
    throw new Error("useCashAdjustmentModal precisa estar dentro de CashAdjustmentModalProvider.");
  }

  return context;
}
