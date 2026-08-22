import { randomBytes, timingSafeEqual } from "node:crypto";
import { APP_ORIGIN } from "@/lib/versions";

const csrfToken = randomBytes(32).toString("base64url");

export function getCsrfToken(): string {
  return csrfToken;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateLocalMutation(request: Request): { ok: true } | { ok: false; status: number; message: string } {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.APP_ORIGIN ?? APP_ORIGIN;
  if (origin !== expectedOrigin) return { ok: false, status: 403, message: "Недопустимый источник запроса" };
  const suppliedToken = request.headers.get("x-local-csrf") ?? "";
  if (!safeEqual(suppliedToken, csrfToken)) return { ok: false, status: 403, message: "Недействительный защитный токен" };
  return { ok: true };
}
