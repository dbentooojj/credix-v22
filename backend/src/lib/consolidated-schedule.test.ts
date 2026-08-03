import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScheduleWithPaymentHistory,
  buildSimulationProposalSchedule,
  consolidateScheduleAmounts,
} from "./consolidated-schedule";

test("soma parcelas aprovadas da agenda do cliente por data", () => {
  const result = consolidateScheduleAmounts([
    { dueDate: "2026-08-05", amount: 2_000 },
    { dueDate: "2026-09-05", amount: 2_000 },
    { dueDate: "2026-10-05", amount: 2_000 },
    { dueDate: "2026-11-05", amount: 2_000 },
    { dueDate: "2026-08-05", amount: 100 },
    { dueDate: "2026-09-05", amount: 100 },
  ]);

  assert.deepEqual(result, [
    { dueDate: "2026-08-05", amount: 2_100 },
    { dueDate: "2026-09-05", amount: 2_100 },
    { dueDate: "2026-10-05", amount: 2_000 },
    { dueDate: "2026-11-05", amount: 2_000 },
  ]);
});

test("a proposta enviada considera somente as parcelas da nova simulacao", () => {
  const result = buildSimulationProposalSchedule([
    { dueDate: "2026-08-05", amount: 500 },
    { dueDate: "2026-09-05", amount: 500 },
    { dueDate: "2026-10-05", amount: 500 },
    { dueDate: "2026-11-05", amount: 500 },
  ]);

  assert.deepEqual(result.proposalSchedule, [
    { dueDate: "2026-08-05", amount: 500 },
    { dueDate: "2026-09-05", amount: 500 },
    { dueDate: "2026-10-05", amount: 500 },
    { dueDate: "2026-11-05", amount: 500 },
  ]);
  assert.deepEqual(result.totals, {
    total: 2_000,
    open: 2_000,
    paid: 0,
  });
});

test("ignora datas invalidas e valores nao positivos", () => {
  const result = consolidateScheduleAmounts([
    { dueDate: "", amount: 100 },
    { dueDate: "2026-08-05", amount: 0 },
    { dueDate: "2026-08-05", amount: -50 },
    { dueDate: "2026-08-05", amount: 25.55 },
  ]);

  assert.deepEqual(result, [{ dueDate: "2026-08-05", amount: 25.55 }]);
});

test("exibe separadamente os valores pagos e pendentes da mesma data", () => {
  const result = buildScheduleWithPaymentHistory(
    [
      { dueDate: "2026-09-05", amount: 500 },
      { dueDate: "2026-10-05", amount: 500 },
    ],
    [
      { dueDate: "2026-08-05", amount: 500 },
      { dueDate: "2026-09-05", amount: 100 },
    ],
  );

  assert.deepEqual(result.displaySchedule, [
    { dueDate: "2026-08-05", amount: 500, paid: true },
    { dueDate: "2026-09-05", amount: 100, paid: true },
    { dueDate: "2026-09-05", amount: 500, paid: false },
    { dueDate: "2026-10-05", amount: 500, paid: false },
  ]);
  assert.deepEqual(result.openSchedule, [
    { dueDate: "2026-09-05", amount: 500 },
    { dueDate: "2026-10-05", amount: 500 },
  ]);
  assert.deepEqual(result.totals, {
    total: 1_600,
    open: 1_000,
    paid: 600,
  });
});
