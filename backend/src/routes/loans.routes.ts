import {
  InstallmentStatus,
  InterestType,
  LoanStatus,
  Prisma,
} from "@prisma/client";
import { Router } from "express";
import { DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from "../lib/date-time";
import {
  deleteLoanDisbursementTransaction,
  upsertLoanDisbursementTransaction,
} from "../lib/installment-income-transaction";
import { prisma } from "../lib/prisma";
import { requireAuthApi } from "../middleware/auth";
import { AppError } from "../middleware/error-handler";

const router = Router();
router.use(requireAuthApi);

const LOAN_META_START = "[[LOAN_META]]";
const LOAN_META_END = "[[/LOAN_META]]";

type LoanPlanRowInput = {
  installmentNumber?: unknown;
  amount?: unknown;
  principalAmount?: unknown;
  interestAmount?: unknown;
  dueDate?: unknown;
};

function readUserId(req: { user?: { sub?: string } }): number {
  const parsed = Number(req.user?.sub);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readLoanId(rawValue: unknown): number {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError("Emprestimo invalido.", 400);
  }
  return parsed;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: unknown): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function toIsoDateOnly(input: unknown, fallback = new Date()): string {
  const raw = String(input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw || fallback.toISOString());
  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function toDateOnlyUtc(isoDate: string): Date {
  const normalized = toIsoDateOnly(isoDate, new Date());
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function stripLoanMeta(rawText: unknown): string {
  const text = String(rawText ?? "");
  const start = text.indexOf(LOAN_META_START);
  const end = text.indexOf(LOAN_META_END);
  if (start === -1 || end === -1 || end <= start) return text.trim();
  return `${text.slice(0, start)}${text.slice(end + LOAN_META_END.length)}`.trim();
}

function readLoanMeta(rawText: unknown): Record<string, unknown> {
  const text = String(rawText ?? "");
  const start = text.indexOf(LOAN_META_START);
  const end = text.indexOf(LOAN_META_END);
  if (start === -1 || end === -1 || end <= start) return {};

  try {
    return JSON.parse(text.slice(start + LOAN_META_START.length, end));
  } catch {
    return {};
  }
}

function encodeLoanObservations(userText: unknown, meta: Record<string, unknown>): string {
  const cleanText = stripLoanMeta(userText);
  const encodedMeta = `${LOAN_META_START}${JSON.stringify(meta)}${LOAN_META_END}`;
  if (!cleanText) return encodedMeta;
  return `${cleanText}\n${encodedMeta}`;
}

function resolveInterestMode(value: unknown): "composto" | "simples" | "fixo" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "simples") return "simples";
  if (normalized === "fixo") return "fixo";
  return "composto";
}

function resolveInterestTypeForLoan(value: unknown): InterestType {
  return resolveInterestMode(value) === "simples" ? InterestType.SIMPLES : InterestType.COMPOSTO;
}

function resolveLoanStatusFromDueDates(dueDates: string[]): LoanStatus {
  if (dueDates.length === 0) return LoanStatus.PENDENTE;
  const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);
  if (dueDates.some((dueDate) => dueDate < todayIso)) {
    return LoanStatus.ATRASADO;
  }
  return LoanStatus.EM_DIA;
}

function buildValidatedPlan(
  startDate: string,
  installmentsCount: number,
  rawPlan: LoanPlanRowInput[],
) {
  const safeInstallmentsCount = Math.max(1, Math.trunc(toNumber(installmentsCount)));
  const normalizedPlan = rawPlan
    .slice(0, safeInstallmentsCount)
    .map((row, index) => ({
      installmentNumber: Math.max(1, Math.trunc(toNumber(row.installmentNumber) || (index + 1))),
      dueDate: toIsoDateOnly(row.dueDate, new Date()),
      amount: round2(row.amount),
      principalAmount: round2(row.principalAmount),
      interestAmount: round2(row.interestAmount),
    }));

  if (normalizedPlan.length !== safeInstallmentsCount) {
    throw new AppError("Plano de parcelas incompleto para atualizar o emprestimo.", 400);
  }

  let previousDate = startDate;
  normalizedPlan.forEach((row, index) => {
    if (row.amount <= 0) {
      throw new AppError(`O valor da parcela #${index + 1} precisa ser maior que zero.`, 400);
    }

    if (row.dueDate <= previousDate) {
      if (index === 0) {
        throw new AppError("O primeiro vencimento precisa ser posterior a data de inicio.", 400);
      }
      throw new AppError(`A parcela #${index + 1} precisa vencer depois da parcela #${index}.`, 400);
    }

    previousDate = row.dueDate;
  });

  return normalizedPlan;
}

function isInstallmentIdUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
  return target.includes("id");
}

async function syncInstallmentIdSequence(db: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }) {
  await db.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"Installment"', 'id'),
      COALESCE((SELECT MAX(id) FROM "Installment"), 0) + 1,
      false
    )
  `);
}

router.patch("/:loanId", async (req, res) => {
  const ownerUserId = readUserId(req);
  if (!Number.isFinite(ownerUserId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const loanId = readLoanId(req.params.loanId);
  const payload = req.body ?? {};
  const clientId = readLoanId(payload.clientId);
  const principalAmount = round2(payload.principalAmount);
  const interestMode = resolveInterestMode(payload.interestType);
  const installmentsCount = Math.max(1, Math.trunc(toNumber(payload.installmentsCount)));
  const startDate = toIsoDateOnly(payload.startDate, new Date());
  const normalizedPlan = buildValidatedPlan(startDate, installmentsCount, Array.isArray(payload.plan) ? payload.plan : []);

  if (principalAmount <= 0) {
    throw new AppError("O valor principal precisa ser maior que zero.", 400);
  }

  const firstDueDate = normalizedPlan[0]?.dueDate ?? toIsoDateOnly(payload.firstDueDate, new Date());
  const dueDate = normalizedPlan[normalizedPlan.length - 1]?.dueDate ?? firstDueDate;
  const totalAmount = round2(normalizedPlan.reduce((sum, item) => sum + item.amount, 0));
  const installmentAmount = round2(payload.installmentAmount || normalizedPlan[0]?.amount || 0);
  const interestRate = round2(interestMode === "fixo" ? 0 : payload.interestRate);
  const fixedFeeAmount = round2(interestMode === "fixo" ? payload.fixedFeeAmount : 0);

  const updateLoanInTransaction = () => prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({
      where: {
        id: loanId,
        ownerUserId,
      },
      include: {
        installments: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!loan) {
      throw new AppError("Emprestimo nao encontrado.", 404);
    }

    const client = await tx.client.findFirst({
      where: {
        id: clientId,
        ownerUserId,
      },
      select: { id: true },
    });

    if (!client) {
      throw new AppError("Cliente invalido para este emprestimo.", 400);
    }

    const hasPaidInstallments = loan.installments.some((item) => item.status === InstallmentStatus.PAGO);
    if (hasPaidInstallments) {
      throw new AppError("Nao e permitido editar emprestimo com parcela paga. Estorne os pagamentos antes de editar.", 400);
    }

    const paymentRecord = await tx.payment.findFirst({
      where: {
        loanId,
      },
      select: { id: true },
    });

    if (paymentRecord) {
      throw new AppError("Nao e permitido editar emprestimo com pagamento registrado. Estorne os pagamentos antes de editar.", 400);
    }

    const existingMeta = readLoanMeta(loan.observations);
    const nextMeta = {
      ...existingMeta,
      interestMode,
      fixedAddition: fixedFeeAmount,
      maxInstallment: round2(existingMeta.maxInstallment ?? 0),
      simulationId: loan.simulationId ?? existingMeta.simulationId ?? null,
    };

    const status = resolveLoanStatusFromDueDates(normalizedPlan.map((item) => item.dueDate));

    // Defensive for legacy data: some historical rows can have mismatched ownerUserId.
    // The loan ownership is already validated above, so deleting by loanId is safe here.
    await tx.installment.deleteMany({
      where: {
        loanId,
      },
    });

    const updated = await tx.loan.update({
      where: { id: loanId },
      data: {
        clientId,
        principalAmount,
        interestRate,
        interestType: resolveInterestTypeForLoan(interestMode),
        installmentsCount,
        installmentAmount,
        totalAmount,
        startDate: toDateOnlyUtc(startDate),
        firstDueDate: toDateOnlyUtc(firstDueDate),
        dueDate: toDateOnlyUtc(dueDate),
        status,
        observations: encodeLoanObservations(payload.observations, nextMeta),
      },
      select: {
        id: true,
        clientId: true,
        totalAmount: true,
        principalAmount: true,
        status: true,
      },
    });

    await tx.installment.createMany({
      data: normalizedPlan.map((item, index) => ({
        ownerUserId,
        loanId,
        clientId,
        installmentNumber: index + 1,
        dueDate: toDateOnlyUtc(item.dueDate),
        paymentDate: null,
        amount: item.amount,
        principalAmount: item.principalAmount || null,
        interestAmount: item.interestAmount || null,
        status: item.dueDate < getIsoTodayInTimeZone(DEFAULT_TIME_ZONE) ? InstallmentStatus.ATRASADO : InstallmentStatus.PENDENTE,
        paymentMethod: null,
        notes: null,
      })),
    });

    if (status !== LoanStatus.PENDENTE) {
      await upsertLoanDisbursementTransaction(tx, {
        ownerUserId,
        loanId,
        amount: principalAmount,
        date: toDateOnlyUtc(startDate),
      });
    } else {
      await deleteLoanDisbursementTransaction(tx, {
        ownerUserId,
        loanId,
      });
    }

    return updated;
  });

  let updatedLoan: Awaited<ReturnType<typeof updateLoanInTransaction>>;
  try {
    updatedLoan = await updateLoanInTransaction();
  } catch (error) {
    if (!isInstallmentIdUniqueViolation(error)) throw error;
    await syncInstallmentIdSequence(prisma);
    updatedLoan = await updateLoanInTransaction();
  }

  return res.json({
    message: "Emprestimo atualizado",
    data: {
      id: updatedLoan.id,
      clientId: updatedLoan.clientId,
      principalAmount: Number(updatedLoan.principalAmount),
      totalAmount: Number(updatedLoan.totalAmount),
      status: updatedLoan.status,
    },
  });
});

export { router as loansRoutes };
