import {
  ClientStatus,
  InstallmentStatus,
  InterestType,
  LoanStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import {
  deleteLoanDisbursementTransaction,
  INSTALLMENT_PAYMENT_CATEGORY,
  deleteInstallmentIncomeTransaction,
  upsertLoanDisbursementTransaction,
  upsertInstallmentIncomeTransaction,
} from "../lib/installment-income-transaction";
import { isDateBeforeTodayInTimeZone } from "../lib/date-time";
import { toSafeInteger, toSafeNumber } from "../lib/numbers";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error-handler";

export type TableName = "debtors" | "loans" | "installments";

type RawRow = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeBrazilPhoneDigits(value: unknown): string {
  const digits = normalizeDigits(value);
  if (!digits) return "";

  let normalized = digits;

  // Accepts +55/55 prefix pasted from WhatsApp.
  if (normalized.startsWith("55") && normalized.length > 11) {
    normalized = normalized.slice(2);
  }

  // Defensive: keep only the last 11 digits if something longer sneaks in.
  if (normalized.length > 11) {
    normalized = normalized.slice(-11);
  }

  return normalized;
}

function normalizeAsciiUpper(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function toDateOnly(value: unknown, fallback = new Date()): Date {
  if (!value) return new Date(fallback);

  const raw = String(value).trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return new Date(Date.UTC(year, month, day));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date(fallback);
  return parsed;
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function sameDateOnly(left: Date | string | null | undefined, right: Date | string | null | undefined): boolean {
  return toIsoDate(left) === toIsoDate(right);
}

function sameMoney(left: unknown, right: unknown): boolean {
  return Math.abs(toSafeNumber(left) - toSafeNumber(right)) <= 0.01;
}

function sameNullableMoney(left: unknown, right: unknown): boolean {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty;
  return sameMoney(left, right);
}

function isUniqueConstraintError(error: unknown, fields: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
  return fields.every((field) => target.includes(field));
}

function asRows(rows: unknown[]): RawRow[] {
  return rows.filter((row): row is RawRow => Boolean(row && typeof row === "object"));
}

function normalizeClientStatus(value: unknown): ClientStatus {
  const normalized = normalizeAsciiUpper(value);
  if (normalized === "INATIVO" || normalized === "QUITADO") return ClientStatus.INATIVO;
  return ClientStatus.ATIVO;
}

function mapClientStatusToUi(value: ClientStatus): string {
  return value === ClientStatus.ATIVO ? "Ativo" : "Inativo";
}

function normalizeLoanStatus(value: unknown): LoanStatus {
  const normalized = normalizeAsciiUpper(value);

  if (normalized === "ATRASADO") return LoanStatus.ATRASADO;
  if (normalized === "FINALIZADO" || normalized === "QUITADO") return LoanStatus.QUITADO;
  if (normalized === "ATIVO" || normalized === "EM_DIA" || normalized === "EM DIA") return LoanStatus.EM_DIA;
  return LoanStatus.PENDENTE;
}

function mapLoanStatusToUi(value: LoanStatus): string {
  if (value === LoanStatus.ATRASADO) return "Atrasado";
  if (value === LoanStatus.QUITADO) return "Finalizado";
  if (value === LoanStatus.EM_DIA) return "Ativo";
  return "Pendente";
}

function normalizeInstallmentStatus(value: unknown): InstallmentStatus {
  const normalized = normalizeAsciiUpper(value);
  if (normalized === "PAGO") return InstallmentStatus.PAGO;
  if (normalized === "ATRASADO") return InstallmentStatus.ATRASADO;
  return InstallmentStatus.PENDENTE;
}

function mapInstallmentStatusToUi(value: InstallmentStatus): string {
  if (value === InstallmentStatus.PAGO) return "Pago";
  if (value === InstallmentStatus.ATRASADO) return "Atrasado";
  return "Pendente";
}

function normalizeInterestType(value: unknown): InterestType {
  const normalized = normalizeAsciiUpper(value);
  return normalized === "SIMPLES" ? InterestType.SIMPLES : InterestType.COMPOSTO;
}

function mapInterestTypeToUi(value: InterestType): string {
  return value === InterestType.SIMPLES ? "simples" : "composto";
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  const normalized = normalizeAsciiUpper(value);

  if (normalized === "DINHEIRO") return PaymentMethod.DINHEIRO;
  if (normalized === "TRANSFERENCIA") return PaymentMethod.TRANSFERENCIA;
  if (normalized === "PIX") return PaymentMethod.PIX;
  if (normalized === "CARTAO") return PaymentMethod.CARTAO;

  return PaymentMethod.PIX;
}

function mapPaymentMethodToUi(value: PaymentMethod): string {
  if (value === PaymentMethod.DINHEIRO) return "Dinheiro";
  if (value === PaymentMethod.TRANSFERENCIA) return "Transferência";
  if (value === PaymentMethod.CARTAO) return "Cartão";
  return "Pix";
}

function computeLoanStatusFromInstallments(
  installments: Array<{ status: InstallmentStatus; dueDate: Date; paymentDate: Date | null }>,
): LoanStatus {
  if (installments.length === 0) return LoanStatus.PENDENTE;

  const allPaid = installments.every((item) => item.status === InstallmentStatus.PAGO);
  if (allPaid) return LoanStatus.QUITADO;

  const hasOverdue = installments.some((item) => {
    if (item.status === InstallmentStatus.ATRASADO) return true;
    if (item.status === InstallmentStatus.PAGO) return false;
    return isDateBeforeTodayInTimeZone(item.dueDate);
  });

  if (hasOverdue) return LoanStatus.ATRASADO;
  return LoanStatus.EM_DIA;
}

async function refreshLoanStatuses(tx: Prisma.TransactionClient, loanIds: number[]) {
  const uniqueLoanIds = [...new Set(loanIds.filter((id) => Number.isFinite(id)))];
  for (const loanId of uniqueLoanIds) {
    const items = await tx.installment.findMany({
      where: { loanId },
      select: { status: true, dueDate: true, paymentDate: true },
    });

    const nextStatus = computeLoanStatusFromInstallments(items);

    await tx.loan.update({
      where: { id: loanId },
      data: { status: nextStatus },
    });
  }
}

async function ensureRowsOwnedByUser(
  tx: Prisma.TransactionClient,
  tableName: TableName,
  ids: number[],
  ownerUserId: number,
) {
  if (ids.length === 0) return;

  if (tableName === "debtors") {
    const rows = await tx.client.findMany({
      where: { id: { in: ids }, ownerUserId: { not: ownerUserId } },
      select: { id: true },
      take: 1,
    });
    if (rows.length > 0) {
      throw new AppError("Identificador de cliente pertence a outro usuario.", 403);
    }
    return;
  }

  if (tableName === "loans") {
    const rows = await tx.loan.findMany({
      where: { id: { in: ids }, ownerUserId: { not: ownerUserId } },
      select: { id: true },
      take: 1,
    });
    if (rows.length > 0) {
      throw new AppError("Identificador de emprestimo pertence a outro usuario.", 403);
    }
    return;
  }

  const rows = await tx.installment.findMany({
    where: { id: { in: ids }, ownerUserId: { not: ownerUserId } },
    select: { id: true },
    take: 1,
  });
  if (rows.length > 0) {
    throw new AppError("Identificador de parcela pertence a outro usuario.", 403);
  }
}

export async function getTableData(tableName: TableName, ownerUserId: number) {
  if (tableName === "debtors") {
    const rows = await prisma.client.findMany({
      where: { ownerUserId },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      cpf: row.cpf,
      document: row.cpf,
      email: row.email,
      status: mapClientStatusToUi(row.status),
      address: row.address,
      notes: row.notes,
      created_at: toIsoDate(row.createdAt),
    }));
  }

  if (tableName === "loans") {
    const rows = await prisma.loan.findMany({
      where: { ownerUserId },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      debtor_id: row.clientId,
      principal_amount: toSafeNumber(row.principalAmount),
      total_amount: toSafeNumber(row.totalAmount),
      installments_count: row.installmentsCount,
      interest_rate: toSafeNumber(row.interestRate),
      interest_type: mapInterestTypeToUi(row.interestType),
      installment_amount: row.installmentAmount ? toSafeNumber(row.installmentAmount) : null,
      payment_method: mapPaymentMethodToUi(row.paymentMethod),
      observations: row.observations,
      start_date: toIsoDate(row.startDate),
      first_due_date: toIsoDate(row.firstDueDate),
      due_date: toIsoDate(row.dueDate),
      status: mapLoanStatusToUi(row.status),
    }));
  }

  const rows = await prisma.installment.findMany({
    where: { ownerUserId },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    loan_id: row.loanId,
    debtor_id: row.clientId,
    installment_number: row.installmentNumber,
    due_date: toIsoDate(row.dueDate),
    payment_date: toIsoDate(row.paymentDate),
    amount: toSafeNumber(row.amount),
    principal_amount: row.principalAmount ? toSafeNumber(row.principalAmount) : null,
    interest_amount: row.interestAmount ? toSafeNumber(row.interestAmount) : null,
    status: mapInstallmentStatusToUi(row.status),
    payment_method: row.paymentMethod ? mapPaymentMethodToUi(row.paymentMethod) : null,
    notes: row.notes,
  }));
}

export async function replaceTableData(tableName: TableName, rawRows: unknown[], ownerUserId: number) {
  if (tableName === "debtors") {
    const rows = asRows(rawRows);

    try {
      await prisma.$transaction(async (tx) => {
        const maxId = (await tx.client.aggregate({ _max: { id: true } }))._max.id ?? 0;
        let nextId = maxId + 1;

        const drafted = rows.map((row) => {
          const id = toSafeInteger(row.id) ?? nextId++;
          return { id, row };
        });

        const ids = drafted.map((item) => item.id);
        await ensureRowsOwnedByUser(tx, "debtors", ids, ownerUserId);

      const existing = await tx.client.findMany({
        where: {
          id: { in: ids },
          ownerUserId,
        },
        select: { id: true, name: true, cpf: true, phone: true, email: true, status: true, address: true, notes: true },
      });
      const existingById = new Map(existing.map((item) => [item.id, item]));

      const normalized = drafted.map(({ id, row }) => {
        const current = existingById.get(id);

        const nameRaw = normalizeText(row.name);
        const name = nameRaw || current?.name;
        if (!name) {
          throw new AppError("Nome do cliente e obrigatorio.");
        }

        const hasCpfField = Object.prototype.hasOwnProperty.call(row, "cpf")
          || Object.prototype.hasOwnProperty.call(row, "document");
        const cpfInput = normalizeText(row.cpf ?? row.document);
        const cpfDigits = normalizeDigits(cpfInput);

        let cpf: string | null;
        if (!hasCpfField) {
          cpf = current?.cpf ?? null;
        } else if (!cpfDigits) {
          cpf = null;
        } else if (cpfDigits.length === 11) {
          cpf = cpfDigits;
        } else {
          throw new AppError("CPF invalido. Informe um CPF com 11 digitos.");
        }

        const phoneInput = normalizeText(row.phone);
        const phoneDigits = normalizeBrazilPhoneDigits(phoneInput);

        let phone: string;
        if (phoneDigits.length === 10 || phoneDigits.length === 11) {
          phone = phoneDigits;
        } else if (current && normalizeText(current.phone) === phoneInput) {
          phone = current.phone;
        } else {
          throw new AppError("Telefone invalido. Informe DDD + numero (10 ou 11 digitos).");
        }

        const email = (() => {
          const raw = normalizeText(row.email);
          if (raw) return raw;
          if (row.email === undefined) return current?.email ?? null;
          return null;
        })();

        const status = (() => {
          const raw = normalizeText(row.status);
          if (raw) return normalizeClientStatus(raw);
          return current?.status ?? ClientStatus.ATIVO;
        })();

        const address = (() => {
          const raw = normalizeText(row.address);
          if (raw) return raw;
          if (row.address === undefined) return current?.address ?? null;
          return null;
        })();

        const notes = (() => {
          const raw = normalizeText(row.notes);
          if (raw) return raw;
          if (row.notes === undefined) return current?.notes ?? null;
          return null;
        })();

        return {
          id,
          name,
          cpf,
          phone,
          email,
          status,
          address,
          notes,
        };
      });

      const existingClientIds = await tx.client.findMany({
        where: { ownerUserId },
        select: { id: true },
      });
      const existingClientIdSet = new Set(existingClientIds.map((item) => item.id));
      const normalizedClientIdSet = new Set(ids);
      const removedClientIds = [...existingClientIdSet].filter((clientId) => !normalizedClientIdSet.has(clientId));

      if (removedClientIds.length > 0) {
        const linkedLoan = await tx.loan.findFirst({
          where: {
            ownerUserId,
            clientId: { in: removedClientIds },
          },
          select: { id: true },
        });

        if (linkedLoan) {
          throw new AppError("Nao e permitido excluir cliente com historico de emprestimos. Marque-o como Inativo.", 400);
        }

        const linkedInstallment = await tx.installment.findFirst({
          where: {
            ownerUserId,
            clientId: { in: removedClientIds },
          },
          select: { id: true },
        });

        if (linkedInstallment) {
          throw new AppError("Nao e permitido excluir cliente com historico de parcelas. Marque-o como Inativo.", 400);
        }
      }

        if (ids.length > 0) {
          await tx.client.deleteMany({
            where: {
              ownerUserId,
              id: { notIn: ids },
            },
          });
        } else {
          await tx.client.deleteMany({ where: { ownerUserId } });
        }

        for (const row of normalized) {
          await tx.client.upsert({
            where: { id: row.id },
            create: {
              id: row.id,
              ownerUserId,
              name: row.name,
              cpf: row.cpf ?? undefined,
              phone: row.phone,
              email: row.email,
              status: row.status,
              address: row.address,
              notes: row.notes,
              // Backend-controlled "date only" createdAt (not editable by the UI).
              createdAt: toDateOnly(new Date().toISOString().slice(0, 10)),
            },
            update: {
              ownerUserId,
              name: row.name,
              cpf: row.cpf ?? undefined,
              phone: row.phone,
              email: row.email,
              status: row.status,
              address: row.address,
              notes: row.notes,
            },
          });
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error, ["ownerUserId", "cpf"]) || isUniqueConstraintError(error, ["cpf"])) {
        throw new AppError("Ja existe outro cliente com este CPF cadastrado.", 400);
      }
      throw error;
    }

    return getTableData("debtors", ownerUserId);
  }

  if (tableName === "loans") {
    const rows = asRows(rawRows);

    await prisma.$transaction(async (tx) => {
      const clientIds = new Set(
        (await tx.client.findMany({
          where: { ownerUserId },
          select: { id: true },
        })).map((item) => item.id),
      );

      const maxId = (await tx.loan.aggregate({ _max: { id: true } }))._max.id ?? 0;
      let nextId = maxId + 1;

      const normalized = rows
        .map((row) => {
          const clientId = toSafeInteger(row.debtor_id ?? row.client_id ?? row.clientId);
          if (!clientId || !clientIds.has(clientId)) return null;

          const id = toSafeInteger(row.id) ?? nextId++;
          const startDate = toDateOnly(row.start_date ?? row.startDate ?? new Date());
          const firstDueDate = toDateOnly(row.first_due_date ?? row.firstDueDate ?? startDate);
          const dueDate = toDateOnly(row.due_date ?? row.dueDate ?? firstDueDate);

          return {
            id,
            clientId,
            principalAmount: toSafeNumber(row.principal_amount ?? row.principalAmount),
            totalAmount: toSafeNumber(row.total_amount ?? row.totalAmount),
            installmentsCount: Math.max(1, toSafeInteger(row.installments_count ?? row.installmentsCount) ?? 1),
            interestRate: toSafeNumber(row.interest_rate ?? row.interestRate),
            interestType: normalizeInterestType(row.interest_type ?? row.interestType),
            installmentAmount: (() => {
              const value = row.installment_amount ?? row.installmentAmount;
              const amount = toSafeNumber(value, Number.NaN);
              return Number.isFinite(amount) ? amount : null;
            })(),
            paymentMethod: normalizePaymentMethod(row.payment_method ?? row.paymentMethod),
            observations: normalizeText(row.observations ?? row.notes) || null,
            startDate,
            firstDueDate,
            dueDate,
            status: normalizeLoanStatus(row.status),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      const ids = normalized.map((row) => row.id);
      await ensureRowsOwnedByUser(tx, "loans", ids, ownerUserId);
      const existingLoanIds = await tx.loan.findMany({
        where: { ownerUserId },
        select: { id: true },
      });
      const existingLoanIdSet = new Set(existingLoanIds.map((item) => item.id));
      const normalizedLoanIdSet = new Set(ids);
      const removedLoanIds = [...existingLoanIdSet].filter((loanId) => !normalizedLoanIdSet.has(loanId));

      const paidLoanRows = await tx.installment.findMany({
        where: {
          ownerUserId,
          status: InstallmentStatus.PAGO,
        },
        select: { loanId: true },
        distinct: ["loanId"],
      });
      const paidLoanIds = [...new Set(paidLoanRows.map((item) => item.loanId))];

      if (paidLoanIds.length > 0) {
        const normalizedById = new Map(normalized.map((row) => [row.id, row]));
        const missingPaidLoan = paidLoanIds.find((loanId) => !normalizedById.has(loanId));
        if (missingPaidLoan) {
          throw new AppError("Nao e permitido excluir emprestimo com parcela paga. Estorne os pagamentos antes de editar ou excluir.", 400);
        }

        const persistedPaidLoans = await tx.loan.findMany({
          where: {
            ownerUserId,
            id: { in: paidLoanIds },
          },
          select: {
            id: true,
            clientId: true,
            principalAmount: true,
            totalAmount: true,
            installmentsCount: true,
            interestRate: true,
            interestType: true,
            installmentAmount: true,
            paymentMethod: true,
            startDate: true,
            firstDueDate: true,
            dueDate: true,
          },
        });

        for (const persistedLoan of persistedPaidLoans) {
          const nextLoan = normalizedById.get(persistedLoan.id);
          if (!nextLoan) continue;

          const unchanged = nextLoan.clientId === persistedLoan.clientId
            && sameMoney(nextLoan.principalAmount, persistedLoan.principalAmount)
            && sameMoney(nextLoan.totalAmount, persistedLoan.totalAmount)
            && nextLoan.installmentsCount === persistedLoan.installmentsCount
            && sameMoney(nextLoan.interestRate, persistedLoan.interestRate)
            && nextLoan.interestType === persistedLoan.interestType
            && sameNullableMoney(nextLoan.installmentAmount, persistedLoan.installmentAmount)
            && nextLoan.paymentMethod === persistedLoan.paymentMethod
            && sameDateOnly(nextLoan.startDate, persistedLoan.startDate)
            && sameDateOnly(nextLoan.firstDueDate, persistedLoan.firstDueDate)
            && sameDateOnly(nextLoan.dueDate, persistedLoan.dueDate);

          if (!unchanged) {
            throw new AppError("Nao e permitido editar emprestimo com parcela paga. Estorne os pagamentos antes de editar.", 400);
          }
        }
      }

      for (const loanId of removedLoanIds) {
        await deleteLoanDisbursementTransaction(tx, { ownerUserId, loanId });
      }

      if (ids.length > 0) {
        await tx.loan.deleteMany({
          where: {
            ownerUserId,
            id: { notIn: ids },
          },
        });
      } else {
        await tx.loan.deleteMany({ where: { ownerUserId } });
      }

      for (const row of normalized) {
        await tx.loan.upsert({
          where: { id: row.id },
          create: {
            id: row.id,
            ownerUserId,
            clientId: row.clientId,
            principalAmount: row.principalAmount,
            totalAmount: row.totalAmount,
            installmentsCount: row.installmentsCount,
            interestRate: row.interestRate,
            interestType: row.interestType,
            installmentAmount: row.installmentAmount,
            paymentMethod: row.paymentMethod,
            observations: row.observations,
            startDate: row.startDate,
            firstDueDate: row.firstDueDate,
            dueDate: row.dueDate,
            status: row.status,
          },
          update: {
            ownerUserId,
            clientId: row.clientId,
            principalAmount: row.principalAmount,
            totalAmount: row.totalAmount,
            installmentsCount: row.installmentsCount,
            interestRate: row.interestRate,
            interestType: row.interestType,
            installmentAmount: row.installmentAmount,
            paymentMethod: row.paymentMethod,
            observations: row.observations,
            startDate: row.startDate,
            firstDueDate: row.firstDueDate,
            dueDate: row.dueDate,
            status: row.status,
          },
        });

        if (row.status !== LoanStatus.PENDENTE) {
          await upsertLoanDisbursementTransaction(tx, {
            ownerUserId,
            loanId: row.id,
            amount: row.principalAmount,
            date: row.startDate,
          });
        } else {
          await deleteLoanDisbursementTransaction(tx, {
            ownerUserId,
            loanId: row.id,
          });
        }
      }
    });

    return getTableData("loans", ownerUserId);
  }

  const rows = asRows(rawRows);

  await prisma.$transaction(async (tx) => {
    const loans = await tx.loan.findMany({
      where: { ownerUserId },
      select: { id: true, clientId: true, paymentMethod: true },
    });
    const loanMap = new Map(loans.map((loan) => [loan.id, loan]));

    const maxId = (await tx.installment.aggregate({ _max: { id: true } }))._max.id ?? 0;
    let nextId = maxId + 1;

    const normalized = rows
      .map((row) => {
        const loanId = toSafeInteger(row.loan_id ?? row.loanId);
        if (!loanId) return null;

        const loan = loanMap.get(loanId);
        if (!loan) return null;

        const id = toSafeInteger(row.id) ?? nextId++;
        const status = normalizeInstallmentStatus(row.status);
        const paymentMethodRaw = row.payment_method ?? row.paymentMethod;
        const paymentMethod = normalizeText(paymentMethodRaw)
          ? normalizePaymentMethod(paymentMethodRaw)
          : null;

        return {
          id,
          loanId,
          clientId: toSafeInteger(row.debtor_id ?? row.client_id ?? row.clientId) ?? loan.clientId,
          installmentNumber: Math.max(1, toSafeInteger(row.installment_number ?? row.installmentNumber) ?? 1),
          dueDate: toDateOnly(row.due_date ?? row.dueDate ?? new Date()),
          paymentDate: status === InstallmentStatus.PAGO ? toDateOnly(row.payment_date ?? row.paymentDate ?? new Date()) : null,
          amount: toSafeNumber(row.amount),
          principalAmount: (() => {
            const raw = row.principal_amount ?? row.principalAmount;
            if (raw === null || raw === undefined || raw === "") return null;
            return toSafeNumber(raw);
          })(),
          interestAmount: (() => {
            const raw = row.interest_amount ?? row.interestAmount;
            if (raw === null || raw === undefined || raw === "") return null;
            return toSafeNumber(raw);
          })(),
          status,
          paymentMethod,
          notes: normalizeText(row.notes) || null,
          fallbackLoanMethod: loan.paymentMethod,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const ids = normalized.map((row) => row.id);
    await ensureRowsOwnedByUser(tx, "installments", ids, ownerUserId);

    const persistedInstallments = await tx.installment.findMany({
      where: {
        ownerUserId,
      },
      select: {
        id: true,
        loanId: true,
        clientId: true,
        installmentNumber: true,
        dueDate: true,
        paymentDate: true,
        amount: true,
        principalAmount: true,
        interestAmount: true,
        status: true,
        paymentMethod: true,
        notes: true,
      },
    });
    const normalizedIds = new Set(ids);
    const removedInstallments = persistedInstallments.filter((item) => !normalizedIds.has(item.id));
    const normalizedById = new Map(normalized.map((row) => [row.id, row]));

    const persistedPaidInstallments = persistedInstallments.filter((item) => item.status === InstallmentStatus.PAGO);

    const loansWithPaidHistory = [...new Set(persistedPaidInstallments.map((item) => item.loanId))];
    if (loansWithPaidHistory.length > 0) {
      for (const loanId of loansWithPaidHistory) {
        const persistedLoanInstallments = persistedInstallments.filter((item) => item.loanId === loanId);
        const nextLoanInstallments = normalized.filter((item) => item.loanId === loanId);

        if (persistedLoanInstallments.length !== nextLoanInstallments.length) {
          throw new AppError("Nao e permitido alterar a agenda de parcelas de emprestimo com pagamento registrado. Estorne os pagamentos antes de editar.", 400);
        }

        for (const persistedInstallment of persistedLoanInstallments) {
          const nextInstallment = normalizedById.get(persistedInstallment.id);
          if (!nextInstallment) {
            throw new AppError("Nao e permitido alterar a agenda de parcelas de emprestimo com pagamento registrado. Estorne os pagamentos antes de editar.", 400);
          }

          const unchanged = nextInstallment.loanId === persistedInstallment.loanId
            && nextInstallment.clientId === persistedInstallment.clientId
            && nextInstallment.installmentNumber === persistedInstallment.installmentNumber
            && sameDateOnly(nextInstallment.dueDate, persistedInstallment.dueDate)
            && sameDateOnly(nextInstallment.paymentDate, persistedInstallment.paymentDate)
            && sameMoney(nextInstallment.amount, persistedInstallment.amount)
            && sameNullableMoney(nextInstallment.principalAmount, persistedInstallment.principalAmount)
            && sameNullableMoney(nextInstallment.interestAmount, persistedInstallment.interestAmount)
            && nextInstallment.status === persistedInstallment.status
            && (nextInstallment.paymentMethod ?? null) === (persistedInstallment.paymentMethod ?? null)
            && normalizeText(nextInstallment.notes) === normalizeText(persistedInstallment.notes);

          if (!unchanged) {
            throw new AppError("Nao e permitido alterar a agenda de parcelas de emprestimo com pagamento registrado. Estorne os pagamentos antes de editar.", 400);
          }
        }
      }
    }

    const loansWithoutInstallments = loans.filter((loan) => {
      if (!persistedInstallments.some((item) => item.loanId === loan.id)) return false;
      return !normalized.some((item) => item.loanId === loan.id);
    });

    if (loansWithoutInstallments.length > 0) {
      throw new AppError("Nao e permitido remover todas as parcelas de um emprestimo pela sincronizacao. Exclua o emprestimo inteiro na tela de emprestimos.", 400);
    }

    if (ids.length > 0) {
      await tx.installment.deleteMany({
        where: {
          ownerUserId,
          id: { notIn: ids },
        },
      });
    } else {
      await tx.installment.deleteMany({ where: { ownerUserId } });
      await tx.payment.deleteMany({
        where: {
          ownerUserId,
          installmentId: { not: null },
        },
      });
      await tx.financeTransaction.deleteMany({
        where: {
          ownerUserId,
          category: INSTALLMENT_PAYMENT_CATEGORY,
        },
      });
    }

    for (const row of normalized) {
      await tx.installment.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          ownerUserId,
          loanId: row.loanId,
          clientId: row.clientId,
          installmentNumber: row.installmentNumber,
          dueDate: row.dueDate,
          paymentDate: row.paymentDate,
          amount: row.amount,
          principalAmount: row.principalAmount,
          interestAmount: row.interestAmount,
          status: row.status,
          paymentMethod: row.paymentMethod,
          notes: row.notes,
        },
        update: {
          ownerUserId,
          loanId: row.loanId,
          clientId: row.clientId,
          installmentNumber: row.installmentNumber,
          dueDate: row.dueDate,
          paymentDate: row.paymentDate,
          amount: row.amount,
          principalAmount: row.principalAmount,
          interestAmount: row.interestAmount,
          status: row.status,
          paymentMethod: row.paymentMethod,
          notes: row.notes,
        },
      });

      if (row.status === InstallmentStatus.PAGO && row.paymentDate) {
        await tx.payment.upsert({
          where: { installmentId: row.id },
          create: {
            ownerUserId,
            installmentId: row.id,
            loanId: row.loanId,
            amount: row.amount,
            paymentDate: row.paymentDate,
            method: row.paymentMethod ?? row.fallbackLoanMethod ?? PaymentMethod.PIX,
            notes: row.notes,
          },
          update: {
            ownerUserId,
            loanId: row.loanId,
            amount: row.amount,
            paymentDate: row.paymentDate,
            method: row.paymentMethod ?? row.fallbackLoanMethod ?? PaymentMethod.PIX,
            notes: row.notes,
          },
        });

        await upsertInstallmentIncomeTransaction(tx, {
          ownerUserId,
          installmentId: row.id,
          loanId: row.loanId,
          amount: row.amount,
          date: row.paymentDate,
        });
      } else {
        await tx.payment.deleteMany({
          where: {
            ownerUserId,
            installmentId: row.id,
          },
        });

        await deleteInstallmentIncomeTransaction(tx, {
          ownerUserId,
          installmentId: row.id,
          loanId: row.loanId,
        });
      }
    }

    const affectedLoanIds = [...new Set([
      ...normalized.map((row) => row.loanId),
      ...removedInstallments.map((row) => row.loanId),
    ])];

    await refreshLoanStatuses(
      tx,
      affectedLoanIds,
    );
  });

  return getTableData("installments", ownerUserId);
}

