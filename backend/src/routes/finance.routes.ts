import { FinanceTransactionStatus, FinanceTransactionType, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  ensureFinanceCategoryCatalogForUser,
  normalizeFinanceCategoryName,
  resolveFinanceCategorySelection,
  sanitizeFinanceCategoryEmoji,
} from "../lib/finance-categories";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error-handler";
import { requireAuthApi } from "../middleware/auth";
import { INSTALLMENT_PAYMENT_CATEGORY, LOAN_DISBURSEMENT_CATEGORY } from "../lib/installment-income-transaction";
import { getDateOnlyTodayInTimeZone } from "../lib/date-time";
import { assertAvailableBalance, FINANCIAL_REVERSAL_CATEGORY, INTERNAL_TRANSFER_CATEGORY, lockFinancialOwner, requireActiveAccount, TRANSFER_REVERSAL_CATEGORY } from "../lib/financial-accounts";
import { renderFinancialStatementPdf } from "../services/financial-statement-pdf.service";
import { statementDisplayDescriptions } from "../services/statement-description.service";

const router = Router();

const transactionStatusSchema = z.enum(["completed", "scheduled", "pending"]);
const transactionTypeSchema = z.enum(["income", "expense"]);
const transactionInstallmentAmountModeSchema = z.enum(["total", "per_installment"]);
const transactionCreationModeSchema = z.enum(["single", "installments", "recurring_monthly"]);
const categoryIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1)]);
const categoryPayloadFieldsSchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  categoryId: categoryIdSchema.optional(),
});

const transactionBaseFieldsSchema = z.object({
  financialAccountId: z.number().int().positive(),
  type: transactionTypeSchema,
  amount: z.number().positive().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use no máximo duas casas decimais."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(1000).optional(),
  status: transactionStatusSchema,
});

const createTransactionSchema = transactionBaseFieldsSchema
  .merge(categoryPayloadFieldsSchema)
  .extend({
  creationMode: transactionCreationModeSchema.optional(),
  installmentCount: z.number().int().min(1).max(120).optional(),
  installmentAmountMode: transactionInstallmentAmountModeSchema.optional(),
  recurringMonths: z.number().int().min(1).max(120).optional(),
  dueDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120).optional(),
  })
  .refine((payload) => payload.category !== undefined || payload.categoryId !== undefined, {
    message: "Categoria obrigatoria.",
    path: ["category"],
  });

const updateTransactionSchema = transactionBaseFieldsSchema
  .merge(categoryPayloadFieldsSchema)
  .partial()
  .refine((payload) => {
  return (
    payload.type !== undefined
    || payload.amount !== undefined
    || payload.category !== undefined
    || payload.categoryId !== undefined
    || payload.date !== undefined
    || payload.description !== undefined
    || payload.notes !== undefined
    || payload.status !== undefined
    || payload.financialAccountId !== undefined
  );
}, { message: "Nenhum campo para atualizar." });

const financeCategoryQuerySchema = z.object({
  type: transactionTypeSchema,
  includeInactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

const financeCategoryCreateSchema = z.object({
  type: transactionTypeSchema,
  name: z.string().trim().min(1).max(120),
  emoji: z.string().trim().max(16).optional(),
});

const financeCategoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  emoji: z.string().trim().max(16).optional(),
}).refine((payload) => payload.name !== undefined || payload.emoji !== undefined, {
  message: "Nenhum campo para atualizar.",
});

const financeCategoryArchiveSchema = z.object({
  archived: z.boolean().optional().default(true),
});

const financeCategoryApiSelect = {
  id: true,
  name: true,
  emoji: true,
  type: true,
  active: true,
  isPreset: true,
} as const;

const batchCompleteSchema = z.object({
  ids: z.array(z.union([z.number().int().positive(), z.string().trim().min(1)])).min(1).max(500),
});

const statementDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Data inválida.");
const statementPdfQuerySchema = z.object({
  startDate: statementDateSchema,
  endDate: statementDateSchema,
  accountId: z.coerce.number().int().positive().optional(),
});

const transactionListQuerySchema = z.object({
  accountId: z.coerce.number().int().positive().optional(),
  status: transactionStatusSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function toPrismaType(type: "income" | "expense"): FinanceTransactionType {
  return type === "income" ? FinanceTransactionType.INCOME : FinanceTransactionType.EXPENSE;
}

function toPrismaStatus(status: "completed" | "scheduled" | "pending"): FinanceTransactionStatus {
  if (status === "scheduled") return FinanceTransactionStatus.SCHEDULED;
  if (status === "pending") return FinanceTransactionStatus.PENDING;
  return FinanceTransactionStatus.COMPLETED;
}

function toApiType(type: FinanceTransactionType): "income" | "expense" {
  return type === FinanceTransactionType.INCOME ? "income" : "expense";
}

function toApiStatus(status: FinanceTransactionStatus): "completed" | "scheduled" | "pending" {
  if (status === FinanceTransactionStatus.SCHEDULED) return "scheduled";
  if (status === FinanceTransactionStatus.PENDING) return "pending";
  return "completed";
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toMoneyCents(amount: number): number {
  return Math.round(amount * 100);
}

function centsToMoney(amountInCents: number): number {
  return Number((amountInCents / 100).toFixed(2));
}

function splitAmountByInstallments(totalAmount: number, installmentCount: number): number[] {
  const safeCount = Math.max(1, Math.trunc(installmentCount));
  const totalCents = toMoneyCents(totalAmount);
  const baseCents = Math.floor(totalCents / safeCount);
  const remainder = totalCents - (baseCents * safeCount);

  return Array.from({ length: safeCount }, (_, index) => centsToMoney(baseCents + (index < remainder ? 1 : 0)));
}

function addMonthsDateOnlyUtc(date: Date, monthsToAdd: number): Date {
  const sourceYear = date.getUTCFullYear();
  const sourceMonth = date.getUTCMonth();
  const sourceDay = date.getUTCDate();
  const firstTargetMonth = new Date(Date.UTC(sourceYear, sourceMonth + monthsToAdd, 1));
  const targetYear = firstTargetMonth.getUTCFullYear();
  const targetMonth = firstTargetMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(sourceDay, lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

function resolveInstallmentDueDates(baseDate: Date, installmentCount: number, customDueDates?: string[]): Date[] {
  const safeCount = Math.max(1, Math.trunc(installmentCount));
  const generated = Array.from({ length: safeCount }, (_, index) => addMonthsDateOnlyUtc(baseDate, index));
  if (!Array.isArray(customDueDates) || customDueDates.length === 0) return generated;

  return generated.map((fallbackDate, index) => {
    const rawDate = customDueDates[index];
    if (!rawDate) return fallbackDate;
    return parseDateOnly(rawDate);
  });
}

function buildInstallmentDescription(baseDescription: string, installmentIndex: number, installmentCount: number): string {
  const suffix = ` (${installmentIndex}/${installmentCount})`;
  if (baseDescription.length + suffix.length <= 300) {
    return `${baseDescription}${suffix}`;
  }
  const maxBaseLength = Math.max(1, 300 - suffix.length);
  return `${baseDescription.slice(0, maxBaseLength).trimEnd()}${suffix}`;
}

function toDateOnlyIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function readUserId(req: { user?: { sub?: string } }): number {
  const parsed = Number(req.user?.sub);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

function parseOptionalId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError("Identificador invalido.");
  }
  return Math.trunc(parsed);
}

function toApiCategory(category: {
  id: number;
  name: string;
  emoji: string;
  type: FinanceTransactionType;
  active: boolean;
  isPreset: boolean;
} | null | undefined) {
  if (!category) {
    return null;
  }

  return {
    id: String(category.id),
    name: category.name,
    emoji: category.emoji,
    type: toApiType(category.type),
    active: category.active,
    isPreset: category.isPreset,
  };
}

function toApiTransaction(row: {
  id: number;
  type: FinanceTransactionType;
  amount: Prisma.Decimal | number;
  category: string;
  categoryId: number | null;
  date: Date;
  createdAt: Date;
  description: string;
  notes?: string | null;
  status: FinanceTransactionStatus;
  financialAccountId: number;
  categoryRef?: {
    id: number;
    name: string;
    emoji: string;
    type: FinanceTransactionType;
    active: boolean;
    isPreset: boolean;
  } | null;
}, displayDescription?: string) {
  return {
    id: String(row.id),
    type: toApiType(row.type),
    amount: Number(row.amount),
    categoryId: row.categoryId ? String(row.categoryId) : null,
    category: row.category,
    categoryMeta: toApiCategory(row.categoryRef),
    date: toDateOnlyIso(row.date),
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    ...(displayDescription ? { displayDescription } : {}),
    notes: row.notes || null,
    status: toApiStatus(row.status),
    financialAccountId: row.financialAccountId,
  };
}

router.use(requireAuthApi);

router.get("/categories", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const query = financeCategoryQuerySchema.parse(req.query);
  const type = toPrismaType(query.type);

  await ensureFinanceCategoryCatalogForUser(prisma, userId);

  const rows = await prisma.financeCategory.findMany({
    where: {
      ownerUserId: userId,
      type,
      ...(query.includeInactive ? {} : { active: true }),
    },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return res.json({
    data: rows.map((row) => toApiCategory(row)),
  });
});

router.post("/categories", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const payload = financeCategoryCreateSchema.parse(req.body);
  const type = toPrismaType(payload.type);

  await ensureFinanceCategoryCatalogForUser(prisma, userId);

  const normalizedName = normalizeFinanceCategoryName(payload.name);
  const existing = await prisma.financeCategory.findUnique({
    where: {
      ownerUserId_type_normalizedName: {
        ownerUserId: userId,
        type,
        normalizedName,
      },
    },
  });

  if (existing) {
    const updated = existing.active
      ? existing
      : await prisma.financeCategory.update({
        where: { id: existing.id },
        data: {
          active: true,
          emoji: existing.isPreset ? existing.emoji : sanitizeFinanceCategoryEmoji(payload.emoji) || existing.emoji,
        },
      });

    return res.status(200).json({ data: toApiCategory(updated) });
  }

  const lastCategory = await prisma.financeCategory.findFirst({
    where: { ownerUserId: userId, type },
    select: { sortOrder: true },
    orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
  });

  const created = await prisma.financeCategory.create({
    data: {
      ownerUserId: userId,
      type,
      name: payload.name.trim(),
      normalizedName,
      emoji: sanitizeFinanceCategoryEmoji(payload.emoji),
      active: true,
      isPreset: false,
      sortOrder: (lastCategory?.sortOrder ?? 1000) + 10,
    },
  });

  return res.status(201).json({ data: toApiCategory(created) });
});

router.patch("/categories/:id", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId)) {
    return res.status(400).json({ message: "Identificador invalido." });
  }

  const payload = financeCategoryUpdateSchema.parse(req.body);
  const existing = await prisma.financeCategory.findFirst({
    where: { id: categoryId, ownerUserId: userId },
  });

  if (!existing) {
    return res.status(404).json({ message: "Categoria nao encontrada." });
  }

  if (existing.isPreset) {
    throw new AppError("Categorias padrao nao podem ser editadas manualmente.", 400);
  }

  const nextName = payload.name?.trim() ?? existing.name;
  const nextNormalizedName = normalizeFinanceCategoryName(nextName);
  const conflicting = await prisma.financeCategory.findUnique({
    where: {
      ownerUserId_type_normalizedName: {
        ownerUserId: userId,
        type: existing.type,
        normalizedName: nextNormalizedName,
      },
    },
  });

  if (conflicting && conflicting.id !== existing.id) {
    throw new AppError("Ja existe uma categoria com este nome.", 409);
  }

  const updated = await prisma.financeCategory.update({
    where: { id: existing.id },
    data: {
      name: nextName,
      normalizedName: nextNormalizedName,
      emoji: payload.emoji !== undefined ? sanitizeFinanceCategoryEmoji(payload.emoji) : existing.emoji,
    },
  });

  return res.json({ data: toApiCategory(updated) });
});

router.patch("/categories/:id/archive", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId)) {
    return res.status(400).json({ message: "Identificador invalido." });
  }

  const payload = financeCategoryArchiveSchema.parse(req.body ?? {});
  const existing = await prisma.financeCategory.findFirst({
    where: { id: categoryId, ownerUserId: userId },
  });

  if (!existing) {
    return res.status(404).json({ message: "Categoria nao encontrada." });
  }

  const updated = await prisma.financeCategory.update({
    where: { id: existing.id },
    data: {
      active: !payload.archived,
    },
  });

  return res.json({ data: toApiCategory(updated) });
});

router.get("/transactions/export.pdf", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) return res.status(401).json({ message: "Não autenticado." });

  const query = statementPdfQuerySchema.parse(req.query);
  if (query.startDate > query.endDate) throw new AppError("A data inicial deve ser anterior à data final.", 400);

  const account = query.accountId
    ? await prisma.financialAccount.findFirst({ where: { id: query.accountId, ownerUserId: userId }, select: { name: true } })
    : null;
  if (query.accountId && !account) throw new AppError("Conta não encontrada.", 404);

  const rows = await prisma.financeTransaction.findMany({
    where: {
      ownerUserId: userId,
      status: FinanceTransactionStatus.COMPLETED,
      date: { gte: new Date(`${query.startDate}T00:00:00Z`), lte: new Date(`${query.endDate}T00:00:00Z`) },
      ...(query.accountId ? { financialAccountId: query.accountId } : {}),
    },
    include: { financialAccount: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  if (rows.length === 0) throw new AppError("Nenhuma movimentação concluída no período selecionado.", 404);
  const displayDescriptions = await statementDisplayDescriptions(prisma, userId, rows);

  const document = renderFinancialStatementPdf({
    startDate: query.startDate,
    endDate: query.endDate,
    accountName: account?.name ?? "Consolidado",
    issuedAt: new Date(),
    movements: rows.map((row) => ({
      date: row.date,
      createdAt: row.createdAt,
      description: displayDescriptions.get(row.id) ?? row.description,
      accountName: row.financialAccount.name,
      type: toApiType(row.type),
      amount: Number(row.amount),
    })),
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="extrato-${query.startDate}-${query.endDate}.pdf"`);
  document.on("error", (error) => res.destroy(error));
  document.pipe(res);
});

router.get("/transactions", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  await ensureFinanceCategoryCatalogForUser(prisma, userId);

  const query = transactionListQuerySchema.parse(req.query);
  const paginated = query.page !== undefined || query.pageSize !== undefined;
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.FinanceTransactionWhereInput = {
    ownerUserId: userId,
    ...(query.accountId ? { financialAccountId: query.accountId } : {}),
    ...(query.status ? { status: toPrismaStatus(query.status) } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      include: {
        categoryRef: { select: financeCategoryApiSelect },
        financialAccount: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    paginated ? prisma.financeTransaction.count({ where }) : Promise.resolve(0),
  ]);
  const displayDescriptions = await statementDisplayDescriptions(prisma, userId, rows);

  return res.json({
    data: rows.map((row) => toApiTransaction(row, displayDescriptions.get(row.id))),
    ...(paginated ? {
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    } : {}),
  });
});

router.post("/transactions", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const payload = createTransactionSchema.parse(req.body);
  await prisma.$transaction((tx) => requireActiveAccount(tx, userId, payload.financialAccountId));
  await ensureFinanceCategoryCatalogForUser(prisma, userId);

  const parsedInstallmentCount = Math.max(1, Math.trunc(payload.installmentCount ?? 1));
  const parsedRecurringMonths = Math.max(1, Math.trunc(payload.recurringMonths ?? 1));
  const creationMode = payload.creationMode
    ?? (parsedInstallmentCount > 1 ? "installments" : (parsedRecurringMonths > 1 ? "recurring_monthly" : "single"));
  const installmentCount = creationMode === "installments" ? parsedInstallmentCount : 1;
  const recurringMonths = creationMode === "recurring_monthly" ? parsedRecurringMonths : 1;
  const installmentAmountMode = payload.installmentAmountMode ?? "total";
  const type = toPrismaType(payload.type);
  const status = toPrismaStatus(payload.status);
  const baseDate = parseDateOnly(payload.date);
  const resolvedCategory = await resolveFinanceCategorySelection(prisma, {
    ownerUserId: userId,
    type,
    categoryId: parseOptionalId(payload.categoryId),
    categoryName: payload.category,
  });

  if (!resolvedCategory) {
    throw new AppError("Categoria invalida para este lancamento.", 400);
  }

  if (creationMode === "single") {
    const created = await prisma.$transaction(async (tx) => {
      await lockFinancialOwner(tx, userId);
      await requireActiveAccount(tx, userId, payload.financialAccountId);
      if (status === FinanceTransactionStatus.COMPLETED && type === FinanceTransactionType.EXPENSE) await assertAvailableBalance(tx, userId, payload.financialAccountId, payload.amount);
      return tx.financeTransaction.create({
      include: {
        categoryRef: { select: financeCategoryApiSelect },
      },
      data: {
        ownerUserId: userId,
        financialAccountId: payload.financialAccountId,
        type,
        amount: payload.amount,
        categoryId: resolvedCategory.id,
        category: resolvedCategory.name,
        date: baseDate,
        description: payload.description,
        notes: payload.notes?.trim() || null,
        status,
      },
      });
    });

    return res.status(201).json({
      data: {
        ...toApiTransaction(created),
        creationMode: "single",
        createdCount: 1,
      },
    });
  }

  if (creationMode === "installments") {
    if (installmentCount < 2) {
      return res.status(400).json({ message: "Parcelamento invalido. Informe pelo menos 2 parcelas." });
    }
    if (Array.isArray(payload.dueDates) && payload.dueDates.length > 0 && payload.dueDates.length !== installmentCount) {
      return res.status(400).json({ message: "Plano de parcelas incompleto. Revise os vencimentos informados." });
    }

    const installmentAmounts = installmentAmountMode === "per_installment"
      ? Array.from({ length: installmentCount }, () => centsToMoney(toMoneyCents(payload.amount)))
      : splitAmountByInstallments(payload.amount, installmentCount);
    const installmentDueDates = resolveInstallmentDueDates(baseDate, installmentCount, payload.dueDates);

    const createdIds = await prisma.$transaction(async (tx) => {
      await lockFinancialOwner(tx, userId);
      await requireActiveAccount(tx, userId, payload.financialAccountId);
      if (status === FinanceTransactionStatus.COMPLETED && type === FinanceTransactionType.EXPENSE) await assertAvailableBalance(tx, userId, payload.financialAccountId, installmentAmounts.reduce((a, b) => a + b, 0));
      const ids: number[] = [];
      for (let index = 0; index < installmentCount; index += 1) {
        const created = await tx.financeTransaction.create({
          select: { id: true },
          data: {
            ownerUserId: userId,
            financialAccountId: payload.financialAccountId,
            type,
            amount: installmentAmounts[index] ?? 0,
            categoryId: resolvedCategory.id,
            category: resolvedCategory.name,
            date: installmentDueDates[index] ?? addMonthsDateOnlyUtc(baseDate, index),
            description: buildInstallmentDescription(payload.description, index + 1, installmentCount),
            notes: payload.notes?.trim() || null,
            status,
          },
        });
        ids.push(created.id);
      }
      return ids;
    });

    return res.status(201).json({
      data: {
        creationMode: "installments",
        createdCount: createdIds.length,
        installmentCount,
        installmentAmountMode,
        firstId: createdIds[0] ? String(createdIds[0]) : null,
        lastId: createdIds[createdIds.length - 1] ? String(createdIds[createdIds.length - 1]) : null,
      },
    });
  }

  if (recurringMonths < 2) {
    return res.status(400).json({ message: "Recorrencia mensal invalida. Informe pelo menos 2 meses." });
  }

  const recurringAmount = centsToMoney(toMoneyCents(payload.amount));
  const createdIds = await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    await requireActiveAccount(tx, userId, payload.financialAccountId);
    if (status === FinanceTransactionStatus.COMPLETED && type === FinanceTransactionType.EXPENSE) await assertAvailableBalance(tx, userId, payload.financialAccountId, recurringAmount * recurringMonths);
    const ids: number[] = [];
    for (let index = 0; index < recurringMonths; index += 1) {
      const created = await tx.financeTransaction.create({
        select: { id: true },
        data: {
          ownerUserId: userId,
          financialAccountId: payload.financialAccountId,
          type,
          amount: recurringAmount,
          categoryId: resolvedCategory.id,
          category: resolvedCategory.name,
          date: addMonthsDateOnlyUtc(baseDate, index),
          description: payload.description,
          notes: payload.notes?.trim() || null,
          status,
        },
      });
      ids.push(created.id);
    }
    return ids;
  });

  return res.status(201).json({
    data: {
      creationMode: "recurring_monthly",
      createdCount: createdIds.length,
      recurringMonths,
      firstId: createdIds[0] ? String(createdIds[0]) : null,
      lastId: createdIds[createdIds.length - 1] ? String(createdIds[createdIds.length - 1]) : null,
    },
  });
});

router.post("/transactions/batch-complete", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const payload = batchCompleteSchema.parse(req.body);
  const requestedIds = [...new Set(
    payload.ids
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value)),
  )];

  if (requestedIds.length === 0) {
    return res.status(400).json({ message: "Nenhum identificador valido foi enviado." });
  }

  const rows = await prisma.financeTransaction.findMany({
    where: {
      ownerUserId: userId,
      id: { in: requestedIds },
    },
    select: {
      id: true,
      status: true,
    },
  });

  const existingIds = new Set(rows.map((row) => row.id));
  const alreadyCompletedIds: number[] = [];
  const updatableIds: number[] = [];

  rows.forEach((row) => {
    if (row.status === FinanceTransactionStatus.COMPLETED) {
      alreadyCompletedIds.push(row.id);
      return;
    }
    updatableIds.push(row.id);
  });

  if (updatableIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      await lockFinancialOwner(tx, userId);
      const pendingExpenses = await tx.financeTransaction.findMany({ where: { ownerUserId: userId, id: { in: updatableIds }, type: FinanceTransactionType.EXPENSE } });
      const byAccount = new Map<number, number>();
      for (const row of pendingExpenses) byAccount.set(row.financialAccountId, (byAccount.get(row.financialAccountId) ?? 0) + Number(row.amount));
      for (const [accountId, amount] of byAccount) {
        await requireActiveAccount(tx, userId, accountId);
        await assertAvailableBalance(tx, userId, accountId, amount);
      }
      await tx.financeTransaction.updateMany({
      where: {
        ownerUserId: userId,
        id: { in: updatableIds },
      },
      data: {
        status: FinanceTransactionStatus.COMPLETED,
      },
    });
    });
  }

  const notFoundIds = requestedIds.filter((id) => !existingIds.has(id));

  return res.json({
    data: {
      requestedCount: requestedIds.length,
      updatedCount: updatableIds.length,
      updatedIds: updatableIds.map(String),
      alreadyCompletedIds: alreadyCompletedIds.map(String),
      notFoundIds: notFoundIds.map(String),
    },
  });
});

router.patch("/transactions/:id", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const transactionId = Number(req.params.id);
  if (!Number.isFinite(transactionId)) {
    return res.status(400).json({ message: "Identificador invalido." });
  }

  const payload = updateTransactionSchema.parse(req.body);
  await ensureFinanceCategoryCatalogForUser(prisma, userId);

  const existing = await prisma.financeTransaction.findFirst({
    where: { id: transactionId, ownerUserId: userId },
    include: {
      categoryRef: { select: financeCategoryApiSelect },
    },
  });

  if (!existing) {
    return res.status(404).json({ message: "Transacao nao encontrada." });
  }

  if (existing.status === FinanceTransactionStatus.COMPLETED) {
    return res.status(409).json({ message: "Lancamentos confirmados nao podem ser editados." });
  }
  if (payload.financialAccountId !== undefined) await prisma.$transaction((tx) => requireActiveAccount(tx, userId, payload.financialAccountId));

  const nextType = payload.type ? toPrismaType(payload.type) : existing.type;
  let nextCategoryId: number | null | undefined;
  let nextCategoryName: string | undefined;

  if (payload.categoryId !== undefined || payload.category !== undefined) {
    const resolvedCategory = await resolveFinanceCategorySelection(prisma, {
      ownerUserId: userId,
      type: nextType,
      categoryId: parseOptionalId(payload.categoryId),
      categoryName: payload.category,
    });

    if (!resolvedCategory) {
      throw new AppError("Categoria invalida para este lancamento.", 400);
    }

    nextCategoryId = resolvedCategory.id;
    nextCategoryName = resolvedCategory.name;
  } else if (payload.type !== undefined && existing.categoryRef && existing.categoryRef.type !== nextType) {
    throw new AppError("Ao alterar o tipo do lancamento, selecione uma categoria compativel.", 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    const current = await tx.financeTransaction.findFirst({ where: { id: transactionId, ownerUserId: userId } });
    if (!current || current.status === FinanceTransactionStatus.COMPLETED) throw new AppError("Lançamento indisponível para edição.", 409);
    const nextAccountId = payload.financialAccountId ?? current.financialAccountId;
    const nextStatus = payload.status ? toPrismaStatus(payload.status) : current.status;
    await requireActiveAccount(tx, userId, nextAccountId);
    if (nextStatus === FinanceTransactionStatus.COMPLETED && nextType === FinanceTransactionType.EXPENSE) {
      await assertAvailableBalance(tx, userId, nextAccountId, payload.amount ?? Number(current.amount));
    }
    return tx.financeTransaction.update({
      where: { id: transactionId },
      include: { categoryRef: { select: financeCategoryApiSelect } },
      data: {
        type: payload.type ? nextType : undefined,
        financialAccountId: payload.financialAccountId,
        amount: payload.amount,
        categoryId: nextCategoryId,
        category: nextCategoryName,
        date: payload.date ? parseDateOnly(payload.date) : undefined,
        description: payload.description,
        notes: payload.notes !== undefined ? (payload.notes?.trim() || null) : undefined,
        status: payload.status ? toPrismaStatus(payload.status) : undefined,
      },
    });
  });

  return res.json({
    data: toApiTransaction(updated),
  });
});

router.delete("/transactions/:id", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const transactionId = Number(req.params.id);
  if (!Number.isFinite(transactionId)) {
    return res.status(400).json({ message: "Identificador invalido." });
  }

  await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    const row = await tx.financeTransaction.findFirst({ where: { id: transactionId, ownerUserId: userId } });
    if (!row) throw new AppError("Transação não encontrada.", 404);
    if (row.transferId || [INTERNAL_TRANSFER_CATEGORY, TRANSFER_REVERSAL_CATEGORY].includes(row.category)) throw new AppError("Use o estorno de transferência.", 409);
    if ([INSTALLMENT_PAYMENT_CATEGORY, LOAN_DISBURSEMENT_CATEGORY].includes(row.category)) throw new AppError("Use o estorno do pagamento ou cancelamento do empréstimo.", 409);
    if (row.reversalOfId) throw new AppError("Estorno não pode ser excluído.", 409);
    if (row.status !== FinanceTransactionStatus.COMPLETED) {
      await tx.financeTransaction.delete({ where: { id: row.id } });
      return;
    }
    const prior = await tx.financeTransaction.findUnique({ where: { reversalOfId: row.id } });
    if (prior) return;
    if (row.type === FinanceTransactionType.INCOME) await assertAvailableBalance(tx, userId, row.financialAccountId, Number(row.amount));
    await tx.financeTransaction.create({ data: {
      ownerUserId: userId, financialAccountId: row.financialAccountId, reversalOfId: row.id,
      type: row.type === FinanceTransactionType.INCOME ? FinanceTransactionType.EXPENSE : FinanceTransactionType.INCOME,
      amount: row.amount, category: FINANCIAL_REVERSAL_CATEGORY, date: getDateOnlyTodayInTimeZone(),
      description: `Estorno do lançamento #${row.id}`, status: FinanceTransactionStatus.COMPLETED,
    } });
  });
  return res.status(204).send();
});

export { router as financeRoutes };
