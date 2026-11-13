import { ClientStatus, InstallmentStatus, LoanStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { deleteLoanDisbursementTransaction } from "../lib/installment-income-transaction";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error-handler";
import { requireAuthApi } from "../middleware/auth";
import { lockFinancialOwner } from "../lib/financial-accounts";

const router = Router();
router.use(requireAuthApi);

const clientSchema = z.object({
  name: z.string().trim().min(1),
  document: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  status: z.string().default("ativo"),
});

function ownerId(req: { user?: { sub?: string } }) {
  const id = Number(req.user?.sub);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError("Nao autenticado", 401);
  return id;
}

function recordId(value: unknown) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError("Identificador invalido.", 400);
  return id;
}

function clientData(body: unknown) {
  const input = clientSchema.parse(body);
  const cpf = input.document.replace(/\D/g, "");
  if (cpf && cpf.length !== 11) throw new AppError("CPF invalido. Informe um CPF com 11 digitos.", 400);
  const phoneDigits = input.phone.replace(/\D/g, "");
  const phone = phoneDigits.startsWith("55") && phoneDigits.length > 11
    ? phoneDigits.slice(2)
    : phoneDigits;
  return {
    name: input.name,
    cpf: cpf || null,
    phone: phone.slice(-11),
    email: input.email.trim() || null,
    status: input.status.trim().toLowerCase() === "inativo" ? ClientStatus.INATIVO : ClientStatus.ATIVO,
  };
}

function throwClientWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    throw new AppError(
      target.includes("cpf") ? "CPF ja cadastrado para outro cliente." : "Cadastro alterado por outra operacao. Tente novamente.",
      409,
    );
  }
  throw error;
}

router.post("/debtors", async (req, res) => {
  const userId = ownerId(req);
  const data = clientData(req.body);
  let client: { id: number };
  try {
    client = await prisma.$transaction(async (tx) => {
      // The legacy bulk writer uses explicit IDs, so a DB sequence may lag behind MAX(id).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73401)`;
      const maxId = (await tx.client.aggregate({ _max: { id: true } }))._max.id ?? 0;
      return tx.client.create({ data: { id: maxId + 1, ownerUserId: userId, ...data }, select: { id: true } });
    });
  } catch (error) {
    throwClientWriteError(error);
  }
  return res.status(201).json({ data: { id: client.id } });
});

router.patch("/debtors/:id", async (req, res) => {
  const userId = ownerId(req);
  const id = recordId(req.params.id);
  const data = clientData(req.body);
  let updated: { count: number };
  try {
    updated = await prisma.client.updateMany({ where: { id, ownerUserId: userId }, data });
  } catch (error) {
    throwClientWriteError(error);
  }
  if (updated.count === 0) throw new AppError("Cliente nao encontrado.", 404);
  return res.json({ data: { id } });
});

router.delete("/debtors/:id", async (req, res) => {
  const userId = ownerId(req);
  const id = recordId(req.params.id);
  await prisma.$transaction(async (tx) => {
    const client = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Client" WHERE id = ${id} AND "ownerUserId" = ${userId} FOR UPDATE
    `;
    if (client.length === 0) throw new AppError("Cliente nao encontrado.", 404);
    const [loan, installment, simulation] = await Promise.all([
      tx.loan.findFirst({ where: { clientId: id, ownerUserId: userId }, select: { id: true } }),
      tx.installment.findFirst({ where: { clientId: id, ownerUserId: userId }, select: { id: true } }),
      tx.loanSimulation.findFirst({ where: { clientId: id, ownerUserId: userId }, select: { id: true } }),
    ]);
    if (loan || installment || simulation) {
      throw new AppError("Cliente com historico nao pode ser excluido. Marque-o como Inativo.", 409);
    }
    await tx.client.delete({ where: { id } });
  });
  return res.json({ message: "Cliente excluido." });
});

router.delete("/loans/:id", async (req, res) => {
  const userId = ownerId(req);
  const id = recordId(req.params.id);
  await prisma.$transaction(async (tx) => {
    await lockFinancialOwner(tx, userId);
    const loan = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Loan" WHERE id = ${id} AND "ownerUserId" = ${userId} FOR UPDATE
    `;
    if (loan.length === 0) throw new AppError("Emprestimo nao encontrado.", 404);
    const loanRecord = await tx.loan.findFirstOrThrow({ where: { id, ownerUserId: userId }, select: { status: true } });
    if (loanRecord.status !== LoanStatus.PENDENTE && req.body?.fundsReturned !== true) throw new AppError("Confirme a devolução efetiva do capital antes de cancelar o empréstimo.", 409);
    const [paidInstallment, payment] = await Promise.all([
      tx.installment.findFirst({ where: { loanId: id, status: InstallmentStatus.PAGO }, select: { id: true } }),
      tx.payment.findFirst({ where: { loanId: id }, select: { id: true } }),
    ]);
    if (paidInstallment || payment) {
      throw new AppError("Nao e permitido excluir emprestimo com pagamento registrado.", 409);
    }
    await deleteLoanDisbursementTransaction(tx, { ownerUserId: userId, loanId: id });
    await tx.loan.delete({ where: { id } });
  });
  return res.json({ message: "Emprestimo excluido." });
});

export { router as recordsRoutes };
