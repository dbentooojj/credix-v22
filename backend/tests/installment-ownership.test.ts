import "express-async-errors";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import type { PrismaClient } from "@prisma/client";

// Run only against an explicitly supplied, disposable test database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.startsWith("/credix_ownership_test_")) {
  throw new Error("TEST_DATABASE_URL deve apontar para um banco temporario credix_ownership_test_*.");
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "ownership-test-secret-not-for-production";
process.env.NODE_ENV = "test";

let prisma: PrismaClient;
let server: Server | undefined;
let baseUrl: string;
let cookieA: string;
let cookieB: string;
let clientA: number;
let otherClientA: number;
let clientB: number;
let loanB: number;
const userIds: number[] = [];
type Row = Record<string, unknown>;

async function readRows(cookie = cookieA): Promise<Row[]> {
  const response = await fetch(`${baseUrl}/api/tables/installments`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return (await response.json() as { data: Row[] }).data;
}

async function saveRows(rows: Row[]) {
  return fetch(`${baseUrl}/api/tables/installments`, {
    method: "PUT",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ rows }),
  });
}

before(async () => {
  // Load after selecting the test database, using the backend's CommonJS
  // module graph so the router and error handler share the same AppError class.
  ({ prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma"));
  const { tablesRoutes } = require("../src/routes/tables.routes") as typeof import("../src/routes/tables.routes");
  const { errorHandler } = require("../src/middleware/error-handler") as typeof import("../src/middleware/error-handler");
  const { signToken } = require("../src/lib/jwt") as typeof import("../src/lib/jwt");
  const { env } = require("../src/config/env") as typeof import("../src/config/env");
  const clients: number[] = [];
  const loans: number[] = [];
  const cookies: string[] = [];

  for (const suffix of ["a", "b"]) {
    const user = await prisma.user.create({
      data: { name: `Test ${suffix}`, email: `ownership-${suffix}@test.invalid`, passwordHash: "not-a-login-password" },
    });
    userIds.push(user.id);
    cookies.push(`${env.COOKIE_NAME}=${signToken({ sub: String(user.id), email: user.email, name: user.name, role: "ADMIN" })}`);
    const client = await prisma.client.create({ data: { ownerUserId: user.id, name: `Client ${suffix}`, phone: "11999999999" } });
    clients.push(client.id);
    const loan = await prisma.loan.create({
      data: {
        ownerUserId: user.id, clientId: client.id, principalAmount: 200, totalAmount: 200,
        interestRate: 0, installmentsCount: 2, startDate: new Date("2099-01-01"),
        firstDueDate: new Date("2099-02-01"), dueDate: new Date("2099-03-01"),
      },
    });
    loans.push(loan.id);
    await prisma.installment.createMany({
      data: [1, 2].map((installmentNumber) => ({
        ownerUserId: user.id, clientId: client.id, loanId: loan.id, installmentNumber,
        amount: 100, dueDate: new Date(`2099-0${installmentNumber + 1}-01`),
      })),
    });
  }
  [clientA, clientB] = clients;
  loanB = loans[1];
  [cookieA, cookieB] = cookies;
  otherClientA = (await prisma.client.create({
    data: { ownerUserId: userIds[0], name: "Other client A", phone: "11999999998" },
  })).id;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/tables", tablesRoutes);
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (prisma && userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await prisma?.$disconnect();
  }
});

for (const field of ["debtor_id", "client_id", "clientId"]) {
  test(`rejeita cliente de outro usuario via ${field} e preserva o lote inteiro`, async () => {
    const beforeA = await readRows();
    const beforeB = await readRows(cookieB);
    const rows = structuredClone(beforeA);
    rows[0].amount = 999; // An earlier valid row must not be partially saved.
    rows[1][field] = clientB;
    const response = await saveRows(rows);
    assert.equal(response.status, 409);
    assert.match((await response.json() as { message: string }).message, /sincroniza.*massa/i);
    assert.deepEqual(await readRows(), beforeA);
    assert.deepEqual(await readRows(cookieB), beforeB);
  });
}

test("rejeita outro cliente do mesmo usuario", async () => {
  const before = await readRows();
  const rows = structuredClone(before);
  rows[0].debtor_id = otherClientA;
  assert.equal((await saveRows(rows)).status, 409);
  assert.deepEqual(await readRows(), before);
});

test("rejeita emprestimo alheio ou inexistente com a mesma resposta", async () => {
  const before = await readRows();
  const errors = [];
  for (const loanId of [loanB, 2147483647]) {
    const rows = structuredClone(before);
    rows[0].loan_id = loanId;
    const response = await saveRows(rows);
    assert.equal(response.status, 409);
    errors.push(await response.json());
    assert.deepEqual(await readRows(), before);
  }
  assert.deepEqual(errors[0], errors[1]);
});

test("bloqueia a escrita em massa mesmo com cliente correto", async () => {
  for (const field of ["debtor_id", "client_id", "clientId", null]) {
    const rows = await readRows();
    for (const row of rows) {
      delete row.debtor_id;
      if (field) row[field] = String(clientA);
    }
    const response = await saveRows(rows);
    assert.equal(response.status, 409);
    assert.ok((await readRows()).every((row) => row.debtor_id === clientA));
  }
});
