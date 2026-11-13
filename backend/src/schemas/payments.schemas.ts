import { z } from "zod";

const paymentMethodSchema = z.enum(["PIX", "DINHEIRO", "TRANSFERENCIA", "CARTAO"]);

const normalizeMethodInput = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

export const createPaymentSchema = z.object({
  financialAccountId: z.coerce.number().int().positive(),
  loanId: z.coerce.number().int().positive(),
  installmentId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().positive().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use no máximo duas casas decimais.'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Informe uma data válida."),
  method: z.string().transform(normalizeMethodInput).pipe(paymentMethodSchema),
  notes: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
});
