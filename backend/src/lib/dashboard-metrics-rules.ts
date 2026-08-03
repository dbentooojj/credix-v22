export type DashboardTransactionType = "revenue" | "expense" | "adjustment" | "loan" | "repayment";

export type DashboardTransactionImpact = {
  isAdjustment: boolean;
  affectsRevenue: boolean;
  affectsProfit: boolean;
  affectsBalance: boolean;
};

export type DashboardTransaction = {
  type: DashboardTransactionType;
  amountSigned: number;
};

export type DashboardLedgerTransaction = DashboardTransaction & {
  monthKey: string;
};

export type DashboardLedgerAccumulator = {
  cashBalance: number;
  cashAdjustmentNet: number;
  totalReceived: number;
  receivedThisMonth: number;
  profitTotal: number;
  profitThisMonth: number;
};

export type DashboardMetricsBase = {
  cashBalanceBase: number;
  receivedThisMonth: number;
  profitThisMonth: number;
  profitTotal: number;
  roiRate: number;
  totalOverdue: number;
  totalLoaned: number;
};

export type DashboardMetricsWithAdjustments = DashboardMetricsBase & {
  cashAdjustmentNet: number;
  cashBalance: number;
};

export type PortfolioRates = {
  roiRate: number;
  delinquencyRate: number;
};

const DASHBOARD_TRANSACTION_IMPACT_MAP: Record<DashboardTransactionType, DashboardTransactionImpact> = {
  revenue: {
    isAdjustment: false,
    affectsRevenue: true,
    affectsProfit: true,
    affectsBalance: true,
  },
  expense: {
    isAdjustment: false,
    affectsRevenue: false,
    affectsProfit: true,
    affectsBalance: true,
  },
  adjustment: {
    isAdjustment: true,
    affectsRevenue: false,
    affectsProfit: false,
    affectsBalance: true,
  },
  loan: {
    isAdjustment: false,
    affectsRevenue: false,
    affectsProfit: false,
    affectsBalance: true,
  },
  repayment: {
    isAdjustment: false,
    affectsRevenue: true,
    affectsProfit: false,
    affectsBalance: true,
  },
};

export function getDashboardTransactionImpact(type: DashboardTransactionType): DashboardTransactionImpact {
  return DASHBOARD_TRANSACTION_IMPACT_MAP[type];
}

export function computeOutstandingAmount(installmentAmount: number, paidAmount: number): number {
  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) return 0;
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) return installmentAmount;
  return Math.max(installmentAmount - paidAmount, 0);
}

export function computePortfolioRates(input: {
  realizedProfit: number;
  totalOriginated: number;
  overdueOutstanding: number;
  totalOutstanding: number;
}): PortfolioRates {
  const realizedProfit = Number.isFinite(input.realizedProfit) ? input.realizedProfit : 0;
  const totalOriginated = Number.isFinite(input.totalOriginated) ? input.totalOriginated : 0;
  const overdueOutstanding = Number.isFinite(input.overdueOutstanding) ? input.overdueOutstanding : 0;
  const totalOutstanding = Number.isFinite(input.totalOutstanding) ? input.totalOutstanding : 0;

  return {
    roiRate: totalOriginated > 0 ? (realizedProfit / totalOriginated) * 100 : 0,
    delinquencyRate: totalOutstanding > 0
      ? (Math.max(overdueOutstanding, 0) / totalOutstanding) * 100
      : 0,
  };
}

export function createDashboardLedgerAccumulator(): DashboardLedgerAccumulator {
  return {
    cashBalance: 0,
    cashAdjustmentNet: 0,
    totalReceived: 0,
    receivedThisMonth: 0,
    profitTotal: 0,
    profitThisMonth: 0,
  };
}

export function applyDashboardLedgerTransaction(
  accumulator: DashboardLedgerAccumulator,
  transaction: DashboardLedgerTransaction,
  currentMonthKey: string,
): DashboardLedgerAccumulator {
  if (!Number.isFinite(transaction.amountSigned)) {
    return accumulator;
  }

  const impact = getDashboardTransactionImpact(transaction.type);

  if (impact.affectsBalance) {
    accumulator.cashBalance += transaction.amountSigned;
  }

  if (impact.isAdjustment) {
    accumulator.cashAdjustmentNet += transaction.amountSigned;
  }

  if (impact.affectsRevenue) {
    accumulator.totalReceived += transaction.amountSigned;
    if (transaction.monthKey === currentMonthKey) {
      accumulator.receivedThisMonth += transaction.amountSigned;
    }
  }

  if (impact.affectsProfit) {
    accumulator.profitTotal += transaction.amountSigned;
    if (transaction.monthKey === currentMonthKey) {
      accumulator.profitThisMonth += transaction.amountSigned;
    }
  }

  return accumulator;
}

export function applyDashboardAdjustments(
  baseMetrics: DashboardMetricsBase,
  transactions: DashboardTransaction[],
): DashboardMetricsWithAdjustments {
  let cashAdjustmentNet = 0;
  let balanceDelta = 0;

  transactions.forEach((transaction) => {
    const { isAdjustment, affectsBalance } = getDashboardTransactionImpact(transaction.type);
    if (!Number.isFinite(transaction.amountSigned)) return;

    if (isAdjustment) {
      cashAdjustmentNet += transaction.amountSigned;
      if (affectsBalance) {
        balanceDelta += transaction.amountSigned;
      }
    }
  });

  return {
    ...baseMetrics,
    cashAdjustmentNet,
    cashBalance: baseMetrics.cashBalanceBase + balanceDelta,
  };
}
