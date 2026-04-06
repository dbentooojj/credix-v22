import { randomUUID } from "node:crypto";
import {
  InstallmentStatus,
  InterestType,
  LoanSimulationStatus,
  LoanStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { Router } from "express";
import { addDays, DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from "../lib/date-time";
import { upsertLoanDisbursementTransaction } from "../lib/installment-income-transaction";
import { AppError } from "../middleware/error-handler";
import { requireAuthApi } from "../middleware/auth";
import { prisma } from "../lib/prisma";

type SimulationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED" | "CANCELED";

type ClientLite = {
  id: number;
  name: string;
  phone: string;
};

type LoanSimulationWithRefs = Prisma.LoanSimulationGetPayload<{
  include: {
    client: {
      select: {
        id: true;
        name: true;
        phone: true;
      };
    };
    loan: {
      select: {
        id: true;
      };
    };
  };
}>;

const router = Router();
router.use(requireAuthApi);

const LOAN_META_START = "[[LOAN_META]]";
const LOAN_META_END = "[[/LOAN_META]]";

function readUserId(req: { user?: { sub?: string } }): number {
  const parsed = Number(req.user?.sub);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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

function addMonthsIsoDate(baseIsoDate: string, months: number): string {
  const match = String(baseIsoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return baseIsoDate;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const absoluteMonth = (year * 12) + (month - 1) + Math.trunc(months);
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonthIndex = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonthIndex + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);

  const mm = String(nextMonthIndex + 1).padStart(2, "0");
  const dd = String(safeDay).padStart(2, "0");
  return `${nextYear}-${mm}-${dd}`;
}

function toDateOnlyUtc(isoDate: string): Date {
  const normalized = toIsoDateOnly(isoDate, new Date());
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function splitAmount(total: number, parts: number): number[] {
  const safeParts = Math.max(1, Math.trunc(toNumber(parts)));
  const cents = Math.round(round2(total) * 100);
  const base = Math.floor(cents / safeParts);
  const remainder = cents - (base * safeParts);

  return Array.from({ length: safeParts }, (_item, index) => {
    const current = base + (index === safeParts - 1 ? remainder : 0);
    return round2(current / 100);
  });
}

function resolveInterestTypeForLoan(value: unknown): InterestType {
  const interestType = String(value ?? "").trim().toLowerCase();
  if (interestType === "simples") return InterestType.SIMPLES;
  return InterestType.COMPOSTO;
}

function resolveLoanStatusFromDueDates(dueDates: string[]): LoanStatus {
  if (dueDates.length === 0) return LoanStatus.PENDENTE;
  const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);
  if (dueDates.some((dueDate) => dueDate < todayIso)) {
    return LoanStatus.ATRASADO;
  }
  return LoanStatus.EM_DIA;
}

function stripLoanMeta(rawText: unknown): string {
  const text = String(rawText ?? "");
  const start = text.indexOf(LOAN_META_START);
  const end = text.indexOf(LOAN_META_END);
  if (start === -1 || end === -1 || end <= start) return text.trim();
  return `${text.slice(0, start)}${text.slice(end + LOAN_META_END.length)}`.trim();
}

function encodeLoanObservations(userText: unknown, meta: Record<string, unknown>): string {
  const cleanText = stripLoanMeta(userText);
  const encodedMeta = `${LOAN_META_START}${JSON.stringify(meta)}${LOAN_META_END}`;
  if (!cleanText) return encodedMeta;
  return `${cleanText}\n${encodedMeta}`;
}

function resolveSimulationDueDates(firstDueDate: string, dueDates: string[], count: number): string[] {
  const safeCount = Math.max(1, Math.trunc(toNumber(count)));
  const explicitDueDates = dueDates
    .map((dueDate) => toIsoDateOnly(dueDate, new Date()))
    .filter(Boolean);

  const normalizedFirstDueDate = toIsoDateOnly(firstDueDate || explicitDueDates[0], new Date());
  return Array.from({ length: safeCount }, (_item, index) => {
    return explicitDueDates[index] || addMonthsIsoDate(normalizedFirstDueDate, index);
  });
}

function isIdUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
  return target.includes("id");
}

function isSimulationLinkUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
  return target.includes("simulationId");
}

function formatCurrencyBRL(value: unknown): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatDateDayMonthShort(input: unknown): string {
  const raw = String(input ?? "").trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "-";

  const monthIndex = Number(match[2]) - 1;
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const month = months[monthIndex] ?? null;
  if (!month) return "-";

  return `${match[3]} ${month}`;
}

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeBrazilPhoneDigits(value: unknown): string {
  const digits = normalizeDigits(value);
  if (!digits) return "";

  let normalized = digits;
  if (normalized.startsWith("55") && normalized.length > 11) {
    normalized = normalized.slice(2);
  }
  if (normalized.length > 11) {
    normalized = normalized.slice(-11);
  }
  return normalized;
}

function toWhatsAppPhone(value: unknown): string | null {
  const digits = normalizeBrazilPhoneDigits(value);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return `55${digits}`;
}

async function findClient(ownerUserId: number, clientId: number): Promise<ClientLite | null> {
  return prisma.client.findFirst({
    where: {
      ownerUserId,
      id: clientId,
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });
}

function parseStatusFilter(rawStatus: unknown): Set<SimulationStatus> | null {
  const input = String(rawStatus ?? "").trim().toUpperCase();
  if (!input) return null;
  const statuses = input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item): item is SimulationStatus => (
      item === "DRAFT"
      || item === "SENT"
      || item === "ACCEPTED"
      || item === "EXPIRED"
      || item === "CANCELED"
    ));

  return statuses.length > 0 ? new Set(statuses) : null;
}

function getSimulationStatusLabel(status: SimulationStatus): string {
  if (status === "DRAFT") return "Rascunho";
  if (status === "SENT") return "Enviada";
  if (status === "ACCEPTED") return "Aceita";
  if (status === "EXPIRED") return "Expirada";
  if (status === "CANCELED") return "Cancelada";
  return status;
}

function computeTotalsFromPayload(payload: Record<string, unknown>) {
  const principal = round2(payload.principalAmount);
  const installments = Math.max(1, Math.trunc(toNumber(payload.installmentsCount)));
  const interestType = String(payload.interestType ?? "composto").toLowerCase();
  const interestRate = round2(payload.interestRate);
  const fixedFeeAmount = round2(payload.fixedFeeAmount);

  const explicitTotal = round2((payload._preview as Record<string, unknown> | undefined)?.totalAmount);
  if (explicitTotal > 0) {
    return {
      totalAmount: explicitTotal,
      installmentAmount: round2(explicitTotal / installments),
      interestRate,
      fixedFeeAmount,
    };
  }

  if (interestType === "fixo") {
    const totalAmount = round2(principal + fixedFeeAmount);
    return {
      totalAmount,
      installmentAmount: round2(totalAmount / installments),
      interestRate: 0,
      fixedFeeAmount,
    };
  }

  const totalAmount = round2(principal * (1 + (interestRate / 100) * installments));
  return {
    totalAmount,
    installmentAmount: round2(totalAmount / installments),
    interestRate,
    fixedFeeAmount: 0,
  };
}

function resolveEffectiveSimulationStatus(row: {
  status: LoanSimulationStatus;
  expiresAt: Date;
}): SimulationStatus {
  const nowIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);
  const expiresAtIso = row.expiresAt.toISOString().slice(0, 10);
  if ((row.status === LoanSimulationStatus.DRAFT || row.status === LoanSimulationStatus.SENT) && expiresAtIso < nowIso) {
    return "EXPIRED";
  }
  return row.status;
}

function mapRowForResponse(row: LoanSimulationWithRefs) {
  const dueDates = resolveSimulationDueDates(
    row.firstDueDate.toISOString().slice(0, 10),
    row.dueDates,
    row.installmentsCount,
  );
  const effectiveStatus = resolveEffectiveSimulationStatus(row);
  const clientName = row.client?.name ?? row.clientName ?? `Cliente #${row.clientId}`;
  const clientPhone = row.client?.phone ?? row.clientPhone ?? null;

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    clientId: row.clientId,
    clientName,
    clientPhone,
    principalAmount: Number(row.principalAmount),
    interestType: row.interestType,
    interestRate: Number(row.interestRate),
    fixedFeeAmount: Number(row.fixedFeeAmount),
    installmentsCount: row.installmentsCount,
    startDate: row.startDate.toISOString().slice(0, 10),
    firstDueDate: row.firstDueDate.toISOString().slice(0, 10),
    dueDates,
    observations: row.observations ?? "",
    status: effectiveStatus,
    loanId: row.loan?.id ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString().slice(0, 10),
    totals: {
      totalAmount: Number(row.totalAmount),
      installmentAmount: Number(row.installmentAmount),
    },
    schedule: dueDates.map((dueDate) => ({ dueDate })),
    client: {
      id: row.clientId,
      name: clientName,
      phone: clientPhone,
    },
    statusLabel: getSimulationStatusLabel(effectiveStatus),
  };
}

async function readSimulation(ownerUserId: number, simulationId: string) {
  return prisma.loanSimulation.findFirst({
    where: {
      id: simulationId,
      ownerUserId,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      loan: {
        select: {
          id: true,
        },
      },
    },
  });
}

router.get("/", async (req, res) => {
  const ownerUserId = readUserId(req);
  if (!Number.isFinite(ownerUserId)) return res.status(401).json({ message: "Nao autenticado" });

  const statusFilter = parseStatusFilter(req.query.status);
  const rows = await prisma.loanSimulation.findMany({
    where: {
      ownerUserId,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      loan: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });

  const mapped = rows
    .map((row) => mapRowForResponse(row))
    .filter((row) => (statusFilter ? statusFilter.has(row.status) : true));

  return res.json({ data: mapped });
});

router.post("/", async (req, res) => {
  const ownerUserId = readUserId(req);
  if (!Number.isFinite(ownerUserId)) return res.status(401).json({ message: "Nao autenticado" });

  const payload = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const simulationId = String(payload.id ?? "").trim() || randomUUID();
  const now = new Date();
  const startDate = toIsoDateOnly(payload.startDate, now);
  const firstDueDate = toIsoDateOnly(payload.firstDueDate ?? payload.startDate, now);
  const dueDates = resolveSimulationDueDates(
    firstDueDate,
    Array.isArray(payload.dueDates) ? payload.dueDates.map((item) => toIsoDateOnly(item, now)) : [firstDueDate],
    Math.max(1, Math.trunc(toNumber(payload.installmentsCount))),
  );
  const totals = computeTotalsFromPayload(payload);
  const clientId = Math.max(1, Math.trunc(toNumber(payload.clientId)));
  const client = await findClient(ownerUserId, clientId);
  if (!client) {
    return res.status(400).json({ message: "Cliente invalido para simulacao." });
  }

  const created = await prisma.loanSimulation.create({
    data: {
      id: simulationId,
      ownerUserId,
      clientId,
      clientName: client.name,
      clientPhone: client.phone,
      principalAmount: round2(payload.principalAmount),
      interestType: String(payload.interestType ?? "composto").toLowerCase(),
      interestRate: totals.interestRate,
      fixedFeeAmount: totals.fixedFeeAmount,
      installmentsCount: Math.max(1, Math.trunc(toNumber(payload.installmentsCount))),
      startDate: toDateOnlyUtc(startDate),
      firstDueDate: toDateOnlyUtc(firstDueDate),
      dueDates,
      observations: String(payload.observations ?? "").trim() || null,
      status: LoanSimulationStatus.DRAFT,
      totalAmount: totals.totalAmount,
      installmentAmount: totals.installmentAmount,
      expiresAt: toDateOnlyUtc(addDays(getIsoTodayInTimeZone(DEFAULT_TIME_ZONE), 7)),
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      loan: {
        select: {
          id: true,
        },
      },
    },
  });

  return res.status(201).json({ data: mapRowForResponse(created) });
});

router.post("/:id/send", async (req, res) => {
  const ownerUserId = readUserId(req);
  if (!Number.isFinite(ownerUserId)) return res.status(401).json({ message: "Nao autenticado" });

  const id = String(req.params.id ?? "").trim();
  const row = await readSimulation(ownerUserId, id);
  if (!row) return res.status(404).json({ message: "Simulacao nao encontrada" });

  await prisma.loanSimulation.update({
    where: { id: row.id },
    data: {
      status: LoanSimulationStatus.SENT,
    },
  });

  const updatedRow = await readSimulation(ownerUserId, id);
  if (!updatedRow) return res.status(404).json({ message: "Simulacao nao encontrada" });

  const clientPhone = updatedRow.client?.phone ?? updatedRow.clientPhone ?? null;
  const waPhone = toWhatsAppPhone(clientPhone);
  const paymentDatesList = updatedRow.dueDates
    .map((date) => formatDateDayMonthShort(date))
    .filter((date) => date !== "-");
  const paymentDatesBlock = paymentDatesList.length > 0
    ? paymentDatesList.map((date) => `- ${date}`).join("\n")
    : "- -";

  const whatsappMessage = [
    `*Valor total:* ${formatCurrencyBRL(updatedRow.totalAmount)}`,
    `*Valor da parcela:* ${formatCurrencyBRL(updatedRow.installmentAmount)}`,
    "",
    "*Datas de pagamento:*",
    paymentDatesBlock,
  ].join("\n");
  const whatsappUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  return res.json({ data: { ...mapRowForResponse(updatedRow), whatsappMessage, whatsappUrl } });
});

router.post("/:id/approve", async (req, res) => {
  const ownerUserId = readUserId(req);
  if (!Number.isFinite(ownerUserId)) return res.status(401).json({ message: "Nao autenticado" });

  const id = String(req.params.id ?? "").trim();
  const existingSimulation = await readSimulation(ownerUserId, id);
  if (!existingSimulation) return res.status(404).json({ message: "Simulacao nao encontrada" });

  if (existingSimulation.loan?.id) {
    await prisma.loanSimulation.update({
      where: { id: existingSimulation.id },
      data: { status: LoanSimulationStatus.ACCEPTED },
    });

    const alreadyAccepted = await readSimulation(ownerUserId, id);
    if (!alreadyAccepted) return res.status(404).json({ message: "Simulacao nao encontrada" });
    return res.json({ data: mapRowForResponse(alreadyAccepted) });
  }

  const client = await findClient(ownerUserId, existingSimulation.clientId);
  if (!client) {
    return res.status(400).json({ message: "Cliente invalido para aprovar simulacao." });
  }

  let createdLoanId: number | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      createdLoanId = await prisma.$transaction(async (tx) => {
        const lockedSimulation = await tx.loanSimulation.findFirst({
          where: {
            id,
            ownerUserId,
          },
          include: {
            loan: {
              select: {
                id: true,
              },
            },
          },
        });

        if (!lockedSimulation) {
          throw new AppError("Simulacao nao encontrada", 404);
        }

        if (lockedSimulation.loan?.id) {
          await tx.loanSimulation.update({
            where: { id: lockedSimulation.id },
            data: { status: LoanSimulationStatus.ACCEPTED },
          });
          return lockedSimulation.loan.id;
        }

        const dueDates = resolveSimulationDueDates(
          lockedSimulation.firstDueDate.toISOString().slice(0, 10),
          lockedSimulation.dueDates,
          lockedSimulation.installmentsCount,
        );
        const installmentsCount = Math.max(1, Math.trunc(toNumber(lockedSimulation.installmentsCount)));
        const principalAmount = round2(lockedSimulation.principalAmount);
        const totalAmount = round2(lockedSimulation.totalAmount);
        const installmentAmount = round2(lockedSimulation.installmentAmount);
        const interestAmountTotal = Math.max(round2(totalAmount - principalAmount), 0);
        const normalizedInterestType = String(lockedSimulation.interestType || "composto").trim().toLowerCase();
        const fixedAddition = round2(normalizedInterestType === "fixo" ? (lockedSimulation.fixedFeeAmount || lockedSimulation.interestRate) : 0);
        const loanInterestRate = round2(normalizedInterestType === "fixo" ? 0 : lockedSimulation.interestRate);
        const interestType = resolveInterestTypeForLoan(normalizedInterestType);
        const loanStatus = resolveLoanStatusFromDueDates(dueDates);

        const loanMeta = {
          interestMode: normalizedInterestType === "simples" ? "simples" : (normalizedInterestType === "fixo" ? "fixo" : "composto"),
          fixedAddition,
          maxInstallment: 0,
          simulationId: lockedSimulation.id,
        };

        const observations = encodeLoanObservations(lockedSimulation.observations, loanMeta);
        const installmentValues = splitAmount(totalAmount, installmentsCount);
        const principalValues = splitAmount(principalAmount, installmentsCount);
        const interestValues = splitAmount(interestAmountTotal, installmentsCount);
        const todayIso = getIsoTodayInTimeZone(DEFAULT_TIME_ZONE);

        const [loanMax, installmentMax] = await Promise.all([
          tx.loan.aggregate({ _max: { id: true } }),
          tx.installment.aggregate({ _max: { id: true } }),
        ]);

        const nextLoanId = (loanMax._max.id ?? 0) + 1;
        const nextInstallmentId = (installmentMax._max.id ?? 0) + 1;

        const loan = await tx.loan.create({
          data: {
            id: nextLoanId,
            ownerUserId,
            clientId: lockedSimulation.clientId,
            principalAmount,
            interestRate: loanInterestRate,
            interestType,
            installmentsCount,
            installmentAmount,
            totalAmount,
            paymentMethod: PaymentMethod.PIX,
            startDate: lockedSimulation.startDate,
            firstDueDate: toDateOnlyUtc(dueDates[0] || lockedSimulation.firstDueDate.toISOString().slice(0, 10)),
            dueDate: toDateOnlyUtc(dueDates[dueDates.length - 1] || dueDates[0] || lockedSimulation.firstDueDate.toISOString().slice(0, 10)),
            simulationId: lockedSimulation.id,
            status: loanStatus,
            observations,
          },
          select: { id: true },
        });

        await tx.installment.createMany({
          data: dueDates.map((dueDate, index) => ({
            id: nextInstallmentId + index,
            ownerUserId,
            loanId: loan.id,
            clientId: lockedSimulation.clientId,
            installmentNumber: index + 1,
            dueDate: toDateOnlyUtc(dueDate),
            paymentDate: null,
            amount: installmentValues[index] ?? installmentAmount,
            principalAmount: principalValues[index] ?? null,
            interestAmount: interestValues[index] ?? null,
            status: dueDate < todayIso ? InstallmentStatus.ATRASADO : InstallmentStatus.PENDENTE,
            paymentMethod: null,
            notes: null,
          })),
        });

        if (loanStatus !== LoanStatus.PENDENTE) {
          await upsertLoanDisbursementTransaction(tx, {
            ownerUserId,
            loanId: loan.id,
            amount: principalAmount,
            date: lockedSimulation.startDate,
          });
        }

        await tx.loanSimulation.update({
          where: { id: lockedSimulation.id },
          data: {
            status: LoanSimulationStatus.ACCEPTED,
            clientName: client.name,
            clientPhone: client.phone,
          },
        });

        return loan.id;
      });
      break;
    } catch (error) {
      if (isSimulationLinkUniqueViolation(error)) {
        const linkedLoan = await prisma.loan.findFirst({
          where: {
            ownerUserId,
            simulationId: id,
          },
          select: { id: true },
        });

        if (linkedLoan) {
          createdLoanId = linkedLoan.id;
          await prisma.loanSimulation.updateMany({
            where: {
              id,
              ownerUserId,
            },
            data: {
              status: LoanSimulationStatus.ACCEPTED,
            },
          });
          break;
        }
      }

      if (isIdUniqueViolation(error) && attempt < 2) {
        continue;
      }

      throw error;
    }
  }

  if (!createdLoanId) {
    throw new AppError("Falha ao criar emprestimo da simulacao.");
  }

  const approvedSimulation = await readSimulation(ownerUserId, id);
  if (!approvedSimulation) return res.status(404).json({ message: "Simulacao nao encontrada" });

  return res.json({ data: mapRowForResponse(approvedSimulation) });
});

router.post("/:id/cancel", async (req, res) => {
  const ownerUserId = readUserId(req);
  if (!Number.isFinite(ownerUserId)) return res.status(401).json({ message: "Nao autenticado" });

  const id = String(req.params.id ?? "").trim();
  const row = await readSimulation(ownerUserId, id);
  if (!row) return res.status(404).json({ message: "Simulacao nao encontrada" });

  await prisma.loanSimulation.update({
    where: { id: row.id },
    data: {
      status: LoanSimulationStatus.CANCELED,
    },
  });

  const canceledSimulation = await readSimulation(ownerUserId, id);
  if (!canceledSimulation) return res.status(404).json({ message: "Simulacao nao encontrada" });
  return res.json({ data: mapRowForResponse(canceledSimulation) });
});

export { router as loanSimulationsRoutes };
