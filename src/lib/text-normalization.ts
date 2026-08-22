const forbiddenMultiline = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const forbiddenSingleLine = /[\u0000-\u001F\u007F]/g;

export function normalizeMultiline(value: string | null | undefined): string | null {
  const normalized = (value ?? "").normalize("NFKC").replaceAll("\r\n", "\n").replaceAll("\r", "\n").replace(forbiddenMultiline, "").trim();
  return normalized || null;
}

export function normalizeSingleLine(value: string | null | undefined): string | null {
  const normalized = (value ?? "").normalize("NFKC").replace(forbiddenSingleLine, " ").replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ru-RU");
}
