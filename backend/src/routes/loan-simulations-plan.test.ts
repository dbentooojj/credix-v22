import assert from "node:assert/strict";
import test from "node:test";
import { calculateLoanPreview } from "../lib/loanCalculator";
import { validatedPlan } from "../lib/simulation-plan";

const dueDates = ["2027-02-01", "2027-03-01", "2027-04-01"];
const plan = [
  { installmentNumber: 1, dueDate: dueDates[0], amount: 406.91, principalAmount: 301.92, interestAmount: 104.99 },
  { installmentNumber: 2, dueDate: dueDates[1], amount: 406.91, principalAmount: 331.05, interestAmount: 75.86 },
  { installmentNumber: 3, dueDate: dueDates[2], amount: 406.92, principalAmount: 367.03, interestAmount: 39.89 },
];

test("preserva a composicao variavel de principal e juros", () => {
  assert.deepEqual(validatedPlan(plan, dueDates, 1000, 1220.74), plan);
});

test("rejeita parcela alterada sem atualizar o contrato", () => {
  const altered = plan.map((row) => ({ ...row }));
  altered[0].interestAmount += 10;
  assert.throws(() => validatedPlan(altered, dueDates, 1000, 1220.74), /Parcela #1 invalida/);
});

test("rejeita vencimentos divergentes e plano incompleto", () => {
  assert.throws(() => validatedPlan(plan.slice(0, 2), dueDates, 1000, 1220.74), /incompleto/);
  assert.throws(() => validatedPlan([{ ...plan[0], dueDate: "2027-02-02" }, ...plan.slice(1)], dueDates, 1000, 1220.74), /Parcela #1 invalida/);
});

test("permite que simulacoes antigas sem plano sigam o fluxo legado", () => {
  assert.equal(validatedPlan(null, dueDates, 1000, 1220.74), null);
});

test("mantem principal, juros fixos e valor alinhados quando ha residuo de centavos", () => {
  const fixedDueDates = Array.from(
    { length: 9 },
    (_item, index) => `2027-${String(index + 1).padStart(2, "0")}-10`,
  );
  const calculation = calculateLoanPreview({
    principal: 7000,
    monthlyRate: 0,
    fixedAddition: 2000,
    installments: 9,
    interestType: "fixo",
    startDate: "2026-12-10",
    firstDueDate: fixedDueDates[0],
    dueDates: fixedDueDates,
  });

  assert.deepEqual(
    calculation.plan.map(({ amount, principalAmount, interestAmount }) => ({
      amount,
      principalAmount,
      interestAmount,
    })),
    [
      ...Array.from({ length: 8 }, () => ({ amount: 1000, principalAmount: 777.78, interestAmount: 222.22 })),
      { amount: 1000, principalAmount: 777.76, interestAmount: 222.24 },
    ],
  );
  assert.doesNotThrow(() => validatedPlan(calculation.plan, fixedDueDates, 7000, 9000));
});
