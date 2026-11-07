export type PortfolioCapitalMovement = {
  date: string;
  investedChange: number;
  resultChange: number;
};

export type PortfolioCapitalPoint = {
  month: string;
  invested: number;
  result: number;
  capital: number;
};

/** Deposits/withdrawals affect invested capital; only realized results affect gains. */
export function buildPortfolioCapitalEvolution(
  movements: PortfolioCapitalMovement[],
  asOf: string,
): PortfolioCapitalPoint[] {
  const eligible = movements.filter((movement) => movement.date <= asOf
    && Number.isFinite(movement.investedChange) && Number.isFinite(movement.resultChange)
    && (movement.investedChange !== 0 || movement.resultChange !== 0));
  if (eligible.length === 0) return [];

  const firstMonth = eligible.map((movement) => movement.date.slice(0, 7)).sort()[0];
  const finalMonth = asOf.slice(0, 7);
  const totalsByMonth = new Map<string, { invested: number; result: number }>();
  for (const movement of eligible) {
    const month = movement.date.slice(0, 7);
    const totals = totalsByMonth.get(month) ?? { invested: 0, result: 0 };
    totals.invested += Math.round(movement.investedChange * 100);
    totals.result += Math.round(movement.resultChange * 100);
    totalsByMonth.set(month, totals);
  }

  const [year, month] = firstMonth.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const points: PortfolioCapitalPoint[] = [];
  let invested = 0;
  let result = 0;
  while (cursor.toISOString().slice(0, 7) <= finalMonth) {
    const key = cursor.toISOString().slice(0, 7);
    const totals = totalsByMonth.get(key);
    invested += totals?.invested ?? 0;
    result += totals?.result ?? 0;
    points.push({ month: key, invested: invested / 100, result: result / 100, capital: (invested + result) / 100 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return points;
}
