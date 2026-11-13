import assert from "node:assert/strict";
import test from "node:test";
import { FinanceTransactionType, type Prisma, type PrismaClient } from "@prisma/client";
import { statementDisplayDescriptions, type StatementTransactionRow } from "./statement-description.service";
import { deleteLoanDisbursementTransaction } from "../lib/installment-income-transaction";

const row = (overrides: Partial<StatementTransactionRow> & Pick<StatementTransactionRow, "id" | "category" | "description">): StatementTransactionRow => ({
  id: overrides.id,
  category: overrides.category,
  description: overrides.description,
  notes: overrides.notes ?? null,
  type: overrides.type ?? FinanceTransactionType.INCOME,
  financialAccountId: overrides.financialAccountId ?? 1,
  financialAccount: overrides.financialAccount ?? { name: "Conta principal" },
  transferId: overrides.transferId ?? null,
  reversalOfId: overrides.reversalOfId ?? null,
});

function database(originals: StatementTransactionRow[], transfers: StatementTransactionRow[], withLoan: boolean): PrismaClient {
  return {
    financeTransaction: {
      findMany: async ({ where }: { where: { id?: unknown } }) => where.id ? originals : transfers,
    },
    loan: { findMany: async () => withLoan ? [{ id: 42, installmentsCount: 6, client: { name: "Ana Souza" } }] : [] },
    installment: { findMany: async () => withLoan ? [{ id: 88, installmentNumber: 2 }] : [] },
  } as unknown as PrismaClient;
}

test("mostra cliente e número real da parcela sem alterar a descrição armazenada", async () => {
  const disbursement = row({ id: 10, category: "Desembolso de emprestimo", description: "Desembolso do emprestimo #42", type: FinanceTransactionType.EXPENSE });
  const receipt = row({ id: 11, category: "Recebimento de parcela", description: "Recebimento da parcela #88 do emprestimo #42 pagamento #7" });
  const labels = await statementDisplayDescriptions(database([], [], true), 1, [disbursement, receipt]);
  assert.equal(labels.get(10), "Empréstimo #42 para Ana Souza");
  assert.equal(labels.get(11), "Parcela 2/6 recebida — Ana Souza · Empréstimo #42");
  assert.equal(disbursement.description, "Desembolso do emprestimo #42");
});

test("identifica cancelamento mesmo depois da exclusão do empréstimo", async () => {
  const original = row({ id: 10, category: "Desembolso de emprestimo", description: "Desembolso do emprestimo #42", notes: "Cliente: Ana Souza", type: FinanceTransactionType.EXPENSE });
  const reversal = row({ id: 12, category: "Estorno financeiro", description: "Estorno do desembolso #10", notes: "Cliente: Ana Souza", reversalOfId: 10 });
  const labels = await statementDisplayDescriptions(database([original], [], false), 1, [original, reversal]);
  assert.equal(labels.get(10), "Empréstimo #42 para Ana Souza");
  assert.equal(labels.get(12), "Saída do empréstimo #42 cancelada — Ana Souza");
});

test("distingue os dois lados de uma transferência e seu cancelamento", async () => {
  const sent = row({ id: 20, category: "Transferência interna", description: "Transferência entre contas", transferId: "transfer-1", type: FinanceTransactionType.EXPENSE });
  const received = row({ id: 21, category: "Transferência interna", description: "Transferência entre contas", transferId: "transfer-1", financialAccountId: 2, financialAccount: { name: "Reserva" } });
  const reversal = row({ id: 22, category: "Estorno de transferência", description: "Estorno da transferência transfer-1", reversalOfId: 20 });
  const labels = await statementDisplayDescriptions(database([sent], [sent, received], false), 1, [sent, received, reversal]);
  assert.equal(labels.get(20), "Transferência enviada para Reserva");
  assert.equal(labels.get(21), "Transferência recebida de Conta principal");
  assert.equal(labels.get(22), "Envio para Reserva cancelado");
});

test("explica cancelamento de recebimento e ajustes sem expor IDs financeiros", async () => {
  const receipt = row({ id: 11, category: "Recebimento de parcela", description: "Recebimento da parcela #88 do emprestimo #42" });
  const reversal = row({ id: 12, category: "Estorno financeiro", description: "Estorno do recebimento #11", reversalOfId: 11, type: FinanceTransactionType.EXPENSE });
  const adjustment = row({ id: 13, category: "Ajuste de caixa", description: "Ajuste manual de caixa", type: FinanceTransactionType.EXPENSE });
  const labels = await statementDisplayDescriptions(database([receipt], [], true), 1, [reversal, adjustment]);
  assert.equal(labels.get(12), "Recebimento da parcela 2/6 cancelado — Ana Souza · Empréstimo #42");
  assert.equal(labels.get(13), "Ajuste de caixa — saída");
});

test("guarda o nome do cliente no cancelamento antes de excluir o empréstimo", async () => {
  const changes: Array<{ action: string; notes: string | null }> = [];
  const tx = {
    loan: { findFirst: async () => ({ client: { name: "Ana Souza" } }) },
    financeTransaction: {
      findMany: async () => [{ id: 10, ownerUserId: 1, financialAccountId: 1, amount: 500, notes: null }],
      findUnique: async () => null,
      update: async ({ data }: { data: { notes: string } }) => { changes.push({ action: "original", notes: data.notes }); },
      create: async ({ data }: { data: { notes: string | null } }) => { changes.push({ action: "cancelamento", notes: data.notes }); },
    },
  } as unknown as Prisma.TransactionClient;
  await deleteLoanDisbursementTransaction(tx, { ownerUserId: 1, loanId: 42 });
  assert.deepEqual(changes, [
    { action: "original", notes: "Cliente: Ana Souza" },
    { action: "cancelamento", notes: "Cliente: Ana Souza" },
  ]);
});
