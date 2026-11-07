import "dotenv/config";
import { FinanceTransactionStatus, FinanceTransactionType, LoanSimulationStatus, PrismaClient } from "@prisma/client";
import { ensureFinanceCategoryCatalogForUser } from "../src/lib/finance-categories";
import {
  buildInstallmentIncomeDescription, buildLoanDisbursementDescription,
  CASH_ADJUSTMENT_CATEGORY, INSTALLMENT_PAYMENT_CATEGORY, LOAN_DISBURSEMENT_CATEGORY,
} from "../src/lib/installment-income-transaction";
import { buildValidationClients, dateAtOffset, VALIDATION_TAG } from "./validation-data";

const prisma = new PrismaClient();

function referenceDate() {
  const iso = process.env.SEED_DATE || new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error("SEED_DATE deve ser uma data valida no formato AAAA-MM-DD.");
  }
  return date;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (process.env.NODE_ENV === "production" || !["db", "localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/credix_(local|test|validation)$/.test(url.pathname)) {
    throw new Error("A base de validacao exige PostgreSQL local com banco credix_local, credix_test ou credix_validation.");
  }
  const email = (process.env.SEED_USER_EMAIL || process.env.ADMIN_EMAIL || "admin@credix.local").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Usuario ${email} nao encontrado. Inicialize o ambiente local primeiro.`);
  const today = referenceDate();
  const clients = buildValidationClients(today);

  const result = await prisma.$transaction(async (tx) => {
    // Serialize two executions for this owner; the dataset is inserted only once.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${user.id}::integer, 221107)`;
    if (await tx.client.count({ where: { ownerUserId: user.id, notes: { startsWith: VALIDATION_TAG } } })) return "ja existente";
    // Legacy imports assign explicit IDs without advancing PostgreSQL sequences.
    // Keep the next value at least above existing IDs, never moving it backwards.
    for (const table of ["Client", "Loan", "Installment", "Payment", "FinanceTransaction", "FinanceCategory"]) {
      await tx.$executeRawUnsafe(`SELECT setval(
        pg_get_serial_sequence('"${table}"', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1,
          nextval(pg_get_serial_sequence('"${table}"', 'id'))), false)`);
    }
    const cash = [];
    const createdLoans = [];
    for (const profile of clients) {
      const { loans, ...data } = profile;
      const client = await tx.client.create({ data: {
        ...data, ownerUserId: user.id,
        notes: `${VALIDATION_TAG} Dados ficticios. Referencia: ${today.toISOString().slice(0, 10)}. ${loans.length} contratos.`,
      } });
      for (const plan of loans) {
        const { label, installments, ...data } = plan;
        const loan = await tx.loan.create({ data: {
          ...data, ownerUserId: user.id, clientId: client.id,
          observations: `${VALIDATION_TAG} ${label}`, createdAt: plan.startDate,
        } });
        createdLoans.push({ loan, plan, client });
        if (plan.status !== "PENDENTE") cash.push({
          ownerUserId: user.id, type: FinanceTransactionType.EXPENSE, amount: plan.principalAmount,
          category: LOAN_DISBURSEMENT_CATEGORY, description: buildLoanDisbursementDescription(loan.id),
          date: plan.startDate, status: FinanceTransactionStatus.COMPLETED, notes: VALIDATION_TAG,
        });
        for (const item of installments) {
          const installment = await tx.installment.create({ data: {
            ...item, ownerUserId: user.id, clientId: client.id, loanId: loan.id,
            notes: `${VALIDATION_TAG} ${label}`, createdAt: plan.startDate,
          } });
          if (item.paymentDate && item.paymentMethod) {
            await tx.payment.create({ data: {
              ownerUserId: user.id, loanId: loan.id, installmentId: installment.id,
              amount: item.amount, method: item.paymentMethod, paymentDate: item.paymentDate,
              notes: VALIDATION_TAG, createdAt: item.paymentDate,
            } });
            cash.push({
              ownerUserId: user.id, type: FinanceTransactionType.INCOME, amount: item.amount,
              category: INSTALLMENT_PAYMENT_CATEGORY,
              description: buildInstallmentIncomeDescription(installment.id, loan.id),
              date: item.paymentDate, status: FinanceTransactionStatus.COMPLETED, notes: VALIDATION_TAG,
            });
          }
        }
      }
    }
    for (const offset of [-720, -180, -30]) cash.push({
      ownerUserId: user.id, type: FinanceTransactionType.INCOME, amount: 500_000,
      category: CASH_ADJUSTMENT_CATEGORY, description: `${VALIDATION_TAG} Aporte de capital ficticio`,
      date: dateAtOffset(today, offset), status: FinanceTransactionStatus.COMPLETED, notes: VALIDATION_TAG,
    });
    for (const type of Object.values(FinanceTransactionType)) {
      for (const status of Object.values(FinanceTransactionStatus)) {
        for (const offset of (status === "COMPLETED" ? [-90, -30, 0] : [-5, 0, 7, 30])) cash.push({
          ownerUserId: user.id, type, status, amount: type === "INCOME" ? 850 : 320,
          category: type === "INCOME" ? "Servicos" : "Internet",
          description: `${VALIDATION_TAG} ${type === "INCOME" ? "Receita" : "Despesa"} ${status} (${offset} dias)`,
          date: dateAtOffset(today, offset), notes: VALIDATION_TAG,
        });
      }
    }
    await tx.financeTransaction.createMany({ data: cash });
    for (const [i, status] of Object.values(LoanSimulationStatus).entries()) {
      const source = createdLoans.find((entry) => entry.plan.label === "Em dia com historico de pagamentos")!;
      const accepted = status === "ACCEPTED";
      const startDate = accepted ? source.plan.startDate : dateAtOffset(today, -10);
      const dueDates = accepted ? source.plan.installments.map((item) => item.dueDate) : [15, 45, 75].map((offset) => dateAtOffset(today, offset));
      const simulation = await tx.loanSimulation.create({ data: {
        ownerUserId: user.id, clientId: source.client.id, clientName: source.client.name,
        clientPhone: source.client.phone, status, observations: `${VALIDATION_TAG} Simulacao ${status}`,
        principalAmount: accepted ? source.plan.principalAmount : 3000,
        interestType: accepted ? source.plan.interestType.toLowerCase() : "simples",
        interestRate: accepted ? source.plan.interestRate : 2.5, fixedFeeAmount: 0,
        installmentsCount: dueDates.length, startDate, firstDueDate: dueDates[0],
        dueDates: dueDates.map((date) => date.toISOString().slice(0, 10)),
        totalAmount: accepted ? source.plan.totalAmount : 3225,
        installmentAmount: accepted ? source.plan.installmentAmount : 1075,
        expiresAt: accepted ? dateAtOffset(startDate, 5) : dateAtOffset(today, status === "EXPIRED" ? -1 : 7),
        createdAt: accepted ? startDate : dateAtOffset(today, -10 + i),
      } });
      if (accepted) await tx.loan.update({ where: { id: source.loan.id }, data: { simulationId: simulation.id } });
    }
    await ensureFinanceCategoryCatalogForUser(tx, user.id);
    return "criada";
  }, { timeout: 120_000 });

  const owner = { ownerUserId: user.id };
  const [clientCount, loanStatuses, installmentStatuses, payments, transactions, simulations] = await Promise.all([
    prisma.client.count({ where: { ...owner, notes: { startsWith: VALIDATION_TAG } } }),
    prisma.loan.groupBy({ by: ["status"], where: { ...owner, observations: { startsWith: VALIDATION_TAG } }, _count: true }),
    prisma.installment.groupBy({ by: ["status"], where: { ...owner, notes: { startsWith: VALIDATION_TAG } }, _count: true }),
    prisma.payment.count({ where: { ...owner, notes: VALIDATION_TAG } }),
    prisma.financeTransaction.count({ where: { ...owner, notes: VALIDATION_TAG } }),
    prisma.loanSimulation.count({ where: { ...owner, observations: { startsWith: VALIDATION_TAG } } }),
  ]);
  console.log(JSON.stringify({ base: result, usuario: email, referencia: today.toISOString().slice(0, 10),
    clientes: clientCount, emprestimos: loanStatuses, parcelas: installmentStatuses,
    pagamentos: payments, lancamentosCaixa: transactions, simulacoes: simulations }, null, 2));
}

main().catch((error) => {
  console.error("Falha ao criar base de validacao:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
