import "express-async-errors";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import express from "express";
import { DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from "../src/lib/date-time";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.startsWith("/credix_payment_status_test_")) {
  throw new Error("TEST_DATABASE_URL deve apontar para um banco temporario de teste de pagamentos.");
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "payment-status-test-secret-not-for-production";
process.env.NODE_ENV = "test";

let prisma: PrismaClient;
let server: Server | undefined;
let baseUrl: string;
let cookie: string;
let loanId: number;
let firstInstallmentId: number;
let secondInstallmentId: number;
let financialAccountId: number;
const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);

async function blockStatusUpdates() {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION reject_loan_status_for_test() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'forced loan status failure'; END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER reject_loan_status_for_test
    BEFORE UPDATE OF status ON "Loan"
    FOR EACH ROW EXECUTE FUNCTION reject_loan_status_for_test()
  `);
}

async function allowStatusUpdates() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER reject_loan_status_for_test ON "Loan"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION reject_loan_status_for_test()`);
}

function pay(installmentId: number) {
  return fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ loanId, installmentId, financialAccountId, amount: 100, paymentDate: todayIso, method: "PIX" }),
  });
}

function revert(installmentId: number) {
  return fetch(`${baseUrl}/api/payments/installments/${installmentId}/revert`, {
    method: "POST", headers: { cookie },
  });
}

function remove(installmentId: number) {
  return fetch(`${baseUrl}/api/payments/installments/${installmentId}`, {
    method: "DELETE", headers: { cookie },
  });
}

before(async () => {
  ({ prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma"));
  const { paymentsRoutes } = require("../src/routes/payments.routes") as typeof import("../src/routes/payments.routes");
  const { errorHandler } = require("../src/middleware/error-handler") as typeof import("../src/middleware/error-handler");
  const { signToken } = require("../src/lib/jwt") as typeof import("../src/lib/jwt");
  const { env } = require("../src/config/env") as typeof import("../src/config/env");

  const user = await prisma.user.create({
    data: { name: "Payment test", email: "payment-status@test.invalid", passwordHash: "test-only" },
  });
  cookie = `${env.COOKIE_NAME}=${signToken({ sub: String(user.id), email: user.email, name: user.name, role: "ADMIN" })}`;
  financialAccountId = (await prisma.financialAccount.findFirstOrThrow({ where: { ownerUserId: user.id, isOriginal: true } })).id;
  await prisma.financeTransaction.create({ data: { ownerUserId: user.id, financialAccountId, type: "INCOME", amount: 200, category: "Ajuste de caixa", date: new Date("2099-01-01"), description: "Capital de teste", status: "COMPLETED" } });
  const client = await prisma.client.create({ data: { ownerUserId: user.id, name: "Client", phone: "11999999999" } });
  const loan = await prisma.loan.create({
    data: {
      ownerUserId: user.id, clientId: client.id, principalAmount: 200, totalAmount: 200,
      interestRate: 0, installmentsCount: 2, startDate: new Date("2099-01-01"),
      firstDueDate: new Date("2099-02-01"), dueDate: new Date("2099-03-01"), status: "EM_DIA",
    },
  });
  loanId = loan.id;
  const installments = await prisma.installment.createManyAndReturn({
    data: [1, 2].map((installmentNumber) => ({
      ownerUserId: user.id, clientId: client.id, loanId, installmentNumber,
      amount: 100, dueDate: new Date(`2099-0${installmentNumber + 1}-01`),
    })),
  });
  firstInstallmentId = installments.find((item) => item.installmentNumber === 1)!.id;
  secondInstallmentId = installments.find((item) => item.installmentNumber === 2)!.id;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/payments", paymentsRoutes);
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await prisma?.$disconnect();
});

test("registro, estorno e exclusao revertem tudo se o status nao puder ser atualizado", async () => {
  await blockStatusUpdates();
  assert.equal((await pay(firstInstallmentId)).status, 500);
  assert.equal(await prisma.payment.count(), 0);
  assert.equal(await prisma.financeTransaction.count({ where: { category: "Recebimento de parcela" } }), 0);
  assert.equal((await prisma.installment.findUniqueOrThrow({ where: { id: firstInstallmentId } })).status, "PENDENTE");
  assert.equal((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).status, "EM_DIA");
  await allowStatusUpdates();

  assert.equal((await pay(firstInstallmentId)).status, 201);
  assert.equal(await prisma.payment.count(), 1);
  assert.equal(await prisma.financeTransaction.count({ where: { category: "Recebimento de parcela" } }), 1);

  await blockStatusUpdates();
  assert.equal((await revert(firstInstallmentId)).status, 500);
  assert.equal(await prisma.payment.count(), 1);
  assert.equal(await prisma.financeTransaction.count({ where: { category: "Recebimento de parcela" } }), 1);
  assert.equal((await prisma.installment.findUniqueOrThrow({ where: { id: firstInstallmentId } })).status, "PAGO");
  await allowStatusUpdates();

  assert.equal((await pay(secondInstallmentId)).status, 201);
  assert.equal((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).status, "QUITADO");
  assert.equal((await revert(secondInstallmentId)).status, 200);
  assert.equal((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).status, "EM_DIA");

  await blockStatusUpdates();
  assert.equal((await remove(secondInstallmentId)).status, 500);
  assert.equal(await prisma.installment.count({ where: { loanId } }), 2);
  assert.equal((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).totalAmount.toString(), "200");
  await allowStatusUpdates();

  assert.equal((await remove(secondInstallmentId)).status, 200);
  assert.equal(await prisma.installment.count({ where: { loanId } }), 1);
  assert.equal((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).status, "QUITADO");
});
