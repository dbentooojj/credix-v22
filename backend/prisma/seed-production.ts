import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function hasApplicationData() {
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.client.count(),
    prisma.loan.count(),
    prisma.loanSimulation.count(),
    prisma.installment.count(),
    prisma.payment.count(),
    prisma.financeCategory.count(),
    prisma.financeTransaction.count(),
  ]);

  return counts.some((count) => count > 0);
}

function requiredValue(name: "ADMIN_EMAIL" | "ADMIN_PASSWORD") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} precisa estar definido para criar o administrador inicial.`);
  }

  return value;
}

async function main() {
  if (await hasApplicationData()) {
    console.log("SEED_SKIPPED_DATABASE_NOT_EMPTY");
    return;
  }

  const name = process.env.ADMIN_NAME?.trim() || "Administrador";
  const email = requiredValue("ADMIN_EMAIL").toLowerCase();
  const password = requiredValue("ADMIN_PASSWORD");

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD precisa ter ao menos 12 caracteres.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  console.log(`SEED_ADMIN_CREATED ${email}`);
}

main()
  .catch((error) => {
    console.error("Erro no seed de produção:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
