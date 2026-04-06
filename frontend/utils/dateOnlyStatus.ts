const APP_TIME_ZONE = "America/Sao_Paulo";

export function getTodayIsoInAppTimeZone(timeZone = APP_TIME_ZONE): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((item) => item.type === "year")?.value ?? "1970";
  const month = parts.find((item) => item.type === "month")?.value ?? "01";
  const day = parts.find((item) => item.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function toIsoDateOnly(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return [
        parsed.getFullYear(),
        String(parsed.getMonth() + 1).padStart(2, "0"),
        String(parsed.getDate()).padStart(2, "0"),
      ].join("-");
    }
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  return null;
}

export function getDateOnlyRelationToToday(value: unknown, timeZone = APP_TIME_ZONE): "past" | "today" | "future" | null {
  const dateIso = toIsoDateOnly(value);
  if (!dateIso) return null;

  const todayIso = getTodayIsoInAppTimeZone(timeZone);
  if (dateIso < todayIso) return "past";
  if (dateIso === todayIso) return "today";
  return "future";
}

export function getOverdueDays(value: unknown, timeZone = APP_TIME_ZONE): number | null {
  const dateIso = toIsoDateOnly(value);
  if (!dateIso) return null;

  const todayIso = getTodayIsoInAppTimeZone(timeZone);
  if (dateIso >= todayIso) return 0;

  const date = new Date(`${dateIso}T00:00:00Z`);
  const today = new Date(`${todayIso}T00:00:00Z`);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86400000));
}
