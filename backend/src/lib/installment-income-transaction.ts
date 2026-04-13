import {
  FinanceTransactionStatus,
  FinanceTransactionType,
  type Prisma,
} from "@prisma/client";

export const CASH_ADJUSTMENT_CATEGORY = "Ajuste de caixa";
export const INSTALLMENT_PAYMENT_CATEGORY = "Recebimento de parcela";
export const LOAN_DISBURSEMENT_CATEGORY = "Desembolso de emprestimo";

export function buildInstallmentIncomeDescription(installmentId: number, loanId: number): string {
  return `Recebimento da parcela #${installmentId} do emprestimo #${loanId}`;
}

export function parseInstallmentIncomeDescription(description: string): {
  installmentId: number;
  loanId: number;
} | null {
  const match = description.match(/^Recebimento da parcela #(\d+) do emprestimo #(\d+)$/i);
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

type InstallmentIncomeTransactionInput = {
  ownerUserId: number;
  installmentId: number;
  loanId: number;
  amount: number;
  date: Date;
};

export async function upsertInstallmentIncomeTransaction(
  tx: Prisma.TransactionClient,
  input: InstallmentIncomeTransactionInput,
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const description = buildInstallmentIncomeDescription(input.installmentId, input.loanId);

  const existing = await tx.financeTransaction.findFirst({
    where: {
      ownerUserId: input.ownerUserId,
      category: INSTALLMENT_PAYMENT_CATEGORY,
      description,
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
        type: FinanceTransactionType.INCOME,
        amount,
        category: INSTALLMENT_PAYMENT_CATEGORY,
        date: input.date,
        description,
        status: FinanceTransactionStatus.COMPLETED,
      },
    });
    return;
  }

  await tx.financeTransaction.create({
    data: {
      ownerUserId: input.ownerUserId,
      type: FinanceTransactionType.INCOME,
      amount,
      category: INSTALLMENT_PAYMENT_CATEGORY,
      date: input.date,
      description,
      status: FinanceTransactionStatus.COMPLETED,
    },
  });
}

export async function deleteInstallmentIncomeTransaction(
  tx: Prisma.TransactionClient,
  params: { ownerUserId: number; installmentId: number; loanId: number },
) {
  const description = buildInstallmentIncomeDescription(params.installmentId, params.loanId);
  await tx.financeTransaction.deleteMany({
    where: {
      ownerUserId: params.ownerUserId,
      category: INSTALLMENT_PAYMENT_CATEGORY,
      description,
    },
  });
}

type LoanDisbursementTransactionInput = {
  ownerUserId: number;
  loanId: number;
  amount: number;
  date: Date;
};

export async function upsertLoanDisbursementTransaction(
  tx: Prisma.TransactionClient,
  input: LoanDisbursementTransactionInput,
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const description = buildLoanDisbursementDescription(input.loanId);

  const existing = await tx.financeTransaction.findFirst({
    where: {
      ownerUserId: input.ownerUserId,
      category: LOAN_DISBURSEMENT_CATEGORY,
      description,
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
        type: FinanceTransactionType.EXPENSE,
        amount,
        category: LOAN_DISBURSEMENT_CATEGORY,
        date: input.date,
        description,
        status: FinanceTransactionStatus.COMPLETED,
      },
    });
    return;
  }

  await tx.financeTransaction.create({
    data: {
      ownerUserId: input.ownerUserId,
      type: FinanceTransactionType.EXPENSE,
      amount,
      category: LOAN_DISBURSEMENT_CATEGORY,
      date: input.date,
      description,
      status: FinanceTransactionStatus.COMPLETED,
    },
  });
}

export async function deleteLoanDisbursementTransaction(
  tx: Prisma.TransactionClient,
  params: { ownerUserId: number; loanId: number },
) {
  const description = buildLoanDisbursementDescription(params.loanId);
  await tx.financeTransaction.deleteMany({
    where: {
      ownerUserId: params.ownerUserId,
      category: LOAN_DISBURSEMENT_CATEGORY,
      description,
    },
  });
}
