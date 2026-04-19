import { z } from "zod";

function parseBooleanFlag(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeOptional(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value))
    .refine((value) => !value || /^https?:\/\/.+/i.test(value), "APP_BASE_URL invalida"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  RESET_PASSWORD_SECRET: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  RESET_PASSWORD_EXPIRES_IN: z.string().default("30m"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  COOKIE_NAME: z.string().default("credix_token"),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => parseBooleanFlag(value)),
  WHATSAPP_GRAPH_BASE_URL: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized || "https://graph.facebook.com";
    })
    .pipe(z.string().url()),
  WHATSAPP_API_VERSION: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized || "v22.0";
    }),
  WHATSAPP_PHONE_NUMBER_ID: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  WHATSAPP_ACCESS_TOKEN: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  PIX_KEY: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  PAYMENT_LINK: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  SMTP_HOST: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  SMTP_PORT: z.preprocess((value) => {
    if (value === undefined || value === null) return 587;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized) return 587;
      return Number(normalized);
    }
    return value;
  }, z.number().int().positive()),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => parseBooleanFlag(value)),
  SMTP_USER: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  SMTP_PASS: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  SMTP_FROM: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  EMAIL_NOTIFY_ENABLED: z
    .string()
    .optional()
    .transform((value) => parseBooleanFlag(value)),
  EMAIL_NOTIFY_TO: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  EMAIL_NOTIFY_TZ: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized || "America/Sao_Paulo";
    }),
  EMAIL_NOTIFY_TIME: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized || "08:00";
    })
    .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "EMAIL_NOTIFY_TIME invalido")),
  EMAIL_NOTIFY_DAYS_AHEAD: z.preprocess((value) => {
    if (value === undefined || value === null) return 0;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized) return 0;
      return Number(normalized);
    }
    return value;
  }, z.number().int().min(0)),
  EMAIL_NOTIFY_RUN_ON_START: z
    .string()
    .optional()
    .transform((value) => parseBooleanFlag(value)),
  EMAIL_WEEKLY_BACKUP_ENABLED: z
    .string()
    .optional()
    .transform((value) => parseBooleanFlag(value)),
  EMAIL_WEEKLY_BACKUP_TO: z
    .string()
    .optional()
    .transform((value) => normalizeOptional(value)),
  EMAIL_WEEKLY_BACKUP_TZ: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized || "America/Sao_Paulo";
    }),
  EMAIL_WEEKLY_BACKUP_TIME: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized || "00:00";
    })
    .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "EMAIL_WEEKLY_BACKUP_TIME invalido")),
  EMAIL_WEEKLY_BACKUP_RUN_ON_START: z
    .string()
    .optional()
    .transform((value) => parseBooleanFlag(value)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variaveis de ambiente invalidas:", parsed.error.flatten().fieldErrors);
  throw new Error("Falha ao validar variaveis de ambiente");
}

export const env = parsed.data;
