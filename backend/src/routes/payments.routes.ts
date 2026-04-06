import {
  InstallmentStatus,
  LoanStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { Router } from "express";
import {
  deleteInstallmentIncomeTransaction,
  upsertInstallmentIncomeTransaction,
} from "../lib/installment-income-transaction";
import { isDateBeforeTodayInTimeZone } from "../lib/date-time";
import { AppError } from "../middleware/error-handler";
import { requireAuthApi } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { createPaymentSchema } from "../schemas/payments.schemas";

const router = Router();

function toDateOnly(input: string) {
  const raw = input.trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Data de pagamento invalida", 400);
  }
  return parsed;
}

function readUserId(req: { user?: { sub?: string } }): number {
  const parsed = Number(req.user?.sub);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readInstallmentId(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError("Parcela invalida", 400);
  }
  return Math.trunc(parsed);
}

async function refreshLoanStatus(loanId: number, ownerUserId: number) {
  const installments = await prisma.installment.findMany({
    where: { loanId, ownerUserId },
    select: { status: true, dueDate: true },
  });

  if (installments.length === 0) {
    await prisma.loan.updateMany({
      where: { id: loanId, ownerUserId },
      data: { status: LoanStatus.PENDENTE },
    });
    return;
  }

  if (installments.every((i) => i.status === InstallmentStatus.PAGO)) {
    await prisma.loan.updateMany({
      where: { id: loanId, ownerUserId },
      data: { status: LoanStatus.QUITADO },
    });
    return;
  }

  const hasOverdue = installments.some((i) => (
    i.status === InstallmentStatus.ATRASADO
    || (i.status !== InstallmentStatus.PAGO && isDateBeforeTodayInTimeZone(i.dueDate))
  ));

  await prisma.loan.updateMany({
    where: { id: loanId, ownerUserId },
    data: { status: hasOverdue ? LoanStatus.ATRASADO : LoanStatus.EM_DIA },
  });
}

function isPaymentIdUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;

  const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
  return target.includes("id");
}

async function syncPaymentIdSequence(db: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }) {
  await db.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"Payment"', 'id'),
      COALESCE((SELECT MAX(id) FROM "Payment"), 0) + 1,
      false
    )
  `);
}

router.use(requireAuthApi);

router.get("/", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const loanId = req.query.loanId ? Number(req.query.loanId) : undefined;

  const payments = await prisma.payment.findMany({
    where: {
      ownerUserId: userId,
      ...(loanId ? { loanId } : {}),
    },
    include: {
      loan: {
        select: {
          clientId: true,
        },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  return res.json({
    data: payments.map((payment) => ({
      id: payment.id,
      loanId: payment.loanId,
      installmentId: payment.installmentId,
      debtorId: payment.loan.clientId,
      amount: Number(payment.amount),
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      method: payment.method,
      notes: payment.notes,
      createdAt: payment.createdAt,
    })),
  });
});

router.post("/", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const payload = createPaymentSchema.parse(req.body);
  const paymentDate = toDateOnly(payload.paymentDate);

  const persistPaymentInTransaction = () => prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({
      where: {
        id: payload.loanId,
        ownerUserId: userId,
      },
    });
    if (!loan) {
      throw new AppError("Emprestimo nao encontrado", 404);
    }

    if (payload.installmentId) {
      const installment = await tx.installment.findFirst({
        where: {
          id: payload.installmentId,
          loanId: payload.loanId,
          ownerUserId: userId,
        },
      });
      if (!installment || installment.loanId !== payload.loanId) {
        throw new AppError("Parcela nao encontrada para este emprestimo", 404);
      }
    }

    const payment = payload.installmentId
      ? await tx.payment.upsert({
          where: { installmentId: payload.installmentId },
          create: {
            ownerUserId: userId,
            loanId: payload.loanId,
            installmentId: payload.installmentId,
            amount: payload.amount,
            paymentDate,
            method: payload.method as PaymentMethod,
            notes: payload.notes?.trim() || null,
          },
          update: {
            ownerUserId: userId,
            loanId: payload.loanId,
            amount: payload.amount,
            paymentDate,
            method: payload.method as PaymentMethod,
            notes: payload.notes?.trim() || null,
          },
        })
      : await tx.payment.create({
          data: {
            ownerUserId: userId,
            loanId: payload.loanId,
            installmentId: payload.installmentId,
            amount: payload.amount,
            paymentDate,
            method: payload.method as PaymentMethod,
            notes: payload.notes?.trim() || null,
          },
        });

    if (payload.installmentId) {
      await tx.installment.updateMany({
        where: {
          id: payload.installmentId,
          ownerUserId: userId,
        },
        data: {
          status: InstallmentStatus.PAGO,
          paymentDate,
          paymentMethod: payload.method as PaymentMethod,
          notes: payload.notes?.trim() || null,
        },
      });

      await upsertInstallmentIncomeTransaction(tx, {
        ownerUserId: userId,
        installmentId: payload.installmentId,
        loanId: payload.loanId,
        amount: payload.amount,
        date: paymentDate,
      });
    }

    return payment;
  });

  let result: Awaited<ReturnType<typeof persistPaymentInTransaction>>;
  try {
    result = await persistPaymentInTransaction();
  } catch (error) {
    if (!isPaymentIdUniqueViolation(error)) throw error;
    await syncPaymentIdSequence(prisma);
    result = await persistPaymentInTransaction();
  }

  await refreshLoanStatus(payload.loanId, userId);

  return res.status(201).json({
    message: "Pagamento registrado",
    data: {
      id: result.id,
      loanId: result.loanId,
      installmentId: result.installmentId,
      amount: Number(result.amount),
      paymentDate: result.paymentDate.toISOString().slice(0, 10),
      method: result.method,
      notes: result.notes,
    },
  });
});

router.post("/installments/:installmentId/revert", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const installmentId = readInstallmentId(req.params.installmentId);

  const result = await prisma.$transaction(async (tx) => {
    const installment = await tx.installment.findFirst({
      where: {
        id: installmentId,
        ownerUserId: userId,
      },
      select: {
        id: true,
        loanId: true,
        dueDate: true,
      },
    });

    if (!installment) {
      throw new AppError("Parcela nao encontrada", 404);
    }

    await tx.payment.deleteMany({
      where: {
        ownerUserId: userId,
        installmentId,
      },
    });

    const revertedStatus = isDateBeforeTodayInTimeZone(installment.dueDate)
      ? InstallmentStatus.ATRASADO
      : InstallmentStatus.PENDENTE;

    await tx.installment.update({
      where: { id: installmentId },
      data: {
        status: revertedStatus,
        paymentDate: null,
        paymentMethod: null,
        notes: null,
      },
    });

    await deleteInstallmentIncomeTransaction(tx, {
      ownerUserId: userId,
      installmentId,
      loanId: installment.loanId,
    });

    return {
      installmentId,
      loanId: installment.loanId,
      status: revertedStatus,
    };
  });

  await refreshLoanStatus(result.loanId, userId);

  return res.json({
    message: "Pagamento estornado",
    data: {
      installmentId: result.installmentId,
      loanId: result.loanId,
      status: result.status,
    },
  });
});

router.delete("/installments/:installmentId", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const installmentId = readInstallmentId(req.params.installmentId);

  const result = await prisma.$transaction(async (tx) => {
    const installment = await tx.installment.findFirst({
      where: {
        id: installmentId,
        ownerUserId: userId,
      },
      select: {
        id: true,
        loanId: true,
        status: true,
      },
    });

    if (!installment) {
      throw new AppError("Parcela nao encontrada", 404);
    }

    if (installment.status === InstallmentStatus.PAGO) {
      throw new AppError("Nao e possivel excluir uma parcela paga. Estorne o pagamento antes de excluir.", 400);
    }

    const loanInstallments = await tx.installment.findMany({
      where: {
        ownerUserId: userId,
        loanId: installment.loanId,
      },
      select: {
        id: true,
        dueDate: true,
        amount: true,
        installmentNumber: true,
      },
      orderBy: [
        { dueDate: "asc" },
        { installmentNumber: "asc" },
      ],
    });

    if (loanInstallments.length <= 1) {
      throw new AppError("Este emprestimo possui apenas uma parcela. Exclua o emprestimo inteiro na tela de emprestimos.", 400);
    }

    await tx.payment.deleteMany({
      where: {
        ownerUserId: userId,
        installmentId,
      },
    });

    await tx.installment.delete({
      where: {
        id: installmentId,
      },
    });

    const remainingInstallments = loanInstallments.filter((item) => item.id !== installmentId);

    if (remainingInstallments.length === 0) {
      throw new AppError("Nao e possivel remover todas as parcelas do emprestimo.", 400);
    }

    const firstDueDate = remainingInstallments[0].dueDate;
    const dueDate = remainingInstallments[remainingInstallments.length - 1].dueDate;
    const totalAmount = remainingInstallments.reduce((sum, item) => sum + Number(item.amount), 0);
    const averageInstallment = totalAmount / remainingInstallments.length;
    const preservedSequenceTotal = remainingInstallments.reduce((max, item) => {
      const next = Number.isFinite(item.installmentNumber) ? item.installmentNumber : 0;
      return next > max ? next : max;
    }, 0);

    await tx.loan.updateMany({
      where: {
        id: installment.loanId,
        ownerUserId: userId,
      },
      data: {
        // Estrategia A: mantem numeracao original das parcelas (nao renumera).
        installmentsCount: Math.max(preservedSequenceTotal, 1),
        totalAmount,
        installmentAmount: averageInstallment,
        firstDueDate,
        dueDate,
      },
    });

    return {
      installmentId,
      loanId: installment.loanId,
      remainingInstallmentsCount: remainingInstallments.length,
      newLoanTotalAmount: totalAmount,
    };
  });

  await refreshLoanStatus(result.loanId, userId);

  return res.json({
    message: "Parcela excluida",
    data: result,
  });
});

export { router as paymentsRoutes };
