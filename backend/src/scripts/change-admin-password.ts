import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("ADMIN_EMAIL precisa estar configurado.");
  if (process.stdin.isTTY) throw new Error("Envie a nova senha por stdin, sem inclui-la no comando.");

  let password = "";
  for await (const chunk of process.stdin) {
    password += chunk.toString();
    if (Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("A nova senha deve ter no maximo 72 bytes.");
    }
  }

  if (password.length < 12) throw new Error("A nova senha deve ter ao menos 12 caracteres.");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user || user.role !== UserRole.ADMIN) {
    throw new Error("Administrador nao encontrado para ADMIN_EMAIL.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  console.log("Senha do administrador atualizada.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha ao atualizar a senha.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
