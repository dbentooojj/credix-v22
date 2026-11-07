import { computeOutstandingAmount } from "./dashboard-metrics-rules";

type Client = { id: number; status: string };
type Loan = { id: number; clientId: number; status: string; startDate: string };
type Installment = {
  id: number; clientId: number; loanId: number; status: string;
  dueDate: string; paymentDate: string | null; amount: number; paidAmount: number;
};
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round(
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
));

/** Same Credix score weights and thresholds as the original Clients page. */
export function buildClientOverview<T extends Client>(clients: T[], loans: Loan[], installments: Installment[], today: string) {
  const loansByClient = new Map<number, Loan[]>();
  const installmentsByClient = new Map<number, Installment[]>();
  const loanMap = new Map(loans.map((loan) => [loan.id, loan]));
  for (const loan of loans) {
    const items = loansByClient.get(loan.clientId) ?? [];
    items.push(loan);
    loansByClient.set(loan.clientId, items);
  }
  for (const installment of installments) {
    const items = installmentsByClient.get(installment.clientId) ?? [];
    items.push(installment);
    installmentsByClient.set(installment.clientId, items);
  }
  return clients.map((client) => {
    const clientLoans = loansByClient.get(client.id) ?? [];
    const history = (installmentsByClient.get(client.id) ?? []).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
    let openTotal = 0, overdueTotal = 0, overdueCount = 0, pendingCount = 0, maxOverdueDays = 0;
    let scoreRaw = 500;
    for (const item of history) {
      // Use actual payments, including partial amounts, just like the reports.
      const outstanding = round2(computeOutstandingAmount(item.amount, item.paidAmount));
      if ((loanMap.get(item.loanId)?.startDate ?? today) <= today && outstanding > 0) {
        openTotal = round2(openTotal + outstanding);
        if (item.dueDate < today) {
          overdueCount += 1;
          overdueTotal = round2(overdueTotal + outstanding);
          maxOverdueDays = Math.max(maxOverdueDays, daysBetween(item.dueDate, today));
        } else pendingCount += 1;
      }
      if (item.dueDate > today && item.status !== "PAGO") continue;
      const isPaid = item.status === "PAGO" || Boolean(item.paymentDate);
      if (isPaid) {
        const late = item.paymentDate ? daysBetween(item.dueDate, item.paymentDate) : 0;
        scoreRaw += late === 0 ? 12 : late <= 3 ? -8 : late <= 7 ? -20 : late <= 15 ? -38 : -60;
      } else {
        const late = daysBetween(item.dueDate, today);
        if (late > 0) scoreRaw -= late <= 7 ? 48 : late <= 15 ? 78 : late <= 30 ? 118 : 165;
      }
    }
    let streak = 0;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (!(item.status === "PAGO" || item.paymentDate)) break;
      if (item.paymentDate && daysBetween(item.dueDate, item.paymentDate) > 0) break;
      streak += 1;
    }
    scoreRaw += Math.min(streak * 6, 30);
    scoreRaw += Math.min(clientLoans.filter((loan) => loan.status === "QUITADO").length * 10, 40);
    let uiStatus = client.status.toLowerCase() === "ativo" ? "Ativo" : "Inativo";
    if (uiStatus === "Ativo") {
      if (overdueCount > 0) uiStatus = "Atrasado";
      else if (openTotal === 0 && clientLoans.length > 0 && clientLoans.every((loan) => loan.startDate <= today)) uiStatus = "Quitado";
    }
    return { ...client, uiStatus, loansCount: clientLoans.length, openTotal, overdueTotal, overdueCount,
      pendingCount, maxOverdueDays, score: Math.max(0, Math.min(1000, Math.round(scoreRaw))),
      totalDueCount: history.filter((item) => item.dueDate <= today).length };
  });
}
