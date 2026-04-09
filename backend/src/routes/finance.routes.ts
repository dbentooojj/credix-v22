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
  type: transactionTypeSchema,
  amount: z.number().positive(),
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
  description: string;
  notes?: string | null;
  status: FinanceTransactionStatus;
  categoryRef?: {
    id: number;
    name: string;
    emoji: string;
    type: FinanceTransactionType;
    active: boolean;
    isPreset: boolean;
  } | null;
}) {
  return {
    id: String(row.id),
    type: toApiType(row.type),
    amount: Number(row.amount),
    categoryId: row.categoryId ? String(row.categoryId) : null,
    category: row.category,
    categoryMeta: toApiCategory(row.categoryRef),
    date: toDateOnlyIso(row.date),
    description: row.description,
    notes: row.notes || null,
    status: toApiStatus(row.status),
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

router.get("/transactions", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  await ensureFinanceCategoryCatalogForUser(prisma, userId);

  const rows = await prisma.financeTransaction.findMany({
    where: { ownerUserId: userId },
    include: {
      categoryRef: { select: financeCategoryApiSelect },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  return res.json({
    data: rows.map((row) => toApiTransaction(row)),
  });
});

router.post("/transactions", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const payload = createTransactionSchema.parse(req.body);
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
    const created = await prisma.financeTransaction.create({
      include: {
        categoryRef: { select: financeCategoryApiSelect },
      },
      data: {
        ownerUserId: userId,
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

    const installmentAmounts = installmentAmountMode === "per_installment"
      ? Array.from({ length: installmentCount }, () => centsToMoney(toMoneyCents(payload.amount)))
      : splitAmountByInstallments(payload.amount, installmentCount);

    const createdIds = await prisma.$transaction(async (tx) => {
      const ids: number[] = [];
      for (let index = 0; index < installmentCount; index += 1) {
        const created = await tx.financeTransaction.create({
          select: { id: true },
          data: {
            ownerUserId: userId,
            type,
            amount: installmentAmounts[index] ?? 0,
            categoryId: resolvedCategory.id,
            category: resolvedCategory.name,
            date: addMonthsDateOnlyUtc(baseDate, index),
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
    const ids: number[] = [];
    for (let index = 0; index < recurringMonths; index += 1) {
      const created = await tx.financeTransaction.create({
        select: { id: true },
        data: {
          ownerUserId: userId,
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
    await prisma.financeTransaction.updateMany({
      where: {
        ownerUserId: userId,
        id: { in: updatableIds },
      },
      data: {
        status: FinanceTransactionStatus.COMPLETED,
      },
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

  const updated = await prisma.financeTransaction.update({
    where: { id: transactionId },
    include: {
      categoryRef: { select: financeCategoryApiSelect },
    },
    data: {
      type: payload.type ? nextType : undefined,
      amount: payload.amount,
      categoryId: nextCategoryId,
      category: nextCategoryName,
      date: payload.date ? parseDateOnly(payload.date) : undefined,
      description: payload.description,
      notes: payload.notes !== undefined ? (payload.notes?.trim() || null) : undefined,
      status: payload.status ? toPrismaStatus(payload.status) : undefined,
    },
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

  const result = await prisma.financeTransaction.deleteMany({
    where: { id: transactionId, ownerUserId: userId },
  });

  if (result.count === 0) {
    return res.status(404).json({ message: "Transacao nao encontrada." });
  }

  return res.status(204).send();
});

export { router as financeRoutes };
