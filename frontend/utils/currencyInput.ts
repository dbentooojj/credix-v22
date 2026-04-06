export function parseCurrencyInput(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return Number.NaN;

  if (cleaned.includes(",")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }

  return Number(cleaned);
}

export function formatCurrencyInput(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  const amount = Number(digits) / 100;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyInputFromNumber(value: unknown): string {
  const amount = parseCurrencyInput(value);
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
