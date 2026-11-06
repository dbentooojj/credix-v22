import "express-async-errors";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import express from "express";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.startsWith("/credix_payment_amount_test_")) {
  throw new Error("TEST_DATABASE_URL deve apontar para um banco temporario de teste de pagamentos.");
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "payment-amount-test-secret-not-for-production";
process.env.NODE_ENV = "test";

let prisma: PrismaClient;
let server: Server | undefined;
let baseUrl: string;
let cookie: string;
let loanId: number;
let installmentId: number;

async function pay(amount: number) {
  return fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ loanId, installmentId, amount, paymentDate: "2099-02-01", method: "PIX" }),
  });
}

before(async () => {
  ({ prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma"));
  const { paymentsRoutes } = require("../src/routes/payments.routes") as typeof import("../src/routes/payments.routes");
  const { errorHandler } = require("../src/middleware/error-handler") as typeof import("../src/middleware/error-handler");
  const { signToken } = require("../src/lib/jwt") as typeof import("../src/lib/jwt");
  const { env } = require("../src/config/env") as typeof import("../src/config/env");

  const user = await prisma.user.create({
    data: { name: "Payment test", email: "payment-amount@test.invalid", passwordHash: "test-only" },
  });
  cookie = `${env.COOKIE_NAME}=${signToken({ sub: String(user.id), email: user.email, name: user.name, role: "ADMIN" })}`;
  const client = await prisma.client.create({ data: { ownerUserId: user.id, name: "Client", phone: "11999999999" } });
  const loan = await prisma.loan.create({
    data: {
      ownerUserId: user.id, clientId: client.id, principalAmount: 100.01, totalAmount: 100.01,
      interestRate: 0, installmentsCount: 1, startDate: new Date("2099-01-01"),
      firstDueDate: new Date("2099-02-01"), dueDate: new Date("2099-02-01"),
    },
  });
  loanId = loan.id;
  const installment = await prisma.installment.create({
    data: {
      ownerUserId: user.id, clientId: client.id, loanId, installmentNumber: 1,
      amount: 100.01, dueDate: new Date("2099-02-01"),
    },
  });
  installmentId = installment.id;

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

test("recusa valores divergentes sem criar pagamento ou receita", async () => {
  for (const amount of [0.01, 100, 100.001, 100.02]) {
    const response = await pay(amount);
    assert.equal(response.status, 400);
    assert.match((await response.json() as { message: string }).message, /valor integral da parcela/);
    assert.equal(await prisma.payment.count(), 0);
    assert.equal(await prisma.financeTransaction.count(), 0);
    const installment = await prisma.installment.findUniqueOrThrow({ where: { id: installmentId } });
    assert.equal(installment.status, "PENDENTE");
    assert.equal(installment.paymentDate, null);
  }
});

test("aceita o valor exato e registra pagamento, parcela e receita", async () => {
  const response = await pay(100.01);
  assert.equal(response.status, 201);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { installmentId } });
  assert.equal(payment.amount.toString(), "100.01");
  const installment = await prisma.installment.findUniqueOrThrow({ where: { id: installmentId } });
  assert.equal(installment.status, "PAGO");
  assert.equal(await prisma.financeTransaction.count({ where: { ownerUserId: payment.ownerUserId } }), 1);
});

test("nao altera pagamento ja registrado com valor divergente", async () => {
  assert.equal((await pay(1)).status, 400);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { installmentId } });
  assert.equal(payment.amount.toString(), "100.01");
  assert.equal(await prisma.financeTransaction.count(), 1);
});
