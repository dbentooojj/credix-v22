import { z } from 'zod';
import { DEFAULT_TIME_ZONE, getIsoTodayInTimeZone } from '../lib/date-time';

export const cashAdjustmentCreateSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Informe uma data válida.').refine(
    (value) => value <= getIsoTodayInTimeZone(DEFAULT_TIME_ZONE),
    'A data do movimento não pode ser futura.',
  ).optional(),
  description: z.string().trim().max(300).optional(),
});
