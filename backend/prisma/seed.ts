import bcrypt from "bcryptjs";
import {
  FinanceTransactionStatus,
  FinanceTransactionType,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { ensureFinanceCategoryCatalogForUser } from "../src/lib/finance-categories";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME || "Administrador";
  const email = (process.env.ADMIN_EMAIL || "admin@credix.app.br").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "123456";

  const passwordHash = await bcrypt.hash(password, 10);

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: UserRole.ADMIN,
    },
    create: {
      name,
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const transactionCount = await prisma.financeTransaction.count({
    where: { ownerUserId: adminUser.id },
  });

  if (transactionCount === 0) {
    await prisma.financeTransaction.createMany({
      data: [
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.INCOME,
          amount: 8900,
          category: "Salario",
          date: new Date("2026-02-05"),
          description: "Pagamento mensal empresa",
          status: FinanceTransactionStatus.COMPLETED,
        },
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.INCOME,
          amount: 2300,
          category: "Freelance",
          date: new Date("2026-02-13"),
          description: "Projeto app mobile fintech",
          status: FinanceTransactionStatus.COMPLETED,
        },
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.INCOME,
          amount: 1600,
          category: "Freelance",
          date: new Date("2026-03-04"),
          description: "Fase 2 dashboard analytics",
          status: FinanceTransactionStatus.SCHEDULED,
        },
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.EXPENSE,
          amount: 2400,
          category: "Moradia",
          date: new Date("2026-02-02"),
          description: "Aluguel",
          status: FinanceTransactionStatus.COMPLETED,
        },
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.EXPENSE,
          amount: 780,
          category: "Alimentacao",
          date: new Date("2026-02-08"),
          description: "Compras do mes",
          status: FinanceTransactionStatus.COMPLETED,
        },
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.EXPENSE,
          amount: 620,
          category: "Transporte",
          date: new Date("2026-02-11"),
          description: "Combustivel e pedagios",
          status: FinanceTransactionStatus.COMPLETED,
        },
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.EXPENSE,
          amount: 1340,
          category: "Educacao",
          date: new Date("2026-02-17"),
          description: "Mentoria de produto SaaS",
          status: FinanceTransactionStatus.COMPLETED,
        },
        {
          ownerUserId: adminUser.id,
          type: FinanceTransactionType.EXPENSE,
          amount: 410,
          category: "Lazer",
          date: new Date("2026-02-22"),
          description: "Fim de semana",
          status: FinanceTransactionStatus.PENDING,
        },
      ],
    });
  }

  await ensureFinanceCategoryCatalogForUser(prisma, adminUser.id);

  console.log(`Admin seed concluido: ${email}`);
}

main()
  .catch((error) => {
    console.error("Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
