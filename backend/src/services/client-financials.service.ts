import { Prisma } from "@prisma/client";
import { buildClientOverview } from "../lib/client-overview";
import { DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from "../lib/date-time";
import { prisma } from "../lib/prisma";
import { buildLoansReport } from "../lib/reports";
import { AppError } from "../middleware/error-handler";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const todayIso = () => getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);

// Select only the columns used by the existing report engine. Relation queries are
// batched by Prisma, never issued once per customer/loan.
function financialSelect(ownerUserId: number) {
  return {
    id: true, principalAmount: true, totalAmount: true, installmentsCount: true,
    startDate: true, dueDate: true,
    installments: { where: { ownerUserId }, select: {
      id: true, loanId: true, installmentNumber: true, amount: true, dueDate: true,
      principalAmount: true, interestAmount: true,
    } },
    payments: { where: { ownerUserId }, select: {
      id: true, loanId: true, installmentId: true, amount: true, paymentDate: true,
    } },
  } satisfies Prisma.LoanSelect;
}
type FinancialLoan = Prisma.LoanGetPayload<{ select: ReturnType<typeof financialSelect> }>;

export function buildClientFinancialReport(loans: FinancialLoan[], today: string) {
  return buildLoansReport(
    loans.map((loan) => ({ ...loan, clientName: "", principalAmount: Number(loan.principalAmount),
      totalAmount: Number(loan.totalAmount), startDate: iso(loan.startDate), dueDate: iso(loan.dueDate) })),
    loans.flatMap((loan) => loan.installments.map((item) => ({ ...item, amount: Number(item.amount),
      principalAmount: item.principalAmount === null ? null : Number(item.principalAmount),
      interestAmount: item.interestAmount === null ? null : Number(item.interestAmount), dueDate: iso(item.dueDate) }))),
    loans.flatMap((loan) => loan.payments.map((payment) => ({ ...payment,
      amount: Number(payment.amount), paymentDate: iso(payment.paymentDate) }))),
    { startDate: "0001-01-01", endDate: today, loanStatus: "all", groupBy: "month" },
  );
}

export async function getClientsOverview(ownerUserId: number) {
  const today = todayIso();
  const [clients, loans, installments] = await Promise.all([
    prisma.client.findMany({ where: { ownerUserId }, orderBy: { id: "asc" }, select: {
      id: true, name: true, phone: true, cpf: true, email: true, status: true, createdAt: true,
    } }),
    prisma.loan.findMany({ where: { ownerUserId }, select: { id: true, clientId: true, status: true, startDate: true } }),
    prisma.installment.findMany({ where: { ownerUserId, loan: { ownerUserId } }, select: {
      id: true, clientId: true, loanId: true, dueDate: true, paymentDate: true, amount: true, status: true,
      payments: { where: { ownerUserId, paymentDate: { lte: new Date(`${today}T00:00:00Z`) } }, select: { amount: true } },
    } }),
  ]);
  return buildClientOverview(clients.map((client) => ({ ...client, document: client.cpf,
    status: client.status.toLowerCase(), created_at: iso(client.createdAt) })),
  loans.map((loan) => ({ ...loan, startDate: iso(loan.startDate) })),
  installments.map((item) => ({ ...item, amount: Number(item.amount), dueDate: iso(item.dueDate),
    paymentDate: item.paymentDate ? iso(item.paymentDate) : null,
    paidAmount: item.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) })), today);
}

async function requireClient(ownerUserId: number, clientId: number, db: Prisma.TransactionClient = prisma) {
  const client = await db.client.findFirst({ where: { id: clientId, ownerUserId }, select: { id: true } });
  if (!client) throw new AppError("Cliente não encontrado.", 404);
}

export async function getClientFinancialSummary(ownerUserId: number, clientId: number) {
  return prisma.$transaction(async (tx) => {
    await requireClient(ownerUserId, clientId, tx);
    const today = todayIso();
    const summary = { totalLoaned: 0, totalReceived: 0, realizedProfit: 0, totalOpen: 0, loansCount: 0, settledLoansCount: 0 };
    let cursor = 0;
    // A full aggregate needs every contract, but only a bounded batch is held in
    // memory. No contract list is sent with the summary or reloaded on page changes.
    while (true) {
      const loans = await tx.loan.findMany({ where: { ownerUserId, clientId, id: { gt: cursor } },
        select: financialSelect(ownerUserId), orderBy: { id: "asc" }, take: 100 });
      if (!loans.length) break;
      const report = buildClientFinancialReport(loans, today);
      summary.totalLoaned = round2(summary.totalLoaned + report.summary.loanedInPeriod);
      summary.totalReceived = round2(summary.totalReceived + report.summary.receivedInPeriod);
      summary.realizedProfit = round2(summary.realizedProfit + report.summary.profitInPeriod);
      summary.totalOpen = round2(summary.totalOpen + report.summary.openPortfolioAtEnd);
      summary.loansCount += loans.length;
      summary.settledLoansCount += report.portfolioStatus.items.find((item) => item.status === "QUITADO")?.count ?? 0;
      cursor = loans[loans.length - 1].id;
      if (loans.length < 100) break;
    }
    return summary;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
}

export async function getClientLoansPage(ownerUserId: number, clientId: number, page: number, pageSize: number) {
  const where = { ownerUserId, clientId };
  // Count and page share a snapshot even if a contract is added/deleted concurrently.
  return prisma.$transaction(async (tx) => {
    await requireClient(ownerUserId, clientId, tx);
    const totalItems = await tx.loan.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const loans = await tx.loan.findMany({ where, select: financialSelect(ownerUserId),
      orderBy: [{ startDate: "desc" }, { id: "desc" }], skip: (safePage - 1) * pageSize, take: pageSize });
    const report = buildClientFinancialReport(loans, todayIso());
    const byId = new Map(report.exportRows.map((row) => [row.loanId, row]));
    return { rows: loans.map((loan) => {
      const row = byId.get(String(loan.id))!;
      const isRealized = row.status === "QUITADO";
      const projectedProfit = round2(Math.max(row.total - row.principal, 0));
      const realizedProfit = round2(Math.max(row.profit, 0));
      const remainingProfit = round2(Math.max(projectedProfit - realizedProfit, 0));
      const returnAmount = isRealized ? realizedProfit : projectedProfit;
      const returnPercent = row.principal > 0 ? round2((returnAmount / row.principal) * 100) : 0;
      const paidByInstallment = new Map<number, number>();
      loan.payments.forEach((payment) => {
        if (payment.installmentId === null) return;
        paidByInstallment.set(payment.installmentId,
          round2((paidByInstallment.get(payment.installmentId) ?? 0) + Number(payment.amount)));
      });
      const installmentAmounts = loan.installments.map((installment) => Number(installment.amount));
      const paidInstallmentsCount = loan.installments.filter((installment) =>
        (paidByInstallment.get(installment.id) ?? 0) >= Number(installment.amount) - 0.005).length;
      const installmentMinAmount = installmentAmounts.length ? round2(Math.min(...installmentAmounts)) : 0;
      const installmentMaxAmount = installmentAmounts.length ? round2(Math.max(...installmentAmounts)) : 0;
      return { ...row, returnAmount, returnPercent, returnBasis: isRealized ? "REALIZADO" : "PREVISTO",
        realizedProfit, remainingProfit, installmentsCount: loan.installmentsCount, paidInstallmentsCount,
        remainingInstallmentsCount: Math.max(loan.installmentsCount - paidInstallmentsCount, 0),
        installmentMinAmount, installmentMaxAmount };
    }),
      pagination: { page: safePage, pageSize, totalItems, totalPages } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
