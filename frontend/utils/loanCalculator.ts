const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_AUTO_INSTALLMENTS = 96;
const MAX_INSTALLMENT_TOLERANCE = 1;

export type LoanInterestType = "composto" | "simples" | "fixo";

export type LoanCalculatorInput = {
  principal: unknown;
  monthlyRate: unknown;
  fixedAddition?: unknown;
  installments: unknown;
  maxInstallment?: unknown;
  useMaxInstallment?: boolean;
  interestType: LoanInterestType;
  startDate: unknown;
  firstDueDate: unknown;
};

export type LoanInstallmentPlanRow = {
  installmentNumber: number;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  dueDate: string;
  status: "Atrasado" | "Pendente";
  paymentDate: null;
  balance?: number;
  daysInterval?: number;
};

export type LoanCalculatorOutput = {
  values: {
    principal: number;
    monthlyRate: number;
    fixedAddition: number;
    installments: number;
    maxInstallment: number;
    useMaxInstallment: boolean;
    interestType: LoanInterestType;
    startDate: string;
    firstDueDate: string;
  };
  calcResult: {
    totalAmount: number;
    installmentAmount: number;
    totalInterest: number;
  };
  dueDates: string[];
  plan: LoanInstallmentPlanRow[];
  installmentsLabel: string;
  rateLabel: string;
  rateValue: string;
  modeLabel: string;
  fromMaxInstallment: boolean;
  autoInstallmentPending: boolean;
  autoInstallmentError: string | null;
};

type LoanResolvedValues = {
  principal: number;
  monthlyRate: number;
  fixedAddition: number;
  installments: number;
  maxInstallment: number;
  useMaxInstallment: boolean;
  interestType: LoanInterestType;
  startDate: string;
  firstDueDate: string;
};

type LoanValuesResolution = {
  values: LoanResolvedValues;
  fromMaxInstallment: boolean;
  pending: boolean;
  error: string | null;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: unknown): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function ceil2(value: unknown): number {
  return Math.ceil((toNumber(value) - Number.EPSILON) * 100) / 100;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalIsoDate(value = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function normalizeIsoDateOnly(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  const raw = String(value).trim();
  if (!raw) return "";

  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (directMatch) {
    const year = Number(directMatch[1]);
    const month = Number(directMatch[2]);
    const day = Number(directMatch[3]);
    const utcMs = Date.UTC(year, month - 1, day);
    const parsed = new Date(utcMs);
    const isValid = parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
    return isValid ? `${year}-${pad2(month)}-${pad2(day)}` : "";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

function isoDateToUtcMillis(value: unknown): number {
  const iso = normalizeIsoDateOnly(value);
  if (!iso) return Number.NaN;
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return Date.UTC(year, month - 1, day);
}

function diffDaysDateOnly(fromDate: unknown, toDate: unknown): number {
  const startMs = isoDateToUtcMillis(fromDate);
  const endMs = isoDateToUtcMillis(toDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.NaN;
  return Math.round((endMs - startMs) / MS_PER_DAY);
}

function addMonthsIsoDate(baseIsoDate: unknown, count: unknown): string {
  const safeIso = normalizeIsoDateOnly(baseIsoDate);
  if (!safeIso) return "";

  const [year, month, day] = safeIso.split("-").map((part) => Number(part));
  const totalMonths = (year * 12) + (month - 1) + Math.trunc(toNumber(count));
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${pad2(targetMonth)}-${pad2(targetDay)}`;
}

function sanitizeMoney(value: unknown): number {
  const amount = round2(value);
  return Math.abs(amount) < 0.005 ? 0 : amount;
}

function isDateBeforeDateOnly(dateIso: unknown, referenceIso: unknown): boolean {
  const diff = diffDaysDateOnly(dateIso, referenceIso);
  return Number.isFinite(diff) ? diff > 0 : false;
}

function splitAmount(total: number, parts: number): number[] {
  const safeParts = Math.max(1, Math.trunc(toNumber(parts)));
  const cents = Math.round(round2(total) * 100);
  const base = Math.floor(cents / safeParts);
  const remainder = cents - (base * safeParts);

  return Array.from({ length: safeParts }, (_item, index) => {
    const current = base + (index === safeParts - 1 ? remainder : 0);
    return round2(current / 100);
  });
}

function generateDueDates(firstDueDate: string, installments: number): string[] {
  const safeFirstDueDate = normalizeIsoDateOnly(firstDueDate);
  const total = Math.max(0, Math.trunc(toNumber(installments)));
  if (!safeFirstDueDate || total <= 0) return [];

  return Array.from({ length: total }, (_item, index) => addMonthsIsoDate(safeFirstDueDate, index));
}

function resolveDueDates(firstDueDate: string, installments: number): string[] {
  return generateDueDates(firstDueDate, installments);
}

function effectiveFactor(days: unknown, dailyRate: unknown): number {
  const safeDays = Math.max(0, Math.trunc(toNumber(days)));
  const safeDailyRate = toNumber(dailyRate);
  return Math.pow(1 + safeDailyRate, safeDays);
}

function simulateEndingBalance(
  payment: unknown,
  principal: number,
  dailyRate: number,
  startDateIso: string,
  dueDates: string[],
): number {
  if (!startDateIso || dueDates.length === 0) return Number.NaN;

  const paymentAmount = toNumber(payment);
  let remainingBalance = toNumber(principal);
  let previousDate = startDateIso;

  for (let index = 0; index < dueDates.length; index += 1) {
    const dueDateIso = normalizeIsoDateOnly(dueDates[index]);
    if (!dueDateIso) return Number.NaN;

    const days = diffDaysDateOnly(previousDate, dueDateIso);
    if (!Number.isFinite(days) || days < 0) return Number.NaN;

    remainingBalance = (remainingBalance * effectiveFactor(days, dailyRate)) - paymentAmount;
    previousDate = dueDateIso;
  }

  return remainingBalance;
}

function solvePaymentBinarySearch(
  principal: number,
  dailyRate: number,
  startDateIso: string,
  dueDates: string[],
  maxIterations = 60,
): number {
  if (!Number.isFinite(principal) || principal <= 0 || dueDates.length === 0) return 0;

  let low = 0;
  let high = Math.max(principal * 10, 1);
  let balanceAtHigh = simulateEndingBalance(high, principal, dailyRate, startDateIso, dueDates);

  let guard = 0;
  while (Number.isFinite(balanceAtHigh) && balanceAtHigh > 0 && guard < 60) {
    high *= 2;
    balanceAtHigh = simulateEndingBalance(high, principal, dailyRate, startDateIso, dueDates);
    guard += 1;
  }

  if (!Number.isFinite(balanceAtHigh)) return Number.NaN;

  for (let iteration = 0; iteration < Math.max(1, Math.trunc(toNumber(maxIterations))); iteration += 1) {
    const mid = (low + high) / 2;
    const balance = simulateEndingBalance(mid, principal, dailyRate, startDateIso, dueDates);
    if (!Number.isFinite(balance)) return Number.NaN;

    if (balance > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round2(high);
}

type CompoundScheduleRow = {
  data: string;
  dias: number;
  pagamento: number;
  jurosPeriodo: number;
  principalPeriodo: number;
  saldo: number;
};

function buildSchedule(
  principal: number,
  dailyRate: number,
  startDateIso: string,
  dueDates: string[],
  basePayment: number,
): CompoundScheduleRow[] {
  const normalizedDueDates = dueDates
    .map((date) => normalizeIsoDateOnly(date))
    .filter(Boolean);
  if (!startDateIso || normalizedDueDates.length === 0) return [];

  const payment = Number.isFinite(basePayment) && basePayment > 0
    ? round2(basePayment)
    : solvePaymentBinarySearch(principal, dailyRate, startDateIso, normalizedDueDates);
  if (!Number.isFinite(payment) || payment <= 0) return [];

  let remainingBalance = round2(principal);
  let previousDate = startDateIso;
  const schedule: CompoundScheduleRow[] = [];

  for (let index = 0; index < normalizedDueDates.length; index += 1) {
    const dueDateIso = normalizedDueDates[index];
    const days = diffDaysDateOnly(previousDate, dueDateIso);
    const factor = effectiveFactor(days, dailyRate);
    const balanceBeforeInterest = remainingBalance;
    const balanceAfterInterest = balanceBeforeInterest * factor;
    const periodInterest = balanceAfterInterest - balanceBeforeInterest;

    let installmentPayment = payment;
    let balanceAfterPayment = balanceAfterInterest - installmentPayment;

    if (index === normalizedDueDates.length - 1) {
      installmentPayment = round2(balanceAfterInterest);
      balanceAfterPayment = 0;
    }

    const interestRounded = sanitizeMoney(periodInterest);
    const principalPeriod = sanitizeMoney(installmentPayment - interestRounded);
    const balanceRounded = sanitizeMoney(balanceAfterPayment);

    schedule.push({
      data: dueDateIso,
      dias: days,
      pagamento: round2(installmentPayment),
      jurosPeriodo: interestRounded,
      principalPeriodo: principalPeriod,
      saldo: balanceRounded,
    });

    remainingBalance = balanceRounded;
    previousDate = dueDateIso;
  }

  if (schedule.length > 0) {
    schedule[schedule.length - 1].saldo = 0;
  }

  return schedule;
}

function calculateSimpleLoanValues(principal: number, monthlyRate: number, installments: number) {
  const p = round2(principal);
  const r = toNumber(monthlyRate) / 100;
  const n = Math.max(1, Math.trunc(toNumber(installments)));

  if (p <= 0 || n <= 0 || r < 0) return null;

  const totalInterest = round2(p * r * n);
  const totalAmount = round2(p + totalInterest);
  const installmentAmount = round2(totalAmount / n);
  return { totalAmount, installmentAmount, totalInterest };
}

function buildInstallmentStatus(dueDateIso: string): "Atrasado" | "Pendente" {
  return isDateBeforeDateOnly(dueDateIso, toLocalIsoDate(new Date())) ? "Atrasado" : "Pendente";
}

function buildSimpleInstallmentPlan(
  principal: number,
  totalInterest: number,
  installments: number,
  dueDates: string[],
): LoanInstallmentPlanRow[] {
  const n = Math.max(1, Math.trunc(toNumber(installments)));
  const principalParts = splitAmount(principal, n);
  const interestParts = splitAmount(totalInterest, n);

  return Array.from({ length: n }, (_item, index) => {
    const dueDate = dueDates[index] || "";
    const amount = round2(principalParts[index] + interestParts[index]);
    return {
      installmentNumber: index + 1,
      amount,
      principalAmount: principalParts[index],
      interestAmount: interestParts[index],
      dueDate,
      status: buildInstallmentStatus(dueDate),
      paymentDate: null,
    };
  });
}

function buildFixedInstallmentPlan(
  principal: number,
  fixedAddition: number,
  installments: number,
  dueDates: string[],
): LoanInstallmentPlanRow[] {
  const n = Math.max(1, Math.trunc(toNumber(installments)));
  const totalAmount = round2(principal + fixedAddition);
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - (baseCents * n);
  const principalParts = splitAmount(principal, n);
  const fixedParts = splitAmount(fixedAddition, n);

  const installmentCents = Array.from({ length: n }, (_item, index) => (
    baseCents + (index === n - 1 ? remainderCents : 0)
  ));

  return installmentCents.map((amountCents, index) => {
    const dueDate = dueDates[index] || "";
    return {
      installmentNumber: index + 1,
      amount: round2(amountCents / 100),
      principalAmount: principalParts[index],
      interestAmount: fixedParts[index],
      dueDate,
      status: buildInstallmentStatus(dueDate),
      paymentDate: null,
    };
  });
}

function buildZeroInterestInstallmentPlan(
  principal: number,
  installments: number,
  dueDates: string[],
): LoanInstallmentPlanRow[] {
  const n = Math.max(1, Math.trunc(toNumber(installments)));
  const principalParts = splitAmount(principal, n);

  return Array.from({ length: n }, (_item, index) => {
    const dueDate = dueDates[index] || "";
    const amount = round2(principalParts[index]);
    return {
      installmentNumber: index + 1,
      amount,
      principalAmount: principalParts[index],
      interestAmount: 0,
      dueDate,
      status: buildInstallmentStatus(dueDate),
      paymentDate: null,
    };
  });
}

function calculateCompoundLoanByPeriods(
  principal: number,
  monthlyRate: number,
  installments: number,
  startDate: string,
  dueDates: string[],
) {
  const startDateIso = normalizeIsoDateOnly(startDate);
  const normalizedDueDates = dueDates
    .map((date) => normalizeIsoDateOnly(date))
    .filter(Boolean);

  if (!startDateIso || normalizedDueDates.length === 0 || normalizedDueDates.some((date) => !date)) {
    return null;
  }

  let previousDateIso = startDateIso;
  for (let index = 0; index < normalizedDueDates.length; index += 1) {
    const days = diffDaysDateOnly(previousDateIso, normalizedDueDates[index]);
    if (!Number.isFinite(days) || days <= 0) return null;
    previousDateIso = normalizedDueDates[index];
  }

  const dailyRate = (toNumber(monthlyRate) / 100) / 30;
  const payment = solvePaymentBinarySearch(principal, dailyRate, startDateIso, normalizedDueDates);
  if (!Number.isFinite(payment) || payment <= 0) return null;

  const schedule = buildSchedule(principal, dailyRate, startDateIso, normalizedDueDates, payment);
  if (!schedule.length) return null;

  const plan: LoanInstallmentPlanRow[] = schedule.map((row, index) => ({
    installmentNumber: index + 1,
    amount: round2(row.pagamento),
    principalAmount: round2(row.principalPeriodo),
    interestAmount: round2(row.jurosPeriodo),
    dueDate: row.data,
    status: buildInstallmentStatus(row.data),
    paymentDate: null,
    balance: round2(row.saldo),
    daysInterval: row.dias,
  }));

  const totalAmount = round2(plan.reduce((sum, row) => sum + toNumber(row.amount), 0));
  const totalInterest = round2(totalAmount - toNumber(principal));
  const safeInstallments = Math.max(1, Math.trunc(toNumber(installments)));

  return {
    calcResult: {
      totalAmount,
      installmentAmount: payment,
      totalInterest,
    },
    installments: safeInstallments,
    plan,
  };
}

function getPlanPeakInstallmentAmount(plan: LoanInstallmentPlanRow[]): number {
  if (!Array.isArray(plan) || plan.length === 0) return 0;
  return round2(plan.reduce((maxValue, row) => {
    const amount = toNumber(row?.amount);
    return amount > maxValue ? amount : maxValue;
  }, 0));
}

function evaluateInstallmentByCount(values: LoanResolvedValues, installmentsCount: number) {
  const installments = Math.max(1, Math.trunc(toNumber(installmentsCount)));

  if (values.interestType === "fixo") {
    const totalAmount = round2(values.principal + values.fixedAddition);
    const totalCents = Math.round(totalAmount * 100);
    const baseCents = Math.floor(totalCents / installments);
    const remainderCents = totalCents - (baseCents * installments);
    const peakInstallment = round2((baseCents + remainderCents) / 100);
    return { installmentAmount: peakInstallment, installments };
  }

  if (values.interestType === "simples") {
    const calcResult = calculateSimpleLoanValues(values.principal, values.monthlyRate, installments);
    if (!calcResult) return null;
    const dueDates = resolveDueDates(values.firstDueDate, installments);
    const plan = buildSimpleInstallmentPlan(values.principal, calcResult.totalInterest, installments, dueDates);
    return { installmentAmount: getPlanPeakInstallmentAmount(plan), installments };
  }

  const dueDates = resolveDueDates(values.firstDueDate, installments);
  const compound = calculateCompoundLoanByPeriods(
    values.principal,
    values.monthlyRate,
    installments,
    values.startDate,
    dueDates,
  );
  if (!compound?.calcResult || !Array.isArray(compound.plan) || compound.plan.length === 0) {
    return null;
  }

  return { installmentAmount: getPlanPeakInstallmentAmount(compound.plan), installments };
}

function findInstallmentsByMaxInstallment(values: LoanResolvedValues) {
  const maxInstallment = round2(values.maxInstallment);
  const tolerance = Math.max(0, round2(MAX_INSTALLMENT_TOLERANCE));

  if (maxInstallment <= 0) {
    return {
      installments: Math.max(0, Math.trunc(toNumber(values.installments))),
      fromMaxInstallment: false,
      matchedInstallment: 0,
      tolerance,
    };
  }

  for (let installments = 1; installments <= MAX_AUTO_INSTALLMENTS; installments += 1) {
    const evaluated = evaluateInstallmentByCount(values, installments);
    const installmentAmount = ceil2(evaluated?.installmentAmount ?? 0);
    if (!evaluated || installmentAmount <= 0) continue;
    if (installmentAmount <= (maxInstallment + tolerance + 0.000001)) {
      return {
        installments,
        fromMaxInstallment: true,
        matchedInstallment: installmentAmount,
        tolerance,
      };
    }
  }

  return {
    installments: 0,
    fromMaxInstallment: true,
    matchedInstallment: 0,
    tolerance,
  };
}

function resolveLoanValuesForCalculation(raw: LoanResolvedValues): LoanValuesResolution {
  const values: LoanResolvedValues = {
    ...raw,
    installments: Math.max(0, Math.trunc(toNumber(raw.installments))),
    maxInstallment: round2(raw.maxInstallment),
    useMaxInstallment: Boolean(raw.useMaxInstallment),
  };

  if (!values.useMaxInstallment) {
    return {
      values,
      fromMaxInstallment: false,
      pending: false,
      error: null,
    };
  }

  if (values.maxInstallment <= 0) {
    values.installments = 0;
    return {
      values,
      fromMaxInstallment: true,
      pending: true,
      error: null,
    };
  }

  const hasRequiredBaseData = values.principal > 0
    && Boolean(normalizeIsoDateOnly(values.startDate))
    && Boolean(normalizeIsoDateOnly(values.firstDueDate))
    && (values.interestType === "fixo"
      ? values.fixedAddition >= 0
      : values.monthlyRate > 0);

  if (!hasRequiredBaseData) {
    values.installments = 0;
    return {
      values,
      fromMaxInstallment: true,
      pending: true,
      error: null,
    };
  }

  const resolved = findInstallmentsByMaxInstallment(values);
  if (!resolved.installments) {
    values.installments = 0;
    return {
      values,
      fromMaxInstallment: true,
      pending: false,
      error: `Nao foi possivel encaixar a parcela maxima em ate ${MAX_AUTO_INSTALLMENTS} parcelas.`,
    };
  }

  values.installments = resolved.installments;
  return {
    values,
    fromMaxInstallment: true,
    pending: false,
    error: null,
  };
}

function formatRateValue(interestType: LoanInterestType, monthlyRate: number, fixedAddition: number): string {
  if (interestType === "fixo") {
    return `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(round2(fixedAddition))} de acrescimo`;
  }

  const safeRate = round2(monthlyRate);
  if (interestType === "composto") {
    const dailyRatePercent = round2(safeRate / 30);
    return `${safeRate}% a.m. | ${dailyRatePercent}% a.d.`;
  }
  return `${safeRate}% a.m.`;
}

export function calculateLoanPreview(input: LoanCalculatorInput): LoanCalculatorOutput {
  const interestType: LoanInterestType = input.interestType === "simples"
    ? "simples"
    : input.interestType === "fixo"
      ? "fixo"
      : "composto";

  const resolvedRawValues: LoanResolvedValues = {
    principal: Math.max(0, round2(input.principal)),
    monthlyRate: Math.max(0, round2(input.monthlyRate)),
    fixedAddition: Math.max(0, round2(input.fixedAddition)),
    installments: Math.max(0, Math.trunc(toNumber(input.installments))),
    maxInstallment: Math.max(0, round2(input.maxInstallment)),
    useMaxInstallment: Boolean(input.useMaxInstallment),
    interestType,
    startDate: normalizeIsoDateOnly(input.startDate),
    firstDueDate: normalizeIsoDateOnly(input.firstDueDate),
  };

  const resolution = resolveLoanValuesForCalculation(resolvedRawValues);
  const values = resolution.values;
  const dueDates = resolveDueDates(values.firstDueDate, values.installments);

  const baseTotalAmount = values.principal;
  const baseInstallmentAmount = values.installments > 0 ? round2(baseTotalAmount / values.installments) : 0;
  let calcResult = {
    totalAmount: baseTotalAmount,
    installmentAmount: baseInstallmentAmount,
    totalInterest: round2(baseTotalAmount - values.principal),
  };
  let plan: LoanInstallmentPlanRow[] = values.installments > 0
    ? buildZeroInterestInstallmentPlan(values.principal, values.installments, dueDates)
    : [];

  if (values.principal > 0 && values.installments > 0) {
    if (values.interestType === "fixo") {
      const totalAmount = round2(values.principal + values.fixedAddition);
      plan = buildFixedInstallmentPlan(values.principal, values.fixedAddition, values.installments, dueDates);
      calcResult = {
        totalAmount,
        installmentAmount: round2(totalAmount / values.installments),
        totalInterest: round2(values.fixedAddition),
      };
    } else if (values.interestType === "simples" && values.monthlyRate > 0) {
      const simple = calculateSimpleLoanValues(values.principal, values.monthlyRate, values.installments);
      if (simple) {
        calcResult = simple;
        plan = buildSimpleInstallmentPlan(values.principal, simple.totalInterest, values.installments, dueDates);
      }
    } else if (values.interestType === "composto" && values.monthlyRate > 0) {
      const compound = calculateCompoundLoanByPeriods(
        values.principal,
        values.monthlyRate,
        values.installments,
        values.startDate,
        dueDates,
      );
      if (compound) {
        calcResult = compound.calcResult;
        plan = compound.plan;
      }
    }
  }

  return {
    values,
    calcResult,
    dueDates: plan.map((row) => row.dueDate).filter(Boolean),
    plan,
    installmentsLabel: values.installments > 0 ? `${values.installments}x` : "(a definir)",
    rateLabel: values.interestType === "composto" ? "Composto" : values.interestType === "simples" ? "Simples" : "Fixo",
    rateValue: formatRateValue(values.interestType, values.monthlyRate, values.fixedAddition),
    modeLabel: values.useMaxInstallment ? "Modo: por valor da parcela" : "Modo: parcelas manuais",
    fromMaxInstallment: resolution.fromMaxInstallment,
    autoInstallmentPending: resolution.pending,
    autoInstallmentError: resolution.error,
  };
}
