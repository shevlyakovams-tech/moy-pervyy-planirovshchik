export type DateAccess = "past" | "today" | "future";

export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function assertLocalDate(value: string): string {
  if (!parseLocalDate(value)) throw new Error("INVALID_DATE");
  return value;
}

export function addLocalDays(value: string, amount: number): string {
  const parsed = parseLocalDate(value);
  if (!parsed) throw new Error("INVALID_DATE");
  parsed.setDate(parsed.getDate() + amount);
  return localDate(parsed);
}

export function startOfLocalWeek(input: Date | string = new Date()): string {
  const parsed = typeof input === "string" ? parseLocalDate(input) : input;
  if (!parsed) throw new Error("INVALID_DATE");
  const copy = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const weekday = copy.getDay() || 7;
  copy.setDate(copy.getDate() - weekday + 1);
  return localDate(copy);
}

export function endOfLocalWeek(input: Date | string = new Date()): string {
  return addLocalDays(startOfLocalWeek(input), 6);
}

export function dateAccess(value: string, businessDate: string): DateAccess {
  assertLocalDate(value);
  assertLocalDate(businessDate);
  return value < businessDate ? "past" : value > businessDate ? "future" : "today";
}

export function resolveObservedBusinessDate(systemDate: string, maxObservedBusinessDate: string): { businessDate: string; clockWarning: boolean } {
  assertLocalDate(systemDate);
  assertLocalDate(maxObservedBusinessDate);
  return systemDate < maxObservedBusinessDate
    ? { businessDate: maxObservedBusinessDate, clockWarning: true }
    : { businessDate: systemDate, clockWarning: false };
}

export function isDateInWeek(value: string, weekStart: string): boolean {
  assertLocalDate(value);
  const start = startOfLocalWeek(weekStart);
  return value >= start && value <= addLocalDays(start, 6);
}

export function formatRussianDate(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "long", year: "numeric", weekday: "long"
  }).format(parsed);
}

export function formatRussianWeek(weekStart: string): string {
  const start = parseLocalDate(startOfLocalWeek(weekStart));
  const end = parseLocalDate(endOfLocalWeek(weekStart));
  if (!start || !end) return weekStart;
  const short = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const endWithYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${endWithYear.format(end)}`
    : `${short.format(start)} — ${endWithYear.format(end)}`;
}
