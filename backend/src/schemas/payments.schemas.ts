import { z } from "zod";

const paymentMethodSchema = z.enum(["PIX", "DINHEIRO", "TRANSFERENCIA", "CARTAO"]);

const normalizeMethodInput = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

export const createPaymentSchema = z.object({
  loanId: z.coerce.number().int().positive(),
  installmentId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().min(1),
  method: z.string().transform(normalizeMethodInput).pipe(paymentMethodSchema),
  notes: z.string().optional(),
});
