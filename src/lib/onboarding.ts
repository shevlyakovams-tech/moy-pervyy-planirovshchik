import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { localDate, startOfLocalWeek } from "@/lib/date-service";

const weekdaysSchema = z.array(z.number().int().min(1).max(7)).max(7).default([]);
const trackerSchema = z.object({ goal: z.number().int().positive().optional(), weekdays: weekdaysSchema }).default({ weekdays: [] });

export const onboardingDraftSchema = z.object({
  weeklyPlanningWeekday: z.number().int().min(1).max(7).default(7),
  weeklyGoal: z.string().max(500).default(""),
  trackers: z.object({ plank: z.boolean(), pushups: z.boolean(), water: z.boolean() }).default({ plank: false, pushups: false, water: false }),
  trackerSettings: z.object({ plank: trackerSchema, pushups: trackerSchema, water: trackerSchema }).default({
    plank: { weekdays: [] }, pushups: { weekdays: [] }, water: { weekdays: [] }
  }),
  simpleHabit: z.object({ name: z.string().max(80).default(""), weekdays: weekdaysSchema }).default({ name: "", weekdays: [] })
});

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export const onboardingPatchSchema = z.object({
  currentStep: z.number().int().min(1).max(7),
  draft: onboardingDraftSchema
});

export function parseDraft(value: string): OnboardingDraft {
  try {
    return onboardingDraftSchema.parse(JSON.parse(value));
  } catch {
    return onboardingDraftSchema.parse({});
  }
}

export function scheduleMask(weekdays: number[]): number {
  return [...new Set(weekdays)].reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

type TransactionClient = Prisma.TransactionClient;

async function createBuiltInHabit(
  tx: TransactionClient,
  input: { type: "PLANK" | "PUSHUPS" | "WATER"; name: string; key: string; goal?: number; weekdays: number[] }
): Promise<void> {
  if (await tx.habit.findUnique({ where: { builtInKey: input.key } })) return;
  const mask = scheduleMask(input.weekdays);
  const status = input.goal && mask ? "ACTIVE" : "DRAFT";
  const habit = await tx.habit.create({
    data: {
      type: input.type,
      builtInKey: input.key,
      name: input.name,
      normalizedName: input.name.normalize("NFKC").toLocaleLowerCase("ru-RU"),
      status,
      startDate: localDate()
    }
  });
  if (input.goal && mask) {
    const unit = input.type === "PLANK" ? "SECOND" : input.type === "PUSHUPS" ? "REPETITION" : "MILLILITER";
    await tx.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: localDate(), scheduleMask: mask, goalValue: input.goal, unit } });
  }
}

export async function finishOnboarding(client: PrismaClient, draftInput: unknown): Promise<void> {
  const draft = onboardingDraftSchema.parse(draftInput);
  await client.$transaction(async (tx) => {
    const settings = await tx.appSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", weeklyPlanningWeekday: draft.weeklyPlanningWeekday },
      update: { weeklyPlanningWeekday: draft.weeklyPlanningWeekday }
    });
    if (settings.onboardingCompletedAt) return;

    const goal = draft.weeklyGoal.trim();
    if (goal) {
      const plan = await tx.weeklyPlan.upsert({
        where: { weekStart: startOfLocalWeek() },
        update: {},
        create: { weekStart: startOfLocalWeek(), goal }
      });
      for (const orderIndex of [1, 2, 3]) {
        await tx.weeklyStep.upsert({
          where: { weeklyPlanId_orderIndex: { weeklyPlanId: plan.id, orderIndex } },
          update: {},
          create: { weeklyPlanId: plan.id, orderIndex }
        });
      }
    }

    if (draft.trackers.plank) await createBuiltInHabit(tx, { type: "PLANK", key: "PLANK", name: "Планка", ...draft.trackerSettings.plank });
    if (draft.trackers.pushups) await createBuiltInHabit(tx, { type: "PUSHUPS", key: "PUSHUPS", name: "Отжимания", ...draft.trackerSettings.pushups });
    if (draft.trackers.water) await createBuiltInHabit(tx, { type: "WATER", key: "WATER", name: "Вода", ...draft.trackerSettings.water });

    const simpleName = draft.simpleHabit.name.trim();
    if (simpleName) {
      const mask = scheduleMask(draft.simpleHabit.weekdays);
      const normalizedName = simpleName.normalize("NFKC").toLocaleLowerCase("ru-RU");
      const existing = await tx.habit.findFirst({ where: { normalizedName, status: { not: "ARCHIVED" } } });
      if (!existing) {
        const habit = await tx.habit.create({
          data: { type: "SIMPLE", name: simpleName, normalizedName, status: mask ? "ACTIVE" : "DRAFT", startDate: localDate() }
        });
        if (mask) await tx.habitRevision.create({ data: { habitId: habit.id, effectiveFromDate: localDate(), scheduleMask: mask, goalValue: 1, unit: "CHECK" } });
      }
    }

    await tx.appSettings.update({ where: { id: "singleton" }, data: { onboardingCompletedAt: new Date(), version: { increment: 1 } } });
    await tx.onboardingState.deleteMany({});
  });
}

export async function skipAllOnboarding(client: PrismaClient): Promise<void> {
  await client.$transaction([
    client.appSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", onboardingCompletedAt: new Date(), weeklyPlanningWeekday: 7 },
      update: { onboardingCompletedAt: new Date(), weeklyPlanningWeekday: 7, version: { increment: 1 } }
    }),
    client.onboardingState.deleteMany({})
  ]);
}
