import fs from "node:fs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api-response";
import { APP_VERSION, SCHEMA_VERSION, SEED_VERSION } from "@/lib/versions";
import { getAppPaths } from "@/lib/paths";
import { applySeed } from "@/lib/seed";

const RULE_KINDS = ["MORNING", "WEEKLY", "HABIT", "WATER"] as const;

function int(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new ApiError(422, "INVALID_SETTING", message);
  return value;
}

function boolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") throw new ApiError(422, "INVALID_SETTING", message);
  return value;
}

export async function getSettings(client: PrismaClient) {
  const settings = await client.appSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  const rules = await client.notificationRule.findMany({ orderBy: [{ kind: "asc" }, { habitId: "asc" }] });
  const habits = await client.habit.findMany({ where: { status: { in: ["ACTIVE", "PAUSED"] } }, select: { id: true, name: true, type: true, status: true, builtInKey: true }, orderBy: { createdAt: "asc" } });
  const hiddenQuotes = await client.quote.findMany({ where: { userState: { hiddenAt: { not: null } } }, select: { id: true, translationRu: true, author: true }, orderBy: { author: "asc" } });
  const quoteCounts = await client.quote.groupBy({ by: ["category"], where: { OR: [{ userState: null }, { userState: { hiddenAt: null } }] }, _count: { _all: true } });
  return { settings, rules, habits, hiddenQuotes, quoteCounts: Object.fromEntries(quoteCounts.map((row) => [row.category, row._count._all])), appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, seedVersion: SEED_VERSION, dataPath: getAppPaths().root };
}

export async function patchSettings(client: PrismaClient, body: Record<string, unknown>) {
  const version = int(body.version, 1, Number.MAX_SAFE_INTEGER, "Обновите страницу и повторите действие");
  const data: Prisma.AppSettingsUpdateManyMutationInput = {};
  if (body.weeklyPlanningWeekday !== undefined) data.weeklyPlanningWeekday = int(body.weeklyPlanningWeekday, 1, 7, "Выберите день недели");
  if (body.pageTurnEnabled !== undefined) data.pageTurnEnabled = boolean(body.pageTurnEnabled, "Проверьте настройку анимации");
  if (body.plankGoalSoundEnabled !== undefined) data.plankGoalSoundEnabled = boolean(body.plankGoalSoundEnabled, "Проверьте настройку звука");
  if (body.notificationsGloballyPaused !== undefined) data.notificationsGloballyPaused = boolean(body.notificationsGloballyPaused, "Проверьте настройку паузы");
  if (body.quietHoursEnabled !== undefined) data.quietHoursEnabled = boolean(body.quietHoursEnabled, "Проверьте тихие часы");
  if (body.quietStartMinutes !== undefined) data.quietStartMinutes = body.quietStartMinutes === null ? null : int(body.quietStartMinutes, 0, 1439, "Проверьте начало тихих часов");
  if (body.quietEndMinutes !== undefined) data.quietEndMinutes = body.quietEndMinutes === null ? null : int(body.quietEndMinutes, 0, 1439, "Проверьте конец тихих часов");
  if (body.autostartEnabled !== undefined) data.autostartEnabled = boolean(body.autostartEnabled, "Проверьте настройку автозапуска");
  const result = await client.appSettings.updateMany({ where: { id: "singleton", version }, data: { ...data, version: { increment: 1 } } });
  if (result.count !== 1) throw new ApiError(409, "STALE_VERSION", "Настройки изменились в другой вкладке");
  return client.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
}

export async function saveNotificationRule(client: PrismaClient, body: Record<string, unknown>) {
  if (!RULE_KINDS.includes(body.kind as typeof RULE_KINDS[number])) throw new ApiError(422, "INVALID_RULE", "Выберите вид уведомления");
  const kind = body.kind as typeof RULE_KINDS[number];
  const habitId = typeof body.habitId === "string" ? body.habitId : null;
  if (kind === "HABIT" && !habitId) throw new ApiError(422, "INVALID_RULE", "Выберите привычку");
  const data = {
    kind, habitId, enabled: boolean(body.enabled, "Проверьте переключатель уведомления"),
    weekdaysMask: body.weekdaysMask == null ? null : int(body.weekdaysMask, 0, 127, "Выберите дни"),
    timeMinutes: body.timeMinutes == null ? null : int(body.timeMinutes, 0, 1439, "Проверьте время"),
    repeatAfter15: body.repeatAfter15 === true,
    intervalMinutes: body.intervalMinutes == null ? null : int(body.intervalMinutes, 60, 120, "Выберите интервал"),
    windowStartMinutes: body.windowStartMinutes == null ? null : int(body.windowStartMinutes, 0, 1439, "Проверьте начало окна"),
    windowEndMinutes: body.windowEndMinutes == null ? null : int(body.windowEndMinutes, 0, 1439, "Проверьте конец окна")
  };
  if (kind === "WATER" && ![60, 90, 120].includes(data.intervalMinutes ?? 0)) throw new ApiError(422, "INVALID_RULE", "Интервал воды может быть 60, 90 или 120 минут");
  const existing = await client.notificationRule.findFirst({ where: { kind, habitId } });
  if (existing) {
    const version = int(body.version, 1, Number.MAX_SAFE_INTEGER, "Обновите правило и повторите");
    const result = await client.notificationRule.updateMany({ where: { id: existing.id, version }, data: { ...data, version: { increment: 1 } } });
    if (result.count !== 1) throw new ApiError(409, "STALE_VERSION", "Уведомление изменилось в другой вкладке");
    return client.notificationRule.findUniqueOrThrow({ where: { id: existing.id } });
  }
  return client.notificationRule.create({ data });
}

export async function resetAllData(client: PrismaClient, phrase: unknown, simulateFailure = false) {
  if (phrase !== "УДАЛИТЬ") throw new ApiError(422, "INVALID_CONFIRMATION", "Введите точную фразу «УДАЛИТЬ»");
  await client.$transaction(async (tx) => {
    await tx.notificationOccurrence.deleteMany();
    await tx.notificationRule.deleteMany();
    await tx.weeklyHabitFocus.deleteMany();
    await tx.simpleHabitLog.deleteMany(); await tx.plankSession.deleteMany(); await tx.pushupSet.deleteMany(); await tx.waterEntry.deleteMany();
    await tx.habitExclusionInterval.deleteMany(); await tx.habitRevision.deleteMany();
    await tx.weeklyStep.deleteMany(); await tx.dailyReflectionAnswer.deleteMany(); await tx.quoteDisplay.deleteMany(); await tx.quoteUserState.deleteMany();
    await tx.searchDocument.deleteMany();
    await tx.task.updateMany({ data: { sourceTaskId: null, chainRootTaskId: null } });
    await tx.weeklyPlan.updateMany({ data: { sourceWeeklyPlanId: null } });
    await tx.task.deleteMany(); await tx.weeklyPlan.deleteMany(); await tx.dailyEntry.deleteMany(); await tx.habit.deleteMany();
    await tx.onboardingState.deleteMany(); await tx.appSettings.deleteMany();
    if (simulateFailure) throw new Error("RESET_TEST_FAILURE");
    await tx.appSettings.create({ data: { id: "singleton" } });
    await tx.onboardingState.create({ data: { id: "singleton" } });
  });
  await applySeed(client);
  const [quotes, prompts] = await Promise.all([client.quote.count(), client.reflectionPrompt.count()]);
  if (quotes !== 60 || prompts !== 13) throw new Error("RESET_SEED_INVARIANT");
  for (const suffix of ["", ".1", ".2", ".3", ".4"]) {
    const file = `${getAppPaths().logFile}${suffix}`;
    if (fs.existsSync(/* turbopackIgnore: true */ file)) fs.rmSync(/* turbopackIgnore: true */ file);
  }
  return { reset: true, onboardingRequired: true };
}
