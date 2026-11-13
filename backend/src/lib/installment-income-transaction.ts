import {
  FinanceTransactionStatus,
  FinanceTransactionType,
  type Prisma,
} from "@prisma/client";
import { getDateOnlyTodayInTimeZone } from "./date-time";

export const CASH_ADJUSTMENT_CATEGORY = "Ajuste de caixa";
export const INSTALLMENT_PAYMENT_CATEGORY = "Recebimento de parcela";
export const LOAN_DISBURSEMENT_CATEGORY = "Desembolso de emprestimo";

export function buildInstallmentIncomeDescription(installmentId: number, loanId: number, paymentId?: number): string {
  return `Recebimento da parcela #${installmentId} do emprestimo #${loanId}${paymentId ? ` pagamento #${paymentId}` : ""}`;
}

export function parseInstallmentIncomeDescription(description: string): {
  installmentId: number;
  loanId: number;
} | null {
  const match = description.match(/^Recebimento da parcela #(\d+) do emprestimo #(\d+)(?: pagamento #\d+)?$/i);
  if (!match) return null;

  const installmentId = Number(match[1]);
  const loanId = Number(match[2]);
  if (!Number.isFinite(installmentId) || !Number.isFinite(loanId)) {
    return null;
  }

  return { installmentId, loanId };
}

export function buildLoanDisbursementDescription(loanId: number): string {
  return `Desembolso do emprestimo #${loanId}`;
}

export function parseLoanDisbursementDescription(description: string): {
  loanId: number;
} | null {
  const match = description.match(/^Desembolso do emprestimo #(\d+)$/i);
  if (!match) return null;

  const loanId = Number(match[1]);
  if (!Number.isFinite(loanId)) {
    return null;
  }

  return { loanId };
}

async function clientSnapshot(tx: Prisma.TransactionClient, ownerUserId: number, loanId: number): Promise<string | null> {
  const loan = await tx.loan.findFirst({
    where: { id: loanId, ownerUserId },
    select: { client: { select: { name: true } } },
  });
  const name = loan?.client.name.trim().replace(/\s+/g, " ").slice(0, 160);
  return name ? `Cliente: ${name}` : null;
}

type InstallmentIncomeTransactionInput = {
  ownerUserId: number;
  installmentId: number;
  paymentId?: number;
  requestKey?: string;
  loanId: number;
  amount: number;
  date: Date;
  financialAccountId?: number;
};

export async function upsertInstallmentIncomeTransaction(
  tx: Prisma.TransactionClient,
  input: InstallmentIncomeTransactionInput,
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const description = buildInstallmentIncomeDescription(input.installmentId, input.loanId, input.paymentId);
  const notes = await clientSnapshot(tx, input.ownerUserId, input.loanId);
  const originalAccount = input.financialAccountId ? null : await tx.financialAccount.findFirst({ where: { ownerUserId: input.ownerUserId, isOriginal: true }, select: { id: true } });
  const financialAccountId = input.financialAccountId ?? originalAccount?.id;
  if (!financialAccountId) throw new Error("Caixa Original ausente");

  const existing = await tx.financeTransaction.findFirst({
    where: {
      ownerUserId: input.ownerUserId,
      category: INSTALLMENT_PAYMENT_CATEGORY,
      description,
      reversedBy: null,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    await tx.financeTransaction.update({
      where: { id: existing.id },
      data: {
        ownerUserId: input.ownerUserId,
        financialAccountId: input.financialAccountId ?? undefined,
        type: FinanceTransactionType.INCOME,
        amount,
        category: INSTALLMENT_PAYMENT_CATEGORY,
        date: input.date,
        description,
        notes: notes ?? undefined,
        status: FinanceTransactionStatus.COMPLETED,
      },
    });
    return;
  }

  await tx.financeTransaction.create({
    data: {
      ownerUserId: input.ownerUserId,
      financialAccountId,
      requestKey: input.requestKey,
      type: FinanceTransactionType.INCOME,
      amount,
      category: INSTALLMENT_PAYMENT_CATEGORY,
      date: input.date,
      description,
      notes,
      status: FinanceTransactionStatus.COMPLETED,
    },
  });
}

export async function deleteInstallmentIncomeTransaction(
  tx: Prisma.TransactionClient,
  params: { ownerUserId: number; installmentId: number; loanId: number },
) {
  const description = buildInstallmentIncomeDescription(params.installmentId, params.loanId);
  const notes = await clientSnapshot(tx, params.ownerUserId, params.loanId);
  const rows = await tx.financeTransaction.findMany({
    where: {
      ownerUserId: params.ownerUserId,
      category: INSTALLMENT_PAYMENT_CATEGORY,
      description: { startsWith: description },
    },
  });
  for (const row of rows) {
    const reverted = await tx.financeTransaction.findUnique({ where: { reversalOfId: row.id } });
    if (!reverted) {
      if (notes && !row.notes) await tx.financeTransaction.update({ where: { id: row.id }, data: { notes } });
      await tx.financeTransaction.create({ data: {
      ownerUserId: row.ownerUserId, financialAccountId: row.financialAccountId,
      reversalOfId: row.id, type: FinanceTransactionType.EXPENSE, amount: row.amount,
      category: "Estorno financeiro", date: getDateOnlyTodayInTimeZone(), description: `Estorno do recebimento #${row.id}`,
      notes: notes ?? row.notes,
      status: FinanceTransactionStatus.COMPLETED,
      } });
    }
  }
}

type LoanDisbursementTransactionInput = {
  ownerUserId: number;
  loanId: number;
  amount: number;
  date: Date;
  financialAccountId?: number;
};

export async function upsertLoanDisbursementTransaction(
  tx: Prisma.TransactionClient,
  input: LoanDisbursementTransactionInput,
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const description = buildLoanDisbursementDescription(input.loanId);
  const notes = await clientSnapshot(tx, input.ownerUserId, input.loanId);
  const originalAccount = input.financialAccountId ? null : await tx.financialAccount.findFirst({ where: { ownerUserId: input.ownerUserId, isOriginal: true }, select: { id: true } });
  const financialAccountId = input.financialAccountId ?? originalAccount?.id;
  if (!financialAccountId) throw new Error("Caixa Original ausente");

  const existing = await tx.financeTransaction.findFirst({
    where: {
      ownerUserId: input.ownerUserId,
      category: LOAN_DISBURSEMENT_CATEGORY,
      description,
      reversedBy: null,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    await tx.financeTransaction.update({
      where: { id: existing.id },
      data: {
        ownerUserId: input.ownerUserId,
        financialAccountId: input.financialAccountId ?? undefined,
        type: FinanceTransactionType.EXPENSE,
        amount,
        category: LOAN_DISBURSEMENT_CATEGORY,
        date: input.date,
        description,
        notes: notes ?? undefined,
        status: FinanceTransactionStatus.COMPLETED,
      },
    });
    return;
  }

  await tx.financeTransaction.create({
    data: {
      ownerUserId: input.ownerUserId,
      financialAccountId,
      type: FinanceTransactionType.EXPENSE,
      amount,
      category: LOAN_DISBURSEMENT_CATEGORY,
      date: input.date,
      description,
      notes,
      status: FinanceTransactionStatus.COMPLETED,
    },
  });
}

export async function deleteLoanDisbursementTransaction(
  tx: Prisma.TransactionClient,
  params: { ownerUserId: number; loanId: number },
) {
  const description = buildLoanDisbursementDescription(params.loanId);
  const notes = await clientSnapshot(tx, params.ownerUserId, params.loanId);
  const rows = await tx.financeTransaction.findMany({
    where: {
      ownerUserId: params.ownerUserId,
      category: LOAN_DISBURSEMENT_CATEGORY,
      description,
    },
  });
  for (const row of rows) {
    const reverted = await tx.financeTransaction.findUnique({ where: { reversalOfId: row.id } });
    if (!reverted) {
      if (notes && !row.notes) await tx.financeTransaction.update({ where: { id: row.id }, data: { notes } });
      await tx.financeTransaction.create({ data: {
      ownerUserId: row.ownerUserId, financialAccountId: row.financialAccountId,
      reversalOfId: row.id, type: FinanceTransactionType.INCOME, amount: row.amount,
      category: "Estorno financeiro", date: getDateOnlyTodayInTimeZone(), description: `Estorno do desembolso #${row.id}`,
      notes: notes ?? row.notes,
      status: FinanceTransactionStatus.COMPLETED,
      } });
    }
  }
}
