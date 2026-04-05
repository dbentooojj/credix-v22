import { FinanceTransactionType, Prisma, PrismaClient } from "@prisma/client";
import {
  CASH_ADJUSTMENT_CATEGORY,
  INSTALLMENT_PAYMENT_CATEGORY,
  LOAN_DISBURSEMENT_CATEGORY,
} from "./installment-income-transaction";

type FinanceCategoryDb = PrismaClient | Prisma.TransactionClient;

export const SYSTEM_FINANCE_CATEGORY_NAMES = new Set([
  CASH_ADJUSTMENT_CATEGORY,
  INSTALLMENT_PAYMENT_CATEGORY,
  LOAN_DISBURSEMENT_CATEGORY,
]);

type FinanceCategoryPreset = {
  type: FinanceTransactionType;
  name: string;
  emoji: string;
  sortOrder: number;
};

const EXPENSE_CATEGORY_PRESETS: FinanceCategoryPreset[] = [
  { type: FinanceTransactionType.EXPENSE, name: "Internet", emoji: "🌐", sortOrder: 10 },
  { type: FinanceTransactionType.EXPENSE, name: "Alimentacao", emoji: "🍔", sortOrder: 20 },
  { type: FinanceTransactionType.EXPENSE, name: "Transporte", emoji: "🚗", sortOrder: 30 },
  { type: FinanceTransactionType.EXPENSE, name: "Moradia", emoji: "🏠", sortOrder: 40 },
  { type: FinanceTransactionType.EXPENSE, name: "Energia", emoji: "💡", sortOrder: 50 },
  { type: FinanceTransactionType.EXPENSE, name: "Agua", emoji: "💧", sortOrder: 60 },
  { type: FinanceTransactionType.EXPENSE, name: "Telefone", emoji: "📱", sortOrder: 70 },
  { type: FinanceTransactionType.EXPENSE, name: "Educacao", emoji: "🎓", sortOrder: 80 },
  { type: FinanceTransactionType.EXPENSE, name: "Saude", emoji: "🩺", sortOrder: 90 },
  { type: FinanceTransactionType.EXPENSE, name: "Lazer", emoji: "🎮", sortOrder: 100 },
  { type: FinanceTransactionType.EXPENSE, name: "Marketing", emoji: "📢", sortOrder: 110 },
  { type: FinanceTransactionType.EXPENSE, name: "Impostos", emoji: "🧾", sortOrder: 120 },
];

const INCOME_CATEGORY_PRESETS: FinanceCategoryPreset[] = [
  { type: FinanceTransactionType.INCOME, name: "Servicos", emoji: "💼", sortOrder: 10 },
  { type: FinanceTransactionType.INCOME, name: "Vendas", emoji: "🛒", sortOrder: 20 },
  { type: FinanceTransactionType.INCOME, name: "Freelance", emoji: "🧑‍💻", sortOrder: 30 },
  { type: FinanceTransactionType.INCOME, name: "Comissao", emoji: "🤝", sortOrder: 40 },
  { type: FinanceTransactionType.INCOME, name: "Reembolso", emoji: "💸", sortOrder: 50 },
  { type: FinanceTransactionType.INCOME, name: "Juros", emoji: "💰", sortOrder: 60 },
  { type: FinanceTransactionType.INCOME, name: "Outros recebimentos", emoji: "📦", sortOrder: 70 },
];

export const FINANCE_CATEGORY_PRESETS: FinanceCategoryPreset[] = [
  ...EXPENSE_CATEGORY_PRESETS,
  ...INCOME_CATEGORY_PRESETS,
];

export function normalizeFinanceCategoryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function sanitizeFinanceCategoryEmoji(value?: string | null): string {
  return (value ?? "").trim().slice(0, 16);
}

export function isSystemFinanceCategoryName(value?: string | null): boolean {
  const name = String(value ?? "").trim();
  return SYSTEM_FINANCE_CATEGORY_NAMES.has(name);
}

async function readCurrentCategoryMap(db: FinanceCategoryDb, ownerUserId: number) {
  const rows = await db.financeCategory.findMany({
    where: { ownerUserId },
    select: {
      id: true,
      ownerUserId: true,
      type: true,
      name: true,
      normalizedName: true,
      emoji: true,
      active: true,
      isPreset: true,
      sortOrder: true,
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const map = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    map.set(`${row.type}:${row.normalizedName}`, row);
  });
  return { rows, map };
}

async function ensureFinanceCategoryPresetsForUser(db: FinanceCategoryDb, ownerUserId: number) {
  const { map } = await readCurrentCategoryMap(db, ownerUserId);
  const missing = FINANCE_CATEGORY_PRESETS
    .filter((preset) => !map.has(`${preset.type}:${normalizeFinanceCategoryName(preset.name)}`))
    .map((preset) => ({
      ownerUserId,
      type: preset.type,
      name: preset.name,
      normalizedName: normalizeFinanceCategoryName(preset.name),
      emoji: preset.emoji,
      active: true,
      isPreset: true,
      sortOrder: preset.sortOrder,
    }));

  if (missing.length > 0) {
    await db.financeCategory.createMany({
      data: missing,
      skipDuplicates: true,
    });
  }
}

async function readNextSortOrder(db: FinanceCategoryDb, ownerUserId: number, type: FinanceTransactionType) {
  const last = await db.financeCategory.findFirst({
    where: { ownerUserId, type },
    select: { sortOrder: true },
    orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
  });

  return (last?.sortOrder ?? 1000) + 10;
}

async function upsertCustomFinanceCategory(
  db: FinanceCategoryDb,
  ownerUserId: number,
  type: FinanceTransactionType,
  name: string,
) {
  const normalizedName = normalizeFinanceCategoryName(name);
  const existing = await db.financeCategory.findUnique({
    where: {
      ownerUserId_type_normalizedName: {
        ownerUserId,
        type,
        normalizedName,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return db.financeCategory.create({
    data: {
      ownerUserId,
      type,
      name: name.trim(),
      normalizedName,
      emoji: "",
      active: true,
      isPreset: false,
      sortOrder: await readNextSortOrder(db, ownerUserId, type),
    },
  });
}

async function backfillFinanceTransactionsForUser(db: FinanceCategoryDb, ownerUserId: number) {
  const pendingRows = await db.financeTransaction.findMany({
    where: {
      ownerUserId,
      categoryId: null,
    },
    select: {
      id: true,
      type: true,
      category: true,
    },
    orderBy: { id: "asc" },
  });

  if (pendingRows.length === 0) {
    return;
  }

  const { map } = await readCurrentCategoryMap(db, ownerUserId);

  for (const row of pendingRows) {
    if (isSystemFinanceCategoryName(row.category)) {
      continue;
    }

    const normalizedName = normalizeFinanceCategoryName(row.category);
    if (!normalizedName) {
      continue;
    }

    const cacheKey = `${row.type}:${normalizedName}`;
    let category = map.get(cacheKey);

    if (!category) {
      category = await upsertCustomFinanceCategory(db, ownerUserId, row.type, row.category);
      map.set(cacheKey, {
        id: category.id,
        ownerUserId: category.ownerUserId,
        type: category.type,
        name: category.name,
        normalizedName: category.normalizedName,
        emoji: category.emoji,
        active: category.active,
        isPreset: category.isPreset,
        sortOrder: category.sortOrder,
      });
    }

    await db.financeTransaction.update({
      where: { id: row.id },
      data: {
        categoryId: category.id,
      },
    });
  }
}

export async function ensureFinanceCategoryCatalogForUser(db: FinanceCategoryDb, ownerUserId: number) {
  await ensureFinanceCategoryPresetsForUser(db, ownerUserId);
  await backfillFinanceTransactionsForUser(db, ownerUserId);
}

export async function resolveFinanceCategorySelection(
  db: FinanceCategoryDb,
  params: {
    ownerUserId: number;
    type: FinanceTransactionType;
    categoryId?: number | null;
    categoryName?: string | null;
    allowInactive?: boolean;
  },
) {
  await ensureFinanceCategoryCatalogForUser(db, params.ownerUserId);

  if (params.categoryId) {
    const category = await db.financeCategory.findFirst({
      where: {
        id: params.categoryId,
        ownerUserId: params.ownerUserId,
        type: params.type,
      },
    });

    if (!category) {
      throw new Error("Categoria nao encontrada para este usuario.");
    }

    if (!category.active && !params.allowInactive) {
      throw new Error("Categoria arquivada nao pode ser usada em novos lancamentos.");
    }

    return category;
  }

  const rawCategoryName = String(params.categoryName ?? "").trim();
  if (!rawCategoryName || isSystemFinanceCategoryName(rawCategoryName)) {
    return null;
  }

  const normalizedName = normalizeFinanceCategoryName(rawCategoryName);
  const existing = await db.financeCategory.findUnique({
    where: {
      ownerUserId_type_normalizedName: {
        ownerUserId: params.ownerUserId,
        type: params.type,
        normalizedName,
      },
    },
  });

  if (existing) {
    if (!existing.active && !params.allowInactive) {
      throw new Error("Categoria arquivada nao pode ser usada em novos lancamentos.");
    }
    return existing;
  }

  return upsertCustomFinanceCategory(db, params.ownerUserId, params.type, rawCategoryName);
}
