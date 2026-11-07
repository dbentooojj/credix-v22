import assert from "node:assert/strict";
import test from "node:test";
import { buildClientOverview } from "./client-overview";

const today = "2026-11-07";
const clients = [{ id: 1, status: "ativo" }, { id: 2, status: "inativo" }, { id: 3, status: "ativo" }];
const loans = [{ id: 1, clientId: 1, status: "EM_DIA", startDate: "2026-01-01" }];

test("separa saldo vencido, pagamentos parciais e parcelas a vencer, sem confiar no status desatualizado", () => {
  const [client] = buildClientOverview(clients, loans, [
    { id: 1, loanId: 1, clientId: 1, amount: 120, paidAmount: 40, dueDate: "2026-09-05", paymentDate: null, status: "PENDENTE" },
    { id: 2, loanId: 1, clientId: 1, amount: 120, paidAmount: 0, dueDate: "2026-12-05", paymentDate: null, status: "ATRASADO" },
    { id: 3, loanId: 1, clientId: 1, amount: 120, paidAmount: 120, dueDate: "2026-10-05", paymentDate: "2026-10-05", status: "PAGO" },
    { id: 4, loanId: 1, clientId: 1, amount: 120, paidAmount: 0, dueDate: today, paymentDate: null, status: "PENDENTE" },
  ], today);
  assert.equal(client.openTotal, 320);
  assert.equal(client.overdueTotal, 80);
  assert.equal(client.overdueCount, 1);
  assert.equal(client.maxOverdueDays, 63);
  assert.equal(client.pendingCount, 2);
  assert.equal(client.uiStatus, "Atrasado");
});

test("preserva os pesos do Índice Credix e os bônus de sequência e quitação", () => {
  const [client] = buildClientOverview(clients, [{ ...loans[0], status: "QUITADO" }], [
    { id: 1, loanId: 1, clientId: 1, amount: 100, paidAmount: 100, dueDate: "2026-01-01", paymentDate: "2026-01-01", status: "PAGO" },
    { id: 2, loanId: 1, clientId: 1, amount: 100, paidAmount: 100, dueDate: "2026-02-01", paymentDate: "2026-02-01", status: "PAGO" },
  ], today);
  assert.equal(client.score, 546); // 500 + 2*12 + 2*6 + 10
  assert.equal(client.uiStatus, "Quitado");
});

test("cliente sem empréstimos e cliente inativo mantêm seus estados", () => {
  const result = buildClientOverview(clients, [], [], today);
  assert.equal(result[0].score, 500);
  assert.equal(result[0].totalDueCount, 0);
  assert.equal(result[1].uiStatus, "Inativo");
  assert.equal(result[2].loansCount, 0);
});

test("valores futuros não entram na carteira liberada", () => {
  const [client] = buildClientOverview(clients, [{ ...loans[0], startDate: "2027-01-01" }], [
    { id: 1, loanId: 1, clientId: 1, amount: 100, paidAmount: 0, dueDate: "2027-02-01", paymentDate: null, status: "PENDENTE" },
  ], today);
  assert.equal(client.openTotal, 0);
  assert.equal(client.score, 500);
  assert.equal(client.uiStatus, "Ativo");
});
