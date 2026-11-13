import { FinanceTransactionStatus, FinanceTransactionType, LoanStatus, Prisma } from "@prisma/client";
import { AppError } from "../middleware/error-handler";
import {
  buildInstallmentIncomeDescription,
  buildLoanDisbursementDescription,
  INSTALLMENT_PAYMENT_CATEGORY,
  LOAN_DISBURSEMENT_CATEGORY,
} from "./installment-income-transaction";

export const INTERNAL_TRANSFER_CATEGORY = "Transferência interna";
export const TRANSFER_REVERSAL_CATEGORY = "Estorno de transferência";
export const FINANCIAL_REVERSAL_CATEGORY = "Estorno financeiro";

export async function lockFinancialOwner(tx: Prisma.TransactionClient, ownerUserId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(48271, ${ownerUserId}::integer)`;
}

export async function getOriginalAccount(tx: Prisma.TransactionClient, ownerUserId: number) {
  const account = await tx.financialAccount.findFirst({ where: { ownerUserId, isOriginal: true } });
  if (!account) throw new AppError("Caixa Original não encontrado. Execute as migrações.", 503);
  return account;
}

export async function requireActiveAccount(tx: Prisma.TransactionClient, ownerUserId: number, rawId: unknown) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Selecione uma conta financeira.", 400);
  const account = await tx.financialAccount.findFirst({ where: { id, ownerUserId, archived: false } });
  if (!account) throw new AppError("Conta financeira indisponível.", 400);
  return account;
}

export async function accountBalances(tx: Prisma.TransactionClient, ownerUserId: number) {
  const [accounts, transactions, loans, payments] = await Promise.all([
    tx.financialAccount.findMany({
      where: { ownerUserId },
      orderBy: { id: "asc" },
      include: { _count: { select: { transactions: true, loans: true, payments: true } } },
    }),
    tx.financeTransaction.findMany({ where: { ownerUserId, status: FinanceTransactionStatus.COMPLETED } }),
    tx.loan.findMany({ where: { ownerUserId, status: { not: LoanStatus.PENDENTE } }, select: { id: true, principalAmount: true, financialAccountId: true } }),
    tx.payment.findMany({ where: { ownerUserId }, select: { id: true, loanId: true, installmentId: true, amount: true, financialAccountId: true } }),
  ]);
  const originalId = accounts.find((account) => account.isOriginal)?.id;
  if (!originalId) throw new AppError("Caixa Original não encontrado. Execute as migrações.", 503);
  const cents = new Map(accounts.map((account) => [account.id, 0]));
  const add = (accountId: number, amount: Prisma.Decimal | number, sign: number) => {
    cents.set(accountId, (cents.get(accountId) ?? 0) + Math.round(Number(amount) * 100) * sign);
  };
  const disbursements = new Map<string, typeof transactions[number]>();
  const receipts = new Map<string, typeof transactions[number]>();
  const reversedIds = new Set(transactions.map((row) => row.reversalOfId).filter((id): id is number => id !== null));
  for (const row of transactions) {
    if (row.reversalOfId || reversedIds.has(row.id)) continue;
    if (row.category === LOAN_DISBURSEMENT_CATEGORY) {
      if (!disbursements.has(row.description)) disbursements.set(row.description, row);
    } else if (row.category === INSTALLMENT_PAYMENT_CATEGORY) {
      if (!receipts.has(row.description)) receipts.set(row.description, row);
    } else {
      add(row.financialAccountId, row.amount, row.type === FinanceTransactionType.INCOME ? 1 : -1);
    }
  }
  for (const loan of loans) {
    add(loan.financialAccountId ?? disbursements.get(buildLoanDisbursementDescription(loan.id))?.financialAccountId ?? originalId, loan.principalAmount, -1);
  }
  for (const payment of payments) {
    const key = payment.installmentId ? buildInstallmentIncomeDescription(payment.installmentId, payment.loanId) : null;
    const newKey = payment.installmentId ? buildInstallmentIncomeDescription(payment.installmentId, payment.loanId, payment.id) : null;
    add(payment.financialAccountId ?? (newKey ? receipts.get(newKey)?.financialAccountId : null) ?? (key ? receipts.get(key)?.financialAccountId : null) ?? originalId, payment.amount, 1);
    if (key) receipts.delete(key);
    if (newKey) receipts.delete(newKey);
  }
  // Historical orphaned receipt mirrors are counted by the existing dashboard.
  for (const receipt of receipts.values()) add(receipt.financialAccountId, receipt.amount, 1);
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    institution: account.institution,
    color: account.color,
    description: account.description,
    archived: account.archived,
    isOriginal: account.isOriginal,
    createdAt: account.createdAt,
    balance: (cents.get(account.id) ?? 0) / 100,
    canDelete: !account.isOriginal
      && account._count.transactions === 0
      && account._count.loans === 0
      && account._count.payments === 0,
  }));
}

export async function assertAvailableBalance(tx: Prisma.TransactionClient, ownerUserId: number, accountId: number, amount: number) {
  const balance = (await accountBalances(tx, ownerUserId)).find((account) => account.id === accountId)?.balance;
  if (balance === undefined || Math.round(balance * 100) < Math.round(amount * 100)) {
    throw new AppError("Saldo insuficiente na conta selecionada.", 409);
  }
}
