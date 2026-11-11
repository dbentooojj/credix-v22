import "express-async-errors";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { PrismaClient } from "@prisma/client";
import express from "express";
import cookieParser from "cookie-parser";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.startsWith("/credix_client_financials_test_")) {
  throw new Error("Use o banco temporário de testes de resumo de clientes.");
}
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET = "client-financials-test-secret-only";
process.env.NODE_ENV = "test";
let prisma: PrismaClient;
let server: Server;
let baseUrl: string, cookie: string, otherCookie: string;
let userId: number, emptyId: number, singleId: number, manyId: number, otherId: number;
let paidInstallmentId: number;

async function get(path: string, auth = cookie) {
  const response = await fetch(`${baseUrl}/api/${path}`, { headers: auth ? { cookie: auth } : {} });
  const body = await response.json() as any;
  return { status: response.status, body };
}

before(async () => {
  ({ prisma } = require("../src/lib/prisma"));
  const { tablesRoutes } = require("../src/routes/tables.routes");
  const { paymentsRoutes } = require("../src/routes/payments.routes");
  const { reportsRoutes } = require("../src/routes/reports.routes");
  const { errorHandler } = require("../src/middleware/error-handler");
  const { signToken } = require("../src/lib/jwt");
  const { env } = require("../src/config/env");
  for (const suffix of ["a", "b"]) {
    const user = await prisma.user.create({ data: { name: suffix, email: `${suffix}@financials.test`, passwordHash: "test-only" } });
    const auth = `${env.COOKIE_NAME}=${signToken({ sub: String(user.id), email: user.email, name: user.name, role: "ADMIN" })}`;
    if (suffix === "a") { userId = user.id; cookie = auth; }
    else {
      otherCookie = auth;
      otherId = (await prisma.client.create({ data: { ownerUserId: user.id, name: "Other owner", phone: "1" } })).id;
    }
  }
  emptyId = (await prisma.client.create({ data: { ownerUserId: userId, name: "Empty", phone: "1" } })).id;
  singleId = (await prisma.client.create({ data: { ownerUserId: userId, name: "Single", phone: "1" } })).id;
  manyId = (await prisma.client.create({ data: { ownerUserId: userId, name: "Many", phone: "1" } })).id;
  async function createLoan(clientId: number, index: number, paid: number, amount = 120) {
    const date = new Date(Date.UTC(2020, 0, index + 1));
    const loan = await prisma.loan.create({ data: {
      ownerUserId: userId, clientId, principalAmount: 100, totalAmount: amount, installmentsCount: 1,
      interestRate: 20, startDate: date, firstDueDate: new Date("2021-01-01"), dueDate: new Date("2021-01-01"),
      status: paid === amount ? "QUITADO" : "ATRASADO",
    } });
    const installment = await prisma.installment.create({ data: {
      ownerUserId: userId, clientId, loanId: loan.id, installmentNumber: 1, amount,
      principalAmount: 100, interestAmount: amount - 100, dueDate: new Date("2021-01-01"),
      status: paid === amount ? "PAGO" : "PENDENTE", paymentDate: paid === amount ? new Date("2021-01-01") : null,
    } });
    if (paid > 0) await prisma.payment.create({ data: {
      ownerUserId: userId, loanId: loan.id, installmentId: installment.id, amount: paid,
      paymentDate: new Date("2021-01-01"), method: "PIX",
    } });
    return installment.id;
  }
  paidInstallmentId = await createLoan(singleId, 0, 120);
  // Crosses the 100-contract summary batch boundary; alternating paid and partial.
  for (let index = 0; index < 105; index++) await createLoan(manyId, index, index % 2 === 0 ? 120 : 60);
  // Persisted discount: principal 100 + actual interest 5, not projected interest 20.
  await createLoan(manyId, 106, 105, 105);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/tables", tablesRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma?.$disconnect();
});

test("resumo e histórico vazios são retornados como zero", async () => {
  const result = await get(`tables/debtors/${emptyId}/financial-summary`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { totalLoaned: 0, totalReceived: 0, realizedProfit: 0, totalOpen: 0, loansCount: 0, settledLoansCount: 0 });
  const history = await get(`tables/debtors/${emptyId}/loans`);
  assert.deepEqual(history.body.rows, []);
  assert.deepEqual(history.body.pagination, { page: 1, pageSize: 5, totalItems: 0, totalPages: 1 });
});

test("um empréstimo quitado mostra lucro realizado separado do principal", async () => {
  const result = await get(`tables/debtors/${singleId}/financial-summary`);
  assert.deepEqual(result.body.data, { totalLoaned: 100, totalReceived: 120, realizedProfit: 20, totalOpen: 0, loansCount: 1, settledLoansCount: 1 });
  const history = await get(`tables/debtors/${singleId}/loans`);
  assert.equal(history.body.rows[0].returnAmount, 20);
  assert.equal(history.body.rows[0].returnPercent, 20);
  assert.equal(history.body.rows[0].returnBasis, "REALIZADO");
  assert.equal(history.body.rows[0].realizedProfit, 20);
  assert.equal(history.body.rows[0].remainingProfit, 0);
  assert.equal(history.body.rows[0].installmentsCount, 1);
  assert.equal(history.body.rows[0].paidInstallmentsCount, 1);
  assert.equal(history.body.rows[0].remainingInstallmentsCount, 0);
  assert.equal(history.body.rows[0].installmentMinAmount, 120);
  assert.equal(history.body.rows[0].installmentMaxAmount, 120);
});

test("mais de 100 contratos somam pagamentos parciais e descontos conforme os relatórios", async () => {
  const result = await get(`tables/debtors/${manyId}/financial-summary`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { totalLoaned: 10600, totalReceived: 9585, realizedProfit: 1585, totalOpen: 3120, loansCount: 106, settledLoansCount: 54 });
  const report = await get("reports/loans?startDate=0001-01-01&endDate=2090-01-01");
  assert.equal(report.status, 200);
  assert.equal(report.body.summary.receivedInPeriod, result.body.data.totalReceived + 120);
  assert.equal(report.body.summary.profitInPeriod, result.body.data.realizedProfit + 20);
  assert.equal(report.body.summary.openPortfolioAtEnd, result.body.data.totalOpen);
  const overview = await get("tables/debtors/overview");
  const row = overview.body.data.find((item: any) => item.id === manyId);
  assert.equal(row.openTotal, result.body.data.totalOpen);
  assert.equal(row.overdueTotal, 3120);
  assert.equal(row.overdueCount, 52);
  assert.equal(row.uiStatus, "Atrasado");
  assert.equal(overview.body.data.some((item: any) => item.id === otherId), false);
});

test("histórico pagina no servidor com 5/10 registros e desempate estável", async () => {
  const first = await get(`tables/debtors/${manyId}/loans`);
  const next = await get(`tables/debtors/${manyId}/loans?page=2`);
  const last = await get(`tables/debtors/${manyId}/loans?page=999&pageSize=10`);
  assert.equal(first.body.rows.length, 5);
  assert.equal(first.body.pagination.totalPages, 22);
  assert.equal(next.body.rows.length, 5);
  assert.equal(last.body.pagination.page, 11);
  assert.equal(last.body.rows.length, 6);
  const firstIds = new Set(first.body.rows.map((row: any) => row.loanId));
  assert.ok(next.body.rows.every((row: any) => !firstIds.has(row.loanId)));
  assert.ok(first.body.rows[0].startDate > next.body.rows[0].startDate);
});

test("autenticação, isolamento por usuário e validação dos limites", async () => {
  for (const path of ["tables/debtors/overview", `tables/debtors/${singleId}/loans`, `tables/debtors/${singleId}/financial-summary`]) {
    assert.equal((await get(path, "")).status, 401);
  }
  for (const suffix of ["loans", "financial-summary"]) {
    assert.equal((await get(`tables/debtors/${singleId}/${suffix}`, otherCookie)).status, 404);
    assert.equal((await get(`tables/debtors/${otherId}/${suffix}`)).status, 404);
    assert.equal((await get(`tables/debtors/2147483647/${suffix}`)).status, 404);
    assert.equal((await get(`tables/debtors/invalid/${suffix}`)).status, 400);
  }
  for (const query of ["pageSize=100", "pageSize=6", "page=0", "page=-1", "pageSize=x"]) {
    assert.equal((await get(`tables/debtors/${manyId}/loans?${query}`)).status, 400);
  }
});

test("estorno remove recebimento e lucro, reabrindo o saldo sem duplicar valores", async () => {
  const response = await fetch(`${baseUrl}/api/payments/installments/${paidInstallmentId}/revert`, { method: "POST", headers: { cookie } });
  assert.equal(response.status, 200);
  const result = await get(`tables/debtors/${singleId}/financial-summary`);
  assert.deepEqual(result.body.data, { totalLoaned: 100, totalReceived: 0, realizedProfit: 0, totalOpen: 120, loansCount: 1, settledLoansCount: 0 });
  const history = await get(`tables/debtors/${singleId}/loans`);
  assert.equal(history.body.rows[0].status, "ATRASADO");
  assert.equal(history.body.rows[0].returnAmount, 20);
  assert.equal(history.body.rows[0].returnPercent, 20);
  assert.equal(history.body.rows[0].returnBasis, "PREVISTO");
  assert.equal(history.body.rows[0].realizedProfit, 0);
  assert.equal(history.body.rows[0].remainingProfit, 20);
  assert.equal(history.body.rows[0].paidInstallmentsCount, 0);
  assert.equal(history.body.rows[0].remainingInstallmentsCount, 1);
});

test("edição e exclusão do cadastro continuam refletidas na lista de clientes", async () => {
  const initial = await get("tables/debtors");
  const editedRows = initial.body.data.map((row: any) => row.id === emptyId ? { ...row, name: "Edited client", phone: "11912345678" } : row);
  async function save(rows: any[]) {
    return fetch(`${baseUrl}/api/tables/debtors`, { method: "PUT", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
  }
  assert.equal((await save(editedRows)).status, 200);
  const edited = await get("tables/debtors/overview");
  assert.equal(edited.body.data.find((row: any) => row.id === emptyId).name, "Edited client");
  assert.equal((await save(editedRows.filter((row: any) => row.id !== emptyId))).status, 200);
  const deleted = await get("tables/debtors/overview");
  assert.equal(deleted.body.data.some((row: any) => row.id === emptyId), false);
  assert.equal((await get(`tables/debtors/${emptyId}/financial-summary`)).status, 404);
});
