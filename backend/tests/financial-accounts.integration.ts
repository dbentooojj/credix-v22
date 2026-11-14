import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";
import { signToken } from "../src/lib/jwt";
import { DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from "../src/lib/date-time";

if (!env.DATABASE_URL.includes("/credix_mfa_validation?")) throw new Error("Run only against credix_mfa_validation copy");
const base = process.env.MFA_TEST_BASE_URL || "http://credix-mfa-validation-api:4000";
const prisma = new PrismaClient();
async function main() {
const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
assert.ok(users.length >= 2, "representative copy needs multiple users");
const cookie = (user: typeof users[number]) => `${env.COOKIE_NAME}=${signToken({ sub: String(user.id), email: user.email, name: user.name, role: user.role })}`;
const call = async (user: typeof users[number], path: string, method = "GET", body?: object) => {
  const response = await fetch(`${base}${path}`, { method, headers: { Cookie: cookie(user), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};
try {
  for (const user of users) {
    const accounts = await call(user, "/api/financial-accounts");
    const dashboard = await call(user, "/api/dashboard");
    assert.equal(accounts.status, 200, JSON.stringify(accounts.body));
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
    assert.equal(accounts.body.data.length, 1);
    assert.equal(accounts.body.data[0].name, "Caixa Original");
    assert.ok(Math.abs(accounts.body.consolidatedBalance - dashboard.body.kpis.cashBalance) < 0.011,
      `User ${user.id}: accounts ${accounts.body.consolidatedBalance}, dashboard ${dashboard.body.kpis.cashBalance}`);
  }
  const user = users[0];
  const original = (await call(user, "/api/financial-accounts")).body.data[0];
  const before = original.balance;
  const create = await call(user, "/api/financial-accounts", "POST", { name: "Conta de validação", color: "#2563eb", institution: "Teste" });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const otherId = create.body.data.id;
  const disposable = await call(user, "/api/financial-accounts", "POST", { name: "Conta descartável", color: "#64748b" });
  assert.equal(disposable.status, 201, JSON.stringify(disposable.body));
  assert.equal((await call(users[1], `/api/financial-accounts/${disposable.body.data.id}`, "DELETE", {})).status, 404);
  assert.equal((await call(user, `/api/financial-accounts/${disposable.body.data.id}`, "DELETE", {})).status, 204);
  assert.equal((await call(user, "/api/financial-accounts")).body.data.some((row: { id: number }) => row.id === disposable.body.data.id), false);
  assert.equal((await call(user, `/api/financial-accounts/${original.id}`, "DELETE", {})).status, 409);
  assert.equal((await call(user, `/api/financial-accounts/${otherId}`, "PATCH", { name: "Conta validada", color: "#16a34a" })).status, 200);
  assert.equal((await call(user, "/api/financial-accounts")).body.data.find((row: { id: number }) => row.id === otherId).name, "Conta validada");
  assert.equal((await call(users[1], `/api/financial-accounts/${otherId}`, "PATCH", { name: "Invasão" })).status, 404);
  const key = randomUUID();
  const transfer = { sourceAccountId: original.id, destinationAccountId: otherId, amount: 1, date: new Date().toISOString().slice(0, 10), description: "Distribuição inicial", idempotencyKey: key };
  if (before >= 1) {
    assert.equal((await call(user, "/api/financial-accounts/transfers", "POST", transfer)).status, 201);
    assert.equal((await call(user, "/api/financial-accounts/transfers", "POST", transfer)).status, 200);
    const after = (await call(user, "/api/financial-accounts")).body;
    assert.equal(after.consolidatedBalance, before);
    assert.equal(after.data.find((row: { id: number }) => row.id === otherId).balance, 1);
    assert.equal((await call(user, `/api/financial-accounts/${otherId}/archive`, "PATCH", { archived: true })).status, 200);
    assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, before);
    assert.equal((await call(user, "/api/financial-accounts/transfers", "POST", { ...transfer, idempotencyKey: randomUUID() })).status, 400);
    assert.equal((await call(user, `/api/financial-accounts/transfers/${key}/revert`, "POST")).status, 200);
    assert.equal((await call(user, `/api/financial-accounts/transfers/${key}/revert`, "POST")).status, 200);
    assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, before);
    assert.equal((await call(user, `/api/financial-accounts/${otherId}/archive`, "PATCH", { archived: false })).status, 200);
  }
  assert.equal((await call(user, "/api/financial-accounts/transfers", "POST", { ...transfer, amount: Math.max(before, 0) + 100000, idempotencyKey: randomUUID() })).status, 409);
  if (before < 10) {
    const funding = await call(user, "/api/dashboard/cash-adjustments", "POST", { financialAccountId: original.id, type: "income", amount: 20 + Math.abs(before), description: "Capital para teste isolado", date: getIsoTodayInTimeZone(DEFAULT_TIME_ZONE) });
    assert.equal(funding.status, 201, JSON.stringify(funding.body));
  }
  const loanBefore = (await call(user, "/api/financial-accounts")).body.consolidatedBalance;
  const client = await prisma.client.findFirst({ where: { ownerUserId: user.id } });
  assert.ok(client);
  const today = new Date();
  const startDate = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  const firstDueDate = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const simulation = await call(user, "/api/loan-simulations", "POST", { clientId: client.id, principalAmount: 10, interestType: "fixo", interestRate: 0, fixedFeeAmount: 0, installmentsCount: 1, startDate, firstDueDate, dueDates: [firstDueDate] });
  assert.equal(simulation.status, 201, JSON.stringify(simulation.body));
  const simulationId = simulation.body.data.id;
  assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, loanBefore);
  assert.equal((await call(user, `/api/loan-simulations/${simulationId}/approve`, "POST", {})).status, 400);
  assert.equal((await call(user, `/api/loan-simulations/${simulationId}/approve`, "POST", { financialAccountId: otherId })).status, 409);
  const approval = await call(user, `/api/loan-simulations/${simulationId}/approve`, "POST", { financialAccountId: original.id });
  assert.equal(approval.status, 200, JSON.stringify(approval.body));
  const loanId = Number(approval.body.data.loanId);
  assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, loanBefore - 10);
  const installment = await prisma.installment.findFirstOrThrow({ where: { loanId } });
  const paymentBase = { loanId, installmentId: installment.id, paymentDate: startDate, method: "PIX" };
  const partialKey = randomUUID();
  const partial = await call(user, "/api/payments", "POST", { ...paymentBase, financialAccountId: otherId, amount: 4, idempotencyKey: partialKey });
  assert.equal(partial.status, 201, JSON.stringify(partial.body));
  const deleteAccountWithReceipt = await call(user, `/api/financial-accounts/${otherId}`, "DELETE", {});
  assert.equal(deleteAccountWithReceipt.status, 409);
  assert.match(deleteAccountWithReceipt.body.message, /recebimentos|histórico financeiro/);
  assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, (await call(user, "/api/dashboard")).body.kpis.cashBalance);
  assert.equal((await call(user, "/api/payments", "POST", { ...paymentBase, financialAccountId: otherId, amount: 4, idempotencyKey: partialKey })).status, 201);
  assert.equal(await prisma.payment.count({ where: { installmentId: installment.id } }), 1);
  const finalPayment = await call(user, "/api/payments", "POST", { ...paymentBase, financialAccountId: original.id, amount: 6, idempotencyKey: randomUUID() });
  assert.equal(finalPayment.status, 201, JSON.stringify(finalPayment.body));
  assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, (await call(user, "/api/dashboard")).body.kpis.cashBalance);
  assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, loanBefore);
  assert.equal((await call(user, `/api/payments/installments/${installment.id}/revert`, "POST")).status, 200);
  assert.equal((await call(user, "/api/payments", "POST", { ...paymentBase, financialAccountId: otherId, amount: 4, idempotencyKey: partialKey })).status, 409);
  assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, loanBefore - 10);
  const finalState = (await call(user, "/api/financial-accounts")).body.data;
  assert.equal(finalState.find((row: { id: number }) => row.id === otherId).balance, 0);
  assert.equal((await call(user, `/api/records/loans/${loanId}`, "DELETE", {})).status, 409);
  assert.equal((await call(user, `/api/records/loans/${loanId}`, "DELETE", { fundsReturned: true })).status, 200);
  assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, loanBefore);
  const available = (await call(user, "/api/financial-accounts")).body.data.find((row: { id: number }) => row.id === original.id).balance;
  if (available > 0) {
    const metricsBeforeTransfer = (await call(user, "/api/dashboard")).body.kpis;
    const reportBeforeTransfer = (await call(user, "/api/reports/finance")).body.summary;
    const concurrent = await Promise.all([randomUUID(), randomUUID()].map((idempotencyKey) => call(user, "/api/financial-accounts/transfers", "POST", { ...transfer, amount: available, idempotencyKey })));
    assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);
    const successfulId = concurrent.find((item) => item.status === 201)?.body.data.transferId;
    assert.ok(successfulId);
    const metricsDuringTransfer = (await call(user, "/api/dashboard")).body.kpis;
    const reportDuringTransfer = (await call(user, "/api/reports/finance")).body.summary;
    for (const field of ["cashBalance", "totalReceived", "profitTotal", "totalOriginated", "cashAdjustmentNet", "ownerRoiRate"]) {
      assert.equal(metricsDuringTransfer[field], metricsBeforeTransfer[field], `Transfer changed ${field}`);
    }
    assert.deepEqual(reportDuringTransfer, reportBeforeTransfer);
    assert.equal((await call(user, `/api/financial-accounts/transfers/${successfulId}/revert`, "POST")).status, 200);
    assert.equal((await call(user, "/api/financial-accounts")).body.consolidatedBalance, loanBefore);
    const metricsAfterTransfer = (await call(user, "/api/dashboard")).body.kpis;
    for (const field of ["cashBalance", "totalReceived", "profitTotal", "totalOriginated", "cashAdjustmentNet", "ownerRoiRate"]) {
      assert.equal(metricsAfterTransfer[field], metricsBeforeTransfer[field], `Transfer changed ${field}`);
    }
  }
  assert.equal((await call(users[1], "/api/financial-accounts/transfers", "POST", { ...transfer, sourceAccountId: original.id, idempotencyKey: randomUUID() })).status, 400);

  const futureDate = new Date();
  futureDate.setUTCFullYear(futureDate.getUTCFullYear() + 1);
  assert.equal((await call(user, "/api/financial-accounts/transfers", "POST", {
    ...transfer,
    date: futureDate.toISOString().slice(0, 10),
    idempotencyKey: randomUUID(),
  })).status, 400);
  assert.equal((await call(user, `/api/financial-accounts/${otherId}/archive`, "PATCH", { archived: true })).status, 200);
  assert.equal((await call(user, "/api/financial-accounts")).body.data.find((row: { id: number }) => row.id === otherId).archived, true);
  const newUser = await prisma.user.create({ data: { name: "Validação de conta", email: `mfa-${randomUUID()}@test.invalid`, passwordHash: "test-only" } });
  assert.equal(await prisma.financialAccount.count({ where: { ownerUserId: newUser.id, isOriginal: true } }), 1);
  const exportResponse = await fetch(`${base}/api/reports/finance/export.csv`, { headers: { Cookie: cookie(user) } });
  assert.equal(exportResponse.status, 200);
  assert.match(await exportResponse.text(), /"conta_id","conta"/);
  console.log("financial accounts integration: passed");
} finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
