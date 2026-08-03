import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDashboardAdjustments,
  applyDashboardLedgerTransaction,
  computePortfolioRates,
  computeOutstandingAmount,
  createDashboardLedgerAccumulator,
  getDashboardTransactionImpact,
  type DashboardMetricsBase,
} from "./dashboard-metrics-rules";

function buildBaseMetrics(): DashboardMetricsBase {
  return {
    cashBalanceBase: 10_000,
    receivedThisMonth: 4_800,
    profitThisMonth: 1_250,
    profitTotal: 9_000,
    roiRate: 18,
    totalOverdue: 1_100,
    totalLoaned: 50_000,
  };
}

test("separa transacao de receita e ajuste manual", () => {
  const revenueImpact = getDashboardTransactionImpact("revenue");
  const adjustmentImpact = getDashboardTransactionImpact("adjustment");
  const repaymentImpact = getDashboardTransactionImpact("repayment");

  assert.equal(revenueImpact.isAdjustment, false);
  assert.equal(revenueImpact.affectsRevenue, true);

  assert.equal(adjustmentImpact.isAdjustment, true);
  assert.equal(adjustmentImpact.affectsRevenue, false);
  assert.equal(adjustmentImpact.affectsProfit, false);

  assert.equal(repaymentImpact.isAdjustment, false);
  assert.equal(repaymentImpact.affectsRevenue, true);
  assert.equal(repaymentImpact.affectsProfit, false);
  assert.equal(repaymentImpact.affectsBalance, true);
});

test("ajuste manual afeta apenas saldo", () => {
  const base = buildBaseMetrics();
  const withAdjustment = applyDashboardAdjustments(base, [
    { type: "adjustment", amountSigned: 700 },
  ]);

  assert.equal(withAdjustment.cashBalance, 10_700);
  assert.equal(withAdjustment.cashAdjustmentNet, 700);
});

test("ajuste manual nao altera lucro", () => {
  const base = buildBaseMetrics();
  const withAdjustment = applyDashboardAdjustments(base, [
    { type: "adjustment", amountSigned: -350 },
  ]);

  assert.equal(withAdjustment.profitThisMonth, base.profitThisMonth);
  assert.equal(withAdjustment.profitTotal, base.profitTotal);
});

test("ajuste manual nao altera ROI", () => {
  const base = buildBaseMetrics();
  const withAdjustment = applyDashboardAdjustments(base, [
    { type: "adjustment", amountSigned: 1_000 },
  ]);

  assert.equal(withAdjustment.roiRate, base.roiRate);
  assert.equal(withAdjustment.totalLoaned, base.totalLoaned);
});

test("ajuste manual nao altera receitas do mes", () => {
  const base = buildBaseMetrics();
  const withAdjustment = applyDashboardAdjustments(base, [
    { type: "adjustment", amountSigned: 2_500 },
  ]);

  assert.equal(withAdjustment.receivedThisMonth, base.receivedThisMonth);
});

test("ajuste manual nao altera em atraso", () => {
  const base = buildBaseMetrics();
  const withAdjustment = applyDashboardAdjustments(base, [
    { type: "adjustment", amountSigned: -2_000 },
  ]);

  assert.equal(withAdjustment.totalOverdue, base.totalOverdue);
});

test("aplicador ignora transacao que nao e ajuste manual", () => {
  const base = buildBaseMetrics();
  const result = applyDashboardAdjustments(base, [
    { type: "revenue", amountSigned: 900 },
    { type: "expense", amountSigned: -400 },
  ]);

  assert.equal(result.cashAdjustmentNet, 0);
  assert.equal(result.cashBalance, base.cashBalanceBase);
});

test("repasse de principal aumenta caixa e recebido, mas nao lucro", () => {
  const currentMonthKey = "2026-03";
  const ledger = createDashboardLedgerAccumulator();

  applyDashboardLedgerTransaction(ledger, {
    type: "repayment",
    amountSigned: 400,
    monthKey: currentMonthKey,
  }, currentMonthKey);
  assert.equal(ledger.cashBalance, 400);
  assert.equal(ledger.receivedThisMonth, 400);
  assert.equal(ledger.profitThisMonth, 0);

  applyDashboardLedgerTransaction(ledger, {
    type: "revenue",
    amountSigned: 100,
    monthKey: currentMonthKey,
  }, currentMonthKey);

  assert.equal(ledger.cashBalance, 500);
  assert.equal(ledger.receivedThisMonth, 500);
  assert.equal(ledger.profitThisMonth, 100);
});

test("parcela futura paga entra inteira no recebido do mes, com lucro apenas no juros", () => {
  const currentMonthKey = "2026-03";
  const ledger = createDashboardLedgerAccumulator();

  const amount = 500;
  const openBefore = computeOutstandingAmount(amount, 0);
  assert.equal(openBefore, 500);

  applyDashboardLedgerTransaction(ledger, {
    type: "repayment",
    amountSigned: 400,
    monthKey: currentMonthKey,
  }, currentMonthKey);
  applyDashboardLedgerTransaction(ledger, {
    type: "revenue",
    amountSigned: 100,
    monthKey: currentMonthKey,
  }, currentMonthKey);

  const openAfter = computeOutstandingAmount(amount, amount);
  assert.equal(openAfter, 0);
  assert.equal(ledger.receivedThisMonth, 500);
  assert.equal(ledger.profitThisMonth, 100);
});

test("desembolso de emprestimo reduz caixa sem afetar lucro", () => {
  const currentMonthKey = "2026-03";
  const ledger = createDashboardLedgerAccumulator();

  applyDashboardLedgerTransaction(ledger, {
    type: "loan",
    amountSigned: -1000,
    monthKey: currentMonthKey,
  }, currentMonthKey);

  assert.equal(ledger.cashBalance, -1000);
  assert.equal(ledger.profitTotal, 0);
  assert.equal(ledger.receivedThisMonth, 0);
});

test("ROI usa lucro realizado sobre capital originado", () => {
  const rates = computePortfolioRates({
    realizedProfit: 1_250,
    totalOriginated: 10_000,
    overdueOutstanding: 900,
    totalOutstanding: 9_000,
  });

  assert.equal(rates.roiRate, 12.5);
  assert.equal(rates.delinquencyRate, 10);
});

test("taxas financeiras ficam zeradas quando nao existe base", () => {
  const rates = computePortfolioRates({
    realizedProfit: 500,
    totalOriginated: 0,
    overdueOutstanding: 300,
    totalOutstanding: 0,
  });

  assert.equal(rates.roiRate, 0);
  assert.equal(rates.delinquencyRate, 0);
});
