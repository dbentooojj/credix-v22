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

const cashAdjustmentInputClass = `${modalInputClass} min-h-[40px] py-2`;

type CashAdjustmentModalOptions = {
  onSuccess?: () => void;
};

type CashAdjustmentModalContextValue = {
  openCashAdjustmentModal: (options?: CashAdjustmentModalOptions) => void;
};

const CashAdjustmentModalContext = createContext<CashAdjustmentModalContextValue | null>(null);

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function CashAdjustmentModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [cashType, setCashType] = useState<"income" | "expense">("income");
  const [cashAmount, setCashAmount] = useState("");
  const [cashDate, setCashDate] = useState(() => toDateInputValue(new Date()));
  const [cashDescription, setCashDescription] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [onSuccess, setOnSuccess] = useState<(() => void) | null>(null);

  function resetForm() {
    setCashType("income");
    setCashAmount("");
    setCashDate(toDateInputValue(new Date()));
    setCashDescription("");
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

    if (!cashDate) {
      setCashError("Informe uma data valida para o ajuste.");
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
          date: cashDate,
          description: cashDescription.trim() || undefined,
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
              {cashSaving ? "Salvando..." : "Salvar ajuste"}
            </ModalBtnPrimary>
          </>
        }
        footerClassName="py-3"
        headerClassName="py-3"
        onClose={closeCashAdjustmentModal}
        open={open}
        size="max-w-[760px]"
        title="Ajustar caixa"
      >
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <ModalField label="Tipo">
            <select
              className={cashAdjustmentInputClass}
              disabled={cashSaving}
              onChange={(event) => setCashType(event.target.value as "income" | "expense")}
              value={cashType}
            >
              <option value="income">Entrada</option>
              <option value="expense">Retirada</option>
            </select>
          </ModalField>

          <ModalField label="Valor (R$)">
            <input
              className={cashAdjustmentInputClass}
              disabled={cashSaving}
              inputMode="decimal"
              maxLength={24}
              onChange={(event) => setCashAmount(formatCurrencyInput(event.target.value))}
              placeholder="0,00"
              type="text"
              value={cashAmount}
            />
          </ModalField>

          <ModalField label="Data">
            <input
              className={cashAdjustmentInputClass}
              disabled={cashSaving}
              onChange={(event) => setCashDate(event.target.value)}
              type="date"
              value={cashDate}
            />
          </ModalField>

          <ModalField label="Observacao">
            <input
              className={cashAdjustmentInputClass}
              disabled={cashSaving}
              maxLength={300}
              onChange={(event) => setCashDescription(event.target.value)}
              placeholder="Motivo do ajuste (opcional)"
              type="text"
              value={cashDescription}
            />
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
