import assert from "node:assert/strict";
import test from "node:test";
import { calculateLoanPreview, type LoanPaymentFrequency } from "./loanCalculator";

function calculate(paymentFrequency: LoanPaymentFrequency, interestType: "simples" | "composto" | "fixo" = "fixo") {
  const firstDueDates: Record<LoanPaymentFrequency, string> = {
    daily: "2026-11-11",
    weekly: "2026-11-17",
    biweekly: "2026-11-25",
    monthly: "2026-12-10",
  };

  return calculateLoanPreview({
    principal: 1000,
    monthlyRate: interestType === "fixo" ? 0 : 3,
    fixedAddition: interestType === "fixo" ? 200 : 0,
    installments: 4,
    interestType,
    paymentFrequency,
    startDate: "2026-11-10",
    firstDueDate: firstDueDates[paymentFrequency],
  });
}

test("gera vencimentos diarios, semanais, quinzenais e mensais", () => {
  assert.deepEqual(calculate("daily").dueDates, [
    "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14",
  ]);
  assert.deepEqual(calculate("weekly").dueDates, [
    "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08",
  ]);
  assert.deepEqual(calculate("biweekly").dueDates, [
    "2026-11-25", "2026-12-10", "2026-12-25", "2027-01-09",
  ]);
  assert.deepEqual(calculate("monthly").dueDates, [
    "2026-12-10", "2027-01-10", "2027-02-10", "2027-03-10",
  ]);
});

test("calcula juros simples pelo prazo real do contrato", () => {
  const result = calculate("weekly", "simples");

  assert.equal(result.calcResult.totalInterest, 28);
  assert.equal(result.calcResult.totalAmount, 1028);
  assert.equal(result.plan.reduce((sum, row) => sum + row.principalAmount, 0), 1000);
  assert.equal(result.plan.reduce((sum, row) => sum + row.interestAmount, 0), 28);
});

test("preserva os totais do acrescimo fixo em qualquer frequencia", () => {
  for (const frequency of ["daily", "weekly", "biweekly", "monthly"] as const) {
    const result = calculate(frequency);
    assert.equal(result.calcResult.totalAmount, 1200);
    assert.equal(result.plan.reduce((sum, row) => sum + row.amount, 0), 1200);
    assert.ok(result.plan.every((row) => row.amount === row.principalAmount + row.interestAmount));
  }
});

test("mantem a composicao das parcelas com juros compostos em todas as frequencias", () => {
  for (const frequency of ["daily", "weekly", "biweekly", "monthly"] as const) {
    const result = calculate(frequency, "composto");
    const principalTotal = result.plan.reduce((sum, row) => sum + row.principalAmount, 0);
    assert.ok(Math.abs(principalTotal - 1000) <= 0.01);
    assert.ok(result.plan.every((row) => Math.abs(row.amount - row.principalAmount - row.interestAmount) <= 0.01));
  }
});
