import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors?: Record<string, string[]>) {
    super(message);
  }
}

export function dataResponse(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const flattened = error.flatten().fieldErrors;
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Проверьте заполненные поля", fieldErrors: flattened } }, { status: 422 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Некорректный формат запроса" } }, { status: 400 });
  }
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Не удалось выполнить действие" } }, { status: 500 });
}
