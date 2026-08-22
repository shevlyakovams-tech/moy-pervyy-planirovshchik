import { NextResponse } from "next/server";
import { parseDraft } from "@/lib/onboarding";
import { getBusinessContext } from "@/lib/planner-service";
import { configureSqlite, prisma } from "@/lib/prisma";
import { getCsrfToken } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  await configureSqlite();
  const business = await getBusinessContext(prisma);
  const settings = await prisma.appSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  let onboarding = null;
  if (!settings.onboardingCompletedAt) {
    const state = await prisma.onboardingState.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
    onboarding = { currentStep: state.currentStep, draft: parseDraft(state.serializedDraft) };
  }
  return NextResponse.json({ onboardingCompleted: Boolean(settings.onboardingCompletedAt), onboarding, today: business.businessDate, clockWarning: business.clockWarning, csrfToken: getCsrfToken() });
}
