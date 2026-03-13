import { FinanceTransactionStatus, FinanceTransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuthApi } from "../middleware/auth";

const router = Router();

const transactionStatusSchema = z.enum(["completed", "scheduled", "pending"]);
const transactionTypeSchema = z.enum(["income", "expense"]);
const transactionInstallmentAmountModeSchema = z.enum(["total", "per_installment"]);
const transactionCreationModeSchema = z.enum(["single", "installments", "recurring_monthly"]);

const transactionBaseSchema = z.object({
  type: transactionTypeSchema,
  amount: z.number().positive(),
  category: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(300),
  status: transactionStatusSchema,
});

const createTransactionSchema = transactionBaseSchema.extend({
  creationMode: transactionCreationModeSchema.optional(),
  installmentCount: z.number().int().min(1).max(120).optional(),
  installmentAmountMode: transactionInstallmentAmountModeSchema.optional(),
  recurringMonths: z.number().int().min(1).max(120).optional(),
});

const updateTransactionSchema = transactionBaseSchema.partial().refine((payload) => {
  return (
    payload.type !== undefined
    || payload.amount !== undefined
    || payload.category !== undefined
    || payload.date !== undefined
    || payload.description !== undefined
    || payload.status !== undefined
  );
}, { message: "Nenhum campo para atualizar." });

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

router.use(requireAuthApi);

router.get("/transactions", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const rows = await prisma.financeTransaction.findMany({
    where: { ownerUserId: userId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  return res.json({
    data: rows.map((row) => ({
      id: String(row.id),
      type: toApiType(row.type),
      amount: Number(row.amount),
      category: row.category,
      date: toDateOnlyIso(row.date),
      description: row.description,
      status: toApiStatus(row.status),
    })),
  });
});

router.post("/transactions", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const payload = createTransactionSchema.parse(req.body);
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

  if (creationMode === "single") {
    const created = await prisma.financeTransaction.create({
      data: {
        ownerUserId: userId,
        type,
        amount: payload.amount,
        category: payload.category,
        date: baseDate,
        description: payload.description,
        status,
      },
    });

    return res.status(201).json({
      data: {
        id: String(created.id),
        type: toApiType(created.type),
        amount: Number(created.amount),
        category: created.category,
        date: toDateOnlyIso(created.date),
        description: created.description,
        status: toApiStatus(created.status),
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
            category: payload.category,
            date: addMonthsDateOnlyUtc(baseDate, index),
            description: buildInstallmentDescription(payload.description, index + 1, installmentCount),
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
          category: payload.category,
          date: addMonthsDateOnlyUtc(baseDate, index),
          description: payload.description,
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

  const existing = await prisma.financeTransaction.findFirst({
    where: { id: transactionId, ownerUserId: userId },
  });

  if (!existing) {
    return res.status(404).json({ message: "Transacao nao encontrada." });
  }

  const updated = await prisma.financeTransaction.update({
    where: { id: transactionId },
    data: {
      type: payload.type ? toPrismaType(payload.type) : undefined,
      amount: payload.amount,
      category: payload.category,
      date: payload.date ? parseDateOnly(payload.date) : undefined,
      description: payload.description,
      status: payload.status ? toPrismaStatus(payload.status) : undefined,
    },
  });

  return res.json({
    data: {
      id: String(updated.id),
      type: toApiType(updated.type),
      amount: Number(updated.amount),
      category: updated.category,
      date: toDateOnlyIso(updated.date),
      description: updated.description,
      status: toApiStatus(updated.status),
    },
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
