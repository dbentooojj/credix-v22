export type ScheduleAmountInput = {
  dueDate: string;
  amount: unknown;
};

export type ConsolidatedScheduleItem = {
  dueDate: string;
  amount: number;
};

export type ScheduleHistoryItem = ConsolidatedScheduleItem & {
  paid: boolean;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: unknown): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

export function consolidateScheduleAmounts(items: ScheduleAmountInput[]): ConsolidatedScheduleItem[] {
  const scheduleByDate = new Map<string, number>();

  items.forEach((item) => {
    const dueDate = String(item.dueDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;

    const amount = round2(item.amount);
    if (amount <= 0) return;

    const current = scheduleByDate.get(dueDate) ?? 0;
    scheduleByDate.set(dueDate, round2(current + amount));
  });

  return [...scheduleByDate.entries()]
    .map(([dueDate, amount]) => ({ dueDate, amount: round2(amount) }))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

export function buildSimulationProposalSchedule(items: ScheduleAmountInput[]) {
  const proposalSchedule = consolidateScheduleAmounts(items);
  const total = round2(proposalSchedule.reduce((sum, item) => sum + item.amount, 0));

  return {
    proposalSchedule,
    displaySchedule: proposalSchedule.map((item) => ({ ...item, paid: false })),
    totals: {
      total,
      open: total,
      paid: 0,
    },
  };
}

export function buildScheduleWithPaymentHistory(
  openItems: ScheduleAmountInput[],
  paidItems: ScheduleAmountInput[],
) {
  const openSchedule = consolidateScheduleAmounts(openItems);
  const allPaidSchedule = consolidateScheduleAmounts(paidItems);
  const openTotal = round2(openSchedule.reduce((sum, item) => sum + item.amount, 0));
  const paidTotal = round2(allPaidSchedule.reduce((sum, item) => sum + item.amount, 0));
  const total = round2(openTotal + paidTotal);

  const displaySchedule: ScheduleHistoryItem[] = [
    ...allPaidSchedule.map((item) => ({ ...item, paid: true })),
    ...openSchedule.map((item) => ({ ...item, paid: false })),
  ].sort((left, right) => (
    left.dueDate.localeCompare(right.dueDate)
    || Number(right.paid) - Number(left.paid)
  ));

  return {
    openSchedule,
    displaySchedule,
    totals: {
      total,
      open: openTotal,
      paid: paidTotal,
    },
  };
}
