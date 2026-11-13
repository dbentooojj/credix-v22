import { z } from 'zod';
import { DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from '../lib/date-time';

export const cashAdjustmentCreateSchema = z.object({
  financialAccountId: z.number().int().positive(),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use no máximo duas casas decimais.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Informe uma data válida.').refine(
    (value) => value <= getIsoTodayInTimeZone(DEFAULT_TIME_ZONE),
    'A data do movimento não pode ser futura.',
  ).optional(),
  description: z.string().trim().min(3).max(300),
});
