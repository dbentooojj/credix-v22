import { FinanceTransactionStatus, FinanceTransactionType } from "@prisma/client";
import { Router } from "express";
import { getDateOnlyTodayInTimeZone } from "../lib/date-time";
import { z } from "zod";
import { accountBalances, assertAvailableBalance, INTERNAL_TRANSFER_CATEGORY, lockFinancialOwner, requireActiveAccount, TRANSFER_REVERSAL_CATEGORY } from "../lib/financial-accounts";
import { prisma } from "../lib/prisma";
import { requireAuthApi } from "../middleware/auth";
import { AppError } from "../middleware/error-handler";

const router = Router();
router.use(requireAuthApi);
const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(120).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().trim().max(300).nullish(),
});
const transferSchema = z.object({
  sourceAccountId: z.number().int().positive(),
  destinationAccountId: z.number().int().positive(),
  amount: z.number().positive().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use no máximo duas casas decimais."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().uuid(),
});
const owner = (req: { user?: { sub?: string } }) => {
  const id = Number(req.user?.sub);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Não autenticado", 401);
  return id;
};
const accountId = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Conta inválida.", 400);
  return id;
};

router.get("/", async (req, res) => {
  const data = await prisma.$transaction((tx) => accountBalances(tx, owner(req)));
  res.json({ data, consolidatedBalance: data.reduce((sum, row) => sum + Math.round(row.balance * 100), 0) / 100 });
});

router.post("/", async (req, res) => {
  const payload = accountSchema.parse(req.body);
  const created = await prisma.financialAccount.create({ data: { ownerUserId: owner(req), ...payload } });
  res.status(201).json({ data: created });
});

router.patch("/:id", async (req, res) => {
  const userId = owner(req);
  const id = accountId(req.params.id);
  const payload = accountSchema.partial().parse(req.body);
  const result = await prisma.financialAccount.updateMany({ where: { id, ownerUserId: userId }, data: payload });
  if (!result.count) throw new AppError("Conta não encontrada.", 404);
  res.json({ data: await prisma.financialAccount.findUnique({ where: { id } }) });
});

router.patch("/:id/archive", async (req, res) => {
  const userId = owner(req);
  const id = accountId(req.params.id);
  const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    return tx.financialAccount.updateMany({ where: { id, ownerUserId: userId }, data: { archived } });
  });
  if (!result.count) throw new AppError("Conta não encontrada.", 404);
  res.json({ data: await prisma.financialAccount.findUnique({ where: { id } }) });
});

router.delete("/:id", async (req, res) => {
  const userId = owner(req);
  const id = accountId(req.params.id);
  await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    const account = await tx.financialAccount.findFirst({
      where: { id, ownerUserId: userId },
      select: {
        id: true,
        isOriginal: true,
        _count: { select: { payments: true, loans: true, transactions: true } },
      },
    });
    if (!account) throw new AppError("Conta não encontrada.", 404);
    if (account.isOriginal) throw new AppError("A Conta Original não pode ser excluída. Arquive-a se não quiser mais utilizá-la.", 409);
    if (account._count.payments > 0) {
      throw new AppError("Esta conta possui recebimentos. Estorne-os ou arquive a conta para preservar o histórico.", 409);
    }
    if (account._count.loans > 0 || account._count.transactions > 0) {
      throw new AppError("Esta conta possui histórico financeiro e não pode ser excluída. Arquive-a para preservar os lançamentos.", 409);
    }
    await tx.financialAccount.delete({ where: { id } });
  });
  res.status(204).send();
});

router.post("/transfers", async (req, res) => {
  const userId = owner(req);
  const payload = transferSchema.parse(req.body);
  if (payload.sourceAccountId === payload.destinationAccountId) throw new AppError("Selecione contas diferentes.", 400);
  const date = new Date(`${payload.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== payload.date) throw new AppError("Data inválida.", 400);
  const result = await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    const existing = await tx.financeTransaction.findMany({ where: { ownerUserId: userId, transferId: payload.idempotencyKey } });
    if (existing.length) {
      if (existing.length !== 2 || existing.some((row) => row.category !== INTERNAL_TRANSFER_CATEGORY)) throw new AppError("Chave de transferência já utilizada.", 409);
      const debit = existing.find((row) => row.type === FinanceTransactionType.EXPENSE);
      const credit = existing.find((row) => row.type === FinanceTransactionType.INCOME);
      if (debit?.financialAccountId !== payload.sourceAccountId || credit?.financialAccountId !== payload.destinationAccountId || Number(debit?.amount) !== payload.amount) throw new AppError("Chave de transferência já utilizada com outros dados.", 409);
      return { transferId: payload.idempotencyKey, duplicate: true };
    }
    await requireActiveAccount(tx, userId, payload.sourceAccountId);
    await requireActiveAccount(tx, userId, payload.destinationAccountId);
    await assertAvailableBalance(tx, userId, payload.sourceAccountId, payload.amount);
    for (const [id, type] of [[payload.sourceAccountId, FinanceTransactionType.EXPENSE], [payload.destinationAccountId, FinanceTransactionType.INCOME]] as const) {
      await tx.financeTransaction.create({ data: {
        ownerUserId: userId, financialAccountId: id, transferId: payload.idempotencyKey,
        type, amount: payload.amount, category: INTERNAL_TRANSFER_CATEGORY, date,
        description: payload.description || "Transferência entre contas", status: FinanceTransactionStatus.COMPLETED,
      } });
    }
    return { transferId: payload.idempotencyKey, duplicate: false };
  });
  res.status(result.duplicate ? 200 : 201).json({ data: result });
});

router.post("/transfers/:id/revert", async (req, res) => {
  const userId = owner(req);
  const transferId = z.string().uuid().parse(req.params.id);
  const result = await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    const rows = await tx.financeTransaction.findMany({ where: { ownerUserId: userId, transferId, category: INTERNAL_TRANSFER_CATEGORY } });
    if (rows.length !== 2) throw new AppError("Transferência não encontrada.", 404);
    const previousReversal = await tx.financeTransaction.findFirst({ where: { reversalOfId: { in: rows.map((row) => row.id) } } });
    if (previousReversal) return { transferId, duplicate: true };
    const incoming = rows.find((row) => row.type === FinanceTransactionType.INCOME);
    if (!incoming) throw new AppError("Transferência inconsistente.", 409);
    await assertAvailableBalance(tx, userId, incoming.financialAccountId, Number(incoming.amount));
    for (const row of rows) {
      await tx.financeTransaction.create({ data: {
        ownerUserId: userId, financialAccountId: row.financialAccountId, reversalOfId: row.id,
        type: row.type === FinanceTransactionType.INCOME ? FinanceTransactionType.EXPENSE : FinanceTransactionType.INCOME,
        amount: row.amount, category: TRANSFER_REVERSAL_CATEGORY, date: getDateOnlyTodayInTimeZone(),
        description: `Estorno da transferência ${transferId}`, status: FinanceTransactionStatus.COMPLETED,
      } });
    }
    return { transferId, duplicate: false };
  });
  res.json({ data: result });
});

export { router as financialAccountsRoutes };
