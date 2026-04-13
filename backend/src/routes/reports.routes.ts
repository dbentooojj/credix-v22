import { FinanceTransactionStatus, FinanceTransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from "../lib/date-time";
import { ensureFinanceCategoryCatalogForUser } from "../lib/finance-categories";
import {
  parseInstallmentIncomeDescription,
  parseLoanDisbursementDescription,
} from "../lib/installment-income-transaction";
import {
  buildFinanceReport,
  buildFinanceReportCsv,
  buildLoansReport,
  buildLoansReportCsv,
  type FinanceReportFilters,
  type LoansReportFilters,
} from "../lib/reports";
import { prisma } from "../lib/prisma";
import { requireAuthApi } from "../middleware/auth";
import { AppError } from "../middleware/error-handler";

const router = Router();

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moduleSchema = z.enum(["finance", "loans", "all"]);

const financeQuerySchema = z.object({
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  module: moduleSchema.optional(),
  origin: z.enum(["all", "manual", "installment_payment", "loan_disbursement", "cash_adjustment"]).optional(),
  direction: z.enum(["all", "income", "expense"]).optional(),
  status: z.enum(["all", "completed", "open"]).optional(),
  categoryId: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const loansQuerySchema = z.object({
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  module: moduleSchema.optional(),
  loanStatus: z.enum(["all", "PENDENTE", "EM_DIA", "ATRASADO", "QUITADO"]).optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
});

router.use(requireAuthApi);

function readUserId(req: { user?: { sub?: string } }) {
  const parsed = Number(req.user?.sub);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getMonthStartIso(isoDate: string) {
  return `${isoDate.slice(0, 7)}-01`;
}

function resolveFinanceFilters(rawQuery: unknown, todayIso: string): FinanceReportFilters {
  const parsed = financeQuerySchema.parse(rawQuery);
  const startDate = parsed.startDate ?? getMonthStartIso(todayIso);
  const endDate = parsed.endDate ?? todayIso;
  if (startDate > endDate) {
    throw new AppError("Periodo invalido para relatorio financeiro.", 400);
  }

  const diffDays = Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000);
  return {
    startDate,
    endDate,
    origin: parsed.origin ?? "all",
    direction: parsed.direction ?? "all",
    status: parsed.status ?? "all",
    categoryId: parsed.categoryId && parsed.categoryId !== "all" ? parsed.categoryId : "all",
    groupBy: parsed.groupBy ?? (diffDays <= 62 ? "day" : "month"),
    page: parsed.page ?? 1,
    pageSize: parsed.pageSize ?? 20,
  };
}

type ReportModule = "finance" | "loans";

function resolveRequestedModule(rawQuery: unknown, fallback: ReportModule): ReportModule {
  const parsed = moduleSchema.safeParse((rawQuery as Record<string, unknown> | undefined)?.module);
  if (!parsed.success) return fallback;
  if (parsed.data === "all") return fallback;
  return parsed.data;
}

function resolveLoansFilters(rawQuery: unknown, todayIso: string): LoansReportFilters {
  const parsed = loansQuerySchema.parse(rawQuery);
  const startDate = parsed.startDate ?? getMonthStartIso(todayIso);
  const endDate = parsed.endDate ?? todayIso;
  if (startDate > endDate) {
    throw new AppError("Periodo invalido para relatorio de emprestimos.", 400);
  }

  return {
    startDate,
    endDate,
    loanStatus: parsed.loanStatus ?? "all",
    groupBy: parsed.groupBy ?? "month",
  };
}

function classifyFinanceTransactionModule(
  row: { description: string },
  context: {
    loanIds: Set<number>;
    installmentById: Map<number, number>;
  },
): ReportModule {
  const installmentMeta = parseInstallmentIncomeDescription(row.description);
  if (installmentMeta) {
    const linkedLoanId = context.installmentById.get(installmentMeta.installmentId);
    if (
      linkedLoanId === installmentMeta.loanId
      && context.loanIds.has(installmentMeta.loanId)
    ) {
      return "loans";
    }
  }

  const disbursementMeta = parseLoanDisbursementDescription(row.description);
  if (disbursementMeta && context.loanIds.has(disbursementMeta.loanId)) {
    return "loans";
  }

  return "finance";
}

function toApiFinanceType(type: FinanceTransactionType) {
  return type === FinanceTransactionType.INCOME ? "income" : "expense";
}

function toApiFinanceStatus(status: FinanceTransactionStatus) {
  if (status === FinanceTransactionStatus.COMPLETED) return "completed";
  if (status === FinanceTransactionStatus.SCHEDULED) return "scheduled";
  return "pending";
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildCategoryBreakdownByDirection(
  rows: Array<{
    direction: "income" | "expense";
    categoryId?: string | null;
    categoryName: string;
    amount: number;
  }>,
  direction: "income" | "expense",
) {
  const map = new Map<string, {
    key: string;
    label: string;
    total: number;
    count: number;
    percentage: number;
  }>();

  rows
    .filter((row) => row.direction === direction)
    .forEach((row) => {
      const key = row.categoryId ? `category:${row.categoryId}` : `category-name:${row.categoryName}`;
      const current = map.get(key) ?? {
        key,
        label: row.categoryName,
        total: 0,
        count: 0,
        percentage: 0,
      };
      current.total = round2(current.total + row.amount);
      current.count += 1;
      map.set(key, current);
    });

  const items = [...map.values()].sort((left, right) => right.total - left.total);
  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
  return items.map((item) => ({
    ...item,
    percentage: totalAmount > 0 ? round2((item.total / totalAmount) * 100) : 0,
  }));
}

function buildFinanceInsights(rows: Array<{
  description: string;
  amount: number;
  direction: "income" | "expense";
  categoryName: string;
  date: string;
}>) {
  const incomes = rows.filter((row) => row.direction === "income");
  const expenses = rows.filter((row) => row.direction === "expense");
  const biggestIncome = incomes.reduce<typeof incomes[number] | null>((best, row) => {
    if (!best || row.amount > best.amount) return row;
    return best;
  }, null);
  const biggestExpense = expenses.reduce<typeof expenses[number] | null>((best, row) => {
    if (!best || row.amount > best.amount) return row;
    return best;
  }, null);
  const incomeByCategory = buildCategoryBreakdownByDirection(rows, "income");
  const expenseByCategory = buildCategoryBreakdownByDirection(rows, "expense");
  const averageAmount = rows.length > 0
    ? round2(rows.reduce((sum, row) => sum + row.amount, 0) / rows.length)
    : 0;

  return {
    biggestIncome: biggestIncome
      ? {
        description: biggestIncome.description,
        amount: biggestIncome.amount,
        categoryName: biggestIncome.categoryName,
        date: biggestIncome.date,
      }
      : null,
    biggestExpense: biggestExpense
      ? {
        description: biggestExpense.description,
        amount: biggestExpense.amount,
        categoryName: biggestExpense.categoryName,
        date: biggestExpense.date,
      }
      : null,
    topIncomeCategory: incomeByCategory[0] ?? null,
    topExpenseCategory: expenseByCategory[0] ?? null,
    averageAmount,
    incomeByCategory,
    expenseByCategory,
  };
}

router.get("/finance", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);
  const filters = resolveFinanceFilters(req.query, todayIso);
  const requestedModule = resolveRequestedModule(req.query, "finance");
  if (requestedModule !== "finance") {
    throw new AppError("Modulo invalido para relatorio financeiro.", 400);
  }

  await ensureFinanceCategoryCatalogForUser(prisma, userId);

  const [transactions, categories, loans, installments] = await Promise.all([
    prisma.financeTransaction.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        type: true,
        amount: true,
        category: true,
        categoryId: true,
        date: true,
        description: true,
        status: true,
      },
    }),
    prisma.financeCategory.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        name: true,
        emoji: true,
        active: true,
        type: true,
      },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.loan.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    }),
    prisma.installment.findMany({
      where: { ownerUserId: userId },
      select: { id: true, loanId: true },
    }),
  ]);

  const moduleContext = {
    loanIds: new Set(loans.map((loan) => loan.id)),
    installmentById: new Map(installments.map((item) => [item.id, item.loanId])),
  };
  const scopedTransactions = transactions.filter((row) => (
    classifyFinanceTransactionModule(row, moduleContext) === requestedModule
  ));

  const report = buildFinanceReport(
    scopedTransactions.map((row) => ({
      id: row.id,
      type: toApiFinanceType(row.type),
      amount: Number(row.amount),
      category: row.category,
      categoryId: row.categoryId ? String(row.categoryId) : null,
      date: row.date.toISOString().slice(0, 10),
      description: row.description,
      status: toApiFinanceStatus(row.status),
    })),
    filters,
  );

  const scopedCategoryIds = new Set(
    scopedTransactions
      .map((row) => (row.categoryId ? String(row.categoryId) : null))
      .filter((value): value is string => Boolean(value)),
  );
  const availableCategories = categories
    .filter((category) => scopedCategoryIds.size === 0 || scopedCategoryIds.has(String(category.id)))
    .map((category) => ({
      id: String(category.id),
      name: category.name,
      emoji: category.emoji,
      active: category.active,
      type: toApiFinanceType(category.type),
    }));

  return res.json({
    filters: report.filters,
    availableCategories,
    summary: report.summary,
    series: report.series,
    breakdowns: report.breakdowns,
    analysis: buildFinanceInsights(report.allRows),
    rows: report.rows,
    pagination: report.pagination,
  });
});

router.get("/finance/export.csv", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);
  const filters = resolveFinanceFilters(req.query, todayIso);
  const requestedModule = resolveRequestedModule(req.query, "finance");
  if (requestedModule !== "finance") {
    throw new AppError("Modulo invalido para exportacao financeira.", 400);
  }

  const [transactions, loans, installments] = await Promise.all([
    prisma.financeTransaction.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        type: true,
        amount: true,
        category: true,
        categoryId: true,
        date: true,
        description: true,
        status: true,
      },
    }),
    prisma.loan.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    }),
    prisma.installment.findMany({
      where: { ownerUserId: userId },
      select: { id: true, loanId: true },
    }),
  ]);

  const moduleContext = {
    loanIds: new Set(loans.map((loan) => loan.id)),
    installmentById: new Map(installments.map((item) => [item.id, item.loanId])),
  };
  const scopedTransactions = transactions.filter((row) => (
    classifyFinanceTransactionModule(row, moduleContext) === requestedModule
  ));

  const report = buildFinanceReport(
    scopedTransactions.map((row) => ({
      id: row.id,
      type: toApiFinanceType(row.type),
      amount: Number(row.amount),
      category: row.category,
      categoryId: row.categoryId ? String(row.categoryId) : null,
      date: row.date.toISOString().slice(0, 10),
      description: row.description,
      status: toApiFinanceStatus(row.status),
    })),
    { ...filters, page: 1, pageSize: 100000 },
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="relatorio-financeiro-${filters.startDate}-${filters.endDate}.csv"`);
  return res.send(buildFinanceReportCsv(report.allRows));
});

router.get("/loans", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }
  const requestedModule = resolveRequestedModule(req.query, "loans");
  if (requestedModule !== "loans") {
    throw new AppError("Modulo invalido para relatorio de emprestimos.", 400);
  }

  const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);
  const filters = resolveLoansFilters(req.query, todayIso);

  const [loans, installments, payments] = await Promise.all([
    prisma.loan.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        principalAmount: true,
        totalAmount: true,
        installmentsCount: true,
        startDate: true,
        dueDate: true,
        client: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.installment.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        loanId: true,
        installmentNumber: true,
        amount: true,
        dueDate: true,
        principalAmount: true,
        interestAmount: true,
      },
    }),
    prisma.payment.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        loanId: true,
        installmentId: true,
        amount: true,
        paymentDate: true,
      },
    }),
  ]);

  const report = buildLoansReport(
    loans.map((loan) => ({
      id: loan.id,
      clientName: loan.client.name,
      principalAmount: Number(loan.principalAmount),
      totalAmount: Number(loan.totalAmount),
      installmentsCount: loan.installmentsCount,
      startDate: loan.startDate.toISOString().slice(0, 10),
      dueDate: loan.dueDate.toISOString().slice(0, 10),
    })),
    installments.map((installment) => ({
      id: installment.id,
      loanId: installment.loanId,
      installmentNumber: installment.installmentNumber,
      amount: Number(installment.amount),
      dueDate: installment.dueDate.toISOString().slice(0, 10),
      principalAmount: installment.principalAmount !== null ? Number(installment.principalAmount) : null,
      interestAmount: installment.interestAmount !== null ? Number(installment.interestAmount) : null,
    })),
    payments.map((payment) => ({
      id: payment.id,
      loanId: payment.loanId,
      installmentId: payment.installmentId,
      amount: Number(payment.amount),
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    })),
    filters,
  );

  return res.json(report);
});

router.get("/loans/export.csv", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }
  const requestedModule = resolveRequestedModule(req.query, "loans");
  if (requestedModule !== "loans") {
    throw new AppError("Modulo invalido para exportacao de emprestimos.", 400);
  }

  const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);
  const filters = resolveLoansFilters(req.query, todayIso);

  const [loans, installments, payments] = await Promise.all([
    prisma.loan.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        principalAmount: true,
        totalAmount: true,
        installmentsCount: true,
        startDate: true,
        dueDate: true,
        client: { select: { name: true } },
      },
    }),
    prisma.installment.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        loanId: true,
        installmentNumber: true,
        amount: true,
        dueDate: true,
        principalAmount: true,
        interestAmount: true,
      },
    }),
    prisma.payment.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        loanId: true,
        installmentId: true,
        amount: true,
        paymentDate: true,
      },
    }),
  ]);

  const report = buildLoansReport(
    loans.map((loan) => ({
      id: loan.id,
      clientName: loan.client.name,
      principalAmount: Number(loan.principalAmount),
      totalAmount: Number(loan.totalAmount),
      installmentsCount: loan.installmentsCount,
      startDate: loan.startDate.toISOString().slice(0, 10),
      dueDate: loan.dueDate.toISOString().slice(0, 10),
    })),
    installments.map((installment) => ({
      id: installment.id,
      loanId: installment.loanId,
      installmentNumber: installment.installmentNumber,
      amount: Number(installment.amount),
      dueDate: installment.dueDate.toISOString().slice(0, 10),
      principalAmount: installment.principalAmount !== null ? Number(installment.principalAmount) : null,
      interestAmount: installment.interestAmount !== null ? Number(installment.interestAmount) : null,
    })),
    payments.map((payment) => ({
      id: payment.id,
      loanId: payment.loanId,
      installmentId: payment.installmentId,
      amount: Number(payment.amount),
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    })),
    filters,
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="relatorio-emprestimos-${filters.startDate}-${filters.endDate}.csv"`);
  return res.send(buildLoansReportCsv(report.exportRows));
});

export { router as reportsRoutes };
