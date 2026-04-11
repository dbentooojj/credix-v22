"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import {
  Ban,
  Hash,
  Banknote,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit2,
  MessageCircle,
  Trash2,
  ArrowUpDown,
  Plus,
  FlaskConical,
  X,
} from "lucide-react";
import { ModalBase, ModalBtnGhost, ModalBtnPrimary } from "../../../components/ModalBase";
import { MobileDataCard, MobileDataCardActions, MobileDataCardRow } from "../../../components/MobileDataCard";
import { useToast } from "../../../components/ToastProvider";
import { readJsonOrThrow } from "../../../../utils/apiClient";
import { calculateLoanPreview } from "../../../../utils/loanCalculator";
import { formatCurrencyInput, parseCurrencyInput } from "../../../../utils/currencyInput";

// --- TYPES ---
type Debtor = {
  id: string | number;
  name?: string;
  document?: string;
  cpf?: string;
  cnpj?: string;
};

type Loan = {
  id: string | number;
  debtor_id: string | number;
  status?: string;
  principal_amount?: number | string;
  principalAmount?: number | string;
  borrowed_amount?: number | string;
  borrowedAmount?: number | string;
  amount?: number | string;
  total_amount?: number | string;
  totalAmount?: number | string;
  installments_count?: number | string;
  installmentsCount?: number | string;
  interest_rate?: number | string;
  interestRate?: number | string;
  interest_type?: string;
  interestType?: string;
  installment_amount?: number | string | null;
  installmentAmount?: number | string | null;
  observations?: string | null;
  start_date?: string;
  first_due_date?: string;
  due_date?: string;
  created_at?: string;
  date?: string; 
};

type Installment = {
  id: string | number;
  loan_id?: string | number;
  loanId?: string | number;
  installment_number?: number | string;
  installmentNumber?: number | string;
  due_date?: string;
  dueDate?: string;
  payment_date?: string | null;
  paymentDate?: string | null;
  amount?: number | string;
  principal_amount?: number | string | null;
  principalAmount?: number | string | null;
  interest_amount?: number | string | null;
  interestAmount?: number | string | null;
  status?: string;
};

type LoanSimulation = {
  id: string;
  ownerUserId?: number;
  clientId: string | number;
  clientName?: string;
  clientPhone?: string | null;
  principalAmount?: number | string;
  interestType?: string;
  interestRate?: number | string;
  fixedFeeAmount?: number | string;
  installmentsCount?: number | string;
  startDate?: string;
  firstDueDate?: string;
  dueDates?: string[];
  observations?: string;
  status?: string;
  loanId?: string | number | null;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  statusLabel?: string;
  totals?: {
    totalAmount?: number | string;
    installmentAmount?: number | string;
  };
  client?: {
    id?: string | number;
    name?: string;
    phone?: string | null;
  };
};

type LoanModalMode = "loan" | "simulation" | "edit";

type EnrichedLoan = Loan & {
  debtor?: Debtor;
  principal: number;
  total: number;
  uiStatus: string;
  createdAt: Date | null;
  installments: Installment[];
  hasPaidInstallments: boolean;
  canEdit: boolean;
  canDelete: boolean;
  searchStr: string;
};

const LOAN_META_START = "[[LOAN_META]]";
const LOAN_META_END = "[[/LOAN_META]]";

// --- HELPERS ---
function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function parseDateValue(value: any) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  
  const raw = String(value).trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return new Date(year, month, day);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatCurrency(value: any) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDocument(value: any) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value || "-";
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStatusBadge(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  switch (normalized) {
    case "ativo":
    case "active":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "atrasado":
    case "late":
    case "overdue":
      return "bg-red-100 text-red-800 border-red-300";
    case "inativo":
    case "inactive":
    case "quitado":
    case "paid":
      return "bg-slate-200 text-slate-800 border-slate-300";
    default:
      return "bg-slate-200 text-slate-800 border-slate-300";
  }
}

function translateStatus(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "ativo" || normalized === "active") return "Ativo";
  if (normalized === "inativo" || normalized === "inactive") return "Inativo";
  if (normalized === "atrasado" || normalized === "late" || normalized === "overdue") return "Atrasado";
  if (normalized === "quitado" || normalized === "paid") return "Quitado";
  return status || "Desconhecido";
}

function translateInstallmentStatus(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pago" || normalized === "paid") return "Pago";
  if (normalized === "atrasado" || normalized === "late" || normalized === "overdue") return "Atrasado";
  return "Pendente";
}

function isInstallmentPaid(installment: Installment) {
  return (
    Boolean(installment.payment_date ?? installment.paymentDate) ||
    translateInstallmentStatus(String(installment.status || "")) === "Pago"
  );
}

function getInstallmentStatusBadgeClass(installment: Installment) {
  if (isInstallmentPaid(installment)) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }

  const label = translateInstallmentStatus(String(installment.status || ""));
  if (label === "Atrasado") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }

  return "bg-amber-100 text-amber-700 border-amber-200";
}

function formatDatePtBr(value: unknown) {
  const parsed = parseDateValue(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function formatPercent(value: unknown) {
  return `${toFiniteNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function resolveInterestMode(loan: Loan, rawMeta: Record<string, any>) {
  const metaMode = String(rawMeta.interestMode || "").trim().toLowerCase();
  if (metaMode === "simples" || metaMode === "composto" || metaMode === "fixo") {
    return metaMode as "simples" | "composto" | "fixo";
  }

  const rawLoanType = String(loan.interest_type || loan.interestType || "").trim().toLowerCase();
  if (rawLoanType === "simples") return "simples";
  if (rawLoanType === "fixo") return "fixo";
  return "composto";
}

function translateInterestMode(mode: string) {
  if (mode === "simples") return "Juros simples";
  if (mode === "fixo") return "Acrescimo fixo";
  return "Juros compostos";
}

function getSimulationStatusBadge(status: string) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "DRAFT") return "bg-amber-100 text-amber-800 border-amber-300";
  if (normalized === "SENT") return "bg-sky-100 text-sky-800 border-sky-300";
  if (normalized === "ACCEPTED") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (normalized === "EXPIRED") return "bg-violet-100 text-violet-800 border-violet-300";
  if (normalized === "CANCELED") return "bg-rose-100 text-rose-800 border-rose-300";
  return "bg-slate-200 text-slate-800 border-slate-300";
}

function getSimulationStatusLabel(simulation: LoanSimulation) {
  if (simulation.statusLabel) return simulation.statusLabel;

  const normalized = String(simulation.status || "").trim().toUpperCase();
  if (normalized === "DRAFT") return "Rascunho";
  if (normalized === "SENT") return "Enviada";
  if (normalized === "ACCEPTED") return "Aceita";
  if (normalized === "EXPIRED") return "Expirada";
  if (normalized === "CANCELED") return "Cancelada";
  return normalized || "Desconhecido";
}

function canManageSimulation(status: string) {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized !== "ACCEPTED" && normalized !== "CANCELED";
}

function formatSimulationInterestPrimary(simulation: LoanSimulation) {
  const interestType = String(simulation.interestType || "").trim().toLowerCase();
  if (interestType === "fixo") {
    return formatCurrency(simulation.fixedFeeAmount ?? simulation.interestRate ?? 0);
  }

  return formatPercent(simulation.interestRate ?? 0);
}

function LoanViewStat({
  label,
  value,
  hint,
  valueClassName = "text-slate-900",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-2 text-lg font-bold ${valueClassName}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function LoanViewInfo({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="h-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function readLoanMeta(rawValue: any) {
  const text = String(rawValue || "");
  const start = text.indexOf(LOAN_META_START);
  const end = text.indexOf(LOAN_META_END);
  if (start === -1 || end === -1 || end <= start) {
    return {
      text: text.trim(),
      meta: {} as Record<string, any>,
    };
  }

  const plainText = `${text.slice(0, start)}${text.slice(end + LOAN_META_END.length)}`.trim();
  try {
    const meta = JSON.parse(text.slice(start + LOAN_META_START.length, end));
    return {
      text: plainText,
      meta: meta && typeof meta === "object" ? meta : {},
    };
  } catch {
    return {
      text: plainText,
      meta: {} as Record<string, any>,
    };
  }
}

export function EmprestimosClient() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [simulations, setSimulations] = useState<LoanSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [simulationSearch, setSimulationSearch] = useState("");
  const [simulationStatusFilter, setSimulationStatusFilter] = useState("PENDENTES");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modal state
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [loanModalMode, setLoanModalMode] = useState<LoanModalMode>("loan");
  const [selectedLoanId, setSelectedLoanId] = useState<string | number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingLoan, setDeletingLoan] = useState<EnrichedLoan | null>(null);
  const [simulationActionLoadingId, setSimulationActionLoadingId] = useState<string | null>(null);
  const [simulationConfirmAction, setSimulationConfirmAction] = useState<{
    type: "approve" | "cancel";
    simulation: LoanSimulation;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formClientId, setFormClientId] = useState("");
  const [formPrincipal, setFormPrincipal] = useState("");
  const [formInterestType, setFormInterestType] = useState<"composto" | "simples" | "fixo">("composto");
  const [formRate, setFormRate] = useState("");
  const [formFixedAddition, setFormFixedAddition] = useState("");
  const [formInstallments, setFormInstallments] = useState("");
  const [formMaxInstallment, setFormMaxInstallment] = useState("");
  const [formCalcByInstallment, setFormCalcByInstallment] = useState(false);
  const [formStartDate, setFormStartDate] = useState("");
  const [formFirstDue, setFormFirstDue] = useState("");
  const [formObservations, setFormObservations] = useState("");
  const [formCustomDueDates, setFormCustomDueDates] = useState<string[]>([]);
  const [settledFormMaxInstallment, setSettledFormMaxInstallment] = useState("");

  useEffect(() => {
    if (!formCalcByInstallment) {
      setSettledFormMaxInstallment(formMaxInstallment);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSettledFormMaxInstallment(formMaxInstallment);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [formCalcByInstallment, formMaxInstallment]);

  const isInstallmentInputSettling = formCalcByInstallment && settledFormMaxInstallment !== formMaxInstallment;
  const calculationMaxInstallment = formCalcByInstallment
    ? (isInstallmentInputSettling ? "" : settledFormMaxInstallment)
    : formMaxInstallment;

  function toDateInput(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function addMonths(dateStr: string, months: number) {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dateStr;
    const y = Number(m[1]), mo = Number(m[2]) - 1 + months, d = Number(m[3]);
    const ny = Math.floor((y * 12 + mo) / 12), nm = ((y * 12 + mo) % 12 + 12) % 12;
    const ld = new Date(ny, nm + 1, 0).getDate();
    return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, ld)).padStart(2, "0")}`;
  }

  function isIsoDateString(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
  }

  function mergeDueDates(firstDueDate: string, installmentsCount: number, customDueDates: string[]) {
    return Array.from({ length: Math.max(0, installmentsCount) }, (_, index) => {
      const fallbackDate = addMonths(firstDueDate, index);
      const customDate = customDueDates[index];
      return isIsoDateString(customDate) ? customDate : fallbackDate;
    });
  }

  function getDueDatesValidationMessage(startDate: string, dueDates: string[]) {
    if (!dueDates.length) return null;

    let previousDate = startDate;
    for (let index = 0; index < dueDates.length; index += 1) {
      const currentDate = dueDates[index];
      if (!isIsoDateString(currentDate)) {
        return `Informe uma data valida para a parcela #${index + 1}.`;
      }

      if (previousDate && currentDate <= previousDate) {
        if (index === 0) {
          return "O primeiro vencimento precisa ser posterior a data de inicio.";
        }
        return `A parcela #${index + 1} precisa vencer depois da parcela #${index}.`;
      }

      previousDate = currentDate;
    }

    return null;
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [resLoans, resDebtors, resInstallments, resSimulations] = await Promise.all([
        fetch("/api/tables/loans").then((r) => r.json()),
        fetch("/api/tables/debtors").then((r) => r.json()),
        fetch("/api/tables/installments").then((r) => r.json()),
        fetch("/api/loan-simulations").then((r) => r.json()),
      ]);
      if (resLoans.data) setLoans(resLoans.data);
      if (resDebtors.data) setDebtors(resDebtors.data);
      if (resInstallments.data) setInstallments(resInstallments.data);
      if (resSimulations.data) setSimulations(resSimulations.data);
    } catch (err) {
      setError("Erro ao carregar dados. Verifique a conexÃ£o.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- CÃ¡lculo dinÃ¢mico do resumo ---
  const baseLoanCalculation = useMemo(() => {
    return calculateLoanPreview({
      principal: formPrincipal,
      monthlyRate: formRate,
      fixedAddition: formFixedAddition,
      installments: formInstallments,
      maxInstallment: calculationMaxInstallment,
      useMaxInstallment: formCalcByInstallment,
      interestType: formInterestType,
      startDate: formStartDate,
      firstDueDate: formFirstDue,
    });
  }, [
    formPrincipal,
    formRate,
    formFixedAddition,
    formInstallments,
    calculationMaxInstallment,
    formCalcByInstallment,
    formInterestType,
    formStartDate,
    formFirstDue,
  ]);

  const previewDueDates = useMemo(() => {
    const firstDueDate = baseLoanCalculation.values.firstDueDate || formFirstDue;
    return mergeDueDates(firstDueDate, baseLoanCalculation.values.installments, formCustomDueDates);
  }, [
    baseLoanCalculation.values.firstDueDate,
    baseLoanCalculation.values.installments,
    formCustomDueDates,
    formFirstDue,
  ]);

  const dueDatesValidationMessage = useMemo(() => {
    return getDueDatesValidationMessage(baseLoanCalculation.values.startDate || formStartDate, previewDueDates);
  }, [baseLoanCalculation.values.startDate, formStartDate, previewDueDates]);

  const loanSummary = useMemo(() => {
    const calculation = calculateLoanPreview({
      principal: formPrincipal,
      monthlyRate: formRate,
      fixedAddition: formFixedAddition,
      installments: formInstallments,
      maxInstallment: calculationMaxInstallment,
      useMaxInstallment: formCalcByInstallment,
      interestType: formInterestType,
      startDate: formStartDate,
      firstDueDate: formFirstDue,
      dueDates: previewDueDates,
    });

    return {
      totalAmount: calculation.calcResult.totalAmount,
      installmentAmount: calculation.calcResult.installmentAmount,
      installments: calculation.installmentsLabel,
      installmentsCount: calculation.values.installments,
      rateLabel: calculation.rateLabel,
      rateValue: calculation.rateValue,
      firstDue: calculation.values.firstDueDate || "--/--/----",
      dueDates: calculation.dueDates,
      plan: calculation.plan,
      modeLabel: calculation.modeLabel,
      fromMaxInstallment: calculation.fromMaxInstallment,
      autoInstallmentPending: calculation.autoInstallmentPending || isInstallmentInputSettling,
      autoInstallmentError: calculation.autoInstallmentError,
    };
  }, [
    formPrincipal,
    formRate,
    formFixedAddition,
    formInstallments,
    calculationMaxInstallment,
    formCalcByInstallment,
    formInterestType,
    formStartDate,
    formFirstDue,
    previewDueDates,
    isInstallmentInputSettling,
  ]);

  function buildLoanSimulationPayload() {
    const safeStartDate = formStartDate || toDateInput(new Date());
    const safeFirstDueDate = formFirstDue || addMonths(safeStartDate, 1);
    const installmentsCount = Math.max(1, loanSummary.installmentsCount || Math.trunc(Number(formInstallments) || 0));
    const fallbackDueDates = Array.from({ length: installmentsCount }, (_, index) => addMonths(safeFirstDueDate, index));
    const dueDates = loanSummary.dueDates.length > 0 ? loanSummary.dueDates : fallbackDueDates;
    const firstDueDate = dueDates[0] || safeFirstDueDate;
    const principalAmount = parseCurrencyInput(formPrincipal);
    const fixedFeeAmount = parseCurrencyInput(formFixedAddition);

    return {
      clientId: Number(formClientId),
      principalAmount: Number.isFinite(principalAmount) ? principalAmount : 0,
      interestType: formInterestType,
      interestRate: formInterestType === "fixo" ? 0 : (Number(formRate) || 0),
      fixedFeeAmount: formInterestType === "fixo" && Number.isFinite(fixedFeeAmount) ? fixedFeeAmount : 0,
      installmentsCount,
      startDate: safeStartDate,
      firstDueDate,
      dueDates,
      observations: formObservations,
      _preview: {
        totalAmount: loanSummary.totalAmount,
        installmentAmount: loanSummary.installmentAmount,
      },
    };
  }

  function buildLoanUpdatePayload() {
    const basePayload = buildLoanSimulationPayload();
    return {
      ...basePayload,
      installmentAmount: loanSummary.installmentAmount,
      totalAmount: loanSummary.totalAmount,
      maxInstallment: parseCurrencyInput(formMaxInstallment),
      plan: loanSummary.plan.map((item) => ({
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate,
        amount: item.amount,
        principalAmount: item.principalAmount,
        interestAmount: item.interestAmount,
      })),
    };
  }

  const canSubmitLoan = useMemo(() => {
    const principal = parseCurrencyInput(formPrincipal);
    const rate = Number(formRate) || 0;
    const fixedAddition = parseCurrencyInput(formFixedAddition);

    if (!formClientId || !Number.isFinite(principal) || principal <= 0) return false;
    if (!formStartDate || !formFirstDue) return false;
    if (loanSummary.installmentsCount <= 0) return false;
    if (loanSummary.autoInstallmentError) return false;
    if (loanSummary.autoInstallmentPending) return false;
    if (isInstallmentInputSettling) return false;
    if (dueDatesValidationMessage) return false;

    if (formInterestType === "fixo") {
      return Number.isFinite(fixedAddition) && fixedAddition >= 0;
    }
    return rate > 0;
  }, [
    formClientId,
    formPrincipal,
    formRate,
    formFixedAddition,
    formStartDate,
    formFirstDue,
    formInterestType,
    loanSummary.installmentsCount,
    loanSummary.autoInstallmentError,
    loanSummary.autoInstallmentPending,
    isInstallmentInputSettling,
    dueDatesValidationMessage,
  ]);

  // --- Modal handlers ---
  function resetForm() {
    const today = toDateInput(new Date());
    setFormClientId("");
    setFormPrincipal(""); setFormRate(""); setFormFixedAddition(""); setFormInstallments(""); setFormMaxInstallment("");
    setFormInterestType("composto"); setFormCalcByInstallment(false);
    setFormStartDate(today); setFormFirstDue(addMonths(today, 1));
    setFormObservations("");
    setFormCustomDueDates([]);
    setSettledFormMaxInstallment("");
  }

  function populateFormFromLoan(loan: EnrichedLoan) {
    const loanMeta = readLoanMeta(loan.observations);
    const interestMode = (() => {
      const mode = String(loanMeta.meta.interestMode || "").trim().toLowerCase();
      if (mode === "simples" || mode === "composto" || mode === "fixo") return mode as "simples" | "composto" | "fixo";
      const loanInterestType = String(loan.interest_type || "").trim().toLowerCase();
      return loanInterestType === "simples" ? "simples" : "composto";
    })();

    const dueDates = [...loan.installments]
      .sort((left, right) => {
        const leftNumber = Number(left.installment_number ?? left.installmentNumber ?? 0);
        const rightNumber = Number(right.installment_number ?? right.installmentNumber ?? 0);
        return leftNumber - rightNumber;
      })
      .map((item) => String(item.due_date ?? item.dueDate ?? "").slice(0, 10))
      .filter(Boolean);

    const fixedAddition = Number(loanMeta.meta.fixedAddition ?? 0);
    const maxInstallment = Number(loanMeta.meta.maxInstallment ?? 0);
    const startDate = String(loan.start_date || "").slice(0, 10) || toDateInput(new Date());
    const firstDueDate = dueDates[0] || String(loan.first_due_date || "").slice(0, 10) || addMonths(startDate, 1);

    setSelectedLoanId(loan.id);
    setFormClientId(String(loan.debtor_id));
    setFormPrincipal(formatCurrencyInput(String(loan.principal || 0)));
    setFormInterestType(interestMode);
    setFormRate(interestMode === "fixo" ? "" : String(Number(loan.interest_rate ?? 0) || ""));
    setFormFixedAddition(interestMode === "fixo" ? formatCurrencyInput(String(fixedAddition || 0)) : "");
    setFormInstallments(String(loan.installments_count || dueDates.length || ""));
    setFormMaxInstallment(maxInstallment > 0 ? formatCurrencyInput(String(maxInstallment)) : "");
    setFormCalcByInstallment(maxInstallment > 0);
    setFormStartDate(startDate);
    setFormFirstDue(firstDueDate);
    setFormObservations(loanMeta.text);
    setFormCustomDueDates(dueDates);
    setSettledFormMaxInstallment(maxInstallment > 0 ? formatCurrencyInput(String(maxInstallment)) : "");
  }

  function clearCustomDueDates() {
    setFormCustomDueDates([]);
  }

  function applyInstallmentDueDate(index: number, value: string) {
    if (!isIsoDateString(value)) return;

    setFormCustomDueDates((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });

    if (index === 0) {
      setFormFirstDue(value);
    }
  }

  function openLoanModal() {
    resetForm();
    setSelectedLoanId(null);
    setLoanModalMode("loan");
    setShowLoanModal(true);
  }

  function openSimulationModal() {
    resetForm();
    setSelectedLoanId(null);
    setLoanModalMode("simulation");
    setShowLoanModal(true);
  }

  function openViewModal(loan: EnrichedLoan) {
    setSelectedLoanId(loan.id);
    setShowViewModal(true);
  }

  function openEditModal(loan: EnrichedLoan) {
    setShowViewModal(false);
    populateFormFromLoan(loan);
    setLoanModalMode("edit");
    setShowLoanModal(true);
  }

  function openDeleteModal(loan: EnrichedLoan) {
    if (loan.hasPaidInstallments) {
      const message = "Nao e permitido excluir emprestimo com parcela paga.";
      setError(message);
      toast.error(message, "Exclusao bloqueada");
      return;
    }
    setDeletingLoan(loan);
    setShowDeleteModal(true);
  }

  function closeLoanModal() {
    setShowLoanModal(false);
    setSelectedLoanId(null);
  }

  function closeViewModal() {
    setShowViewModal(false);
    setSelectedLoanId(null);
  }

  function openLinkedLoanFromSimulation(simulation: LoanSimulation) {
    if (!simulation.loanId) {
      toast.info("Esta simulacao ainda nao foi convertida em emprestimo.");
      return;
    }

    const linkedLoan = enrichedLoans.find((loan) => sameId(loan.id, simulation.loanId));
    if (!linkedLoan) {
      toast.info("O emprestimo vinculado nao foi encontrado na lista atual.");
      return;
    }

    openViewModal(linkedLoan);
  }

  async function createSimulation() {
    const simulationResponse = await fetch("/api/loan-simulations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildLoanSimulationPayload()),
    });

    const simulationPayload = await readJsonOrThrow<{ data?: { id?: string | number } }>(
      simulationResponse,
      "Nao foi possivel salvar a simulacao.",
    );

    if (!simulationPayload?.data?.id) {
      throw new Error("A simulacao foi salva sem identificador valido.");
    }

    return simulationPayload.data;
  }

  async function handleSendSavedSimulation(simulation: LoanSimulation) {
    const simulationId = String(simulation.id || "").trim();
    if (!simulationId) return;

    setSimulationActionLoadingId(simulationId);
    try {
      const sendResponse = await fetch(`/api/loan-simulations/${simulationId}/send`, { method: "POST" });
      const sendPayload = await readJsonOrThrow<{ data?: { whatsappUrl?: string } }>(
        sendResponse,
        "Nao foi possivel reenviar a simulacao pelo WhatsApp.",
      );

      if (sendPayload?.data?.whatsappUrl) {
        window.open(sendPayload.data.whatsappUrl, "_blank");
      }

      await fetchData();
      toast.success("Simulacao pronta para envio no WhatsApp.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel reenviar a simulacao pelo WhatsApp.";
      setError(message);
      toast.error(message, "Falha no WhatsApp");
    } finally {
      setSimulationActionLoadingId(null);
    }
  }

  async function handleConfirmSimulationAction() {
    if (!simulationConfirmAction) return;

    const { simulation, type } = simulationConfirmAction;
    const simulationId = String(simulation.id || "").trim();
    if (!simulationId) return;

    setSimulationActionLoadingId(simulationId);
    try {
      const response = await fetch(
        `/api/loan-simulations/${simulationId}/${type === "approve" ? "approve" : "cancel"}`,
        { method: "POST" },
      );

      await readJsonOrThrow(
        response,
        type === "approve"
          ? "Nao foi possivel aprovar a simulacao."
          : "Nao foi possivel cancelar a simulacao.",
      );

      setSimulationConfirmAction(null);
      await fetchData();
      toast.success(
        type === "approve"
          ? "Simulacao aprovada e convertida em emprestimo."
          : "Simulacao cancelada com sucesso.",
      );
    } catch (err: any) {
      const message = err instanceof Error
        ? err.message
        : (type === "approve"
          ? "Nao foi possivel aprovar a simulacao."
          : "Nao foi possivel cancelar a simulacao.");
      setError(message);
      toast.error(message, type === "approve" ? "Falha ao aprovar simulacao" : "Falha ao cancelar simulacao");
    } finally {
      setSimulationActionLoadingId(null);
    }
  }

  async function handleSaveLoan() {
    if (!canSubmitLoan) return;
    setSaving(true);
    try {
      const simulation = await createSimulation();
      const approveResponse = await fetch(`/api/loan-simulations/${simulation.id}/approve`, { method: "POST" });
      await readJsonOrThrow(approveResponse, "Nao foi possivel criar o emprestimo.");
      closeLoanModal();
      await fetchData();
      toast.success("Emprestimo criado com sucesso.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel criar o emprestimo.";
      setError(message);
      toast.error(message, "Falha ao criar emprestimo");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateLoan() {
    if (!canSubmitLoan || !selectedLoanId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/loans/${selectedLoanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLoanUpdatePayload()),
      });

      await readJsonOrThrow(response, "Nao foi possivel atualizar o emprestimo.");
      closeLoanModal();
      await fetchData();
      toast.success("Emprestimo atualizado com sucesso.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel atualizar o emprestimo.";
      setError(message);
      toast.error(message, "Falha ao atualizar emprestimo");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSimulation(showSuccessToast = true) {
    if (!canSubmitLoan) return null;
    setSaving(true);
    try {
      const simulation = await createSimulation();
      closeLoanModal();
      await fetchData();
      if (showSuccessToast) {
        toast.success("Simulacao salva com sucesso.");
      }
      return simulation;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel salvar a simulacao.";
      setError(message);
      toast.error(message, "Falha ao salvar simulacao");
    } finally {
      setSaving(false);
    }
    return null;
  }

  async function handleSendWhatsApp() {
    const simulation = await handleSaveSimulation(false);
    if (!simulation?.id) return;

    try {
      const sendResponse = await fetch(`/api/loan-simulations/${simulation.id}/send`, { method: "POST" });
      const sendPayload = await readJsonOrThrow<{ data?: { whatsappUrl?: string } }>(
        sendResponse,
        "Nao foi possivel gerar o link do WhatsApp.",
      );

      if (!sendPayload?.data?.whatsappUrl) {
        throw new Error("Nao foi possivel gerar o link do WhatsApp.");
      }

      window.open(sendPayload.data.whatsappUrl, "_blank");
      await fetchData();
      toast.success("Simulacao salva e pronta para envio no WhatsApp.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel enviar a simulacao pelo WhatsApp.";
      setError(message);
      toast.error(message, "Falha no WhatsApp");
    }
  }

  async function handleDeleteLoan() {
    if (!deletingLoan) return;
    if (deletingLoan.hasPaidInstallments) {
      const message = "Nao e permitido excluir emprestimo com parcela paga.";
      setError(message);
      toast.error(message, "Exclusao bloqueada");
      setShowDeleteModal(false);
      setDeletingLoan(null);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tables/loans").then((r) => r.json());
      const rows = (res.data || []).filter((r: any) => String(r.id) !== String(deletingLoan.id));
      const putResponse = await fetch("/api/tables/loans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      await readJsonOrThrow(putResponse, "Nao foi possivel excluir o emprestimo.");
      setShowDeleteModal(false);
      setDeletingLoan(null);
      await fetchData();
      toast.success("Emprestimo excluido com sucesso.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Nao foi possivel excluir o emprestimo.";
      setError(message);
      toast.error(message, "Falha ao excluir emprestimo");
    } finally {
      setSaving(false);
    }
  }

  // Dropdown de clientes para o form
  const clientOptions = useMemo(() => {
    return debtors.map(d => ({ id: String(d.id), name: d.name || `Cliente #${d.id}` })).sort((a, b) => a.name.localeCompare(b.name));
  }, [debtors]);

  const enrichedLoans = useMemo<EnrichedLoan[]>(() => {
    return loans.map((loan) => {
      const debtor = debtors.find((d) => sameId(d.id, loan.debtor_id));
      const loanInstallments = installments
        .filter((item) => sameId(item.loan_id ?? item.loanId, loan.id))
        .sort((left, right) => {
          const leftNumber = Number(left.installment_number ?? left.installmentNumber ?? 0);
          const rightNumber = Number(right.installment_number ?? right.installmentNumber ?? 0);
          return leftNumber - rightNumber;
        });
      const hasPaidInstallments = loanInstallments.some(isInstallmentPaid);
      const principalFromLoan =
        [
          loan.principal_amount,
          loan.principalAmount,
          loan.borrowed_amount,
          loan.borrowedAmount,
          loan.amount,
        ]
          .map(toFiniteNumber)
          .find((value) => value > 0) ?? 0;
      const principalFromInstallments = loanInstallments.reduce(
        (sum, item) => sum + toFiniteNumber(item.principal_amount ?? item.principalAmount),
        0,
      );
      const principal = principalFromLoan > 0 ? principalFromLoan : principalFromInstallments;
      const total =
        [
          loan.total_amount,
          loan.totalAmount,
        ]
          .map(toFiniteNumber)
          .find((value) => value > 0) ?? 0;
      const uiStatus = translateStatus(loan.status || "");
      const createdAt = parseDateValue(loan.created_at || loan.start_date || loan.date);

      return {
        ...loan,
        debtor,
        principal,
        total,
        uiStatus,
        createdAt,
        installments: loanInstallments,
        hasPaidInstallments,
        canEdit: !hasPaidInstallments,
        canDelete: !hasPaidInstallments,
        searchStr: `${loan.id} ${debtor?.name || ""} ${debtor?.document || debtor?.cpf || ""}`.toLowerCase(),
      };
    });
  }, [loans, debtors, installments]);

  const selectedLoan = useMemo(
    () => enrichedLoans.find((loan) => sameId(loan.id, selectedLoanId)) ?? null,
    [enrichedLoans, selectedLoanId],
  );

  const selectedLoanView = useMemo(() => {
    if (!selectedLoan) return null;

    const loanMeta = readLoanMeta(selectedLoan.observations);
    const interestMode = resolveInterestMode(selectedLoan, loanMeta.meta);
    const installmentsCount = Math.max(
      toFiniteNumber(selectedLoan.installments_count ?? selectedLoan.installmentsCount),
      selectedLoan.installments.length,
    );
    const installmentAmount =
      [
        selectedLoan.installment_amount,
        selectedLoan.installmentAmount,
        selectedLoan.installments[0]?.amount,
      ]
        .map(toFiniteNumber)
        .find((value) => value > 0) ?? 0;
    const totalInterest = Math.max(0, selectedLoan.total - selectedLoan.principal);
    const paidInstallments = selectedLoan.installments.filter(isInstallmentPaid);
    const overdueInstallments = selectedLoan.installments.filter(
      (item) => !isInstallmentPaid(item) && translateInstallmentStatus(String(item.status || "")) === "Atrasado",
    );
    const pendingInstallments = selectedLoan.installments.filter(
      (item) => !isInstallmentPaid(item) && translateInstallmentStatus(String(item.status || "")) !== "Atrasado",
    );
    const fixedAddition = toFiniteNumber(loanMeta.meta.fixedAddition);
    const interestRate = toFiniteNumber(selectedLoan.interest_rate ?? selectedLoan.interestRate);

    return {
      id: selectedLoan.id,
      debtorName: selectedLoan.debtor?.name || `Cliente #${selectedLoan.debtor_id}`,
      debtorDocument: formatDocument(selectedLoan.debtor?.document || selectedLoan.debtor?.cpf || selectedLoan.debtor?.cnpj),
      status: selectedLoan.uiStatus,
      statusBadgeClass: getStatusBadge(selectedLoan.uiStatus),
      principal: selectedLoan.principal,
      total: selectedLoan.total,
      totalInterest,
      installmentAmount,
      installmentsCount,
      paidCount: paidInstallments.length,
      overdueCount: overdueInstallments.length,
      pendingCount: pendingInstallments.length,
      startDate: formatDatePtBr(selectedLoan.start_date || selectedLoan.date),
      firstDueDate: formatDatePtBr(
        selectedLoan.first_due_date || selectedLoan.due_date || selectedLoan.installments[0]?.due_date || selectedLoan.installments[0]?.dueDate,
      ),
      createdAt: formatDatePtBr(selectedLoan.created_at || selectedLoan.date || selectedLoan.start_date),
      interestTypeLabel: translateInterestMode(interestMode),
      rateLabel: interestMode === "fixo" ? "Acrescimo fixo" : "Taxa mensal",
      rateValue: interestMode === "fixo" ? formatCurrency(fixedAddition) : formatPercent(interestRate),
      observations: loanMeta.text,
      installments: selectedLoan.installments.map((item) => {
        const statusLabel = isInstallmentPaid(item) ? "Pago" : translateInstallmentStatus(String(item.status || ""));
        return {
          id: item.id,
          number: Number(item.installment_number ?? item.installmentNumber ?? 0),
          amount: toFiniteNumber(item.amount),
          principalAmount: toFiniteNumber(item.principal_amount ?? item.principalAmount),
          interestAmount: toFiniteNumber(item.interest_amount ?? item.interestAmount),
          dueDate: formatDatePtBr(item.due_date ?? item.dueDate),
          paymentDate: formatDatePtBr(item.payment_date ?? item.paymentDate),
          statusLabel,
          badgeClass: getInstallmentStatusBadgeClass(item),
        };
      }),
    };
  }, [selectedLoan]);

  const filteredSimulations = useMemo(() => {
    let result = [...simulations];

    if (simulationSearch.trim()) {
      const term = simulationSearch.trim().toLowerCase();
      result = result.filter((simulation) => {
        const searchValue = [
          simulation.id,
          String(simulation.id || "").slice(0, 8),
          simulation.clientName,
          simulation.client?.name,
          simulation.clientPhone,
          simulation.client?.phone,
          simulation.clientId,
          simulation.loanId,
        ]
          .map((value) => String(value || ""))
          .join(" ")
          .toLowerCase();

        return searchValue.includes(term);
      });
    }

    if (simulationStatusFilter === "PENDENTES") {
      result = result.filter((simulation) => canManageSimulation(String(simulation.status || "")));
    } else if (simulationStatusFilter !== "Todos") {
      result = result.filter((simulation) => String(simulation.status || "").toUpperCase() === simulationStatusFilter);
    }

    return result;
  }, [simulations, simulationSearch, simulationStatusFilter]);

  const filteredAndSortedLoans = useMemo(() => {
    let result = [...enrichedLoans];

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(L => L.searchStr.includes(s));
    }

    if (statusFilter !== "Todos") {
      result = result.filter(L => L.uiStatus === statusFilter);
    }

    result.sort((a, b) => {
      let valA: any = a.id;
      let valB: any = b.id;

      if (sortBy === "id") {
        valA = Number(a.id) || a.id;
        valB = Number(b.id) || b.id;
      } else if (sortBy === "debtor") {
        valA = String(a.debtor?.name || "").toLowerCase();
        valB = String(b.debtor?.name || "").toLowerCase();
      } else if (sortBy === "principal") {
        valA = a.principal;
        valB = b.principal;
      } else if (sortBy === "total") {
        valA = a.total;
        valB = b.total;
      } else if (sortBy === "created_at") {
        valA = a.createdAt ? a.createdAt.getTime() : 0;
        valB = b.createdAt ? b.createdAt.getTime() : 0;
      } else if (sortBy === "status") {
        valA = a.uiStatus;
        valB = b.uiStatus;
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [enrichedLoans, search, statusFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedLoans.length / pageSize));
  const currentPageSafe = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPageSafe - 1) * pageSize;
  const pageRows = filteredAndSortedLoans.slice(startIdx, startIdx + pageSize);
  const manageableSimulationsCount = simulations.filter((simulation) => canManageSimulation(String(simulation.status || ""))).length;

  // KPIs
  const totalCount = enrichedLoans.length;
  const totalPrincipal = enrichedLoans.reduce((acc, curr) => acc + curr.principal, 0);
  const totalContracted = enrichedLoans.reduce((acc, curr) => acc + curr.total, 0);
  const activeCount = enrichedLoans.filter(L => L.uiStatus === "Ativo").length;

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  function renderSortIcon(field: string) {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-1 inline text-slate-500" />;
    return <ArrowUpDown className="h-3 w-3 opacity-100 ml-1 inline text-blue-500" />;
  }

  const isEditingLoanModal = loanModalMode === "edit";
  const isSimulationLoanModal = loanModalMode === "simulation";
  const isLockedLoanModal = isEditingLoanModal && Boolean(selectedLoan?.hasPaidInstallments);
  const simulationsSection = (
    <div className="mb-6 rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3 shadow-xl backdrop-blur-sm sm:p-5 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Simulacoes salvas</h2>
          <p className="mt-1 text-sm text-slate-400">
            {loading
              ? "Carregando simulacoes..."
              : `${simulations.length} simulacao(oes) registradas, ${manageableSimulationsCount} aguardando acao.`}
          </p>
        </div>
        <p className="max-w-2xl text-xs text-slate-500">
          Aqui ficam os rascunhos e propostas enviadas antes de virarem emprestimos aprovados.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-8">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar simulacao</label>
          <input
            type="text"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Cliente, telefone ou ID da simulacao"
            value={simulationSearch}
            onChange={(event) => setSimulationSearch(event.target.value)}
          />
        </div>
        <div className="md:col-span-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
          <select
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            value={simulationStatusFilter}
            onChange={(event) => setSimulationStatusFilter(event.target.value)}
          >
            <option value="PENDENTES">Pendentes</option>
            <option value="Todos">Todos</option>
            <option value="DRAFT">Rascunho</option>
            <option value="SENT">Enviada</option>
            <option value="ACCEPTED">Aceita</option>
            <option value="EXPIRED">Expirada</option>
            <option value="CANCELED">Cancelada</option>
          </select>
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-800 md:block">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-right">Principal</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Juros</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">Carregando simulacoes...</td>
              </tr>
            ) : filteredSimulations.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">Nenhuma simulacao encontrada.</td>
              </tr>
            ) : (
              filteredSimulations.map((simulation) => {
                const simulationId = String(simulation.id || "");
                const isActionLoading = simulationActionLoadingId === simulationId;
                const allowManagement = canManageSimulation(String(simulation.status || ""));

                return (
                  <tr key={simulationId} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-100">#{simulationId.slice(0, 8)}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDatePtBr(simulation.createdAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-100">{simulation.clientName || simulation.client?.name || `Cliente #${simulation.clientId}`}</div>
                      <div className="mt-1 text-xs text-slate-400">{simulation.clientPhone || simulation.client?.phone || "Sem telefone"}</div>
                    </td>
                    <td className="px-4 py-4 text-right font-medium text-slate-300">
                      {formatCurrency(simulation.principalAmount)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-slate-100">{formatCurrency(simulation.totals?.totalAmount)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {Math.max(1, Number(simulation.installmentsCount) || 0)}x de {formatCurrency(simulation.totals?.installmentAmount)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-400">
                      <div>{translateInterestMode(String(simulation.interestType || ""))}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatSimulationInterestPrimary(simulation)}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-400">
                      {formatDatePtBr(simulation.expiresAt)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getSimulationStatusBadge(String(simulation.status || ""))}`}>
                        {getSimulationStatusLabel(simulation)}
                      </span>
                      {simulation.loanId ? (
                        <div className="mt-1 text-xs text-slate-500">Emprestimo #{simulation.loanId}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {simulation.loanId ? (
                          <button
                            onClick={() => openLinkedLoanFromSimulation(simulation)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-blue-500 hover:text-blue-300 disabled:opacity-50"
                            disabled={isActionLoading}
                            title="Ver emprestimo vinculado"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        ) : null}
                        {allowManagement ? (
                          <>
                            <button
                              onClick={() => handleSendSavedSimulation(simulation)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                              disabled={isActionLoading}
                              title="Reenviar no WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setSimulationConfirmAction({ type: "approve", simulation })}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                              disabled={isActionLoading}
                              title="Aprovar simulacao"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setSimulationConfirmAction({ type: "cancel", simulation })}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                              disabled={isActionLoading}
                              title="Cancelar simulacao"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                        {!simulation.loanId && !allowManagement ? (
                          <span className="text-xs text-slate-500">-</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
            Carregando simulacoes...
          </div>
        ) : filteredSimulations.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
            Nenhuma simulacao encontrada.
          </div>
        ) : (
          filteredSimulations.map((simulation) => {
            const simulationId = String(simulation.id || "");
            const isActionLoading = simulationActionLoadingId === simulationId;
            const allowManagement = canManageSimulation(String(simulation.status || ""));

            return (
              <MobileDataCard
                key={simulationId}
                title={simulation.clientName || simulation.client?.name || `Cliente #${simulation.clientId}`}
                subtitle={`Simulacao #${simulationId.slice(0, 8)}`}
                badge={(
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getSimulationStatusBadge(String(simulation.status || ""))}`}>
                    {getSimulationStatusLabel(simulation)}
                  </span>
                )}
                actions={(
                  <MobileDataCardActions
                    primary={simulation.loanId ? (
                      <button
                        onClick={() => openLinkedLoanFromSimulation(simulation)}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#3b6ef0] disabled:opacity-50"
                        disabled={isActionLoading}
                      >
                        <Eye className="h-4 w-4" />
                        Ver emprestimo
                      </button>
                    ) : undefined}
                  >
                    {allowManagement ? (
                      <button
                        onClick={() => handleSendSavedSimulation(simulation)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                        disabled={isActionLoading}
                        title="Reenviar no WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    ) : null}
                    {allowManagement ? (
                      <button
                        onClick={() => setSimulationConfirmAction({ type: "approve", simulation })}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                        disabled={isActionLoading}
                        title="Aprovar simulacao"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : null}
                    {allowManagement ? (
                      <button
                        onClick={() => setSimulationConfirmAction({ type: "cancel", simulation })}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                        disabled={isActionLoading}
                        title="Cancelar simulacao"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    ) : null}
                  </MobileDataCardActions>
                )}
              >
                <div className="grid grid-cols-2 gap-2">
                  <MobileDataCardRow label="Principal" value={formatCurrency(simulation.principalAmount)} />
                  <MobileDataCardRow label="Total" value={formatCurrency(simulation.totals?.totalAmount)} />
                  <MobileDataCardRow label="Parcelas" value={`${Math.max(1, Number(simulation.installmentsCount) || 0)}x`} />
                  <MobileDataCardRow label="Validade" value={formatDatePtBr(simulation.expiresAt)} />
                  <MobileDataCardRow label="Juros" value={formatSimulationInterestPrimary(simulation)} />
                  <MobileDataCardRow
                    label="Vinculo"
                    value={simulation.loanId ? `Emprestimo #${simulation.loanId}` : "Sem emprestimo"}
                  />
                </div>
              </MobileDataCard>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-24 lg:pb-8">
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">EmprÃ©stimos</h1>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:justify-end">
          <button onClick={openSimulationModal} className="inline-flex h-11 min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-semibold text-slate-300 transition-all hover:bg-slate-700 active:scale-[0.98] sm:px-5">
            <FlaskConical className="h-4 w-4" /> Nova simulaÃ§Ã£o
          </button>
          <button onClick={openLoanModal} className="inline-flex h-11 min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] px-3 text-sm font-bold text-white transition-all hover:bg-[#3b6ef0] shadow-[0_4px_14px_rgba(79,126,247,0.4)] active:translate-y-px active:scale-[0.98] sm:px-5">
            <Plus className="h-4 w-4" /> Novo emprÃ©stimo
          </button>
        </div>
      </section>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-[#4F7EF7]" />
          <Hash className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">EmprÃ©stimos</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-slate-100">{loading ? "..." : totalCount}</p>
          <p className="mt-1 hidden text-xs font-semibold text-slate-500 sm:block">Na base de dados</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
          <Banknote className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Principal total</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-emerald-400">{loading ? "..." : formatCurrency(totalPrincipal)}</p>
          <p className="mt-1 hidden text-xs font-semibold text-slate-500 sm:block">Capital emprestado</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-violet-500" />
          <BarChart3 className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Total contratado</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-slate-100">{loading ? "..." : formatCurrency(totalContracted)}</p>
          <p className="mt-1 hidden text-xs font-semibold text-slate-500 sm:block">Custo Efetivo + Juros</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-600/50">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-sky-500" />
          <CheckCircle2 className="pointer-events-none absolute right-3 top-3 sm:right-4 sm:top-4 h-5 w-5 text-slate-600" />
          <p className="text-[0.68rem] sm:text-[13px] font-semibold uppercase tracking-wider text-slate-400">Ativos</p>
          <p className="mt-2 sm:mt-3 text-xl sm:text-[1.375rem] font-bold text-sky-400">{loading ? "..." : activeCount}</p>
          <p className="mt-1 hidden text-xs font-semibold text-slate-500 sm:block">Contratos vigentes</p>
        </div>
      </div>

      {false ? (
        <div className="mb-6 rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3 shadow-xl backdrop-blur-sm sm:p-5 lg:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Simulacoes salvas</h2>
            <p className="mt-1 text-sm text-slate-400">
              {loading
                ? "Carregando simulacoes..."
                : `${simulations.length} simulacao(oes) registradas, ${manageableSimulationsCount} aguardando acao.`}
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-8">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar simulacao</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="Cliente, telefone ou ID da simulacao"
              value={simulationSearch}
              onChange={(event) => setSimulationSearch(event.target.value)}
            />
          </div>
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={simulationStatusFilter}
              onChange={(event) => setSimulationStatusFilter(event.target.value)}
            >
              <option value="Todos">Todos</option>
              <option value="DRAFT">Rascunho</option>
              <option value="SENT">Enviada</option>
              <option value="ACCEPTED">Aceita</option>
              <option value="EXPIRED">Expirada</option>
              <option value="CANCELED">Cancelada</option>
            </select>
          </div>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-800 md:block">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Principal</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Juros</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">Carregando simulacoes...</td>
                </tr>
              ) : filteredSimulations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">Nenhuma simulacao encontrada.</td>
                </tr>
              ) : (
                filteredSimulations.map((simulation) => {
                  const simulationId = String(simulation.id || "");
                  const isActionLoading = simulationActionLoadingId === simulationId;
                  const allowManagement = canManageSimulation(String(simulation.status || ""));

                  return (
                    <tr key={simulationId} className="transition-colors hover:bg-slate-800/40">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-100">#{simulationId.slice(0, 8)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDatePtBr(simulation.createdAt)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-100">{simulation.clientName || simulation.client?.name || `Cliente #${simulation.clientId}`}</div>
                        <div className="mt-1 text-xs text-slate-400">{simulation.clientPhone || simulation.client?.phone || "Sem telefone"}</div>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-slate-300">
                        {formatCurrency(simulation.principalAmount)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="font-bold text-slate-100">{formatCurrency(simulation.totals?.totalAmount)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {Math.max(1, Number(simulation.installmentsCount) || 0)}x de {formatCurrency(simulation.totals?.installmentAmount)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-400">
                        <div>{translateInterestMode(String(simulation.interestType || ""))}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatSimulationInterestPrimary(simulation)}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-400">
                        {formatDatePtBr(simulation.expiresAt)}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getSimulationStatusBadge(String(simulation.status || ""))}`}>
                          {getSimulationStatusLabel(simulation)}
                        </span>
                        {simulation.loanId ? (
                          <div className="mt-1 text-xs text-slate-500">Emprestimo #{simulation.loanId}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {simulation.loanId ? (
                            <button
                              onClick={() => openLinkedLoanFromSimulation(simulation)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-blue-500 hover:text-blue-300 disabled:opacity-50"
                              disabled={isActionLoading}
                              title="Ver emprestimo vinculado"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          ) : null}
                          {allowManagement ? (
                            <>
                              <button
                                onClick={() => handleSendSavedSimulation(simulation)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                                disabled={isActionLoading}
                                title="Reenviar no WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSimulationConfirmAction({ type: "approve", simulation })}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                                disabled={isActionLoading}
                                title="Aprovar simulacao"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSimulationConfirmAction({ type: "cancel", simulation })}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                                disabled={isActionLoading}
                                title="Cancelar simulacao"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                          {!simulation.loanId && !allowManagement ? (
                            <span className="text-xs text-slate-500">-</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Carregando simulacoes...
            </div>
          ) : filteredSimulations.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma simulacao encontrada.
            </div>
          ) : (
            filteredSimulations.map((simulation) => {
              const simulationId = String(simulation.id || "");
              const isActionLoading = simulationActionLoadingId === simulationId;
              const allowManagement = canManageSimulation(String(simulation.status || ""));

              return (
                <MobileDataCard
                  key={simulationId}
                  title={simulation.clientName || simulation.client?.name || `Cliente #${simulation.clientId}`}
                  subtitle={`Simulacao #${simulationId.slice(0, 8)}`}
                  badge={(
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getSimulationStatusBadge(String(simulation.status || ""))}`}>
                      {getSimulationStatusLabel(simulation)}
                    </span>
                  )}
                  actions={(
                    <MobileDataCardActions
                      primary={simulation.loanId ? (
                        <button
                          onClick={() => openLinkedLoanFromSimulation(simulation)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#3b6ef0] disabled:opacity-50"
                          disabled={isActionLoading}
                        >
                          <Eye className="h-4 w-4" />
                          Ver emprestimo
                        </button>
                      ) : undefined}
                    >
                      {allowManagement ? (
                        <button
                          onClick={() => handleSendSavedSimulation(simulation)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                          disabled={isActionLoading}
                          title="Reenviar no WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      ) : null}
                      {allowManagement ? (
                        <button
                          onClick={() => setSimulationConfirmAction({ type: "approve", simulation })}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                          disabled={isActionLoading}
                          title="Aprovar simulacao"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      ) : null}
                      {allowManagement ? (
                        <button
                          onClick={() => setSimulationConfirmAction({ type: "cancel", simulation })}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                          disabled={isActionLoading}
                          title="Cancelar simulacao"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      ) : null}
                    </MobileDataCardActions>
                  )}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <MobileDataCardRow label="Principal" value={formatCurrency(simulation.principalAmount)} />
                    <MobileDataCardRow label="Total" value={formatCurrency(simulation.totals?.totalAmount)} />
                    <MobileDataCardRow label="Parcelas" value={`${Math.max(1, Number(simulation.installmentsCount) || 0)}x`} />
                    <MobileDataCardRow label="Validade" value={formatDatePtBr(simulation.expiresAt)} />
                    <MobileDataCardRow label="Juros" value={formatSimulationInterestPrimary(simulation)} />
                    <MobileDataCardRow
                      label="Vinculo"
                      value={simulation.loanId ? `Emprestimo #${simulation.loanId}` : "Sem emprestimo"}
                    />
                  </div>
                </MobileDataCard>
              );
            })
          )}
        </div>
        </div>
      ) : null}

      {/* Filter and Table */}
      <div className="mb-6 rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3 sm:p-5 lg:p-6 shadow-xl backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-5">
          <div className="md:col-span-5">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="Cliente ou ID do emprÃ©stimo"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="Todos">Todos</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Quitado">Quitado</option>
              <option value="Atrasado">Atrasado</option>
            </select>
          </div>
          <div className="md:col-span-4"></div>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-800 md:block">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("id")}>
                  ID {renderSortIcon("id")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("debtor")}>
                  Cliente {renderSortIcon("debtor")}
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("principal")}>
                  Principal {renderSortIcon("principal")}
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("total")}>
                  Total {renderSortIcon("total")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("created_at")}>
                  Data {renderSortIcon("created_at")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort("status")}>
                  Status {renderSortIcon("status")}
                </th>
                <th className="px-4 py-3 text-right">AÃ§Ãµes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">Carregando emprÃ©stimos...</td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">Nenhum emprÃ©stimo encontrado.</td>
                </tr>
              ) : (
                pageRows.map(loan => (
                  <tr key={loan.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-4 font-semibold text-slate-200">#{loan.id}</td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-100">{loan.debtor?.name || "Cliente excluÃ­do"}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {formatDocument(loan.debtor?.document || loan.debtor?.cpf) || "Sem documento"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-medium text-slate-300">
                      {formatCurrency(loan.principal)}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-100">
                      {formatCurrency(loan.total)}
                    </td>
                    <td className="px-4 py-4 text-slate-400">
                      {loan.createdAt ? new Intl.DateTimeFormat("pt-BR").format(loan.createdAt) : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(loan.uiStatus)}`}>
                        {loan.uiStatus}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openViewModal(loan)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-blue-500 hover:text-blue-300"
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {loan.canEdit ? (
                          <button
                            onClick={() => openEditModal(loan)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 transition-colors hover:bg-amber-500/20"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        ) : null}
                        {loan.canDelete ? (
                          <button onClick={() => openDeleteModal(loan)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20" title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* RodapÃ© Tabela (PaginaÃ§Ã£o) */}
        <div className="grid gap-3 md:hidden">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Carregando emprestimos...
            </div>
          ) : pageRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              Nenhum emprestimo encontrado.
            </div>
          ) : (
            pageRows.map((loan) => {
              const debtorDocument = formatDocument(loan.debtor?.document || loan.debtor?.cpf);
              const subtitle = debtorDocument && debtorDocument !== "-" ? debtorDocument : undefined;

              return (
                <MobileDataCard
                  key={loan.id}
                  title={loan.debtor?.name || "Cliente excluido"}
                  subtitle={subtitle}
                  badge={(
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(loan.uiStatus)}`}>
                      {loan.uiStatus}
                    </span>
                  )}
                  actions={(
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openViewModal(loan)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F7EF7] text-white shadow-[0_8px_18px_rgba(79,126,247,0.3)] transition-colors hover:bg-[#3b6ef0]"
                        title="Visualizar"
                        aria-label={`Visualizar emprestimo #${loan.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {loan.canEdit ? (
                        <button
                          onClick={() => openEditModal(loan)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100"
                          title="Editar"
                          aria-label={`Editar emprestimo #${loan.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      ) : null}
                      {loan.canDelete ? (
                        <button
                          onClick={() => openDeleteModal(loan)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                          title="Excluir"
                          aria-label={`Excluir emprestimo #${loan.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  )}
                >
                  <div className="grid grid-cols-2 gap-2.5">
                    <MobileDataCardRow label="ID" value={`#${loan.id}`} />
                    <MobileDataCardRow label="Data" value={loan.createdAt ? new Intl.DateTimeFormat("pt-BR").format(loan.createdAt) : "-"} />
                    <MobileDataCardRow label="Principal" value={formatCurrency(loan.principal)} />
                    <MobileDataCardRow label="Total" value={formatCurrency(loan.total)} />
                  </div>
                </MobileDataCard>
              );
            })
          )}
        </div>

        {!loading && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/60 pt-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-400">
              Mostrando <span className="text-slate-200">{filteredAndSortedLoans.length > 0 ? startIdx + 1 : 0}</span> atÃ©{" "}
              <span className="text-slate-200">{Math.min(startIdx + pageSize, filteredAndSortedLoans.length)}</span> de{" "}
              <span className="font-semibold text-slate-200">{filteredAndSortedLoans.length}</span> resultados
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-400">
                PÃ¡gina <span className="text-slate-200">{currentPageSafe}</span> de {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {simulationsSection}

      {showViewModal && selectedLoanView ? (
        <ModalBase
          open={showViewModal}
          onClose={closeViewModal}
          title={`Emprestimo #${selectedLoanView.id}`}
          size="max-w-5xl"
          bodyClassName="space-y-5 bg-slate-50"
          footer={
            <>
              <ModalBtnGhost onClick={closeViewModal}>Fechar</ModalBtnGhost>
              {selectedLoan && !selectedLoan.hasPaidInstallments ? (
                <ModalBtnPrimary
                  onClick={() => {
                    closeViewModal();
                    openEditModal(selectedLoan);
                  }}
                >
                  Editar emprestimo
                </ModalBtnPrimary>
              ) : null}
            </>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-stretch">
              <section className="space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">Cliente</p>
                      <h3 className="mt-2 text-xl font-bold text-slate-900">{selectedLoanView.debtorName}</h3>
                      <p className="mt-1 text-sm text-slate-500">{selectedLoanView.debtorDocument}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${selectedLoanView.statusBadgeClass}`}>
                      {selectedLoanView.status}
                    </span>
                  </div>
                </div>

                <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <LoanViewStat label="Valor emprestado" value={formatCurrency(selectedLoanView.principal)} />
                  <LoanViewStat label="Total do contrato" value={formatCurrency(selectedLoanView.total)} />
                  <LoanViewStat
                    label="Juros / acrescimo"
                    value={formatCurrency(selectedLoanView.totalInterest)}
                    hint={selectedLoanView.interestTypeLabel}
                  />
                  <LoanViewStat
                    label={selectedLoanView.rateLabel}
                    value={selectedLoanView.rateValue}
                    hint={selectedLoanView.interestTypeLabel}
                  />
                  <LoanViewStat
                    label="Parcelas"
                    value={`${selectedLoanView.installmentsCount}`}
                    hint={`${selectedLoanView.paidCount} paga(s)`}
                  />
                  <LoanViewStat
                    label="Valor da parcela"
                    value={selectedLoanView.installmentAmount > 0 ? formatCurrency(selectedLoanView.installmentAmount) : "-"}
                    hint={selectedLoanView.installmentsCount > 0 ? "Parcela prevista do contrato" : "Sem plano de parcelas"}
                  />
                </div>
              </section>

              <section className="h-full">
                <div className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
                  <h3 className="text-base font-bold text-slate-900">Parcelas</h3>
                  <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <LoanViewStat label="Pagas" value={selectedLoanView.paidCount} valueClassName="text-emerald-600" />
                    <LoanViewStat label="Em aberto" value={selectedLoanView.pendingCount} valueClassName="text-amber-600" />
                    <LoanViewStat label="Em atraso" value={selectedLoanView.overdueCount} valueClassName="text-rose-600" />
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
              <section className="flex flex-col gap-5">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
                  <h3 className="text-base font-bold text-slate-900">Informacoes do emprestimo</h3>
                  <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2">
                    <LoanViewInfo label="Data de inicio" value={selectedLoanView.startDate} />
                    <LoanViewInfo label="Primeiro vencimento" value={selectedLoanView.firstDueDate} />
                    <LoanViewInfo label="Criado em" value={selectedLoanView.createdAt} />
                    <LoanViewInfo label="Tipo de juros" value={selectedLoanView.interestTypeLabel} />
                  </div>
                </div>

                <div className="flex min-h-[180px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
                  <h3 className="text-base font-bold text-slate-900">Observacoes</h3>
                  <div className="mt-4 flex flex-1 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm leading-6 text-slate-600">
                      {selectedLoanView.observations || "Nenhuma observacao informada para este emprestimo."}
                    </p>
                  </div>
                </div>
              </section>

              <section className="xl:h-[430px]">
                <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-bold text-slate-900">Andamento das parcelas</h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                      {selectedLoanView.installments.length} registro(s)
                    </span>
                  </div>

                  <div className="mt-4 min-h-0 flex-1 space-y-2.5">
                    {selectedLoanView.installments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        Nenhuma parcela cadastrada para este emprestimo.
                      </div>
                    ) : (
                      <div className="h-full space-y-2.5 overflow-y-auto pr-1">
                        {selectedLoanView.installments.map((item) => (
                          <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-bold text-slate-900">Parcela #{item.number || "-"}</p>
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${item.badgeClass}`}>
                                    {item.statusLabel}
                                  </span>
                                </div>
                                <div className="mt-2 grid auto-rows-fr gap-2 sm:grid-cols-2">
                                  <LoanViewInfo label="Vencimento" value={item.dueDate} />
                                  <LoanViewInfo label="Pagamento" value={item.statusLabel === "Pago" ? item.paymentDate : "-"} />
                                </div>
                              </div>
                              <div className="sm:min-w-[160px] sm:text-right">
                                <p className="text-lg font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Principal {formatCurrency(item.principalAmount)} | Juros {formatCurrency(item.interestAmount)}
                                </p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </ModalBase>
      ) : null}

      {/* ===== MODAL: NOVO EMPRÃ‰STIMO / NOVA SIMULAÃ‡ÃƒO ===== */}
      {showLoanModal && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-hidden bg-black/60 px-4 pb-4 pt-14 backdrop-blur-sm sm:pt-16" onClick={closeLoanModal}>
          <div className="flex max-h-[calc(100vh-4.5rem)] w-full max-w-[840px] flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-5rem)]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  {loanModalMode === "loan"
                    ? "Novo emprestimo"
                    : loanModalMode === "simulation"
                      ? "Nova simulacao"
                      : `Editar emprestimo #${selectedLoan?.id ?? ""}`}
                </h2>
              </div>
              <button onClick={closeLoanModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"><X className="h-5 w-5" /></button>
            </div>

            {/* Body: 2 columns */}
            <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col xl:flex-row">
              {/* Left: Form */}
              <fieldset disabled={isLockedLoanModal} className="m-0 min-w-0 border-0 p-0 flex-1 space-y-4 px-5 py-4">
                {isLockedLoanModal ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Este emprestimo ja possui parcela paga. Por regra, ele nao pode mais ser alterado.
                  </div>
                ) : null}
                {/* InformaÃ§Ãµes BÃ¡sicas */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Informacoes basicas</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Cliente*</label>
                      <select className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" required value={formClientId} onChange={(e) => setFormClientId(e.target.value)}>
                        <option value="">Selecione o cliente</option>
                        {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Valor principal (R$)</label>
                      <input className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" inputMode="decimal" maxLength={24} type="text" placeholder="0,00" value={formPrincipal} onChange={(e) => setFormPrincipal(formatCurrencyInput(e.target.value))} />
                    </div>
                  </div>
                </div>

                {/* CondiÃ§Ãµes */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Condicoes</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Tipo de juros</label>
                      <select className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" value={formInterestType} onChange={(e) => setFormInterestType(e.target.value as "composto" | "simples" | "fixo")}>
                        <option value="composto">Composto %</option>
                        <option value="simples">Simples %</option>
                        <option value="fixo">Fixo (valor total)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">{formInterestType === "fixo" ? "Acrescimo fixo (R$)" : "Taxa mensal (%)*"}</label>
                      <input
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        inputMode={formInterestType === "fixo" ? "decimal" : "decimal"}
                        maxLength={formInterestType === "fixo" ? 24 : undefined}
                        type={formInterestType === "fixo" ? "text" : "number"}
                        min="0"
                        step="0.01"
                        placeholder={formInterestType === "fixo" ? "Ex: 500" : "Ex: 8"}
                        value={formInterestType === "fixo" ? formFixedAddition : formRate}
                        onChange={(e) => {
                          if (formInterestType === "fixo") {
                            setFormFixedAddition(formatCurrencyInput(e.target.value));
                            return;
                          }
                          setFormRate(e.target.value);
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">{formCalcByInstallment ? "Valor da parcela (R$)" : "Parcelas*"}</label>
                      <input
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        inputMode={formCalcByInstallment ? "decimal" : "numeric"}
                        maxLength={formCalcByInstallment ? 24 : undefined}
                        type={formCalcByInstallment ? "text" : "number"}
                        min={formCalcByInstallment ? "0.01" : "1"}
                        max={formCalcByInstallment ? undefined : "96"}
                        step={formCalcByInstallment ? "0.01" : "1"}
                        placeholder={formCalcByInstallment ? "0,00" : ""}
                        value={formCalcByInstallment ? formMaxInstallment : formInstallments}
                        onChange={(e) => {
                          if (formCalcByInstallment) {
                            setFormMaxInstallment(formatCurrencyInput(e.target.value));
                            return;
                          }
                          setFormInstallments(e.target.value);
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setFormCalcByInstallment(!formCalcByInstallment)}
                      aria-pressed={formCalcByInstallment}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                        formCalcByInstallment
                          ? "border-blue-500 bg-blue-600 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]"
                          : "border-slate-500 bg-slate-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full transition-transform ${
                          formCalcByInstallment
                            ? "translate-x-6 bg-white"
                            : "translate-x-1 bg-slate-700"
                        }`}
                      />
                    </button>
                    <span className="text-xs text-slate-400">Calcular por valor da parcela</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formCalcByInstallment
                      ? `Se ativado, o sistema define automaticamente a quantidade de parcelas. Quantidade atual: ${isInstallmentInputSettling ? "calculando..." : loanSummary.installmentsCount > 0 ? loanSummary.installmentsCount : "-"}`
                      : "Se ativado, o sistema define automaticamente a quantidade de parcelas."}
                  </p>
                  {formCalcByInstallment && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      O calculo so e atualizado apos voce terminar de digitar o valor da parcela.
                    </p>
                  )}
                  {loanSummary.autoInstallmentError && (
                    <p className="mt-1 text-[11px] text-red-400">{loanSummary.autoInstallmentError}</p>
                  )}
                </div>

                {/* Datas */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Datas</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Data de inicio</label>
                      <input className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" type="date" value={formStartDate} onChange={(e) => { setFormStartDate(e.target.value); setFormFirstDue(addMonths(e.target.value, 1)); clearCustomDueDates(); }} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">1o vencimento</label>
                      <input className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" type="date" value={formFirstDue} onChange={(e) => { setFormFirstDue(e.target.value); clearCustomDueDates(); }} />
                    </div>
                  </div>
                </div>

                {/* Previa das parcelas */}
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Previa das parcelas</h3>
                    {!isLockedLoanModal && formCustomDueDates.some((date) => isIsoDateString(date)) ? (
                      <button
                        className="text-[11px] font-semibold text-blue-400 transition-colors hover:text-blue-300"
                        onClick={clearCustomDueDates}
                        type="button"
                      >
                        Restaurar agenda padrao
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-2 max-h-[21rem] min-h-[12rem] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                    {loanSummary.plan.length === 0 ? (
                      <p className="text-xs text-slate-500">Preencha os campos para visualizar as parcelas.</p>
                    ) : (
                      loanSummary.plan.map((item) => (
                        <div key={item.installmentNumber} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-200">Parcela #{item.installmentNumber}</p>
                            <p className="text-base font-bold text-slate-100">{formatCurrency(item.amount)}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-xs text-slate-400">
                              Vencimento: {item.dueDate ? new Intl.DateTimeFormat("pt-BR").format(new Date(item.dueDate + "T12:00:00")) : "--/--/----"}
                            </p>
                            <label
                              className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-blue-500 hover:text-blue-300"
                              title={`Editar vencimento da parcela #${item.installmentNumber}`}
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              <input
                                className="absolute inset-0 cursor-pointer opacity-0"
                                onChange={(event) => applyInstallmentDueDate(item.installmentNumber - 1, event.target.value)}
                                type="date"
                                value={item.dueDate || ""}
                              />
                            </label>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">Juros: {formatCurrency(item.interestAmount)}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {dueDatesValidationMessage ? (
                    <p className="mt-2 text-xs font-medium text-red-400">{dueDatesValidationMessage}</p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Voce pode ajustar o vencimento de cada parcela diretamente na previa.</p>
                  )}
                </div>
              </fieldset>

              {/* Right: Resumo */}
              <div className="w-full border-t border-slate-800 px-5 py-4 xl:w-[300px] xl:border-l xl:border-t-0">
                <h3 className="text-base font-bold text-slate-100 mb-4">Resumo do emprestimo</h3>
                <div className="space-y-3">
                  <div><p className="text-[11px] font-semibold uppercase text-slate-500">Valor</p><p className="text-sm font-bold text-slate-100">{formatCurrency(loanSummary.totalAmount)}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase text-slate-500">Valor da parcela</p><p className="text-sm font-bold text-slate-100">{formatCurrency(loanSummary.installmentAmount)}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase text-slate-500">Parcelas</p><p className="text-sm font-bold text-slate-100">{loanSummary.installments}</p></div>
                  <hr className="border-slate-800" />
                  <div><p className="text-[11px] font-semibold uppercase text-slate-500">Taxa</p><p className="text-sm font-bold text-slate-100">{loanSummary.rateLabel}</p><p className="text-xs text-slate-400">{loanSummary.rateValue}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase text-slate-500">1o vencimento</p><p className="text-sm font-bold text-slate-100">{(loanSummary.dueDates[0] || loanSummary.firstDue) !== "--/--/----" ? new Intl.DateTimeFormat("pt-BR").format(new Date((loanSummary.dueDates[0] || loanSummary.firstDue) + "T12:00:00")) : "--/--/----"}</p></div>
                  <hr className="border-slate-800" />
                  <p className="text-xs text-slate-500">{loanSummary.modeLabel}</p>
                </div>

                <div className="mt-6">
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Observacoes</h3>
                  <label className="mb-1 block text-xs font-semibold text-slate-400">Detalhes adicionais</label>
                  <textarea
                    className="min-h-[180px] w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                    placeholder="ObservaÃ§Ãµes sobre o emprestimo"
                    value={formObservations}
                    onChange={(e) => setFormObservations(e.target.value)}
                  />
                </div>
              </div>
            </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-800 px-5 py-3.5">
              {isLockedLoanModal ? (
                <button onClick={closeLoanModal} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-6 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-700">
                  Fechar
                </button>
              ) : loanModalMode === "loan" ? (
                <button onClick={handleSaveLoan} disabled={saving || !canSubmitLoan} className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar emprÃ©stimo"}
                </button>
              ) : isEditingLoanModal ? (
                <button onClick={handleUpdateLoan} disabled={saving || !canSubmitLoan} className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar alteracoes"}
                </button>
              ) : (
                <>
                  <button onClick={() => handleSaveSimulation()} disabled={saving || !canSubmitLoan} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-6 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50">
                    {saving ? "Salvando..." : "Salvar simulacao"}
                  </button>
                  <button onClick={handleSendWhatsApp} disabled={saving || !canSubmitLoan} className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                    Enviar WhatsApp
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {simulationConfirmAction ? (
        <ModalBase
          open={Boolean(simulationConfirmAction)}
          onClose={() => setSimulationConfirmAction(null)}
          title={simulationConfirmAction.type === "approve" ? "Aprovar simulacao" : "Cancelar simulacao"}
          subtitle={
            simulationConfirmAction.type === "approve"
              ? `Deseja transformar a simulacao #${String(simulationConfirmAction.simulation.id || "").slice(0, 8)} em emprestimo?`
              : `Deseja cancelar a simulacao #${String(simulationConfirmAction.simulation.id || "").slice(0, 8)}?`
          }
          footer={(
            <>
              <ModalBtnGhost
                onClick={() => setSimulationConfirmAction(null)}
                disabled={simulationActionLoadingId === String(simulationConfirmAction.simulation.id || "")}
              >
                Voltar
              </ModalBtnGhost>
              <ModalBtnPrimary
                variant={simulationConfirmAction.type === "approve" ? "blue" : "red"}
                onClick={handleConfirmSimulationAction}
                disabled={simulationActionLoadingId === String(simulationConfirmAction.simulation.id || "")}
              >
                {simulationActionLoadingId === String(simulationConfirmAction.simulation.id || "")
                  ? (simulationConfirmAction.type === "approve" ? "Aprovando..." : "Cancelando...")
                  : (simulationConfirmAction.type === "approve" ? "Aprovar simulacao" : "Cancelar simulacao")}
              </ModalBtnPrimary>
            </>
          )}
        >
          <p className="text-sm text-slate-400">
            {simulationConfirmAction.type === "approve"
              ? "Ao aprovar, o sistema cria o emprestimo real e vincula esta simulacao ao contrato."
              : "A simulacao permanece no historico, mas deixa de ficar disponivel como proposta ativa."}
          </p>
        </ModalBase>
      ) : null}

      {/* ===== MODAL: EXCLUIR EMPRÃ‰STIMO ===== */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-100">Confirmar exclusÃ£o</h2>
            <p className="mt-1 text-sm text-slate-400">Deseja excluir o emprÃ©stimo #{deletingLoan?.id}?</p>
            <p className="mt-3 text-sm text-slate-400">Esta aÃ§Ã£o nÃ£o pode ser desfeita. O emprÃ©stimo e suas parcelas serÃ£o removidos permanentemente.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowDeleteModal(false)} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-5 text-sm font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancelar</button>
              <button onClick={handleDeleteLoan} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">{saving ? "Excluindo..." : "Excluir emprÃ©stimo"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


