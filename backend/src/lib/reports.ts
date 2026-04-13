import { dateToIso } from "./date-time";
import {
  CASH_ADJUSTMENT_CATEGORY,
  INSTALLMENT_PAYMENT_CATEGORY,
  LOAN_DISBURSEMENT_CATEGORY,
  parseInstallmentIncomeDescription,
  parseLoanDisbursementDescription,
} from "./installment-income-transaction";
import { toSafeInteger, toSafeNumber } from "./numbers";

export type ReportGroupBy = "day" | "week" | "month";
export type FinanceReportOrigin = "manual" | "installment_payment" | "loan_disbursement" | "cash_adjustment";
export type FinanceReportDirection = "income" | "expense";
export type FinanceReportRowStatus = "completed" | "pending" | "scheduled";
export type FinanceReportStatusFilter = "all" | "completed" | "open";
export type LoanReportStatus = "PENDENTE" | "EM_DIA" | "ATRASADO" | "QUITADO";
export type LoanReportStatusFilter = "all" | LoanReportStatus;

export type FinanceReportFilters = {
  startDate: string;
  endDate: string;
  origin: "all" | FinanceReportOrigin;
  direction: "all" | FinanceReportDirection;
  status: FinanceReportStatusFilter;
  categoryId: string | "all";
  groupBy: ReportGroupBy;
  page: number;
  pageSize: number;
};

export type FinanceReportSourceRow = {
  id: string | number;
  type: FinanceReportDirection;
  amount: number;
  category: string;
  categoryId?: string | number | null;
  date: string;
  description: string;
  status: FinanceReportRowStatus;
};

export type FinanceReportRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: FinanceReportDirection;
  status: FinanceReportRowStatus;
  origin: FinanceReportOrigin;
  categoryId: string | null;
  categoryName: string;
  isAutomatic: boolean;
  linkedLoanId: string | null;
  linkedInstallmentId: string | null;
};

export type FinanceReportSummary = {
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  closingBalance: number;
  openToReceive: number;
  openToPay: number;
  projectedBalance: number;
};

export type ReportSeriesPoint = {
  bucket: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  count: number;
};

export type BreakdownItem = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  count: number;
};

export type FinanceReportResult = {
  filters: FinanceReportFilters;
  summary: FinanceReportSummary;
  series: ReportSeriesPoint[];
  breakdowns: {
    byOrigin: BreakdownItem[];
    byCategory: BreakdownItem[];
  };
  rows: FinanceReportRow[];
  allRows: FinanceReportRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type LoansReportFilters = {
  startDate: string;
  endDate: string;
  loanStatus: LoanReportStatusFilter;
  groupBy: ReportGroupBy;
};

export type LoanReportLoanInput = {
  id: string | number;
  clientName: string;
  principalAmount: number;
  totalAmount: number;
  installmentsCount: number;
  startDate: string;
  dueDate: string;
};

export type LoanReportInstallmentInput = {
  id: string | number;
  loanId: string | number;
  installmentNumber: number;
  amount: number;
  dueDate: string;
  principalAmount?: number | null;
  interestAmount?: number | null;
};

export type LoanReportPaymentInput = {
  id: string | number;
  loanId: string | number;
  installmentId?: string | number | null;
  amount: number;
  paymentDate: string;
};

export type LoansReportSummary = {
  loanedInPeriod: number;
  receivedInPeriod: number;
  profitInPeriod: number;
  openPortfolioAtEnd: number;
  overduePortfolioAtEnd: number;
  delinquencyRateAtEnd: number;
  roiAccumulatedToEnd: number;
  totalContracts: number;
  overdueInstallmentsAtEnd: number;
};

export type LoansReportSeriesPoint = {
  bucket: string;
  label: string;
  loaned: number;
  received: number;
  profit: number;
};

export type LoansPortfolioStatusItem = {
  status: LoanReportStatus;
  label: string;
  count: number;
  amount: number;
};

export type LoansPortfolioStatus = {
  items: LoansPortfolioStatusItem[];
  avgTicket: number;
  avgTermDays: number;
  totalContracts: number;
};

export type LoansReportExportRow = {
  loanId: string;
  clientName: string;
  status: LoanReportStatus;
  principal: number;
  total: number;
  received: number;
  open: number;
  overdue: number;
  startDate: string;
  dueDate: string;
};

export type LoansReportResult = {
  filters: LoansReportFilters;
  summary: LoansReportSummary;
  series: LoansReportSeriesPoint[];
  portfolioStatus: LoansPortfolioStatus;
  exportRows: LoansReportExportRow[];
};

type NormalizedLoanSnapshot = {
  loanId: string;
  clientName: string;
  principal: number;
  total: number;
  startDate: string;
  dueDate: string;
  status: LoanReportStatus;
  receivedToEnd: number;
  receivedInPeriod: number;
  profitToEnd: number;
  profitInPeriod: number;
  openAtEnd: number;
  overdueAtEnd: number;
  overdueInstallmentsAtEnd: number;
  totalOutstandingAtEnd: number;
  termDays: number;
};

const EPSILON = 0.009;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function isIsoWithinRange(value: string, startDate: string, endDate: string) {
  return value >= startDate && value <= endDate;
}

function diffDays(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate).getTime();
  const end = parseDateOnly(endDate).getTime();
  return Math.max(Math.round((end - start) / 86400000), 0);
}

function formatDayLabel(isoDate: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(parseDateOnly(isoDate));
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date).replace(".", "");
}

function getWeekBucketStart(isoDate: string) {
  const date = parseDateOnly(isoDate);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayIndex);
  return dateToIso(date);
}

function formatBucketLabel(bucket: string, groupBy: ReportGroupBy) {
  if (groupBy === "day") return formatDayLabel(bucket);
  if (groupBy === "week") return `Semana ${formatDayLabel(bucket)}`;
  return formatMonthLabel(bucket);
}

function resolveBucket(isoDate: string, groupBy: ReportGroupBy) {
  if (groupBy === "month") return isoDate.slice(0, 7);
  if (groupBy === "week") return getWeekBucketStart(isoDate);
  return isoDate;
}

function buildSignedAmount(amount: number, direction: FinanceReportDirection) {
  return direction === "income" ? amount : (-1 * amount);
}

function formatStatusLabel(status: LoanReportStatus) {
  switch (status) {
    case "PENDENTE":
      return "Pendentes";
    case "EM_DIA":
      return "Em dia";
    case "ATRASADO":
      return "Atrasados";
    case "QUITADO":
      return "Quitados";
    default:
      return status;
  }
}

export function classifyFinanceOrigin(category: string): FinanceReportOrigin {
  if (category === INSTALLMENT_PAYMENT_CATEGORY) return "installment_payment";
  if (category === LOAN_DISBURSEMENT_CATEGORY) return "loan_disbursement";
  if (category === CASH_ADJUSTMENT_CATEGORY) return "cash_adjustment";
  return "manual";
}

function parseFinanceLinks(origin: FinanceReportOrigin, description: string) {
  if (origin === "installment_payment") {
    const parsed = parseInstallmentIncomeDescription(description);
    return {
      linkedLoanId: parsed ? String(parsed.loanId) : null,
      linkedInstallmentId: parsed ? String(parsed.installmentId) : null,
    };
  }

  if (origin === "loan_disbursement") {
    const parsed = parseLoanDisbursementDescription(description);
    return {
      linkedLoanId: parsed ? String(parsed.loanId) : null,
      linkedInstallmentId: null,
    };
  }

  return {
    linkedLoanId: null,
    linkedInstallmentId: null,
  };
}

function normalizeFinanceRow(row: FinanceReportSourceRow): FinanceReportRow {
  const origin = classifyFinanceOrigin(row.category);
  const links = parseFinanceLinks(origin, row.description);

  return {
    id: String(row.id),
    date: row.date,
    description: row.description,
    amount: round2(toSafeNumber(row.amount)),
    direction: row.type,
    status: row.status,
    origin,
    categoryId: row.categoryId !== undefined && row.categoryId !== null && row.categoryId !== ""
      ? String(row.categoryId)
      : null,
    categoryName: row.category || "Sem categoria",
    isAutomatic: origin !== "manual",
    linkedLoanId: links.linkedLoanId,
    linkedInstallmentId: links.linkedInstallmentId,
  };
}

function financeStatusMatchesFilter(status: FinanceReportRowStatus, filter: FinanceReportStatusFilter) {
  if (filter === "all") return true;
  if (filter === "completed") return status === "completed";
  return status === "pending" || status === "scheduled";
}

function financeRowMatchesBaseFilters(
  row: FinanceReportRow,
  filters: FinanceReportFilters,
  options?: {
    ignoreDate?: boolean;
    ignoreStatus?: boolean;
  },
) {
  if (!options?.ignoreDate && !isIsoWithinRange(row.date, filters.startDate, filters.endDate)) return false;
  if (!options?.ignoreStatus && !financeStatusMatchesFilter(row.status, filters.status)) return false;
  if (filters.origin !== "all" && row.origin !== filters.origin) return false;
  if (filters.direction !== "all" && row.direction !== filters.direction) return false;
  if (filters.categoryId !== "all" && row.categoryId !== filters.categoryId) return false;
  return true;
}

function buildBreakdown(
  rows: FinanceReportRow[],
  getKey: (row: FinanceReportRow) => string,
  getLabel: (row: FinanceReportRow) => string,
  preferredOrder?: string[],
) {
  const map = new Map<string, BreakdownItem>();
  rows.forEach((row) => {
    const key = getKey(row);
    const current = map.get(key) ?? { key, label: getLabel(row), income: 0, expense: 0, net: 0, count: 0 };
    if (row.direction === "income") {
      current.income = round2(current.income + row.amount);
    } else {
      current.expense = round2(current.expense + row.amount);
    }
    current.net = round2(current.income - current.expense);
    current.count += 1;
    map.set(key, current);
  });

  const items = [...map.values()];
  if (preferredOrder?.length) {
    const orderMap = new Map(preferredOrder.map((key, index) => [key, index]));
    return items.sort((left, right) => {
      const leftOrder = orderMap.get(left.key);
      const rightOrder = orderMap.get(right.key);
      if (leftOrder !== undefined || rightOrder !== undefined) return (leftOrder ?? 999) - (rightOrder ?? 999);
      return (right.income + right.expense) - (left.income + left.expense);
    });
  }

  return items.sort((left, right) => {
    if ((right.income + right.expense) !== (left.income + left.expense)) {
      return (right.income + right.expense) - (left.income + left.expense);
    }
    return left.label.localeCompare(right.label, "pt-BR");
  });
}

function sortFinanceRows(left: FinanceReportRow, right: FinanceReportRow) {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  const leftId = toSafeInteger(left.id);
  const rightId = toSafeInteger(right.id);
  if (leftId !== undefined && rightId !== undefined && leftId !== rightId) return rightId - leftId;
  return right.id.localeCompare(left.id, "pt-BR");
}

function buildFinanceSeries(rows: FinanceReportRow[], groupBy: ReportGroupBy): ReportSeriesPoint[] {
  const map = new Map<string, ReportSeriesPoint>();
  rows.forEach((row) => {
    const bucket = resolveBucket(row.date, groupBy);
    const current = map.get(bucket) ?? {
      bucket,
      label: formatBucketLabel(bucket, groupBy),
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    };
    if (row.direction === "income") {
      current.income = round2(current.income + row.amount);
    } else {
      current.expense = round2(current.expense + row.amount);
    }
    current.net = round2(current.income - current.expense);
    current.count += 1;
    map.set(bucket, current);
  });

  return [...map.values()].sort((left, right) => left.bucket.localeCompare(right.bucket, "pt-BR"));
}

export function buildFinanceReport(sourceRows: FinanceReportSourceRow[], filters: FinanceReportFilters): FinanceReportResult {
  const normalizedRows = sourceRows.map(normalizeFinanceRow);
  const scopedRows = normalizedRows.filter((row) => financeRowMatchesBaseFilters(row, filters, {
    ignoreDate: true,
    ignoreStatus: true,
  }));
  const completedRows = scopedRows.filter((row) => row.status === "completed");
  const openRows = scopedRows.filter((row) => row.status === "pending" || row.status === "scheduled");
  const openingRows = completedRows.filter((row) => row.date < filters.startDate);
  const periodCompletedRows = completedRows.filter((row) => isIsoWithinRange(row.date, filters.startDate, filters.endDate));
  const dueOpenRows = openRows.filter((row) => row.date <= filters.endDate);

  const openingBalance = filters.status === "open"
    ? 0
    : round2(openingRows.reduce((sum, row) => sum + buildSignedAmount(row.amount, row.direction), 0));
  const cashIn = filters.status === "open"
    ? 0
    : round2(periodCompletedRows.filter((row) => row.direction === "income").reduce((sum, row) => sum + row.amount, 0));
  const cashOut = filters.status === "open"
    ? 0
    : round2(periodCompletedRows.filter((row) => row.direction === "expense").reduce((sum, row) => sum + row.amount, 0));
  const closingBalance = round2(openingBalance + cashIn - cashOut);
  const openToReceive = filters.status === "completed"
    ? 0
    : round2(dueOpenRows.filter((row) => row.direction === "income").reduce((sum, row) => sum + row.amount, 0));
  const openToPay = filters.status === "completed"
    ? 0
    : round2(dueOpenRows.filter((row) => row.direction === "expense").reduce((sum, row) => sum + row.amount, 0));
  const projectedBalance = round2(closingBalance + openToReceive - openToPay);

  const allRows = normalizedRows.filter((row) => financeRowMatchesBaseFilters(row, filters)).sort(sortFinanceRows);
  const totalItems = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
  const page = Math.min(Math.max(filters.page, 1), totalPages);
  const startIndex = (page - 1) * filters.pageSize;

  return {
    filters: { ...filters, page },
    summary: {
      openingBalance,
      cashIn,
      cashOut,
      closingBalance,
      openToReceive,
      openToPay,
      projectedBalance,
    },
    series: buildFinanceSeries(allRows, filters.groupBy),
    breakdowns: {
      byOrigin: buildBreakdown(
        allRows,
        (row) => row.origin,
        (row) => row.origin,
        ["manual", "installment_payment", "loan_disbursement", "cash_adjustment"],
      ),
      byCategory: buildBreakdown(
        allRows,
        (row) => row.categoryId ? `category:${row.categoryId}` : `category-name:${row.categoryName}`,
        (row) => row.categoryName,
      ),
    },
    rows: allRows.slice(startIndex, startIndex + filters.pageSize),
    allRows,
    pagination: {
      page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages,
    },
  };
}

function splitAmount(totalAmount: number, parts: number) {
  const safeParts = Math.max(1, Math.trunc(parts || 0));
  const totalCents = Math.round(round2(totalAmount) * 100);
  const baseCents = Math.floor(totalCents / safeParts);
  const remainder = totalCents - (baseCents * safeParts);

  return Array.from({ length: safeParts }, (_item, index) => (
    round2((baseCents + (index < remainder ? 1 : 0)) / 100)
  ));
}

function normalizeInstallmentSplit(
  totalAmount: number,
  split: { principalAmount: number; interestAmount: number },
) {
  const safeTotal = round2(Math.max(totalAmount, 0));
  if (safeTotal <= 0) {
    return { principalAmount: 0, interestAmount: 0 };
  }

  let principalAmount = round2(Math.max(split.principalAmount, 0));
  let interestAmount = round2(Math.max(split.interestAmount, 0));
  const splitTotal = round2(principalAmount + interestAmount);

  if (Math.abs(splitTotal - safeTotal) <= 0.01) {
    return { principalAmount, interestAmount };
  }

  if (splitTotal <= 0) {
    return { principalAmount: safeTotal, interestAmount: 0 };
  }

  principalAmount = round2((safeTotal * principalAmount) / splitTotal);
  interestAmount = round2(safeTotal - principalAmount);
  return { principalAmount, interestAmount };
}

function resolveInstallmentDueSplit(
  installment: LoanReportInstallmentInput,
  loan: LoanReportLoanInput,
) {
  const installmentAmount = round2(toSafeNumber(installment.amount));
  const principalAmount = installment.principalAmount !== undefined && installment.principalAmount !== null
    ? round2(toSafeNumber(installment.principalAmount))
    : null;
  const interestAmount = installment.interestAmount !== undefined && installment.interestAmount !== null
    ? round2(toSafeNumber(installment.interestAmount))
    : null;

  if (principalAmount !== null || interestAmount !== null) {
    const resolvedPrincipal = principalAmount !== null
      ? principalAmount
      : Math.max(installmentAmount - (interestAmount ?? 0), 0);
    const resolvedInterest = interestAmount !== null
      ? interestAmount
      : Math.max(installmentAmount - resolvedPrincipal, 0);
    return normalizeInstallmentSplit(installmentAmount, {
      principalAmount: resolvedPrincipal,
      interestAmount: resolvedInterest,
    });
  }

  const installmentsCount = Math.max(1, Math.trunc(toSafeNumber(loan.installmentsCount) || 1));
  const principalTotal = round2(toSafeNumber(loan.principalAmount));
  const interestTotal = round2(Math.max(toSafeNumber(loan.totalAmount) - principalTotal, 0));
  const principalValues = splitAmount(principalTotal, installmentsCount);
  const interestValues = splitAmount(interestTotal, installmentsCount);
  const installmentIndex = Math.max(0, Math.min(installmentsCount - 1, Math.trunc(toSafeNumber(installment.installmentNumber)) - 1));

  return normalizeInstallmentSplit(installmentAmount, {
    principalAmount: principalValues[installmentIndex] ?? 0,
    interestAmount: interestValues[installmentIndex] ?? 0,
  });
}

function resolveInstallmentPaymentSplit(
  installment: LoanReportInstallmentInput,
  loan: LoanReportLoanInput,
  paymentAmount: number,
) {
  return normalizeInstallmentSplit(round2(paymentAmount), resolveInstallmentDueSplit(installment, loan));
}

function loanStatusMatchesFilter(status: LoanReportStatus, filter: LoanReportStatusFilter) {
  if (filter === "all") return true;
  return status === filter;
}

function buildLoansSeries(
  loanEvents: Array<{ date: string; loaned: number }>,
  paymentEvents: Array<{ date: string; received: number; profit: number }>,
  groupBy: ReportGroupBy,
) {
  const map = new Map<string, LoansReportSeriesPoint>();

  loanEvents.forEach((event) => {
    const bucket = resolveBucket(event.date, groupBy);
    const current = map.get(bucket) ?? {
      bucket,
      label: formatBucketLabel(bucket, groupBy),
      loaned: 0,
      received: 0,
      profit: 0,
    };
    current.loaned = round2(current.loaned + event.loaned);
    map.set(bucket, current);
  });

  paymentEvents.forEach((event) => {
    const bucket = resolveBucket(event.date, groupBy);
    const current = map.get(bucket) ?? {
      bucket,
      label: formatBucketLabel(bucket, groupBy),
      loaned: 0,
      received: 0,
      profit: 0,
    };
    current.received = round2(current.received + event.received);
    current.profit = round2(current.profit + event.profit);
    map.set(bucket, current);
  });

  return [...map.values()].sort((left, right) => left.bucket.localeCompare(right.bucket, "pt-BR"));
}

export function buildLoansReport(
  loans: LoanReportLoanInput[],
  installments: LoanReportInstallmentInput[],
  payments: LoanReportPaymentInput[],
  filters: LoansReportFilters,
): LoansReportResult {
  const loanMap = new Map(loans.map((loan) => [String(loan.id), {
    ...loan,
    id: String(loan.id),
    principalAmount: round2(toSafeNumber(loan.principalAmount)),
    totalAmount: round2(toSafeNumber(loan.totalAmount)),
    installmentsCount: Math.max(1, Math.trunc(toSafeNumber(loan.installmentsCount) || 1)),
  }]));
  const installmentsByLoan = new Map<string, LoanReportInstallmentInput[]>();
  const installmentMap = new Map<string, LoanReportInstallmentInput>();

  installments.forEach((installment) => {
    const loanId = String(installment.loanId);
    const normalized = {
      ...installment,
      id: String(installment.id),
      loanId,
      installmentNumber: Math.max(1, Math.trunc(toSafeNumber(installment.installmentNumber) || 1)),
      amount: round2(toSafeNumber(installment.amount)),
      principalAmount: installment.principalAmount ?? null,
      interestAmount: installment.interestAmount ?? null,
    };
    installmentMap.set(normalized.id, normalized);
    const current = installmentsByLoan.get(loanId) ?? [];
    current.push(normalized);
    installmentsByLoan.set(loanId, current);
  });

  installmentsByLoan.forEach((loanInstallments) => {
    loanInstallments.sort((left, right) => {
      if (left.installmentNumber !== right.installmentNumber) {
        return left.installmentNumber - right.installmentNumber;
      }
      return left.dueDate.localeCompare(right.dueDate, "pt-BR");
    });
  });

  const paymentsByInstallment = new Map<string, LoanReportPaymentInput[]>();
  const standalonePaymentsByLoan = new Map<string, LoanReportPaymentInput[]>();

  payments.forEach((payment) => {
    const normalized = {
      ...payment,
      id: String(payment.id),
      loanId: String(payment.loanId),
      installmentId: payment.installmentId !== undefined && payment.installmentId !== null && payment.installmentId !== ""
        ? String(payment.installmentId)
        : null,
      amount: round2(toSafeNumber(payment.amount)),
    };

    if (normalized.installmentId) {
      const current = paymentsByInstallment.get(normalized.installmentId) ?? [];
      current.push(normalized);
      paymentsByInstallment.set(normalized.installmentId, current);
      return;
    }

    const current = standalonePaymentsByLoan.get(normalized.loanId) ?? [];
    current.push(normalized);
    standalonePaymentsByLoan.set(normalized.loanId, current);
  });

  paymentsByInstallment.forEach((installmentPayments) => {
    installmentPayments.sort((left, right) => {
      if (left.paymentDate !== right.paymentDate) {
        return left.paymentDate.localeCompare(right.paymentDate, "pt-BR");
      }
      return String(left.id).localeCompare(String(right.id), "pt-BR");
    });
  });

  standalonePaymentsByLoan.forEach((loanPayments) => {
    loanPayments.sort((left, right) => {
      if (left.paymentDate !== right.paymentDate) {
        return left.paymentDate.localeCompare(right.paymentDate, "pt-BR");
      }
      return String(left.id).localeCompare(String(right.id), "pt-BR");
    });
  });

  const snapshots: NormalizedLoanSnapshot[] = loans.map((loanInput) => {
    const loanId = String(loanInput.id);
    const loan = loanMap.get(loanId)!;
    const loanInstallments = installmentsByLoan.get(loanId) ?? [];
    const startedByEnd = loan.startDate <= filters.endDate;

    let receivedToEnd = 0;
    let receivedInPeriod = 0;
    let profitToEnd = 0;
    let profitInPeriod = 0;
    let openAtEnd = 0;
    let overdueAtEnd = 0;
    let overdueInstallmentsAtEnd = 0;

    loanInstallments.forEach((installment) => {
      const installmentPayments = paymentsByInstallment.get(String(installment.id)) ?? [];
      let paidByEnd = 0;

      installmentPayments.forEach((payment) => {
        if (payment.paymentDate > filters.endDate) return;

        paidByEnd = round2(paidByEnd + payment.amount);
        receivedToEnd = round2(receivedToEnd + payment.amount);

        const paymentSplit = resolveInstallmentPaymentSplit(installment, loan, payment.amount);
        profitToEnd = round2(profitToEnd + paymentSplit.interestAmount);

        if (isIsoWithinRange(payment.paymentDate, filters.startDate, filters.endDate)) {
          receivedInPeriod = round2(receivedInPeriod + payment.amount);
          profitInPeriod = round2(profitInPeriod + paymentSplit.interestAmount);
        }
      });

      if (!startedByEnd) return;

      const outstandingAtEnd = round2(Math.max(installment.amount - paidByEnd, 0));
      if (outstandingAtEnd <= EPSILON) return;

      if (installment.dueDate < filters.endDate) {
        overdueAtEnd = round2(overdueAtEnd + outstandingAtEnd);
        overdueInstallmentsAtEnd += 1;
      }
      openAtEnd = round2(openAtEnd + outstandingAtEnd);
    });

    const standalonePayments = standalonePaymentsByLoan.get(loanId) ?? [];
    standalonePayments.forEach((payment) => {
      if (payment.paymentDate > filters.endDate) return;

      receivedToEnd = round2(receivedToEnd + payment.amount);
      if (isIsoWithinRange(payment.paymentDate, filters.startDate, filters.endDate)) {
        receivedInPeriod = round2(receivedInPeriod + payment.amount);
      }
    });

    let status: LoanReportStatus;
    if (!startedByEnd) {
      status = "PENDENTE";
    } else if (openAtEnd <= EPSILON) {
      status = "QUITADO";
    } else if (overdueAtEnd > EPSILON) {
      status = "ATRASADO";
    } else {
      status = "EM_DIA";
    }

    return {
      loanId,
      clientName: loan.clientName,
      principal: loan.principalAmount,
      total: loan.totalAmount,
      startDate: loan.startDate,
      dueDate: loan.dueDate,
      status,
      receivedToEnd,
      receivedInPeriod,
      profitToEnd,
      profitInPeriod,
      openAtEnd,
      overdueAtEnd,
      overdueInstallmentsAtEnd,
      totalOutstandingAtEnd: round2(openAtEnd),
      termDays: diffDays(loan.startDate, loan.dueDate),
    };
  });

  const filteredSnapshots = snapshots.filter((snapshot) => loanStatusMatchesFilter(snapshot.status, filters.loanStatus));
  const selectedLoanIds = new Set(filteredSnapshots.map((snapshot) => snapshot.loanId));

  const loanEvents = filteredSnapshots
    .filter((snapshot) => isIsoWithinRange(snapshot.startDate, filters.startDate, filters.endDate))
    .map((snapshot) => ({
      date: snapshot.startDate,
      loaned: snapshot.principal,
    }));

  const paymentEvents: Array<{ date: string; received: number; profit: number }> = [];
  payments.forEach((paymentInput) => {
    const payment = {
      ...paymentInput,
      loanId: String(paymentInput.loanId),
      installmentId: paymentInput.installmentId !== undefined && paymentInput.installmentId !== null && paymentInput.installmentId !== ""
        ? String(paymentInput.installmentId)
        : null,
      amount: round2(toSafeNumber(paymentInput.amount)),
    };

    if (!selectedLoanIds.has(payment.loanId) || !isIsoWithinRange(payment.paymentDate, filters.startDate, filters.endDate)) {
      return;
    }

    let profit = 0;
    if (payment.installmentId) {
      const installment = installmentMap.get(payment.installmentId);
      const loan = loanMap.get(payment.loanId);
      if (installment && loan) {
        profit = resolveInstallmentPaymentSplit(installment, loan, payment.amount).interestAmount;
      }
    }

    paymentEvents.push({
      date: payment.paymentDate,
      received: payment.amount,
      profit,
    });
  });

  const totalLoanedToEnd = round2(filteredSnapshots
    .filter((snapshot) => snapshot.startDate <= filters.endDate)
    .reduce((sum, snapshot) => sum + snapshot.principal, 0));
  const profitToEnd = round2(filteredSnapshots.reduce((sum, snapshot) => sum + snapshot.profitToEnd, 0));
  const openPortfolioAtEnd = round2(filteredSnapshots.reduce((sum, snapshot) => sum + snapshot.totalOutstandingAtEnd, 0));
  const overduePortfolioAtEnd = round2(filteredSnapshots.reduce((sum, snapshot) => sum + snapshot.overdueAtEnd, 0));
  const totalContracts = filteredSnapshots.length;
  const overdueInstallmentsAtEnd = filteredSnapshots.reduce((sum, snapshot) => sum + snapshot.overdueInstallmentsAtEnd, 0);
  const avgTicket = totalContracts > 0
    ? round2(filteredSnapshots.reduce((sum, snapshot) => sum + snapshot.principal, 0) / totalContracts)
    : 0;
  const avgTermDays = totalContracts > 0
    ? round2(filteredSnapshots.reduce((sum, snapshot) => sum + snapshot.termDays, 0) / totalContracts)
    : 0;

  const statusOrder: LoanReportStatus[] = ["PENDENTE", "EM_DIA", "ATRASADO", "QUITADO"];
  const portfolioStatusItems = statusOrder.map((status) => {
    const matches = filteredSnapshots.filter((snapshot) => snapshot.status === status);
    return {
      status,
      label: formatStatusLabel(status),
      count: matches.length,
      amount: round2(matches.reduce((sum, snapshot) => sum + snapshot.totalOutstandingAtEnd, 0)),
    };
  });

  const exportRows = [...filteredSnapshots]
    .sort((left, right) => {
      const clientCompare = left.clientName.localeCompare(right.clientName, "pt-BR");
      if (clientCompare !== 0) return clientCompare;
      return left.loanId.localeCompare(right.loanId, "pt-BR");
    })
    .map((snapshot) => ({
      loanId: snapshot.loanId,
      clientName: snapshot.clientName,
      status: snapshot.status,
      principal: snapshot.principal,
      total: snapshot.total,
      received: snapshot.receivedToEnd,
      open: snapshot.totalOutstandingAtEnd,
      overdue: snapshot.overdueAtEnd,
      startDate: snapshot.startDate,
      dueDate: snapshot.dueDate,
    }));

  return {
    filters,
    summary: {
      loanedInPeriod: round2(loanEvents.reduce((sum, event) => sum + event.loaned, 0)),
      receivedInPeriod: round2(paymentEvents.reduce((sum, event) => sum + event.received, 0)),
      profitInPeriod: round2(paymentEvents.reduce((sum, event) => sum + event.profit, 0)),
      openPortfolioAtEnd,
      overduePortfolioAtEnd,
      delinquencyRateAtEnd: openPortfolioAtEnd > EPSILON
        ? round2((overduePortfolioAtEnd / openPortfolioAtEnd) * 100)
        : 0,
      roiAccumulatedToEnd: totalLoanedToEnd > EPSILON
        ? round2((profitToEnd / totalLoanedToEnd) * 100)
        : 0,
      totalContracts,
      overdueInstallmentsAtEnd,
    },
    series: buildLoansSeries(loanEvents, paymentEvents, filters.groupBy),
    portfolioStatus: {
      items: portfolioStatusItems,
      avgTicket,
      avgTermDays,
      totalContracts,
    },
    exportRows,
  };
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toCsvLine(values: Array<string | number | null | undefined>) {
  return values
    .map((value) => {
      if (value === null || value === undefined) return "\"\"";
      return escapeCsvCell(String(value));
    })
    .join(",");
}

export function buildCsvContent(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  return `\uFEFF${[toCsvLine(headers), ...rows.map((row) => toCsvLine(row))].join("\n")}`;
}

export function buildFinanceReportCsv(rows: FinanceReportRow[]) {
  return buildCsvContent(
    [
      "id",
      "data",
      "descricao",
      "valor",
      "direcao",
      "status",
      "origem",
      "categoria_id",
      "categoria",
      "automatico",
      "emprestimo_id",
      "parcela_id",
    ],
    rows.map((row) => [
      row.id,
      row.date,
      row.description,
      row.amount.toFixed(2),
      row.direction,
      row.status,
      row.origin,
      row.categoryId,
      row.categoryName,
      row.isAutomatic ? "true" : "false",
      row.linkedLoanId,
      row.linkedInstallmentId,
    ]),
  );
}

export function buildLoansReportCsv(rows: LoansReportExportRow[]) {
  return buildCsvContent(
    [
      "emprestimo_id",
      "cliente",
      "status",
      "principal",
      "total",
      "recebido",
      "aberto",
      "atrasado",
      "inicio",
      "vencimento_final",
    ],
    rows.map((row) => [
      row.loanId,
      row.clientName,
      row.status,
      row.principal.toFixed(2),
      row.total.toFixed(2),
      row.received.toFixed(2),
      row.open.toFixed(2),
      row.overdue.toFixed(2),
      row.startDate,
      row.dueDate,
    ]),
  );
}
