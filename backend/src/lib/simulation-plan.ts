import { AppError } from '../middleware/error-handler';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type SimulationPlanRow = {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
};

export function validatedPlan(raw: unknown, dueDates: string[], principal: number, total: number): SimulationPlanRow[] | null {
  if (raw === null || raw === undefined) return null; // Simulations created before this field existed.
  if (!Array.isArray(raw) || raw.length !== dueDates.length) {
    throw new AppError("Plano de parcelas incompleto.", 400);
  }
  const rows = raw.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AppError("Plano de parcelas invalido.", 400);
    }
    const item = value as Record<string, unknown>;
    const amount = Number(item.amount);
    const principalAmount = Number(item.principalAmount);
    const interestAmount = Number(item.interestAmount);
    if (Number(item.installmentNumber) !== index + 1
      || String(item.dueDate) !== dueDates[index]
      || ![amount, principalAmount, interestAmount].every(Number.isFinite)
      || amount <= 0 || principalAmount < 0 || interestAmount < 0
      || Math.abs(round2(principalAmount + interestAmount) - round2(amount)) > 0.01) {
      throw new AppError(`Parcela #${index + 1} invalida.`, 400);
    }
    return {
      installmentNumber: index + 1,
      dueDate: dueDates[index],
      amount: round2(amount),
      principalAmount: round2(principalAmount),
      interestAmount: round2(interestAmount),
    };
  });
  const sum = (field: "amount" | "principalAmount" | "interestAmount") => round2(rows.reduce((acc, row) => acc + row[field], 0));
  if (Math.abs(sum("amount") - total) > 0.01
    || Math.abs(sum("principalAmount") - principal) > 0.01
    || Math.abs(sum("interestAmount") - round2(total - principal)) > 0.01) {
    throw new AppError("Totais do plano de parcelas nao conferem.", 400);
  }
  return rows;
}

