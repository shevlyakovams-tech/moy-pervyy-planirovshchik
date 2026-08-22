import { NextResponse } from "next/server";
import { finishOnboarding, onboardingPatchSchema, skipAllOnboarding } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { validateLocalMutation } from "@/lib/security";
import { z } from "zod";

function forbidden(result: { status: number; message: string }) {
  return NextResponse.json({ error: result.message }, { status: result.status });
}

export async function PATCH(request: Request) {
  const security = validateLocalMutation(request);
  if (!security.ok) return forbidden(security);
  try {
    const payload = onboardingPatchSchema.parse(await request.json());
    await prisma.onboardingState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", currentStep: payload.currentStep, serializedDraft: JSON.stringify(payload.draft) },
      update: { currentStep: payload.currentStep, serializedDraft: JSON.stringify(payload.draft) }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте введённые значения" }, { status: 400 });
    return NextResponse.json({ error: "Не удалось сохранить знакомство" }, { status: 500 });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skipAll") }),
  z.object({ action: z.literal("finish"), draft: onboardingPatchSchema.shape.draft })
]);

export async function POST(request: Request) {
  const security = validateLocalMutation(request);
  if (!security.ok) return forbidden(security);
  try {
    const payload = actionSchema.parse(await request.json());
    if (payload.action === "skipAll") await skipAllOnboarding(prisma);
    else await finishOnboarding(prisma, payload.draft);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте введённые значения" }, { status: 400 });
    return NextResponse.json({ error: "Не удалось завершить знакомство" }, { status: 500 });
  }
}
