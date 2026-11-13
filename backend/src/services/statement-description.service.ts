import { FinanceTransactionType, PrismaClient } from "@prisma/client";
import { INTERNAL_TRANSFER_CATEGORY, TRANSFER_REVERSAL_CATEGORY } from "../lib/financial-accounts";
import {
  CASH_ADJUSTMENT_CATEGORY,
  INSTALLMENT_PAYMENT_CATEGORY,
  LOAN_DISBURSEMENT_CATEGORY,
  parseInstallmentIncomeDescription,
  parseLoanDisbursementDescription,
} from "../lib/installment-income-transaction";

export type StatementTransactionRow = {
  id: number;
  category: string;
  description: string;
  notes: string | null;
  type: FinanceTransactionType;
  financialAccountId: number;
  financialAccount: { name: string };
  transferId: string | null;
  reversalOfId: number | null;
};

const snapshotName = (notes: string | null) => notes?.match(/^Cliente: (.+)$/)?.[1] ?? null;
const personSuffix = (name: string | null | undefined) => name ? ` — ${name}` : "";

/** Human-readable labels for the statement; stored descriptions remain stable identifiers. */
export async function statementDisplayDescriptions(
  db: PrismaClient,
  ownerUserId: number,
  rows: StatementTransactionRow[],
): Promise<Map<number, string>> {
  if (rows.length === 0) return new Map();

  const reversalIds = [...new Set(rows.map((row) => row.reversalOfId).filter((id): id is number => id !== null))];
  const originals = reversalIds.length ? await db.financeTransaction.findMany({
    where: { ownerUserId, id: { in: reversalIds } },
    include: { financialAccount: { select: { name: true } } },
  }) : [];
  const originalById = new Map(originals.map((row) => [row.id, row]));
  const relevant = [...rows, ...originals];

  const transferIds = [...new Set(relevant.map((row) => row.transferId).filter((id): id is string => Boolean(id)))];
  const transferRows = transferIds.length ? await db.financeTransaction.findMany({
    where: { ownerUserId, transferId: { in: transferIds }, category: INTERNAL_TRANSFER_CATEGORY },
    include: { financialAccount: { select: { name: true } } },
  }) : [];
  const transfers = new Map<string, typeof transferRows>();
  for (const row of transferRows) {
    const group = transfers.get(row.transferId as string) ?? [];
    group.push(row);
    transfers.set(row.transferId as string, group);
  }

  const loanIds = new Set<number>();
  const installmentIds = new Set<number>();
  for (const row of relevant) {
    if (row.category === LOAN_DISBURSEMENT_CATEGORY) {
      const parsed = parseLoanDisbursementDescription(row.description);
      if (parsed) loanIds.add(parsed.loanId);
    } else if (row.category === INSTALLMENT_PAYMENT_CATEGORY) {
      const parsed = parseInstallmentIncomeDescription(row.description);
      if (parsed) {
        loanIds.add(parsed.loanId);
        installmentIds.add(parsed.installmentId);
      }
    }
  }
  const [loans, installments] = await Promise.all([
    loanIds.size ? db.loan.findMany({
      where: { ownerUserId, id: { in: [...loanIds] } },
      select: { id: true, installmentsCount: true, client: { select: { name: true } } },
    }) : Promise.resolve([]),
    installmentIds.size ? db.installment.findMany({
      where: { ownerUserId, id: { in: [...installmentIds] } },
      select: { id: true, installmentNumber: true },
    }) : Promise.resolve([]),
  ]);
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const installmentById = new Map(installments.map((installment) => [installment.id, installment]));

  const transferCounterpart = (row: StatementTransactionRow) => {
    const group = transfers.get(row.transferId ?? "") ?? [];
    return group.find((item) => item.id !== row.id)?.financialAccount.name;
  };
  const describeOriginal = (row: StatementTransactionRow): string => {
    if (row.category === LOAN_DISBURSEMENT_CATEGORY) {
      const parsed = parseLoanDisbursementDescription(row.description);
      if (parsed) {
        const name = snapshotName(row.notes) ?? loanById.get(parsed.loanId)?.client.name;
        return `Empréstimo #${parsed.loanId}${name ? ` para ${name}` : " concedido"}`;
      }
    }
    if (row.category === INSTALLMENT_PAYMENT_CATEGORY) {
      const parsed = parseInstallmentIncomeDescription(row.description);
      if (parsed) {
        const loan = loanById.get(parsed.loanId);
        const installment = installmentById.get(parsed.installmentId);
        const number = installment && loan
          ? `${installment.installmentNumber}/${loan.installmentsCount}`
          : `#${parsed.installmentId}`;
        return `Parcela ${number} recebida${personSuffix(snapshotName(row.notes) ?? loan?.client.name)} · Empréstimo #${parsed.loanId}`;
      }
    }
    if (row.category === INTERNAL_TRANSFER_CATEGORY) {
      const counterpart = transferCounterpart(row);
      const label = row.type === FinanceTransactionType.EXPENSE
        ? `Transferência enviada${counterpart ? ` para ${counterpart}` : ""}`
        : `Transferência recebida${counterpart ? ` de ${counterpart}` : ""}`;
      return row.description === "Transferência entre contas" ? label : `${label} — ${row.description}`;
    }
    if (row.category === CASH_ADJUSTMENT_CATEGORY) {
      return row.description === "Ajuste manual de caixa"
        ? `Ajuste de caixa — ${row.type === FinanceTransactionType.INCOME ? "entrada" : "saída"}`
        : `Ajuste de caixa: ${row.description}`;
    }
    return row.description;
  };

  return new Map(rows.map((row) => {
    const original = row.reversalOfId === null ? null : originalById.get(row.reversalOfId);
    if (!original) return [row.id, describeOriginal(row)];
    if (original.category === LOAN_DISBURSEMENT_CATEGORY) {
      const parsed = parseLoanDisbursementDescription(original.description);
      if (parsed) {
        const name = snapshotName(row.notes) ?? snapshotName(original.notes) ?? loanById.get(parsed.loanId)?.client.name;
        return [row.id, `Saída do empréstimo #${parsed.loanId} cancelada${personSuffix(name)}`];
      }
    }
    if (original.category === INSTALLMENT_PAYMENT_CATEGORY) {
      const parsed = parseInstallmentIncomeDescription(original.description);
      if (parsed) {
        const loan = loanById.get(parsed.loanId);
        const installment = installmentById.get(parsed.installmentId);
        const number = installment && loan
          ? `${installment.installmentNumber}/${loan.installmentsCount}`
          : `#${parsed.installmentId}`;
        const name = snapshotName(row.notes) ?? snapshotName(original.notes) ?? loan?.client.name;
        return [row.id, `Recebimento da parcela ${number} cancelado${personSuffix(name)} · Empréstimo #${parsed.loanId}`];
      }
    }
    if (row.category === TRANSFER_REVERSAL_CATEGORY && original.category === INTERNAL_TRANSFER_CATEGORY) {
      const counterpart = transferCounterpart(original);
      return [row.id, original.type === FinanceTransactionType.EXPENSE
        ? `Envio${counterpart ? ` para ${counterpart}` : ""} cancelado`
        : `Recebimento${counterpart ? ` de ${counterpart}` : ""} cancelado`];
    }
    return [row.id, `Lançamento cancelado: ${describeOriginal(original)}`];
  }));
}
