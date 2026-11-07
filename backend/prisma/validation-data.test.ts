import assert from "node:assert/strict";
import { test } from "node:test";
import { buildValidationClients, splitCents } from "./validation-data";

const cents = (amount: number) => Math.round(amount * 100);

for (const iso of ["2026-11-07", "2027-01-01", "2028-02-29"]) {
  test(`base coerente em ${iso}: saldos, datas, estados e cobertura`, () => {
    const today = new Date(`${iso}T00:00:00Z`);
    const clients = buildValidationClients(today);
    const loans = clients.flatMap((client) => client.loans);
    assert.equal(clients.length, 48);
    assert.equal(clients.filter((client) => !client.loans.length).length, 3);
    assert.ok(clients.some((client) => client.loans.length > 20));
    assert.equal(new Set(clients.flatMap((client) => client.cpf ? [client.cpf] : [])).size, 46);
    assert.deepEqual(new Set(loans.map((loan) => loan.status)), new Set(["PENDENTE", "EM_DIA", "ATRASADO", "QUITADO"]));
    assert.equal(new Set(loans.map((loan) => loan.label)).size, 24);
    assert.equal(new Set(loans.map((loan) => loan.paymentMethod)).size, 4);
    assert.equal(new Set(loans.map((loan) => loan.interestType)).size, 2);
    assert.ok(loans.some((loan) => loan.interestRate === 0));
    assert.ok(loans.some((loan) => loan.installments.some((item) => item.dueDate.getTime() === today.getTime() && item.status === "PENDENTE")));
    for (const loan of loans) {
      assert.ok(loan.startDate <= today);
      if (loan.status === "PENDENTE") {
        assert.equal(loan.installments.length, 0);
        continue;
      }
      assert.equal(loan.installments.length, loan.installmentsCount);
      assert.equal(loan.installments.reduce((sum, item) => sum + cents(item.amount), 0), cents(loan.totalAmount));
      assert.equal(loan.installments.reduce((sum, item) => sum + cents(item.principalAmount), 0), cents(loan.principalAmount));
      assert.equal(loan.firstDueDate.getTime(), loan.installments[0].dueDate.getTime());
      assert.equal(loan.dueDate.getTime(), loan.installments.at(-1)!.dueDate.getTime());
      for (const item of loan.installments) {
        assert.equal(cents(item.principalAmount) + cents(item.interestAmount), cents(item.amount));
        if (item.status === "PAGO") {
          assert.ok(item.paymentDate && item.paymentDate <= today);
          assert.ok(item.paymentDate! >= loan.startDate);
          assert.ok(item.paymentMethod);
        } else {
          assert.equal(item.paymentDate, null);
          assert.equal(item.paymentMethod, null);
          assert.equal(item.status === "ATRASADO", item.dueDate < today);
        }
      }
      const expected = loan.installments.every((item) => item.status === "PAGO") ? "QUITADO"
        : loan.installments.some((item) => item.status === "ATRASADO") ? "ATRASADO" : "EM_DIA";
      assert.equal(loan.status, expected);
    }
  });
}

test("divisao preserva o centavo restante na ultima parcela", () => {
  assert.deepEqual(splitCents(100_001, 3), [33_333, 33_333, 33_335]);
});
