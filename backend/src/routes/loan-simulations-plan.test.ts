import assert from "node:assert/strict";
import test from "node:test";
import { validatedPlan } from "./loan-simulations.routes";

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
